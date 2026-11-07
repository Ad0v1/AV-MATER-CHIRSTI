import { afterEach, describe, expect, it, vi } from 'vitest';

// A2 (QA): cabeceras de seguridad de next.config. bucketOrigin() lee el entorno en cada llamada
// a headers(); isDev se fija al cargar el modulo, por eso se resetean los modulos.
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) {
      vi.stubEnv(k, '');
      delete process.env[k];
    } else {
      vi.stubEnv(k, v);
    }
  }
  const mod = (await import('./next.config')).default;
  const rules = await mod.headers!();
  const list = rules[0].headers;
  const header = (k: string) => list.find((h) => h.key === k)?.value ?? '';
  const csp = header('Content-Security-Policy');
  const dir = (name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';
  return { rules, header, csp, dir };
}

afterEach(() => vi.unstubAllEnvs());

describe('next.config headers (A2)', () => {
  it('aplica a todas las rutas y fija las cabeceras fijas', async () => {
    const { rules, header } = await load({
      NODE_ENV: 'production',
      S3_PUBLIC_ORIGIN: 'https://files.colegio.pe',
    });
    expect(rules[0].source).toBe('/:path*');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
    expect(header('Strict-Transport-Security')).toContain('max-age=');
  });

  it('desarrollo: sin HSTS', async () => {
    const { header } = await load({ NODE_ENV: 'development', S3_PUBLIC_ORIGIN: undefined });
    expect(header('Strict-Transport-Security')).toBe('');
  });

  it('CSP: el origen del bucket entra en img-src, connect-src y frame-src (solo el origen)', async () => {
    const { dir } = await load({
      NODE_ENV: 'production',
      S3_PUBLIC_ORIGIN: 'https://cuenta.r2.cloudflarestorage.com/aula/privado',
    });
    for (const d of ['img-src', 'connect-src', 'frame-src']) {
      expect(dir(d)).toContain(' https://cuenta.r2.cloudflarestorage.com');
      expect(dir(d)).not.toContain('/aula');
    }
  });

  it('desarrollo: fallback a 127.0.0.1:9000 si no hay S3_ENDPOINT ni S3_PUBLIC_ORIGIN', async () => {
    const { dir } = await load({
      NODE_ENV: 'development',
      S3_PUBLIC_ORIGIN: undefined,
      S3_ENDPOINT: undefined,
    });
    for (const d of ['img-src', 'connect-src', 'frame-src']) {
      expect(dir(d)).toContain('http://127.0.0.1:9000');
    }
  });

  it.each([undefined, 'no-es-url'])(
    'produccion sin S3_PUBLIC_ORIGIN valida (%s): falla con error claro (M2)',
    async (origin) => {
      await expect(
        load({
          NODE_ENV: 'production',
          S3_PUBLIC_ORIGIN: origin,
          S3_ENDPOINT: 'http://minio:9000',
        }),
      ).rejects.toThrow(/S3_PUBLIC_ORIGIN/);
    },
  );

  it('S3_PUBLIC_ORIGIN gana sobre S3_ENDPOINT', async () => {
    const { csp } = await load({
      NODE_ENV: 'development',
      S3_PUBLIC_ORIGIN: 'https://files.colegio.pe',
      S3_ENDPOINT: 'http://minio:9000',
    });
    expect(csp).toContain('https://files.colegio.pe');
    expect(csp).not.toContain('minio:9000');
  });

  it('desarrollo, origen invalido: la CSP se genera sin bucket y sin romper', async () => {
    const { dir } = await load({ NODE_ENV: 'development', S3_PUBLIC_ORIGIN: 'no-es-url' });
    expect(dir('img-src')).toBe("img-src 'self' data: blob:");
    expect(dir('frame-src')).toBe("frame-src 'self'");
  });

  it('produccion: sin unsafe-eval, sin ws:, sin alias localhost', async () => {
    const { csp, dir } = await load({
      NODE_ENV: 'production',
      S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_PUBLIC_ORIGIN: 'https://files.colegio.pe',
    });
    expect(csp).not.toContain('unsafe-eval');
    expect(dir('connect-src')).not.toContain('ws:');
    expect(csp).not.toContain('localhost');
  });

  it('desarrollo: admite localhost y 127.0.0.1 indistintamente, HMR y eval', async () => {
    const { csp, dir } = await load({
      NODE_ENV: 'development',
      S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_PUBLIC_ORIGIN: undefined,
    });
    expect(dir('img-src')).toContain('http://localhost:9000');
    expect(dir('img-src')).toContain('http://127.0.0.1:9000');
    expect(dir('connect-src')).toContain('ws:');
    expect(csp).toContain("'unsafe-eval'");
  });

  it('endurecimiento fijo: object-src none, frame-ancestors none, base-uri self', async () => {
    const { csp } = await load({ NODE_ENV: 'production', S3_PUBLIC_ORIGIN: 'https://f.test' });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("default-src 'self'");
  });
});
