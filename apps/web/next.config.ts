import type { NextConfig } from 'next';

// Origen interno de la API (NestJS). El navegador nunca lo ve: llama a /api/v1 en el mismo origen
// de la web y Next reenvia la peticion. Asi la cookie de sesion queda en un solo origen.
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
