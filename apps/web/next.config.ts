import type { NextConfig } from 'next';

// Origen interno de la API (NestJS). El navegador nunca lo ve: llama a /api/v1 en el mismo origen
// de la web y Next reenvia la peticion. Asi la cookie de sesion queda en un solo origen.
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// Origen del bucket (MinIO en local, R2 en produccion) para la CSP: las URL firmadas de logo,
// visor de PDF y subidas directas (PUT) apuntan ahi. Sale de la configuracion de S3, nunca fijo.
// - Produccion (next build / next start): S3_PUBLIC_ORIGIN es OBLIGATORIA y debe ser una URL
//   valida; si falta, el build falla (M2) en vez de quedarse con el origen local.
// - Desarrollo: S3_PUBLIC_ORIGIN, si no S3_ENDPOINT, si no MinIO local.
function bucketOrigin(isDev: boolean): string | null {
  if (!isDev) {
    const raw = process.env.S3_PUBLIC_ORIGIN?.trim();
    let origin: string | null = null;
    try {
      origin = raw ? new URL(raw).origin : null;
    } catch {
      origin = null;
    }
    if (!origin || origin === 'null') {
      throw new Error(
        'next.config: falta S3_PUBLIC_ORIGIN (o no es una URL valida). En produccion es obligatoria ' +
          'al construir la web: es el origen del bucket que aparece en las URL firmadas (CSP). ' +
          'Ver docs/manuales/tecnico.md, "Cabeceras de seguridad de la web".',
      );
    }
    return origin;
  }
  const raw = process.env.S3_PUBLIC_ORIGIN || process.env.S3_ENDPOINT || 'http://127.0.0.1:9000';
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

const isDev = process.env.NODE_ENV !== 'production';

function contentSecurityPolicy(): string {
  const bucket = bucketOrigin(isDev);
  const b = bucket ? ` ${bucket}` : '';
  // En local MinIO responde en 127.0.0.1 o localhost indistintamente segun S3_ENDPOINT.
  const alt =
    bucket && isDev
      ? ` ${bucket.replace('127.0.0.1', 'localhost')} ${bucket.replace('localhost', '127.0.0.1')}`
      : '';
  return [
    "default-src 'self'",
    // 'unsafe-inline' en script-src es deuda aceptada (M1, ver docs/manuales/tecnico.md): Next
    // inyecta scripts inline de hidratacion y, con cacheComponents + Partial Prerendering, el HTML
    // estatico se genera en el build y se reutiliza entre peticiones, asi que no puede llevar un
    // nonce por peticion (un nonce obligaria a renderizar todo dinamico y perder PPR). La
    // mitigacion es el resto de la politica (sin origenes externos de script, object-src 'none',
    // base-uri 'self'). En desarrollo HMR ademas necesita eval.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${b}${alt}`,
    "font-src 'self' data:",
    `connect-src 'self'${b}${alt}${isDev ? ' ws: wss:' : ''}`,
    `frame-src 'self'${b}${alt}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function securityHeaders(): { key: string; value: string }[] {
  const list = [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
  // HSTS solo fuera de desarrollo: en local se sirve por http y el navegador lo recordaria.
  if (!isDev) {
    list.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
  }
  return list;
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Oculta el circulo "N" de Next en desarrollo; los errores de compilacion se siguen mostrando.
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders(),
      },
    ];
  },
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
