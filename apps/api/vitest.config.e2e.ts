import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Los e2e comparten la BD y cambian el año activo: se ejecutan de a un archivo.
    fileParallelism: false,
  },
});
