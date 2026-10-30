import { z } from 'zod';

// Variables CLAMAV_* de .env.example (Dev 3, pendiente de revisión por Dev 1).
const clamavEnvSchema = z.object({
  CLAMAV_HOST: z.string().min(1).default('127.0.0.1'),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  // Tiempo máximo sin actividad en el socket (conexión, envío o respuesta).
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
});

export type ClamavConfig = { host: string; port: number; timeoutMs: number };

export const CLAMAV_CONFIG = Symbol('CLAMAV_CONFIG');

export function loadClamavConfig(source: NodeJS.ProcessEnv = process.env): ClamavConfig {
  const result = clamavEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuracion de antivirus invalida: ${problems.join('; ')}`);
  }
  return {
    host: result.data.CLAMAV_HOST,
    port: result.data.CLAMAV_PORT,
    timeoutMs: result.data.CLAMAV_TIMEOUT_MS,
  };
}
