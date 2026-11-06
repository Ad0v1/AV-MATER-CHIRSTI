'use client';

// Pantalla de importación masiva (RF-21; RNF-09..13, RNF-24..27). Desde 360 px y WCAG 2.1 AA.
//
// - El archivo nunca se lee aquí: se mira su tamaño y su extensión y se sube tal cual al puente
//   (Route Handler), que lo reenvía a la API. La confirmación vuelve a subir el MISMO File con el
//   sha256 de la vista previa (la API exige que coincida).
// - La máquina de estados vive en `_lib/import-machine.ts` (lógica pura, con tests).
// - Foco: tras validar va al título del reporte; tras un error, al aviso; tras importar, al título
//   del resultado (que además se anuncia en la región de estado siempre montada).
import { useEffect, useReducer, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
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
import { SelectField, TextField } from '../../../_shared/components/form-bits';
import { TOUCH } from '../../../_shared/components/styles';
import { FOCUS_HEADING } from '../../../_shared/lib/focus';
import { USERS_PATH } from '../../_lib/users';
import {
  IMPORT_TYPES,
  isImportType,
  type ImportFormat,
  type ImportType,
} from '../_lib/import-guards';
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

const TYPE_COLUMNS: Record<ImportType, string> = {
  students:
    'dni, nombre_completo, grado, seccion, dni_apoderado, nombre_apoderado, dni_apoderado_2, nombre_apoderado_2',
  teachers: 'dni, nombre_completo',
  guardians: 'dni_apoderado, nombre_apoderado, dni_estudiante',
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

export function ImportScreen() {
  const [state, dispatch] = useReducer(importReducer, undefined, () => initialImportState());
  const file = useRef<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
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

  async function downloadTemplate(format: ImportFormat) {
    setTemplateError(null);
    setDownloading(format);
    try {
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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plantilla-${state.type}.${format}`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
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
          className={cn('text-lg font-semibold', FOCUS_HEADING)}
        >
          1. Elige el tipo y el archivo
        </h2>

        <SelectField
          name="type"
          label="Tipo de usuarios"
          value={state.type}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.value;
            if (isImportType(next)) {
              const message = typeChangeMessage(state, next);
              dispatch({ type: 'TYPE_CHANGED', importType: next });
              if (message) announce(message);
            }
            setTemplateError(null);
          }}
          options={IMPORT_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
          hint={`Columnas de la plantilla: ${TYPE_COLUMNS[state.type]}.`}
          className="sm:max-w-xs"
        />

        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Descarga la plantilla de {TYPE_LABELS[state.type].toLowerCase()}, llénala y guárdala sin
            cambiar los encabezados.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(['xlsx', 'csv'] as const).map((format) => (
              <Button
                key={format}
                type="button"
                variant="outline"
                className={TOUCH}
                disabled={downloading !== null}
                aria-busy={downloading === format || undefined}
                onClick={() => void downloadTemplate(format)}
              >
                {downloading === format
                  ? 'Descargando…'
                  : format === 'xlsx'
                    ? 'Descargar plantilla Excel (.xlsx)'
                    : 'Descargar plantilla CSV'}
              </Button>
            ))}
          </div>
          {templateError ? (
            <p className="text-sm text-destructive" role="alert">
              {templateError}
            </p>
          ) : null}
        </div>

        <Alert role="note">
          <AlertTitle>Privacidad</AlertTitle>
          <AlertDescription>{PRIVACY_NOTICE}.</AlertDescription>
        </Alert>

        <TextField
          key={inputKey}
          name="file"
          type="file"
          label="Archivo (.xlsx o .csv)"
          accept=".xlsx,.csv"
          disabled={busy}
          hint="Hasta 1 MiB y 1000 filas de datos."
          error={state.fileError ?? undefined}
          className="sm:max-w-md"
          onChange={(e) => {
            const chosen = e.currentTarget.files?.[0] ?? null;
            const info = chosen ? { size: chosen.size, name: chosen.name } : null;
            const fileError = info ? checkFile(info) : null;
            dispatch({ type: 'FILE_CHANGED', file: info });
            // Solo se guarda si pasa las comprobaciones de tamaño y extensión (sin leerlo).
            file.current = chosen && fileError === null ? chosen : null;
            // El error del campo se ve, pero no se oía (MEDIO de UX, INFORME 19).
            if (fileError) announce(`Archivo rechazado: ${fileError}.`);
          }}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            className={TOUCH}
            disabled={!canValidate(state)}
            aria-busy={state.phase === 'validando' || undefined}
            onClick={() => void validate()}
          >
            {state.phase === 'validando' ? 'Validando…' : 'Validar'}
          </Button>
          {!state.hasFile && state.phase === 'idle' ? (
            <p className="text-sm text-muted-foreground">Elige un archivo para validarlo.</p>
          ) : null}
        </div>
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
            className={cn('text-lg font-semibold', FOCUS_HEADING)}
          >
            2. Resultado de la validación
          </h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Total label="Filas leídas" value={state.report.totalRows} />
            <Total label="Filas válidas" value={state.report.validRows} />
            <Total label="Filas con errores" value={state.report.errorRows} />
          </dl>
          {state.report.canConfirm && state.phase !== 'reporte' ? (
            <p className="text-sm">
              {willCreateText(state.report.type, state.report.summary)}. Nada se crea hasta que
              confirmes.
            </p>
          ) : state.report.canConfirm ? (
            <p className="text-sm">Vuelve a validar el archivo antes de confirmar.</p>
          ) : (
            <p className="text-sm">
              Corrige las filas marcadas en tu archivo y vuelve a validarlo. No se importa nada
              mientras haya errores.
            </p>
          )}

          {state.rowErrors.length > 0 ? (
            <RowErrors errors={state.rowErrors} truncated={state.rowErrorsTruncated} />
          ) : null}

          {state.phase === 'confirmable' || state.phase === 'confirmando' ? (
            <div>
              <Button
                type="button"
                className={TOUCH}
                disabled={state.phase === 'confirmando'}
                aria-busy={state.phase === 'confirmando' || undefined}
                onClick={() => void confirm()}
              >
                {state.phase === 'confirmando' ? 'Importando…' : 'Confirmar importación'}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {state.phase === 'hecho' && state.result ? (
        <section
          aria-labelledby={DONE_TITLE_ID}
          className="flex flex-col gap-3 rounded-xl border border-emerald-700 p-4 dark:border-emerald-400"
        >
          <h2
            id={DONE_TITLE_ID}
            ref={doneRef}
            tabIndex={-1}
            className={cn('text-lg font-semibold', FOCUS_HEADING)}
          >
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

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl p-3 ring-1 ring-foreground/10">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
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
      <h3 className="text-base font-semibold">{caption}</h3>
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
            className="flex flex-col gap-1 rounded-xl p-3 ring-1 ring-foreground/10"
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
            <TableRow>
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
