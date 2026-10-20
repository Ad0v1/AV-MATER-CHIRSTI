import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // Origen permitido del frontend (CORS). Se ampliara con los dominios reales.
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  // Valor por defecto solo para desarrollo local (coincide con .env.example).
  DATABASE_URL: z.string().default('mysql://aula:aula_dev_change_me@localhost:3306/aula_virtual'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  // Duracion de la sesion. Valor por defecto provisional: pendiente de decision del equipo (RF-05).
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .default(8 * 60 * 60),
  // Limite global de peticiones por IP en una ventana de 60 s (RNF-08).
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(100),
});

export type Env = z.infer<typeof envSchema>;

// Falla al arrancar si la configuracion es invalida, en vez de fallar en medio de una peticion.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuracion invalida: ${problems.join('; ')}`);
  }
  return result.data;
}
