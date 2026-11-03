import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { GetObjectCommand, HeadObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { BackupConfig } from './backup.config.js';
import { backupKey, nextRun, selectExpired } from './backup-naming.js';
import { createDecryptStream, createEncryptStream } from './crypto-stream.js';
import { buildDumpSpec, buildMysqlSpec, runQuery, startProcess } from './sql-runner.js';
import { deleteKeys, ensureBucket, listBackups } from './storage.js';

export type Log = (msg: string, extra?: Record<string, unknown>) => void;
const IDENTIFIER = /^[A-Za-z0-9_]+$/;

// Respaldo completo: mysqldump -> gzip -> cifrado AES-256-GCM -> almacenamiento externo (S3/R2).
// Todo va en streaming: nada se guarda sin cifrar, ni en disco ni en el destino.
export async function runBackup(
  cfg: BackupConfig,
  s3: S3Client,
  log: Log,
  now = new Date(),
): Promise<{ key: string; bytes: number }> {
  await ensureBucket(s3, cfg.S3_BACKUP_BUCKET);
  const key = backupKey(cfg.BACKUP_PREFIX, cfg.db.database, now);

  const dump = startProcess(buildDumpSpec(cfg));
  const body = new PassThrough();
  const upload = new Upload({
    client: s3,
    params: { Bucket: cfg.S3_BACKUP_BUCKET, Key: key, Body: body },
  });

  const results = await Promise.allSettled([
    dump.done,
    pipeline(dump.child.stdout as Readable, createGzip(), createEncryptStream(cfg.key), body),
    upload.done(),
  ]);

  const [dumpResult, ...others] = results;
  const failure =
    dumpResult.status === 'rejected'
      ? (dumpResult.reason as Error).message
      : dumpResult.value.code !== 0
        ? `mysqldump fallo (codigo ${dumpResult.value.code}): ${dumpResult.value.stderr.trim()}`
        : others.find((r) => r.status === 'rejected')
          ? String((others.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason)
          : null;

  if (failure) {
    // Un respaldo a medias seria peor que ninguno: se borra para que nadie lo restaure por error.
    await deleteKeys(s3, cfg.S3_BACKUP_BUCKET, [key]).catch(() => undefined);
    throw new Error(failure);
  }

  const head = await s3.send(new HeadObjectCommand({ Bucket: cfg.S3_BACKUP_BUCKET, Key: key }));
  const bytes = head.ContentLength ?? 0;
  log('respaldo creado', { key, bytes });
  return { key, bytes };
}

// Borra los respaldos que superan la retencion (ERS: 30 dias). Siempre conserva el mas reciente.
export async function pruneBackups(
  cfg: BackupConfig,
  s3: S3Client,
  log: Log,
  now = new Date(),
): Promise<string[]> {
  const expired = selectExpired(await listBackups(s3, cfg), now, cfg.BACKUP_RETENTION_DAYS);
  if (expired.length > 0) await deleteKeys(s3, cfg.S3_BACKUP_BUCKET, expired);
  log('retencion aplicada', { eliminados: expired.length, dias: cfg.BACKUP_RETENTION_DAYS });
  return expired;
}

// Restaura un respaldo en la base indicada. Descifra y descomprime primero a un archivo temporal:
// la etiqueta de autenticacion se comprueba al final, asi que nada se aplica si el respaldo
// fue alterado o la clave es otra.
export async function restoreBackup(
  cfg: BackupConfig,
  s3: S3Client,
  key: string,
  targetDb: string,
  log: Log,
  options: { allowLive?: boolean } = {},
): Promise<void> {
  if (!IDENTIFIER.test(targetDb)) throw new Error('Nombre de base de datos invalido');
  if (targetDb === cfg.db.database && !options.allowLive) {
    throw new Error(
      `Restaurar sobre la base en uso (${targetDb}) sobrescribe datos reales. ` +
        'Restaura en otra base o confirma con --sobrescribir-base-en-uso.',
    );
  }

  const dir = await mkdtemp(join(tmpdir(), 'aula-restore-'));
  const file = join(dir, 'dump.sql');
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: cfg.S3_BACKUP_BUCKET, Key: key }));
    await pipeline(
      obj.Body as Readable,
      createDecryptStream(cfg.key),
      createGunzip(),
      createWriteStream(file),
    );

    await runQuery(cfg, `CREATE DATABASE IF NOT EXISTS \`${targetDb}\``);
    const mysql = startProcess(buildMysqlSpec(cfg, [`--database=${targetDb}`]));
    const piping = pipeline(createReadStream(file), mysql.child.stdin!);
    const [{ code, stderr }] = await Promise.all([mysql.done, piping]);
    if (code !== 0) throw new Error(`mysql fallo al restaurar (codigo ${code}): ${stderr.trim()}`);
    log('respaldo restaurado', { key, base: targetDb });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function countTables(cfg: BackupConfig, db: string): Promise<number> {
  const out = await runQuery(
    cfg,
    `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${db}'`,
  );
  return Number(out);
}

// Prueba de restauracion (ERS: trimestral): restaura en una base temporal, comprueba que tiene
// tablas y la elimina. Sin clave no se puede ejecutar: tambien prueba que la clave guardada sirve.
export async function verifyBackup(
  cfg: BackupConfig,
  s3: S3Client,
  log: Log,
  key?: string,
): Promise<{ key: string; tables: number; liveTables: number; ok: boolean }> {
  const backups = await listBackups(s3, cfg);
  const chosen = key ?? backups.at(-1)?.key;
  if (!chosen) throw new Error('No hay respaldos para verificar');

  const temp = `${cfg.db.database}_verify_${Date.now()}`;
  try {
    await restoreBackup(cfg, s3, chosen, temp, log);
    const tables = await countTables(cfg, temp);
    const liveTables = await countTables(cfg, cfg.db.database);
    const result = { key: chosen, tables, liveTables, ok: tables > 0 };
    log('verificacion terminada', result);
    return result;
  } finally {
    await runQuery(cfg, `DROP DATABASE IF EXISTS \`${temp}\``).catch(() => undefined);
  }
}

// Respaldo diario a la hora configurada (ERS RNF-21: diario y automatico). Un fallo se registra
// y se reintenta al dia siguiente: nunca detiene el programador.
export async function runDaemon(cfg: BackupConfig, s3: S3Client, log: Log): Promise<never> {
  for (;;) {
    const next = nextRun(new Date(), cfg.BACKUP_AT_UTC);
    log('proximo respaldo programado', { cuando: next.toISOString() });
    await new Promise((resolve) => setTimeout(resolve, next.getTime() - Date.now()));
    try {
      await runBackup(cfg, s3, log);
      await pruneBackups(cfg, s3, log);
    } catch (err) {
      log('ERROR en el respaldo diario', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
