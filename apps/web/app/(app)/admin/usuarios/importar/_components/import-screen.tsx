'use client';

// Pantalla de importación masiva (RF-21; RNF-09..13, RNF-24..27). Desde 360 px y WCAG 2.1 AA.
//
// - El archivo nunca se lee aquí: se mira su tamaño y su extensión y se sube tal cual al puente
//   (Route Handler), que lo reenvía a la API. La confirmación vuelve a subir el MISMO File con el
//   sha256 de la vista previa (la API exige que coincida).
// - La máquina de estados vive en `_lib/import-machine.ts` (lógica pura, con tests).
// - Foco: tras validar va al título del reporte; tras un error, al aviso; tras importar, al título
//   del resultado (que además se anuncia en la región de estado siempre montada).
import { useEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  GraduationCap,
  ListChecks,
  Lock,
  Presentation,
  RefreshCw,
  TriangleAlert,
  Upload,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useAnnounce } from '../../../_shared/components/action-feedback';
import { TOUCH } from '../../../_shared/components/styles';
import { FOCUS_HEADING } from '../../../_shared/lib/focus';
import { USERS_PATH } from '../../_lib/users';
import { IMPORT_TYPES, type ImportFormat, type ImportType } from '../_lib/import-guards';
import {
  CREDENTIALS_WARNING,
  IMPORTING_MESSAGE,
  IMPORT_FILE_PATH,
  MAX_ROW_ERRORS,
  PRIVACY_NOTICE,
  TYPE_LABELS,
  canValidate,
  checkFile,
  columnLabel,
  commitAnnouncement,
  commitRowErrors,
  createdText,
  importErrorMessage,
  importReducer,
  initialImportState,
  isBusy,
  parseCommitResult,
  parseImportReport,
  previewAnnouncement,
  sheetBlob,
  templateHref,
  typeChangeMessage,
  VALIDATING_MESSAGE,
  willCreateText,
  type ImportRowError,
} from '../_lib/import-machine';

const REPORT_TITLE_ID = 'reporte-importacion-titulo';
const DONE_TITLE_ID = 'importacion-hecha-titulo';

type Col = { name: string; optional?: boolean };

const TYPE_COLUMNS: Record<ImportType, Col[]> = {
  students: [
    { name: 'dni' },
    { name: 'nombre_completo' },
    { name: 'grado' },
    { name: 'seccion' },
    { name: 'dni_apoderado' },
    { name: 'nombre_apoderado', optional: true },
    { name: 'dni_apoderado_2', optional: true },
    { name: 'nombre_apoderado_2', optional: true },
  ],
  teachers: [{ name: 'dni' }, { name: 'nombre_completo' }],
  guardians: [
    { name: 'dni_apoderado' },
    { name: 'nombre_apoderado', optional: true },
    { name: 'dni_estudiante' },
  ],
};

const TYPE_ICONS: Record<ImportType, LucideIcon> = {
  students: GraduationCap,
  teachers: Presentation,
  guardians: UsersRound,
};

type FocusTarget = 'start' | 'alert' | 'report' | 'done' | null;

type Reply = { status: number; body: unknown };

/** POST multipart al puente. Nunca lanza: sin respuesta, status 0 (red). */
async function send(action: 'preview' | 'commit', form: FormData): Promise<Reply> {
  let res: Response;
  try {
    res = await fetch(`${IMPORT_FILE_PATH}/${action}`, {
      method: 'POST',
      body: form,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    return { status: 0, body: null };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Guarda un archivo en memoria como descarga del navegador. */
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ImportScreen() {
  const [state, dispatch] = useReducer(importReducer, undefined, () => initialImportState());
  const file = useRef<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ImportFormat | null>(null);
  const [sheetState, setSheetState] = useState<'pending' | 'downloaded' | 'failed'>('pending');
  const announce = useAnnounce();

  const alertRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const startRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<FocusTarget>(null);

  // El foco se mueve después de pintar el nuevo estado.
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const refs = { start: startRef, alert: alertRef, report: reportRef, done: doneRef };
    const el = refs[target].current;
    el?.focus();
  }, [state]);

  const busy = isBusy(state);

  // Las plantillas se piden en segundo plano al elegir el tipo; al hacer clic ya están listas.
  const templates = useRef(new Map<string, Promise<Blob | null>>());
  function fetchTemplate(type: ImportType, format: ImportFormat): Promise<Blob | null> {
    const key = `${type}.${format}`;
    let pending = templates.current.get(key);
    if (!pending) {
      pending = fetch(templateHref(type, format), { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.blob() : null))
        .catch(() => null);
      templates.current.set(key, pending);
    }
    return pending;
  }
  useEffect(() => {
    void fetchTemplate(state.type, 'xlsx');
    void fetchTemplate(state.type, 'csv');
  }, [state.type]);

  async function downloadTemplate(format: ImportFormat) {
    setTemplateError(null);
    setDownloading(format);
    try {
      const ready = await fetchTemplate(state.type, format);
      if (ready) {
        saveBlob(ready, `plantilla-${state.type}.${format}`);
        announce(`Plantilla de ${TYPE_LABELS[state.type].toLowerCase()} descargada.`);
        return;
      }
      // Sin copia lista (falló la precarga): se pide de nuevo para mostrar el error real.
      templates.current.delete(`${state.type}.${format}`);
      let res: Response;
      try {
        res = await fetch(templateHref(state.type, format), {
          cache: 'no-store',
          credentials: 'same-origin',
        });
      } catch {
        setTemplateError(importErrorMessage(0, null));
        return;
      }
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        const message = importErrorMessage(res.status, body);
        setTemplateError(message);
        announce(`No se pudo descargar la plantilla. ${message}`);
        return;
      }
      saveBlob(await res.blob(), `plantilla-${state.type}.${format}`);
      announce(`Plantilla de ${TYPE_LABELS[state.type].toLowerCase()} descargada.`);
    } finally {
      setDownloading(null);
    }
  }

  async function validate() {
    const current = file.current;
    if (!current || !canValidate(state)) return;
    const type = state.type;
    dispatch({ type: 'VALIDATE' });
    // aria-busy en el botón no se anuncia: se avisa en la región de estado (MEDIO de UX, INFORME 19).
    announce(VALIDATING_MESSAGE);
    const form = new FormData();
    form.append('type', type);
    form.append('file', current);
    const reply = await send('preview', form);
    const report = reply.status === 200 ? parseImportReport(reply.body) : null;
    if (report && report.type === type) {
      focusNext.current = 'report';
      dispatch({ type: 'PREVIEW_OK', report });
      announce(previewAnnouncement(report));
      return;
    }
    focusNext.current = 'alert';
    dispatch({
      type: 'PREVIEW_FAILED',
      message: importErrorMessage(reply.status === 200 ? 502 : reply.status, reply.body),
    });
  }

  async function confirm() {
    const current = file.current;
    const report = state.report;
    if (!current || !report || state.phase !== 'confirmable') return;
    dispatch({ type: 'CONFIRM' });
    announce(IMPORTING_MESSAGE);
    const form = new FormData();
    form.append('type', report.type);
    form.append('sha256', report.sha256);
    form.append('file', current);
    const reply = await send('commit', form);
    const result = reply.status === 201 ? parseCommitResult(reply.body) : null;
    if (result) {
      focusNext.current = 'done';
      dispatch({ type: 'COMMIT_OK', result });
      announce(commitAnnouncement(result));
      return;
    }
    const status = reply.status === 201 ? 502 : reply.status;
    focusNext.current = 'alert';
    dispatch({
      type: 'COMMIT_FAILED',
      status,
      message: importErrorMessage(status, reply.body),
      rowErrors: status === 422 ? commitRowErrors(reply.body) : undefined,
    });
  }

  function downloadSheet() {
    const sheet = state.result?.credentialsSheet;
    const blob = sheet ? sheetBlob(sheet) : null;
    if (!sheet || !blob) {
      setSheetState('failed');
      announce('No se pudo preparar la hoja de credenciales.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sheet.filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setSheetState('downloaded');
    announce('Hoja de credenciales descargada.');
  }

  function reset() {
    file.current = null;
    setFileName(null);
    setSheetState('pending');
    setInputKey((k) => k + 1);
    // El botón desaparece: el foco va al inicio del paso 1, no a <body> (MEDIO de UX, INFORME 19).
    focusNext.current = 'start';
    dispatch({ type: 'RESET' });
  }

  const alertTitle =
    state.phase === 'idle' ? 'No se pudo validar el archivo' : 'No se importó el archivo';

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="importar-archivo-titulo" className="flex flex-col gap-4">
        <h2
          id="importar-archivo-titulo"
          ref={startRef}
          tabIndex={-1}
          className={cn('flex items-center gap-2.5 text-lg font-semibold', FOCUS_HEADING)}
        >
          <StepBadge n={1} tone="brand" />
          Elige el tipo y el archivo
        </h2>

        <Block label="Tipo de usuarios">
          <div role="group" aria-label="Tipo de usuarios" className="flex flex-wrap gap-2">
            {IMPORT_TYPES.map((t) => {
              const current = t === state.type;
              const Icon = TYPE_ICONS[t];
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={current}
                  disabled={busy}
                  onClick={() => {
                    if (current) return;
                    const message = typeChangeMessage(state, t);
                    dispatch({ type: 'TYPE_CHANGED', importType: t });
                    if (message) announce(message);
                    setTemplateError(null);
                  }}
                  className={cn(
                    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active disabled:cursor-not-allowed disabled:opacity-60',
                    current
                      ? 'border-brand bg-brand text-white shadow-sm'
                      : 'border-line bg-background text-ink-2 hover:bg-brand-soft hover:text-brand',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">Columnas de la plantilla:</p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Columnas de la plantilla">
              {TYPE_COLUMNS[state.type].map((c) => (
                <li
                  key={c.name}
                  className={cn(
                    'rounded-md px-2 py-0.5 font-mono text-xs',
                    c.optional
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                      : 'bg-brand-soft text-brand',
                  )}
                >
                  {c.name}
                  {c.optional ? <span className="sr-only"> (opcional)</span> : null}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              <span className="mr-1 inline-block size-2 rounded-sm bg-brand-soft ring-1 ring-brand/30" />
              Obligatoria
              <span className="mr-1 ml-3 inline-block size-2 rounded-sm bg-amber-100 ring-1 ring-amber-400" />
              Opcional
            </p>
          </div>
        </Block>

        <Block label="Plantilla">
          <p className="text-sm text-muted-foreground">
            Descárgala, llénala y guárdala sin cambiar los encabezados.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {(['xlsx', 'csv'] as const).map((format) => (
              <button
                key={format}
                type="button"
                disabled={downloading === format}
                aria-busy={downloading === format || undefined}
                onClick={() => void downloadTemplate(format)}
                className="group inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-sm font-medium text-brand hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active disabled:cursor-wait disabled:opacity-60 md:min-h-9"
              >
                {downloading === format ? (
                  <Loader2
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Download className="size-4" aria-hidden="true" />
                )}
                {format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV'}
              </button>
            ))}
          </div>
          {templateError ? (
            <p className="text-sm text-destructive" role="alert">
              {templateError}
            </p>
          ) : null}
        </Block>

        <Block label="Sube el archivo lleno">
          <div
            className={cn(
              'relative flex min-h-32 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-5 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-line-active',
              state.fileError
                ? 'border-red-600 bg-red-50 dark:bg-red-950/30'
                : fileName
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'
                  : 'border-line bg-brand-soft/40 hover:bg-brand-soft',
              busy && 'opacity-60',
            )}
          >
            {fileName && !state.fileError ? (
              <FileCheck2 className="size-7 text-emerald-700" aria-hidden="true" />
            ) : state.fileError ? (
              <TriangleAlert className="size-7 text-red-700" aria-hidden="true" />
            ) : (
              <Upload className="size-7 text-brand" aria-hidden="true" />
            )}
            <p className="text-sm font-semibold">
              {fileName ?? 'Arrastra tu archivo aquí o haz clic para elegirlo'}
            </p>
            <p className="text-xs text-muted-foreground">
              {fileName
                ? 'Haz clic para cambiar de archivo'
                : '.xlsx o .csv · hasta 1 MiB y 1000 filas'}
            </p>
            <input
              key={inputKey}
              name="file"
              type="file"
              accept=".xlsx,.csv"
              disabled={busy}
              aria-label="Archivo (.xlsx o .csv)"
              aria-invalid={state.fileError ? true : undefined}
              aria-describedby={state.fileError ? 'importar-archivo-error' : undefined}
              className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              onChange={(e) => {
                const chosen = e.currentTarget.files?.[0] ?? null;
                const info = chosen ? { size: chosen.size, name: chosen.name } : null;
                const fileError = info ? checkFile(info) : null;
                dispatch({ type: 'FILE_CHANGED', file: info });
                // Solo se guarda si pasa las comprobaciones de tamaño y extensión (sin leerlo).
                file.current = chosen && fileError === null ? chosen : null;
                setFileName(chosen && fileError === null ? chosen.name : null);
                // El error del campo se ve, pero no se oía (MEDIO de UX, INFORME 19).
                if (fileError) announce(`Archivo rechazado: ${fileError}.`);
              }}
            />
          </div>
          {state.fileError ? (
            <p id="importar-archivo-error" className="text-sm text-red-700 dark:text-red-300">
              {state.fileError}
            </p>
          ) : null}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            {PRIVACY_NOTICE}.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              className={cn(TOUCH, 'gap-2 px-6')}
              disabled={!canValidate(state)}
              aria-busy={state.phase === 'validando' || undefined}
              onClick={() => void validate()}
            >
              <ListChecks className="size-4" aria-hidden="true" />
              {state.phase === 'validando' ? 'Validando…' : 'Validar archivo'}
            </Button>
            {!state.hasFile && state.phase === 'idle' ? (
              <p className="text-sm text-muted-foreground">Elige un archivo para validarlo.</p>
            ) : null}
          </div>
        </Block>
      </section>

      {state.message ? (
        <ErrorNotice alertRef={alertRef} title={alertTitle} message={state.message} />
      ) : null}

      {state.report && state.phase !== 'hecho' ? (
        <section aria-labelledby={REPORT_TITLE_ID} className="flex flex-col gap-4">
          <h2
            id={REPORT_TITLE_ID}
            ref={reportRef}
            tabIndex={-1}
            className={cn('flex items-center gap-2.5 text-lg font-semibold', FOCUS_HEADING)}
          >
            <StepBadge n={2} tone="info" />
            Resultado de la validación
          </h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Total label="Filas leídas" value={state.report.totalRows} tone="info" />
            <Total label="Filas válidas" value={state.report.validRows} tone="ok" />
            <Total
              label="Filas con errores"
              value={state.report.errorRows}
              tone={state.report.errorRows > 0 ? 'error' : 'neutral'}
            />
          </dl>
          {state.report.canConfirm && state.phase !== 'reporte' ? (
            <Notice tone="ok" icon={CheckCircle2}>
              {willCreateText(state.report.type, state.report.summary)}. Nada se crea hasta que
              confirmes.
            </Notice>
          ) : state.report.canConfirm ? (
            <Notice tone="warn" icon={RefreshCw}>
              Vuelve a validar el archivo antes de confirmar.
            </Notice>
          ) : (
            <Notice tone="error" icon={TriangleAlert}>
              Corrige las filas marcadas en tu archivo y vuelve a validarlo. No se importa nada
              mientras haya errores.
            </Notice>
          )}

          {state.rowErrors.length > 0 ? (
            <RowErrors errors={state.rowErrors} truncated={state.rowErrorsTruncated} />
          ) : null}

          {state.phase === 'confirmable' || state.phase === 'confirmando' ? (
            <div>
              <Button
                type="button"
                className={cn(TOUCH, 'gap-2 bg-emerald-700 text-white hover:bg-emerald-800')}
                disabled={state.phase === 'confirmando'}
                aria-busy={state.phase === 'confirmando' || undefined}
                onClick={() => void confirm()}
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {state.phase === 'confirmando' ? 'Importando…' : 'Confirmar importación'}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {state.phase === 'hecho' && state.result ? (
        <section
          aria-labelledby={DONE_TITLE_ID}
          className="flex flex-col gap-3 rounded-xl border border-emerald-600/50 bg-emerald-50 p-5 dark:border-emerald-400/50 dark:bg-emerald-950/30"
        >
          <h2
            id={DONE_TITLE_ID}
            ref={doneRef}
            tabIndex={-1}
            className={cn('flex items-center gap-2.5 text-lg font-semibold', FOCUS_HEADING)}
          >
            <span className="grid size-8 place-items-center rounded-full bg-emerald-700 text-white">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </span>
            Importación completada
          </h2>
          <p className="text-sm">{createdText(state.result.type, state.result.created)}.</p>
          {state.result.credentialsSheet ? (
            <Alert role="note">
              <AlertTitle>Hoja de credenciales</AlertTitle>
              <AlertDescription>
                <p>{CREDENTIALS_WARNING}</p>
                <div className="mt-3">
                  <Button type="button" className={TOUCH} onClick={downloadSheet}>
                    {sheetState === 'downloaded'
                      ? 'Descargar de nuevo la hoja'
                      : 'Descargar hoja de credenciales (.xlsx)'}
                  </Button>
                </div>
                {sheetState === 'failed' ? (
                  <p className="mt-2 text-destructive" role="alert">
                    No se pudo preparar la hoja. Restablece la contraseña de cada usuario desde su
                    ficha.
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={USERS_PATH}
              className={cn(
                buttonVariants({ variant: 'default' }),
                TOUCH,
                'inline-flex items-center',
              )}
            >
              Ver usuarios
            </Link>
            <Button type="button" variant="outline" className={TOUCH} onClick={reset}>
              Importar otro archivo
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

const TONES = {
  info: 'bg-blue-50 ring-blue-200 text-blue-900 dark:bg-blue-950/30 dark:ring-blue-900 dark:text-blue-100',
  ok: 'bg-emerald-50 ring-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:ring-emerald-900 dark:text-emerald-100',
  error:
    'bg-red-50 ring-red-200 text-red-900 dark:bg-red-950/30 dark:ring-red-900 dark:text-red-100',
  warn: 'bg-amber-50 ring-amber-300 text-amber-900 dark:bg-amber-950/30 dark:ring-amber-800 dark:text-amber-100',
  neutral: 'ring-foreground/10',
} as const;

function Total({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONES }) {
  return (
    <div className={cn('rounded-xl p-3 ring-1', TONES[tone])}>
      <dt className="text-sm opacity-80">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Subsección de un paso: solo una etiqueta pequeña y su contenido (sin cajas anidadas). */
function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink-2">{label}</h3>
      {children}
    </div>
  );
}

/** Círculo numerado de cada paso. */
function StepBadge({ n, tone }: { n: number; tone: 'brand' | 'info' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white',
        tone === 'brand' ? 'bg-brand' : 'bg-blue-700',
      )}
    >
      {n}
    </span>
  );
}

/** Mensaje de resultado en una caja de color con icono. */
function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'ok' | 'warn' | 'error';
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <p className={cn('flex items-start gap-2.5 rounded-xl p-3 text-sm ring-1', TONES[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Aviso de error que recibe el foco por código (sin role="alert": se lee al enfocarlo). */
function ErrorNotice({
  alertRef,
  title,
  message,
}: {
  alertRef: RefObject<HTMLDivElement | null>;
  title: string;
  message: string;
}) {
  return (
    <Alert
      variant="destructive"
      ref={alertRef}
      role="group"
      aria-labelledby="importar-error-titulo"
      aria-describedby="importar-error-mensaje"
      tabIndex={-1}
      className="outline-none focus:ring-3 focus:ring-ring/60"
    >
      <AlertTitle id="importar-error-titulo">{title}</AlertTitle>
      <AlertDescription id="importar-error-mensaje">
        <p className="break-words">{message}</p>
      </AlertDescription>
    </Alert>
  );
}

/** Errores por fila: solo fila, columna y motivo (nunca el valor de la celda). */
function RowErrors({ errors, truncated }: { errors: ImportRowError[]; truncated: boolean }) {
  const caption = `Errores por fila (${errors.length})`;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-base font-semibold text-red-800 dark:text-red-300">
        <TriangleAlert className="size-4" aria-hidden="true" />
        {caption}
      </h3>
      {truncated ? (
        <Alert role="note">
          <AlertTitle>Hay más errores</AlertTitle>
          <AlertDescription>
            Se muestran los primeros {MAX_ROW_ERRORS}. Corrige estos y vuelve a validar para ver el
            resto.
          </AlertDescription>
        </Alert>
      ) : null}
      {/* Móvil (< sm): tarjetas */}
      <ul className="flex flex-col gap-2 sm:hidden" aria-label={caption}>
        {errors.map((e, i) => (
          <li
            key={`${e.row}-${e.column ?? ''}-${e.code}-${i}`}
            className="flex flex-col gap-1 rounded-xl border-l-4 border-l-red-700 bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/30 dark:ring-red-900"
          >
            <p className="text-sm font-semibold">
              Fila {e.row} · {columnLabel(e.column)}
            </p>
            <p className="text-sm break-words">{e.message}</p>
          </li>
        ))}
      </ul>
      {/* sm y más: tabla */}
      <div className="hidden sm:block">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow className="bg-red-50 hover:bg-red-50 dark:bg-red-950/30">
              <TableHead scope="col">Fila</TableHead>
              <TableHead scope="col">Columna</TableHead>
              <TableHead scope="col">Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.map((e, i) => (
              <TableRow key={`${e.row}-${e.column ?? ''}-${e.code}-${i}`}>
                <TableCell className="tabular-nums">{e.row}</TableCell>
                <TableCell className="whitespace-normal">{columnLabel(e.column)}</TableCell>
                <TableCell className="whitespace-normal">{e.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
