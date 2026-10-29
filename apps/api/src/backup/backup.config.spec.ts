import { randomBytes } from 'node:crypto';
import { loadBackupConfig, parseDatabaseUrl } from './backup.config.js';

const base = () => ({
  DATABASE_URL: 'mysql://aula:p%40ss@127.0.0.1:3306/aula_virtual',
  BACKUP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  S3_ACCESS_KEY_ID: 'id',
  S3_SECRET_ACCESS_KEY: 'secret',
});

describe('configuracion de respaldos', () => {
  it('lee la conexion de DATABASE_URL, incluida una contrasena con caracteres especiales', () => {
    expect(parseDatabaseUrl('mysql://aula:p%40ss@127.0.0.1:3307/aula_virtual')).toEqual({
      host: '127.0.0.1',
      port: 3307,
      user: 'aula',
      password: 'p@ss',
      database: 'aula_virtual',
    });
  });

  it('aplica los valores por defecto de la ERS: 30 dias y 07:00 UTC', () => {
    const cfg = loadBackupConfig(base());
    expect(cfg.BACKUP_RETENTION_DAYS).toBe(30);
    expect(cfg.BACKUP_AT_UTC).toBe('07:00');
    expect(cfg.key).toHaveLength(32);
  });

  it('exige la clave de cifrado', () => {
    const env: Record<string, string | undefined> = base();
    delete env.BACKUP_ENCRYPTION_KEY;
    expect(() => loadBackupConfig(env)).toThrow(/BACKUP_ENCRYPTION_KEY/);
  });

  it('rechaza una clave que no mide 32 bytes', () => {
    expect(() => loadBackupConfig({ ...base(), BACKUP_ENCRYPTION_KEY: 'corta' })).toThrow(
      /32 bytes/,
    );
  });

  it('rechaza una hora mal escrita', () => {
    expect(() => loadBackupConfig({ ...base(), BACKUP_AT_UTC: '25:00' })).toThrow(/BACKUP_AT_UTC/);
  });

  it('rechaza un nombre de base de datos que podria inyectar SQL', () => {
    expect(() => parseDatabaseUrl('mysql://u:p@h:3306/aula%60%3B%20DROP')).toThrow(
      /solo puede tener/,
    );
  });
});
