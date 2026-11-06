'use client';

// Botón de exportación de /admin/reportes (RF-58 y RF-59). Solicita el trabajo, consulta su estado
// cada pocos segundos y, al terminar, muestra la descarga (JobDownloadButton, con foco). Mismo
// patrón que la exportación de datos personales de almacenamiento: aria-disabled en vez de
// disabled (el foco no se pierde), aria-busy mientras trabaja, estado anunciado por useAnnounce y
// el error con role=alert. El nombre accesible empieza por el texto visible (WCAG 2.5.3).
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAnnounce } from '../../_shared/components/action-feedback';
import { TOUCH } from '../../_shared/components/styles';
import { jobStatusAction } from '../../almacenamiento/_lib/actions';
import { JobDownloadButton } from '../../almacenamiento/_components/job-download-button';
import { exportStatusText, isJobActive, type JobView } from '../../almacenamiento/_lib/storage';
import { requestExportAction } from '../_lib/actions';
import type { ExportRequest } from '../_lib/reports';

const POLL_MS = 3_000;
/** Deja de consultar a los 10 min (el worker marca STALLED a la hora). */
const POLL_MAX = 200;

export function ExportButton({
  request,
  label,
  accessibleLabel,
  downloadLabel,
  variant = 'outline',
}: {
  request: ExportRequest;
  /** Texto visible, p. ej. "Excel". */
  label: string;
  /** Nombre completo para lectores; empieza por `label`. */
  accessibleLabel: string;
  /** Nombre completo del botón de descarga; empieza por "Descargar". */
  downloadLabel: string;
  variant?: 'outline' | 'default';
}) {
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [pending, start] = useTransition();
  const announce = useAnnounce();
  const polls = useRef(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** Llevar el foco a la descarga solo si el usuario no se movió a otra parte (ux 5f). */
  const [focusDownload, setFocusDownload] = useState(false);

  useEffect(() => {
    if (!job || !isJobActive(job.status)) return;
    const timer = setTimeout(async () => {
      if (polls.current >= POLL_MAX) {
        setStopped(true);
        announce('La exportación sigue en curso. Recarga la página para ver si terminó.');
        return;
      }
      polls.current++;
      const result = await jobStatusAction(job.id);
      if (!result.ok) {
        // El sondeo falló: se desbloquea el botón para reintentar (ux 5f).
        setJob(null);
        setError(`${result.message} Puedes volver a intentarlo.`);
        return;
      }
      if (result.job.status === 'SUCCEEDED' && result.job.hasResult) {
        const focused = document.activeElement;
        setFocusDownload(
          focused === null || focused === document.body || focused === buttonRef.current,
        );
      }
      if (result.job.status !== job.status) announce(exportStatusText(result.job));
      setJob(result.job);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job, announce]);

  const active = job !== null && isJobActive(job.status);
  const blocked = pending || (active && !stopped);

  const onClick = () => {
    if (blocked) return;
    start(async () => {
      setError(null);
      setStopped(false);
      setFocusDownload(false);
      polls.current = 0;
      const result = await requestExportAction(request);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setJob(result.job);
      announce(exportStatusText(result.job));
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={buttonRef}
          type="button"
          variant={variant}
          className={cn(TOUCH, 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50')}
          onClick={onClick}
          aria-disabled={blocked || undefined}
          aria-busy={blocked || undefined}
          aria-label={accessibleLabel}
        >
          {pending ? 'Solicitando…' : active ? `${label}: generando…` : label}
        </Button>
        {job?.status === 'SUCCEEDED' && job.hasResult ? (
          <JobDownloadButton
            jobId={job.id}
            label="Descargar"
            accessibleLabel={downloadLabel}
            focusOnMount={focusDownload}
          />
        ) : null}
      </div>
      {job && job.status !== 'SUCCEEDED' ? (
        <p className="text-sm text-muted-foreground">
          {exportStatusText(job)}
          {active && stopped ? ' Recarga la página para ver si terminó.' : ''}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
