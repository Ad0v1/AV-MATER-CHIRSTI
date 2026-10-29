// /admin/usuarios/importar/archivo/[accion] — puente (BFF) de la importación masiva (RF-21, D-037;
// INFORME 1, Decisión 1). Acciones: `plantilla` (GET), `preview` (POST) y `commit` (POST).
//
// Reglas (no cambiarlas sin pasar por seguridad-cumplimiento):
// - Los Route Handlers no tienen la protección CSRF de las Server Actions: se exige el mismo
//   Origin (isSameOrigin).
// - Content-Length obligatorio y ≤ 1 MiB + 64 KiB (413 local); el cuerpo se cuenta al pasar y se
//   corta si supera el tope.
// - El cuerpo se reenvía como stream (duplex: 'half') con su Content-Type multipart; nunca se lee
//   ni se guarda aquí.
// - Solo se reenvía la cookie `aula_sid` validada; ninguna otra cabecera del navegador.
// - Sin seguir redirecciones, sin caché, con tiempo máximo.
// - Nunca se registra el cuerpo, el nombre del archivo, el token ni la respuesta.
// - La web no decide permisos: la API responde 401/403.
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionCookieHeader } from '@/lib/api/request-guards';
import {
  IMPORT_ACTIONS,
  MAX_BODY_BYTES,
  TEMPLATE_CONTENT_TYPES,
  checkContentLength,
  cleanMultipartContentType,
  isSameOrigin,
  localError,
  parseTemplateQuery,
  resolveAction,
  templateDisposition,
  type ImportAction,
} from '../../_lib/import-guards';

const API_BASE = `${(process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}/api/v1`;

/** El commit puede tardar (transacción de hasta 20 s más la espera de 5 s). */
const UPLOAD_TIMEOUT_MS = 60_000;
const TEMPLATE_TIMEOUT_MS = 15_000;

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

type Ctx = { params: Promise<{ accion: string }> };

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

const LOCAL = {
  notFound: () => json(404, localError('NOT_FOUND', 'No encontrado')),
  method: (allow: string) =>
    json(405, localError('METHOD_NOT_ALLOWED', 'Método no permitido'), { Allow: allow }),
  origin: () => json(403, localError('FORBIDDEN', 'Origen no permitido')),
  tooLarge: () => json(413, localError('PAYLOAD_TOO_LARGE', 'El archivo supera 1 MiB')),
  badRequest: (message: string) => json(400, localError('VALIDATION_ERROR', message)),
  unsupported: () =>
    json(415, localError('UNSUPPORTED_MEDIA_TYPE', 'El envío debe ser multipart/form-data')),
  badGateway: () => json(502, localError('BAD_GATEWAY', '')),
};

function sameOrigin(request: NextRequest): boolean {
  const h = request.headers;
  return isSameOrigin({
    method: request.method,
    origin: h.get('origin'),
    host: h.get('host'),
    forwardedHost: h.get('x-forwarded-host'),
    secFetchSite: h.get('sec-fetch-site'),
  });
}

function apiHeaders(request: NextRequest, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { Accept: 'application/json', ...extra };
  const cookie = sessionCookieHeader(request.cookies.get(SESSION_COOKIE)?.value);
  if (cookie) headers.Cookie = cookie;
  return headers;
}

/** Status y JSON de la API, sin más cabeceras que las propias. Nunca registra el cuerpo. */
async function relayJson(res: Response): Promise<Response> {
  if (res.status >= 300 && res.status < 400) return LOCAL.badGateway();
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    // Cuerpo vacío o no JSON (p. ej. un proxy): solo el status.
    payload = localError('ERROR', '');
  }
  return json(res.status, payload);
}

export async function GET(request: NextRequest, { params }: Ctx): Promise<Response> {
  const resolved = resolveAction((await params).accion, 'GET');
  if (!resolved.ok) {
    return resolved.status === 404 ? LOCAL.notFound() : LOCAL.method(resolved.allow ?? 'POST');
  }
  if (!sameOrigin(request)) return LOCAL.origin();

  const query = parseTemplateQuery(request.nextUrl.searchParams);
  if (!query) return LOCAL.badRequest('Tipo o formato de plantilla no válido');

  const search = new URLSearchParams({ type: query.type, format: query.format });
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${IMPORT_ACTIONS.plantilla.apiPath}?${search}`, {
      method: 'GET',
      headers: apiHeaders(request, { Accept: '*/*' }),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(TEMPLATE_TIMEOUT_MS),
    });
  } catch {
    return LOCAL.badGateway();
  }
  if (res.status !== 200) return relayJson(res);

  const disposition = templateDisposition(
    res.headers.get('content-disposition'),
    query.type,
    query.format,
  );
  if (!disposition || !res.body) {
    await res.body?.cancel();
    return LOCAL.badGateway();
  }
  return new Response(res.body, {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': TEMPLATE_CONTENT_TYPES[query.format],
      'Content-Disposition': disposition,
    },
  });
}

/** Cuenta los bytes al pasar y corta el stream si superan el tope (por si el tamaño mintiera). */
function limitBody(body: ReadableStream<Uint8Array>, max: number) {
  const state = { exceeded: false };
  let seen = 0;
  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) {
          state.exceeded = true;
          controller.error(new Error('body too large'));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return { stream, state };
}

export async function POST(request: NextRequest, { params }: Ctx): Promise<Response> {
  const resolved = resolveAction((await params).accion, 'POST');
  if (!resolved.ok) {
    return resolved.status === 404 ? LOCAL.notFound() : LOCAL.method(resolved.allow ?? 'GET');
  }
  const action: ImportAction = resolved.action;
  if (!sameOrigin(request)) return LOCAL.origin();

  const size = checkContentLength(request.headers.get('content-length'));
  if (!size.ok) {
    if (size.reason === 'empty') return LOCAL.badRequest('Debes adjuntar el archivo');
    if (size.reason === 'invalid') return LOCAL.badRequest('Tamaño del envío no válido');
    return LOCAL.tooLarge();
  }
  const contentType = cleanMultipartContentType(request.headers.get('content-type'));
  if (!contentType) return LOCAL.unsupported();
  if (!request.body) return LOCAL.badRequest('Debes adjuntar el archivo');

  const { stream, state } = limitBody(request.body, MAX_BODY_BYTES);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${IMPORT_ACTIONS[action].apiPath}`, {
      method: 'POST',
      headers: apiHeaders(request, { 'Content-Type': contentType }),
      body: stream,
      // Necesario para enviar un ReadableStream como cuerpo con fetch de Node (undici).
      duplex: 'half',
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    } as RequestInit & { duplex: 'half' });
  } catch {
    return state.exceeded ? LOCAL.tooLarge() : LOCAL.badGateway();
  }
  return relayJson(res);
}
