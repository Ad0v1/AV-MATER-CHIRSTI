import { loadBackupConfig } from '../backup/backup.config.js';
import { loadDotenv } from '../config/dotenv.js';
import {
  pruneBackups,
  restoreBackup,
  runBackup,
  runDaemon,
  verifyBackup,
  type Log,
} from '../backup/backup.service.js';
import { createS3, listBackups } from '../backup/storage.js';

const USAGE = `Uso: pnpm --filter api backup <comando>

  run                          Crea un respaldo ahora y aplica la retencion
  daemon                       Respaldo diario automatico a la hora BACKUP_AT_UTC
  list                         Lista los respaldos disponibles
  prune                        Aplica la retencion (borra los de mas de BACKUP_RETENTION_DAYS)
  verify [clave]               Prueba de restauracion en una base temporal (el mas reciente por defecto)
  restore <clave> --a <base>   Restaura un respaldo en la base indicada
                               (--sobrescribir-base-en-uso si es la base de produccion)`;

const log: Log = (msg, extra) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));

loadDotenv();

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help') {
    console.log(USAGE);
    return;
  }

  const cfg = loadBackupConfig();
  const s3 = createS3(cfg);

  switch (command) {
    case 'run':
      await runBackup(cfg, s3, log);
      await pruneBackups(cfg, s3, log);
      break;
    case 'daemon':
      await runDaemon(cfg, s3, log);
      break;
    case 'list':
      for (const b of await listBackups(s3, cfg)) console.log(`${b.date.toISOString()}  ${b.key}`);
      break;
    case 'prune':
      await pruneBackups(cfg, s3, log);
      break;
    case 'verify': {
      const result = await verifyBackup(cfg, s3, log, args[0]);
      if (!result.ok) throw new Error('La verificacion fallo: la base restaurada no tiene tablas');
      break;
    }
    case 'restore': {
      const key = args[0];
      const target = args[args.indexOf('--a') + 1];
      if (!key || args.indexOf('--a') === -1 || !target) throw new Error(USAGE);
      await restoreBackup(cfg, s3, key, target, log, {
        allowLive: args.includes('--sobrescribir-base-en-uso'),
      });
      break;
    }
    default:
      throw new Error(`Comando desconocido: ${command}\n\n${USAGE}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
