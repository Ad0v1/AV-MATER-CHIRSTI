import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests de lógica pura de la web (F5, A3). Sin DOM ni navegador: Playwright no entra en F5.
// También corre los tests de prisma/seed/local-guard.ts (sin dependencias), que protegen los
// scripts de desarrollo y no tienen otro paquete con Vitest que los alcance.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    dir: fileURLToPath(new URL('../../', import.meta.url)),
    include: ['apps/web/**/*.test.ts', 'prisma/seed/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
});
