import { config } from 'dotenv';

// En desarrollo carga el .env de la raiz del repositorio (o el de apps/api si existe), para que
// `pnpm --filter api start:dev` use la misma configuracion que el resto del equipo sin exportar
// variables a mano. Nunca pisa variables ya definidas, y en produccion no hace nada: ahi la
// configuracion la entrega el entorno (Docker, el servidor), no un archivo.
export function loadDotenv(): void {
  if (process.env.NODE_ENV === 'production') return;
  config({ path: ['.env', '../../.env'], quiet: true });
}
