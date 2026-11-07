// A2 (Dev 1): logo y nombre del colegio en la cabecera del sidebar. Server Component con el BFF
// (D-037). La respuesta exige sesión, así que no se usa 'use cache' (regla de lib/api/server.ts):
// la "caché corta" es la deduplicación por petición de React `cache`. La URL del logo es firmada
// y caduca sola; si la API falla se muestra el nombre genérico sin romper el layout.
import { cache } from 'react';
import { apiServer } from '@/lib/api/server';

type Branding = { name: string; logo: { url: string; expiresAt: string } | null };

const FALLBACK_NAME = 'Aula Virtual';

export const getBranding = cache(async (): Promise<Branding | null> => {
  try {
    return await apiServer.get<Branding>('/institution/branding');
  } catch {
    return null;
  }
});

// En produccion (B4) solo https y solo el origen del bucket (S3_PUBLIC_ORIGIN); si falta esa
// variable no se muestra logo. En desarrollo basta http(s) (MinIO local).
export function safeLogoUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (process.env.NODE_ENV === 'production') {
      const raw = process.env.S3_PUBLIC_ORIGIN;
      const bucket = raw ? new URL(raw).origin : null;
      return u.protocol === 'https:' && bucket !== null && u.origin === bucket
        ? u.toString()
        : null;
    }
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function SchoolBrand({ subtitle }: { subtitle: string }) {
  const branding = await getBranding();
  const name = branding?.name?.trim() || FALLBACK_NAME;
  const logo = safeLogoUrl(branding?.logo?.url);
  return <BrandView name={name} logo={logo} subtitle={subtitle} />;
}

export function BrandView({
  name,
  logo,
  subtitle,
}: {
  name: string;
  logo: string | null;
  subtitle: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {logo ? (
        // Decorativa: el nombre ya va como texto al lado (alt vacio y oculta a lectores de pantalla).
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada externa (bucket), sin optimizador
        <img
          src={logo}
          alt=""
          aria-hidden="true"
          width={32}
          height={32}
          className="size-8 shrink-0 rounded bg-white object-contain p-0.5"
        />
      ) : null}
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold" title={name}>
          {name}
        </span>
        <span className="block truncate text-xs text-sidebar-foreground/70">{subtitle}</span>
      </span>
    </span>
  );
}

/** Esqueleto mientras carga la marca: reserva el hueco del logo y del nombre; el rol se ve ya. */
export function BrandSkeleton({ subtitle }: { subtitle: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2" aria-busy="true">
      <span
        className="size-8 shrink-0 animate-pulse rounded bg-sidebar-accent"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span
          className="mb-1 block h-4 w-28 max-w-full animate-pulse rounded bg-sidebar-accent"
          aria-hidden="true"
        />
        <span className="block truncate text-xs text-sidebar-foreground/70">{subtitle}</span>
      </span>
    </span>
  );
}
