'use client';

// Exportación de datos personales de un estudiante (RF-63, U8, derecho ARCO). El ADMIN elige al
// estudiante, solicita el trabajo y la pantalla consulta su estado cada pocos segundos hasta que
// termina; entonces aparece la descarga (bitácora job.download, Decisión 8). El nombre del
// estudiante no viaja en la URL: la búsqueda es una Server Action (StudentPicker de usuarios).
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAnnounce } from '../../_shared/components/action-feedback';
import { TOUCH } from '../../_shared/components/styles';
import { StudentPicker } from '../../usuarios/_components/student-picker';
import type { StudentChoice } from '../../usuarios/_lib/types';
import { jobStatusAction, requestPersonalDataExportAction } from '../_lib/actions';
import { exportStatusText, isJobActive, type JobView } from '../_lib/storage';
import { JobDownloadButton } from './job-download-button';

const POLL_MS = 3_000;
/** Deja de consultar a los 10 min (el worker marca STALLED a la hora). */
const POLL_MAX = 200;

export function PersonalDataExport() {
  const [selected, setSelected] = useState<StudentChoice[]>([]);
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const announce = useAnnounce();
  const polls = useRef(0);
  const [stopped, setStopped] = useState(false);
  const student = selected[0];

  useEffect(() => {
    if (!job || !isJobActive(job.status)) return;
    const timer = setTimeout(async () => {
      if (polls.current >= POLL_MAX) {
        setStopped(true);
        return;
      }
      polls.current++;
      const result = await jobStatusAction(job.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.job.status !== job.status) announce(exportStatusText(result.job));
      setJob(result.job);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job, announce]);

  const blocked = !student || pending || (job !== null && isJobActive(job.status));

  const onRequest = () => {
    // aria-disabled en vez de disabled: el foco no se pierde (ux 5g, hallazgo 11).
    if (blocked) return;
    start(async () => {
      if (!student) return;
      setError(null);
      polls.current = 0;
      setStopped(false);
      const result = await requestPersonalDataExportAction(student.id);
      if (!result.ok) {
        setError(result.message); // role=alert lo anuncia una sola vez
        return;
      }
      setJob(result.job);
      announce(exportStatusText(result.job));
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <StudentPicker
        legend="Estudiante"
        max={1}
        selected={selected}
        onChange={(next) => {
          setSelected(next);
          setJob(null);
          setError(null);
        }}
        name="exportStudentId"
      />
      <div className="flex flex-wrap items-start gap-3">
        <Button
          type="button"
          className={cn(TOUCH, 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50')}
          onClick={onRequest}
          aria-disabled={blocked || undefined}
          aria-busy={pending || undefined}
        >
          {pending ? 'Solicitando…' : 'Exportar datos personales'}
        </Button>
        {job?.status === 'SUCCEEDED' && job.hasResult ? (
          <JobDownloadButton
            jobId={job.id}
            label="Descargar ZIP"
            accessibleLabel={`Descargar ZIP de los datos personales de ${student?.fullName ?? 'el estudiante'}`}
            focusOnMount
          />
        ) : null}
      </div>
      {job ? (
        <p className="text-sm" aria-busy={isJobActive(job.status)}>
          <span className="font-medium">Estado:</span> {exportStatusText(job)}
          {isJobActive(job.status) && stopped ? ' Recarga la página para ver si terminó.' : ''}
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
