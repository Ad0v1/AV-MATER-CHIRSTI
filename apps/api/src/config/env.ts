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
    // Version vigente de la politica y terminos que debe aceptar cada usuario (RF-07).
    POLICY_VERSION: z.string().default('2026-1'),
    // Limite global de peticiones por IP en una ventana de 60 s (RNF-08).
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(100),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.TOTP_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOTP_ENCRYPTION_KEY'],
        message: 'es obligatoria en produccion',
      });
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
