'use client';

// Descarga de un PDF de entrega (RNF-03, RF-39): en cada clic pide una URL firmada nueva (vence en
// 60 s) y la abre. No la guarda en estado, no la cachea y no la escribe en consola.
// La ventana se abre en blanco de forma síncrona en el clic (si se abre después del await, el
// navegador del móvil la bloquea) y recién después se le asigna la URL.
import { useState, useTransition } from 'react';
import { getSubmissionDownloadUrl } from './actions';

export const DOWNLOAD_BLOCKED =
  'Tu navegador bloqueó la descarga. Permite las ventanas emergentes o inténtalo de nuevo.';
export const DOWNLOAD_FAILED =
  'No se pudo preparar la descarga. Inténtalo de nuevo en unos segundos.';

export function DownloadFileButton({
  fileId,
  label,
  ariaLabel,
}: {
  fileId: string;
  label: string;
  ariaLabel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onClick() {
    if (pending) return;
    setError(null);
    const w = window.open('', '_blank');
    if (!w) {
      setError(DOWNLOAD_BLOCKED);
      return;
    }
    w.opener = null;
    start(async () => {
      try {
        const result = await getSubmissionDownloadUrl(fileId);
        if (!result.ok || !result.data) {
          w.close();
          setError(DOWNLOAD_FAILED);
          return;
        }
        w.location.href = result.data.url;
      } catch {
        w.close();
        setError(DOWNLOAD_FAILED);
      }
    });
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        className="min-h-11 min-w-11 rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:opacity-60"
      >
        {label}
      </button>
      <span aria-live="polite" className="text-xs text-muted-foreground">
        {pending ? 'Preparando…' : ''}
      </span>
      <span role="alert" className="text-sm text-destructive">
        {error}
      </span>
    </span>
  );
}
