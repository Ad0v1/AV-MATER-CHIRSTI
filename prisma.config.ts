import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  // Esquema dividido en un archivo por modulo para evitar conflictos de merge (Plan, seccion 4).
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
