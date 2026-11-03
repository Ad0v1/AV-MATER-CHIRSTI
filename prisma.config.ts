import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  // Esquema dividido en un archivo por modulo para evitar conflictos de merge (Plan, seccion 4).
  schema: 'prisma/schema',
  // Seed ficticio de desarrollo (D-028): se niega a correr en produccion.
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed/index.ts' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
