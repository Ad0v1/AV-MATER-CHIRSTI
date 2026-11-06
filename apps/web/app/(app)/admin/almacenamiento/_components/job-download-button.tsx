'use client';

// Botón de descarga de un trabajo terminado (RF-63, RF-65). Pide a la API una URL firmada de 60 s
// (queda en la bitácora como job.download) y navega a ella: S3 la entrega como adjunto.
// Mientras prepara usa aria-disabled (no `disabled`) para que el foco no se pierda, y al terminar
// el foco sigue en el botón (ux 5g, hallazgo 11). El error se anuncia una sola vez (role=alert).
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAnnounce } from '../../_shared/components/action-feedback';
import { TOUCH } from '../../_shared/components/styles';
import { jobDownloadAction } from '../_lib/actions';

export function JobDownloadButton({
  jobId,
  label = 'Descargar',
  accessibleLabel,
  focusOnMount = false,
}: {
  jobId: string;
  label?: string;
  /** Nombre completo para lectores; empieza por el texto visible (WCAG 2.5.3). */
  accessibleLabel?: string;
  /** Lleva el foco al botón cuando aparece (p. ej. al terminar una exportación). */
  focusOnMount?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const announce = useAnnounce();
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  const onClick = () => {
    if (pending) return;
    start(async () => {
      setError(null);
      const result = await jobDownloadAction(jobId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      announce('Descarga iniciada.');
      window.location.assign(result.url);
      ref.current?.focus();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        ref={ref}
        type="button"
        variant="outline"
        className={cn(TOUCH, 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50')}
        onClick={onClick}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        aria-label={accessibleLabel}
      >
        {pending ? 'Preparando…' : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
