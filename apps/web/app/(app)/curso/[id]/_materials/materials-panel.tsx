'use client';

// Formulario de carga y listado de materiales del curso (Dev 3, RF-26/27; fase 3f).
// Accesibilidad (INFORME 15): validación por campo con aria-invalid y aria-describedby, foco al
// primer error, errores generales en role="alert" y éxito en role="status" enfocable.
import { useRef, useState, useTransition } from 'react';
import { finishUpload, publishMaterial, startUpload } from './actions';
import {
  describedBy,
  FieldError,
  FormAlert,
  INVALID_FIELD,
  SUBMIT_BUTTON,
  SuccessRegion,
  useFocusFirstInvalid,
  useFocusOn,
} from './form-feedback';
import { checkPdf, formatSize, MIB } from './pdf-check';

export type MaterialItem = {
  id: string;
  kind: 'CLASS' | 'READING';
  title: string;
  description: string | null;
  createdAt: string;
  copyrightNotice: string | null;
};

const MAX_BYTES = 20 * MIB;
const KIND_LABEL = { CLASS: 'Clase', READING: 'Lectura' } as const;
const field = `mt-1 block h-11 w-full rounded-md border px-3 text-sm md:h-9 ${INVALID_FIELD}`;

type Field = 'title' | 'file';

export function MaterialsPanel(props: {
  courseSectionId: string;
  kind: 'CLASS' | 'READING';
  items: MaterialItem[];
  canWrite: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invalidTries, setInvalidTries] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [pending, start] = useTransition();
  useFocusFirstInvalid(formRef, invalidTries);
  useFocusOn(resultRef, successes);

  const a11y = (f: Field, hintId?: string) => ({
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': describedBy(errors[f] && `m-${f}-error`, hintId),
  });

  function onFile(f: File | null) {
    setFormError(null);
    const error = f ? (checkPdf(f, MAX_BYTES) ?? undefined) : undefined;
    setErrors((prev) => ({ ...prev, file: error }));
    setFile(error ? null : f);
  }

  function fail(message: string) {
    setProgress(null);
    setFormError(message);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    setSuccess(null);
    const next: Partial<Record<Field, string>> = {};
    if (title.trim().length < 3) next.title = 'Escribe un título de al menos 3 caracteres.';
    if (!file) next.file = errors.file ?? 'Elige el archivo PDF que quieres publicar.';
    setErrors(next);
    if (next.title || next.file || !file) {
      setInvalidTries((n) => n + 1);
      return;
    }
    start(async () => {
      setProgress('Subiendo y validando el archivo…');
      const intent = await startUpload(props.courseSectionId, file.name, file.size);
      if (!intent.ok || !intent.data) {
        return fail(
          intent.ok
            ? 'No se pudo iniciar la subida. Actualiza la página e inténtalo de nuevo.'
            : intent.message,
        );
      }
      const put = await fetch(intent.data.uploadUrl, {
        method: 'PUT',
        headers: intent.data.headers,
        body: file,
      }).catch(() => null);
      if (!put?.ok) {
        return fail('No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.');
      }
      const done = await finishUpload(intent.data.fileId);
      if (!done.ok) return fail(done.message);
      const pub = await publishMaterial(props.courseSectionId, {
        kind: props.kind,
        title,
        description,
        fileId: intent.data.fileId,
      });
      if (!pub.ok) return fail(pub.message);
      const published = title.trim();
      setTitle('');
      setDescription('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setProgress(null);
      setSuccess(`Material publicado: ${published}.`);
      setSuccesses((n) => n + 1);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {props.canWrite && (
        <form ref={formRef} onSubmit={onSubmit} className="rounded-lg border p-4" noValidate>
          <h2 className="text-base font-semibold">Subir {KIND_LABEL[props.kind].toLowerCase()}</h2>
          <label className="mt-3 block text-sm font-medium" htmlFor="m-title">
            Título
          </label>
          <input
            id="m-title"
            className={field}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            {...a11y('title')}
          />
          <FieldError id="m-title-error" message={errors.title} />
          <label className="mt-3 block text-sm font-medium" htmlFor="m-desc">
            Descripción (opcional)
          </label>
          <textarea
            id="m-desc"
            className="mt-1 block min-h-20 w-full rounded-md border px-3 py-2 text-sm"
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="mt-3 block text-sm font-medium" htmlFor="m-file">
            Archivo PDF
          </label>
          <input
            ref={fileRef}
            id="m-file"
            type="file"
            accept=".pdf,application/pdf"
            className={`mt-1 block w-full rounded-md border border-transparent text-sm ${INVALID_FIELD}`}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            {...a11y('file', 'm-file-hint')}
          />
          <FieldError id="m-file-error" message={errors.file} />
          <p id="m-file-hint" className="mt-1 text-xs text-muted-foreground">
            Solo PDF, máximo {formatSize(MAX_BYTES)}. Se valida el contenido y se analiza con
            antivirus antes de publicar.
          </p>
          <button
            type="submit"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            className={SUBMIT_BUTTON}
          >
            {pending ? 'Publicando…' : 'Publicar'}
          </button>
          <FormAlert message={formError} />
          <SuccessRegion regionRef={resultRef}>
            {progress ? <p>{progress}</p> : success ? <p>{success}</p> : null}
          </SuccessRegion>
        </form>
      )}
      <section className="rounded-lg border p-4" aria-labelledby="m-list">
        <h2 id="m-list" className="text-base font-semibold">
          Materiales publicados
        </h2>
        {props.items.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Todavía no hay materiales publicados.
          </p>
        ) : (
          <ul className="mt-3 divide-y">
            {props.items.map((m) => (
              <li key={m.id} className="py-3">
                <p className="text-sm font-medium">{m.title}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABEL[m.kind]} ·{' '}
                  {new Date(m.createdAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}
                </p>
                {m.description && <p className="mt-1 text-sm">{m.description}</p>}
                {m.copyrightNotice && (
                  <p className="mt-1 text-xs text-muted-foreground">{m.copyrightNotice}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
