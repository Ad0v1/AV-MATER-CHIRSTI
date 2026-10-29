'use client';

// Formulario de carga y listado de materiales del curso (Dev 3, RF-26/27). Plantilla inicial (fase 3f).
import { useState, useTransition } from 'react';
import { finishUpload, publishMaterial, startUpload } from './actions';

export type MaterialItem = {
  id: string;
  kind: 'CLASS' | 'READING';
  title: string;
  description: string | null;
  createdAt: string;
  copyrightNotice: string | null;
};

const MAX_BYTES = 20 * 1024 * 1024;
const KIND_LABEL = { CLASS: 'Clase', READING: 'Lectura' } as const;
const field = 'mt-1 block h-11 w-full rounded-md border px-3 text-sm md:h-9';

export function MaterialsPanel(props: {
  courseSectionId: string;
  kind: 'CLASS' | 'READING';
  items: MaterialItem[];
  canWrite: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function onFile(f: File | null) {
    setStatus(null);
    if (f && (!f.name.toLowerCase().endsWith('.pdf') || f.size > MAX_BYTES)) {
      setFile(null);
      setStatus({ ok: false, text: 'Solo se aceptan archivos PDF de hasta 20 MiB.' });
      return;
    }
    setFile(f);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || title.trim().length < 3) {
      setStatus({ ok: false, text: 'Escribe un título (mínimo 3 caracteres) y elige un PDF.' });
      return;
    }
    start(async () => {
      setStatus({ ok: true, text: 'Subiendo y validando el archivo…' });
      const intent = await startUpload(props.courseSectionId, file.name, file.size);
      if (!intent.ok || !intent.data)
        return setStatus({ ok: false, text: intent.ok ? 'Error' : intent.message });
      const put = await fetch(intent.data.uploadUrl, {
        method: 'PUT',
        headers: intent.data.headers,
        body: file,
      }).catch(() => null);
      if (!put?.ok) return setStatus({ ok: false, text: 'No se pudo subir el archivo.' });
      const done = await finishUpload(intent.data.fileId);
      if (!done.ok) return setStatus({ ok: false, text: done.message });
      const pub = await publishMaterial(props.courseSectionId, {
        kind: props.kind,
        title,
        description,
        fileId: intent.data.fileId,
      });
      if (!pub.ok) return setStatus({ ok: false, text: pub.message });
      setTitle('');
      setDescription('');
      setFile(null);
      setStatus({ ok: true, text: 'Material publicado.' });
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {props.canWrite && (
        <form onSubmit={onSubmit} className="rounded-lg border p-4" noValidate>
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
          />
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
            id="m-file"
            type="file"
            accept=".pdf,application/pdf"
            className="mt-1 block w-full text-sm"
            aria-describedby="m-file-hint"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <p id="m-file-hint" className="mt-1 text-xs text-muted-foreground">
            Solo PDF, máximo 20 MiB. Se valida el contenido y se analiza con antivirus antes de
            publicar.
          </p>
          <button
            type="submit"
            disabled={pending}
            className="mt-4 min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {pending ? 'Publicando…' : 'Publicar'}
          </button>
          <p
            role="status"
            aria-live="polite"
            className={`mt-3 text-sm ${status?.ok === false ? 'text-destructive' : ''}`}
          >
            {status?.text}
          </p>
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
