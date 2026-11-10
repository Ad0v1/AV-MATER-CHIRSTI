import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    // Origen permitido del frontend (CORS). Se ampliara con los dominios reales.
    WEB_ORIGIN: z.string().default('http://localhost:3000'),
    // Cantidad de proxies de confianza delante de la API (0 = ninguno). Con la web reenviando
    // las peticiones debe ser 1; asi el limite de intentos y la bitacora ven la IP real del usuario.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // Valor por defecto solo para desarrollo local (coincide con .env.example).
    DATABASE_URL: z.string().default('mysql://aula:aula_dev_change_me@127.0.0.1:3306/aula_virtual'),
    REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
    // Duracion de la sesion. Valor por defecto provisional: pendiente de decision del equipo (RF-05).
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .default(8 * 60 * 60),
    // Clave AES-256 (32 bytes en base64) para cifrar los secretos TOTP. Obligatoria en produccion.
    // Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    TOTP_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'debe ser 32 bytes en base64')
      .optional(),
    TOTP_ISSUER: z.string().default('Aula Virtual'),
    // Clave maestra (32 bytes en base64) para cifrar el DNI y calcular su hash (D-059). De ella
    // salen dos claves distintas. Obligatoria en produccion; misma forma de generarla que la anterior.
    PII_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'debe ser 32 bytes en base64')
      .optional(),
    // Correo saliente (RF-80, RF-82). En local sale a Mailpit (puerto 1025); en produccion las
    // credenciales son obligatorias y la conexion exige TLS.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z
      .string()
      .min(3)
      .max(191)
      .refine((v) => !/[\r\n]/.test(v), 'no puede tener saltos de linea')
      .optional(),
    // Bloqueo temporal por cuenta tras fallos de inicio de sesion seguidos (RF-75, D-061).
    LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    LOGIN_LOCK_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .default(15 * 60),
    // Version vigente de la politica y terminos que debe aceptar cada usuario (RF-07).
    POLICY_VERSION: z.string().default('2026-2'),
    // Limite global de peticiones por IP en una ventana de 60 s (RNF-08).
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(100),
    // Trabajos en segundo plano (Dev 5, RNF-19), autorizado por el usuario el 30/10/2026.
    // El correo saliente usa las variables SMTP_* de arriba (avisos minimos, U3).
    // Conversion HTML a PDF de los reportes (U4, fase 5f).
    GOTENBERG_URL: z.url().default('http://127.0.0.1:3001'),
    // Dias que se conserva el resultado de una exportacion antes de vencer (U6).
    EXPORT_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    // Trabajos en paralelo por cola en el worker.
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.TOTP_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOTP_ENCRYPTION_KEY'],
        message: 'es obligatoria en produccion',
      });
    }
    if (env.NODE_ENV === 'production' && !env.PII_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['PII_ENCRYPTION_KEY'],
        message: 'es obligatoria en produccion',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const) {
        if (!env[name]) {
          ctx.addIssue({ code: 'custom', path: [name], message: 'es obligatoria en produccion' });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

// Falla al arrancar si la configuracion es invalida, en vez de fallar en medio de una peticion.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Una variable vacia (p. ej. `CLAVE=` en .env) se trata como no definida.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuracion invalida: ${problems.join('; ')}`);
  }
  return result.data;
}
