// TEMPORAL (F5, D-037): errores de la API para la web hasta que Dev 1 publique su cliente.
// Lógica pura (sin `server-only`) para poder probarla con Vitest.
//
// Sobre de error de la API (docs/03, ApiExceptionFilter):
//   { error: { code, message, details: [{ path, message }] }, requestId }

export type ApiErrorDetail = { path: string; message: string };

/** Status que usamos cuando no hubo respuesta HTTP (red caída, DNS, timeout). */
export const NETWORK_ERROR_STATUS = 0;

/** Comando para crear la sesión local mientras no hay login (solo se muestra en desarrollo). */
export const DEV_SESSION_COMMAND =
  'pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed/dev-session.ts';

const MAX_SERVER_MESSAGE = 300;
const MAX_DETAILS = 20;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details: ApiErrorDetail[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const cleanText = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 && t.length <= MAX_SERVER_MESSAGE ? t : undefined;
};

/**
 * Convierte la respuesta de error de la API en un ApiError. Tolera cuerpos que no siguen el
 * sobre (por ejemplo, el 413 de multer o un HTML de un proxy): nunca lanza.
 */
export function parseApiError(status: number, body: unknown): ApiError {
  const envelope = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const code = cleanText(envelope?.code) ?? 'ERROR';
  const message = cleanText(envelope?.message) ?? '';
  const details: ApiErrorDetail[] = [];
  if (envelope && Array.isArray(envelope.details)) {
    for (const d of envelope.details.slice(0, MAX_DETAILS)) {
      if (!isRecord(d)) continue;
      const msg = cleanText(d.message);
      if (!msg) continue;
      details.push({ path: typeof d.path === 'string' ? d.path : '', message: msg });
    }
  }
  const requestId = isRecord(body) ? cleanText(body.requestId) : undefined;
  return new ApiError(status, code, message, details, requestId);
}

export function networkError(): ApiError {
  return new ApiError(NETWORK_ERROR_STATUS, 'NETWORK_ERROR', '');
}

type MessageOptions = { isProduction?: boolean };

/**
 * Mensaje en español para la persona usuaria, según el status.
 * - 401, 403, 413, 429, 5xx y red: textos propios (los de la API no traen tildes o están en
 *   inglés).
 * - 400, 404, 409 y 422: el mensaje de la API (son textos fijos en español del módulo), con un
 *   texto propio si viene vacío o es el genérico "Solicitud invalida".
 */
export function toUserMessage(error: unknown, options: MessageOptions = {}): string {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';
  if (!(error instanceof ApiError)) {
    return 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
  const serverMessage =
    error.message && error.message !== 'Solicitud invalida' ? error.message : '';
  const status = error.status;
  if (status === NETWORK_ERROR_STATUS) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }
  if (status === 401) {
    return isProduction
      ? 'Tu sesión terminó o no has iniciado sesión. Inicia sesión de nuevo.'
      : `No hay sesión activa. En desarrollo, crea una con: ${DEV_SESSION_COMMAND}`;
  }
  if (status === 403) return 'No tienes permiso para realizar esta acción.';
  if (status === 404) {
    return serverMessage || 'El registro no existe o ya no está disponible.';
  }
  if (status === 400) return serverMessage || 'Revisa los datos ingresados.';
  if (status === 409) {
    return (
      serverMessage || 'El registro cambió o está en uso. Actualiza la página e inténtalo de nuevo.'
    );
  }
  if (status === 422) return serverMessage || 'La operación no cumple las reglas del sistema.';
  if (status === 413) return 'El archivo supera el tamaño permitido.';
  if (status === 429) {
    return 'Hiciste demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.';
  }
  if (status >= 500) {
    return 'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.';
  }
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}

/**
 * Mensajes de `details` (validación o fechas), sin repetir. `labelOf` puede anteponer un
 * nombre legible según el `path` (p. ej. "II Bimestre"). Vacío si no es un ApiError.
 */
export function detailMessages(
  error: unknown,
  labelOf?: (path: string) => string | undefined,
): string[] {
  if (!(error instanceof ApiError)) return [];
  const lines = error.details.map((d) => {
    const label = labelOf?.(d.path);
    return label ? `${label}: ${d.message}` : d.message;
  });
  return [...new Set(lines)];
}
