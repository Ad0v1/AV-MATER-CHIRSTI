'use client';

// Visor del PDF de una entrega (RF-43, U4): iframe con la URL firmada inline (60 s) y un enlace
// de respaldo por si el navegador no muestra PDF embebido. La URL se pide al pulsar, no al cargar.
import { useState, useTransition } from 'react';
import { FormAlert } from '../../../_materials/form-feedback';
import { getSubmissionPdfUrl } from '../../_lib/actions';

export function PdfViewer({ fileId, studentName }: { fileId: string; studentName: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = () => {
    if (pending) return;
    startTransition(async () => {
      setError(null);
      const r = await getSubmissionPdfUrl(fileId);
      if (r.ok) setUrl(r.url);
      else setError(r.message);
    });
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={open}
        aria-disabled={pending}
        className="min-h-11 rounded-md border px-4 text-sm font-medium aria-disabled:opacity-60"
      >
        {pending ? 'Abriendo PDF…' : url ? 'Volver a cargar el PDF' : 'Ver PDF de la entrega'}
      </button>
      <FormAlert message={error} />
      <p role="status" className="sr-only">
        {url && !pending ? 'PDF cargado' : ''}
      </p>
      {url && (
        <div className="mt-3">
          <iframe
            src={url}
            title={`Entrega en PDF de ${studentName}`}
            className="h-[70vh] min-h-80 w-full rounded-md border"
            referrerPolicy="no-referrer"
          />
          <p className="mt-2 text-sm">
            ¿No se ve?{' '}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Abrir el PDF en una pestaña nueva
            </a>{' '}
            (el enlace vence en un minuto; si vence, vuelve a cargarlo).
          </p>
        </div>
      )}
    </div>
  );
}
