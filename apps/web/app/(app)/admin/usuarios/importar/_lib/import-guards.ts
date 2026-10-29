// Comprobaciones puras del Route Handler de la importación (RF-21, D-037; INFORME 1, Decisión 1).
// Sin `server-only` para probarlas con Vitest. Las usa `archivo/[accion]/route.ts`; no cambiarlas
// sin pasar por seguridad-cumplimiento.
//
// Los Route Handlers no tienen la protección CSRF de las Server Actions: aquí se comprueba el
// Origin, el tamaño declarado y la forma de cada entrada antes de reenviar nada a la API.

/** Tope del archivo en la API (1 MiB, D-007). */
export const MAX_FILE_BYTES = 1_048_576;
/** Margen para las cabeceras y campos del multipart (type, sha256, límites del boundary). */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
/** Tope del cuerpo que acepta el Route Handler (1 MiB + 64 KiB). */
export const MAX_BODY_BYTES = MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES;

export const IMPORT_TYPES = ['students', 'teachers', 'guardians'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_FORMATS = ['xlsx', 'csv'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const isImportType = (v: unknown): v is ImportType =>
  typeof v === 'string' && (IMPORT_TYPES as readonly string[]).includes(v);

export const isImportFormat = (v: unknown): v is ImportFormat =>
  typeof v === 'string' && (IMPORT_FORMATS as readonly string[]).includes(v);

/** Acciones del Route Handler, con su método y la ruta de la API (fija, nunca del cliente). */
export const IMPORT_ACTIONS = {
  plantilla: { method: 'GET', apiPath: '/users/import/template' },
  preview: { method: 'POST', apiPath: '/users/import/preview' },
  commit: { method: 'POST', apiPath: '/users/import/commit' },
} as const;
export type ImportAction = keyof typeof IMPORT_ACTIONS;

export function parseAction(value: unknown): ImportAction | null {
  return typeof value === 'string' && Object.hasOwn(IMPORT_ACTIONS, value)
    ? (value as ImportAction)
    : null;
}

/**
 * Resultado de cruzar acción y método: 404 si la acción no existe, 405 si existe con otro
 * método, o la acción.
 */
export function resolveAction(
  accion: unknown,
  method: string,
): { ok: true; action: ImportAction } | { ok: false; status: 404 | 405; allow?: string } {
  const action = parseAction(accion);
  if (!action) return { ok: false, status: 404 };
  const expected = IMPORT_ACTIONS[action].method;
  if (method.toUpperCase() !== expected) return { ok: false, status: 405, allow: expected };
  return { ok: true, action };
}

const firstValue = (v: string | null | undefined): string | undefined => {
  if (v == null) return undefined;
  const first = v.split(',')[0]?.trim();
  return first ? first.toLowerCase() : undefined;
};

/**
 * ¿La petición viene de la misma web? Compara el host del `Origin` con el host de la petición
 * (`X-Forwarded-Host` si lo pone un proxy, si no `Host`), como hace Next con las Server Actions.
 *
 * - POST: el `Origin` es obligatorio (los navegadores lo envían siempre en un fetch POST).
 * - GET (plantilla): los navegadores no envían `Origin` en un GET del mismo origen; si viene,
 *   debe coincidir, y `Sec-Fetch-Site`, si viene, debe ser `same-origin` o `none`. La plantilla
 *   está vacía (solo encabezados) y no cambia nada, así que no se exige más.
 */
export function isSameOrigin(input: {
  method: string;
  origin: string | null;
  host: string | null;
  forwardedHost?: string | null;
  secFetchSite?: string | null;
}): boolean {
  const expectedHost = firstValue(input.forwardedHost) ?? firstValue(input.host);
  if (!expectedHost) return false;
  const isGet = input.method.toUpperCase() === 'GET';

  if (input.secFetchSite != null) {
    const site = input.secFetchSite.trim().toLowerCase();
    if (site !== 'same-origin' && !(isGet && site === 'none')) return false;
  }

  if (input.origin == null || input.origin === '') return isGet;
  if (input.origin === 'null') return false;
  let url: URL;
  try {
    url = new URL(input.origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return url.host.toLowerCase() === expectedHost;
}

export type BodySizeCheck =
  | { ok: true; length: number }
  | { ok: false; reason: 'missing' | 'invalid' | 'too-large' | 'empty' };

/**
 * `Content-Length` declarado. Sin él (p. ej. `Transfer-Encoding: chunked`) no se sabe cuánto
 * llegará, así que se rechaza; también si pasa de MAX_BODY_BYTES.
 */
export function checkContentLength(
  header: string | null | undefined,
  max = MAX_BODY_BYTES,
): BodySizeCheck {
  if (header == null || header.trim() === '') return { ok: false, reason: 'missing' };
  const value = header.trim();
  if (!/^\d{1,16}$/.test(value)) return { ok: false, reason: 'invalid' };
  const length = Number(value);
  if (!Number.isSafeInteger(length)) return { ok: false, reason: 'too-large' };
  if (length > max) return { ok: false, reason: 'too-large' };
  if (length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, length };
}

/**
 * Content-Type del multipart que se reenvía tal cual (lleva el boundary). Solo
 * `multipart/form-data; boundary=...` sin caracteres de control y de largo razonable.
 */
export function cleanMultipartContentType(header: string | null | undefined): string | null {
  if (typeof header !== 'string') return null;
  const value = header.trim();
  if (value.length === 0 || value.length > 200) return null;
  // Solo ASCII imprimible: así no se puede inyectar nada en la cabecera.
  if (!/^[\x20-\x7e]+$/.test(value)) return null;
  if (!/^multipart\/form-data\s*;/i.test(value)) return null;
  if (!/;\s*boundary=("?)[0-9A-Za-z'()+_,\-./:=? ]{1,70}\1\s*(;|$)/i.test(value)) return null;
  return value;
}

/**
 * Lista blanca de la consulta de la plantilla: exactamente `type` y `format`, una vez cada uno,
 * con valores conocidos. Cualquier otro parámetro → null (400).
 */
export function parseTemplateQuery(
  params: URLSearchParams,
): { type: ImportType; format: ImportFormat } | null {
  const keys = [...params.keys()];
  if (keys.length !== 2) return null;
  const types = params.getAll('type');
  const formats = params.getAll('format');
  if (types.length !== 1 || formats.length !== 1) return null;
  const [type] = types;
  const [format] = formats;
  if (!isImportType(type) || !isImportFormat(format)) return null;
  return { type, format };
}

/** Content-Type de la plantilla según el formato (no se copia el de la API). */
export const TEMPLATE_CONTENT_TYPES: Record<ImportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

/** Nombre de archivo de la plantilla (igual que el de la API, docs/03). */
export const templateFilename = (type: ImportType, format: ImportFormat): string =>
  `plantilla-${type}.${format}`;

/**
 * Content-Disposition de la plantilla. El de la API es `attachment; filename="plantilla-<type>.
 * <format>"` (docs/03): se copia solo si es exactamente ese; si no, null (el Route Handler
 * responde 502 en vez de reenviar un valor arbitrario).
 */
export function templateDisposition(
  fromApi: string | null | undefined,
  type: ImportType,
  format: ImportFormat,
): string | null {
  const expected = `attachment; filename="${templateFilename(type, format)}"`;
  return fromApi?.trim() === expected ? expected : null;
}

/** Sobre de error propio del Route Handler (mismo formato que la API, docs/03). */
export function localError(code: string, message: string) {
  return { error: { code, message, details: [] as never[] } };
}
