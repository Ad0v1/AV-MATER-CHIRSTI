// Máquina de estados y lectura de respuestas de la pantalla de importación (RF-21). Lógica pura,
// probada con Vitest. La pantalla nunca lee el contenido del archivo: solo su tamaño y su
// extensión para avisar antes de subirlo.
//
//   idle ──VALIDATE──▶ validando ──PREVIEW_OK──▶ reporte (con errores) | confirmable
//   confirmable ──CONFIRM──▶ confirmando ──COMMIT_OK──▶ hecho
//   confirmando ──COMMIT_FAILED 409/422/400/413/415──▶ reporte (hay que volver a validar)
//   confirmando ──COMMIT_FAILED 401/403/429/5xx/red──▶ confirmable (se puede reintentar)
//   Cambiar el tipo o el archivo descarta el reporte y vuelve a idle.
import { ApiError, parseApiError, toUserMessage } from '@/lib/api/errors';
import {
  MAX_FILE_BYTES,
  isImportFormat,
  isImportType,
  type ImportFormat,
  type ImportType,
} from './import-guards';

export const MAX_ROW_ERRORS = 500;

export type ImportRowError = {
  row: number;
  column: string | null;
  code: string;
  message: string;
};

export type ImportReport = {
  type: ImportType;
  format: ImportFormat;
  sha256: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ImportRowError[];
  errorsTruncated: boolean;
  summary: { users: number; enrollments: number; links: number };
  canConfirm: boolean;
};

export type ImportCommitResult = {
  type: ImportType;
  created: { users: number; enrollments: number; links: number };
};

export type ImportPhase =
  'idle' | 'validando' | 'reporte' | 'confirmable' | 'confirmando' | 'hecho';

export type ImportState = {
  phase: ImportPhase;
  type: ImportType;
  hasFile: boolean;
  /** Error del archivo elegido (tamaño o extensión), antes de subirlo. */
  fileError: string | null;
  report: ImportReport | null;
  /** Errores por fila que se muestran: los del reporte o los `details` de un 422 del commit. */
  rowErrors: ImportRowError[];
  rowErrorsTruncated: boolean;
  /** Mensaje de error de la última petición. */
  message: string | null;
  result: ImportCommitResult | null;
};

export type FileInfo = { size: number; name: string };

export type ImportEvent =
  | { type: 'TYPE_CHANGED'; importType: ImportType }
  | { type: 'FILE_CHANGED'; file: FileInfo | null }
  | { type: 'VALIDATE' }
  | { type: 'PREVIEW_OK'; report: ImportReport }
  | { type: 'PREVIEW_FAILED'; message: string }
  | { type: 'CONFIRM' }
  | { type: 'COMMIT_OK'; result: ImportCommitResult }
  | { type: 'COMMIT_FAILED'; status: number; message: string; rowErrors?: ImportRowError[] }
  | { type: 'RESET' };

export const initialImportState = (type: ImportType = 'students'): ImportState => ({
  phase: 'idle',
  type,
  hasFile: false,
  fileError: null,
  report: null,
  rowErrors: [],
  rowErrorsTruncated: false,
  message: null,
  result: null,
});

export const FILE_TOO_LARGE_MESSAGE = 'El archivo supera 1 MiB';
export const FILE_FORMAT_MESSAGE = 'Formato no admitido: usa un archivo .xlsx o .csv';
export const TOO_MANY_REQUESTS_MESSAGE = 'Demasiados intentos; espera un minuto';

/** Comprueba el archivo elegido sin leerlo: solo tamaño y extensión. */
export function checkFile(file: FileInfo): string | null {
  if (!/\.(xlsx|csv)$/i.test(file.name)) return FILE_FORMAT_MESSAGE;
  if (file.size > MAX_FILE_BYTES) return FILE_TOO_LARGE_MESSAGE;
  if (file.size === 0) return 'El archivo está vacío';
  return null;
}

/** Fases en que se puede pulsar "Validar". */
export const canValidate = (s: ImportState): boolean =>
  s.hasFile && (s.phase === 'idle' || s.phase === 'reporte' || s.phase === 'confirmable');

export const isBusy = (s: ImportState): boolean =>
  s.phase === 'validando' || s.phase === 'confirmando';

/** Un 409/400/413/415/422 en el commit invalida la vista previa: hay que volver a validar. */
const COMMIT_BACK_TO_REPORT = new Set([400, 409, 413, 415, 422]);

const discardReport = (s: ImportState): ImportState => ({
  ...s,
  phase: 'idle',
  report: null,
  rowErrors: [],
  rowErrorsTruncated: false,
  message: null,
  result: null,
});

export function importReducer(state: ImportState, event: ImportEvent): ImportState {
  switch (event.type) {
    case 'TYPE_CHANGED':
      if (isBusy(state) || event.importType === state.type) return state;
      return { ...discardReport(state), type: event.importType };
    case 'FILE_CHANGED': {
      if (isBusy(state)) return state;
      const fileError = event.file ? checkFile(event.file) : null;
      return {
        ...discardReport(state),
        hasFile: event.file !== null && fileError === null,
        fileError,
      };
    }
    case 'VALIDATE':
      if (!canValidate(state)) return state;
      return {
        ...state,
        phase: 'validando',
        report: null,
        rowErrors: [],
        rowErrorsTruncated: false,
        message: null,
      };
    case 'PREVIEW_OK':
      if (state.phase !== 'validando') return state;
      return {
        ...state,
        phase: event.report.canConfirm ? 'confirmable' : 'reporte',
        report: event.report,
        rowErrors: event.report.errors,
        rowErrorsTruncated: event.report.errorsTruncated,
        message: null,
      };
    case 'PREVIEW_FAILED':
      if (state.phase !== 'validando') return state;
      return { ...state, phase: 'idle', message: event.message };
    case 'CONFIRM':
      if (state.phase !== 'confirmable' || !state.report?.canConfirm) return state;
      return { ...state, phase: 'confirmando', message: null };
    case 'COMMIT_OK':
      if (state.phase !== 'confirmando') return state;
      return { ...state, phase: 'hecho', result: event.result, message: null };
    case 'COMMIT_FAILED': {
      if (state.phase !== 'confirmando') return state;
      if (!COMMIT_BACK_TO_REPORT.has(event.status)) {
        return { ...state, phase: 'confirmable', message: event.message };
      }
      const details = event.status === 422 ? (event.rowErrors ?? []) : null;
      return {
        ...state,
        phase: 'reporte',
        message: event.message,
        rowErrors: details ?? state.rowErrors,
        rowErrorsTruncated: details ? details.length >= MAX_ROW_ERRORS : state.rowErrorsTruncated,
      };
    }
    case 'RESET':
      return initialImportState(state.type);
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------------------------
// Lectura defensiva de las respuestas (la API es de confianza, pero el puente puede devolver un
// error propio o un proxy un HTML). Nunca lanza.

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

const cleanText = (v: unknown, max = 300): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : null;
};

function parseRowError(v: unknown): ImportRowError | null {
  if (!isRecord(v)) return null;
  const message = cleanText(v.message);
  if (!isCount(v.row) || v.row < 1 || !message) return null;
  const column = v.column === null ? null : cleanText(v.column, 64);
  if (column === null && v.column !== null) return null;
  return { row: v.row, column, code: cleanText(v.code, 64) ?? 'ERROR', message };
}

export function parseRowErrors(v: unknown): ImportRowError[] {
  if (!Array.isArray(v)) return [];
  const out: ImportRowError[] = [];
  for (const item of v.slice(0, MAX_ROW_ERRORS)) {
    const e = parseRowError(item);
    if (e) out.push(e);
  }
  return out;
}

const SHA256 = /^[0-9a-f]{64}$/;

export function parseImportReport(v: unknown): ImportReport | null {
  if (!isRecord(v) || !isRecord(v.summary)) return null;
  const { summary } = v;
  if (
    !isImportType(v.type) ||
    !isImportFormat(v.format) ||
    typeof v.sha256 !== 'string' ||
    !SHA256.test(v.sha256) ||
    !isCount(v.totalRows) ||
    !isCount(v.validRows) ||
    !isCount(v.errorRows) ||
    typeof v.errorsTruncated !== 'boolean' ||
    typeof v.canConfirm !== 'boolean' ||
    !Array.isArray(v.errors) ||
    !isCount(summary.users) ||
    !isCount(summary.enrollments) ||
    !isCount(summary.links)
  ) {
    return null;
  }
  const errors = parseRowErrors(v.errors);
  return {
    type: v.type,
    format: v.format,
    sha256: v.sha256,
    totalRows: v.totalRows,
    validRows: v.validRows,
    errorRows: v.errorRows,
    errors,
    errorsTruncated: v.errorsTruncated,
    summary: { users: summary.users, enrollments: summary.enrollments, links: summary.links },
    // Solo se confirma si la API lo dice y no hay ningún error a la vista.
    canConfirm: v.canConfirm && errors.length === 0 && v.errorRows === 0,
  };
}

export function parseCommitResult(v: unknown): ImportCommitResult | null {
  if (!isRecord(v) || !isImportType(v.type) || !isRecord(v.created)) return null;
  const { created } = v;
  if (!isCount(created.users) || !isCount(created.enrollments) || !isCount(created.links)) {
    return null;
  }
  return {
    type: v.type,
    created: { users: created.users, enrollments: created.enrollments, links: created.links },
  };
}

/** `details` de un 422 del commit (errores por fila con el formato de ImportRowError). */
export function commitRowErrors(body: unknown): ImportRowError[] {
  return isRecord(body) && isRecord(body.error) ? parseRowErrors(body.error.details) : [];
}

/**
 * Mensaje para la persona usuaria según el status. 413 y 429 tienen textos propios de la
 * importación; 415 usa el mensaje fijo de la API; el resto, toUserMessage.
 */
export function importErrorMessage(
  status: number,
  body: unknown,
  options: { isProduction?: boolean } = {},
): string {
  if (status === 413) return FILE_TOO_LARGE_MESSAGE;
  if (status === 429) return TOO_MANY_REQUESTS_MESSAGE;
  const error: ApiError = parseApiError(status, body);
  if (status === 415) return error.message || FILE_FORMAT_MESSAGE;
  if (status === 422) {
    return error.message && error.message !== 'Solicitud invalida'
      ? error.message
      : 'El archivo tiene errores; no se importó nada. Revisa la tabla.';
  }
  return toUserMessage(error, options);
}

// ---------------------------------------------------------------------------------------------
// Textos

export const TYPE_LABELS: Record<ImportType, string> = {
  students: 'Estudiantes',
  teachers: 'Docentes',
  guardians: 'Apoderados',
};

export const PRIVACY_NOTICE =
  'El archivo no se guarda; los motivos no muestran datos de las celdas';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Qué se crearía o se creó, según el tipo (solo lo que aplica). */
export function countsText(
  type: ImportType,
  c: { users: number; enrollments: number; links: number },
): string {
  const users = plural(c.users, 'usuario', 'usuarios');
  if (type === 'students') return `${users} y ${plural(c.enrollments, 'matrícula', 'matrículas')}`;
  if (type === 'guardians') return `${users} y ${plural(c.links, 'vínculo', 'vínculos')}`;
  return users;
}

/** "Se crearán 2 usuarios…" / "Se creará 1 usuario…" (el verbo concuerda con los usuarios). */
export const willCreateText = (
  type: ImportType,
  c: { users: number; enrollments: number; links: number },
): string => `${c.users === 1 ? 'Se creará' : 'Se crearán'} ${countsText(type, c)}`;

/** "Se crearon 2 usuarios…" / "Se creó 1 usuario…". */
export const createdText = (
  type: ImportType,
  c: { users: number; enrollments: number; links: number },
): string => `${c.users === 1 ? 'Se creó' : 'Se crearon'} ${countsText(type, c)}`;

export function previewAnnouncement(r: ImportReport): string {
  const rows = plural(r.totalRows, 'fila', 'filas');
  return r.canConfirm
    ? `Validación terminada: ${rows} sin errores. ${willCreateText(r.type, r.summary)} al confirmar.`
    : `Validación terminada: ${rows}, ${r.errorRows} con errores. Corrige el archivo y vuelve a validarlo.`;
}

export function commitAnnouncement(r: ImportCommitResult): string {
  return `Importación terminada. ${createdText(r.type, r.created)}.`;
}

export const VALIDATING_MESSAGE = 'Validando el archivo…';
export const IMPORTING_MESSAGE = 'Importando…';

/**
 * Aviso al cambiar el tipo si eso descarta un reporte (BAJO de UX, INFORME 19); null si no hay
 * nada que descartar o el cambio no se aplicaría (mismo tipo o petición en curso).
 */
export function typeChangeMessage(state: ImportState, next: ImportType): string | null {
  if (isBusy(state) || next === state.type || !state.report) return null;
  return `Cambiaste el tipo a ${TYPE_LABELS[next].toLowerCase()}: se descartó el resultado de la validación. Vuelve a validar el archivo.`;
}

/** Columna de un error: la de la plantilla o "Toda la fila". */
export const columnLabel = (column: string | null): string => column ?? 'Toda la fila';

/** Ruta del puente de la importación. */
export const IMPORT_FILE_PATH = '/admin/usuarios/importar/archivo';

export const templateHref = (type: ImportType, format: ImportFormat): string =>
  `${IMPORT_FILE_PATH}/plantilla?${new URLSearchParams({ type, format })}`;
