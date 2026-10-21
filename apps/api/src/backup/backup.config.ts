import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  // Clave AES-256 (32 bytes en base64), distinta a la de TOTP. Sin ella no se puede restaurar:
  // guardarla fuera del servidor y de los propios respaldos.
  BACKUP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'debe ser 32 bytes en base64'),
  // ERS RNF-21: retencion de 30 dias.
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  // Hora diaria (UTC) del respaldo automatico. 07:00 UTC = 02:00 en Lima, fuera del horario escolar.
  BACKUP_AT_UTC: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'formato HH:MM')
    .default('07:00'),
  BACKUP_PREFIX: z.string().default('db/'),
  S3_BACKUP_BUCKET: z.string().default('aula-backups'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  // MinIO local necesita rutas tipo /bucket/objeto; R2 y S3 funcionan con ambos estilos.
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Si se define, mysqldump/mysql se ejecutan dentro de ese contenedor con `docker exec`
  // (util en desarrollo, donde no hay cliente MySQL instalado en el PC).
  BACKUP_MYSQL_CONTAINER: z.string().optional(),
  MYSQLDUMP_PATH: z.string().default('mysqldump'),
  MYSQL_PATH: z.string().default('mysql'),
});

export type DbConnection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export type BackupConfig = Omit<
  z.infer<typeof schema>,
  'BACKUP_ENCRYPTION_KEY' | 'DATABASE_URL'
> & {
  key: Buffer;
  db: DbConnection;
};

export function parseDatabaseUrl(url: string): DbConnection {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!parsed.hostname || !parsed.username || !database) {
    throw new Error('DATABASE_URL debe incluir host, usuario y base de datos');
  }
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('El nombre de la base de datos solo puede tener letras, numeros y guion bajo');
  }
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
}

export function loadBackupConfig(source: NodeJS.ProcessEnv = process.env): BackupConfig {
  // Una variable vacia (p. ej. `CLAVE=` en .env) se trata como no definida.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuracion de respaldos invalida: ${problems.join('; ')}`);
  }
  const { BACKUP_ENCRYPTION_KEY, DATABASE_URL, ...rest } = result.data;
  return {
    ...rest,
    key: Buffer.from(BACKUP_ENCRYPTION_KEY, 'base64'),
    db: parseDatabaseUrl(DATABASE_URL),
  };
}
