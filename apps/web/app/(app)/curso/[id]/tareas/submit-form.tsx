'use client';

// Entrega de una tarea en PDF (Dev 3, RF-33/36/37/39): intent SUBMISSION → PUT directo al
// almacenamiento → complete (validación y antivirus) → POST /assignments/:id/submissions.
// Accesibilidad (INFORME 15): error del archivo en el campo, errores generales en role="alert",
// progreso y constancia en role="status" enfocable.
import { useId, useRef, useState, useTransition } from 'react';
import { finishUpload, startUpload } from '../_materials/actions';
import {
  describedBy,
  FieldError,
  FormAlert,
  INVALID_FIELD,
  SUBMIT_BUTTON,
  SuccessRegion,
  useFocusFirstInvalid,
  useFocusOn,
} from '../_materials/form-feedback';
import { submitAssignment } from './actions';
import { checkPdf, formatSize } from './assignment-format';
import { ReceiptView } from './receipt-view';
import type { SubmissionReceipt } from './types';

export function SubmitForm(props: {
  courseSectionId: string;
  assignmentId: string;
  maxSizeBytes: number;
  isResubmission: boolean;
}) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const [invalidTries, setInvalidTries] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [pending, start] = useTransition();
  useFocusFirstInvalid(formRef, invalidTries);
  useFocusOn(resultRef, successes);

  const fileId = `${uid}-file`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;

  function fail(message: string) {
    setProgress(null);
    setFormError(message);
  }

  function onFile(f: File | null) {
    setFormError(null);
    const error = f ? (checkPdf(f, props.maxSizeBytes) ?? undefined) : undefined;
    setFileError(error);
    setFile(error ? null : f);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    if (!file) {
      setFileError(fileError ?? 'Elige el archivo PDF de tu entrega.');
      setInvalidTries((n) => n + 1);
      return;
    }
    start(async () => {
      setReceipt(null);
      setProgress('Subiendo y validando el archivo…');
      const intent = await startUpload(props.courseSectionId, file.name, file.size, {
        purpose: 'SUBMISSION',
        assignmentId: props.assignmentId,
      });
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
      const sent = await submitAssignment(props.assignmentId, intent.data.fileId);
      if (!sent.ok || !sent.data) {
        return fail(
          sent.ok
            ? 'No se pudo registrar la entrega. Actualiza la página para ver si quedó registrada.'
            : sent.message,
        );
      }
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setProgress(null);
      setReceipt(sent.data.receipt);
      setSuccesses((n) => n + 1);
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-3 rounded-md bg-muted/40 p-3" noValidate>
      <label className="block text-sm font-medium" htmlFor={fileId}>
        {props.isResubmission ? 'Reemplazar mi entrega (PDF)' : 'Mi entrega (PDF)'}
      </label>
      <input
        ref={inputRef}
        id={fileId}
        type="file"
        accept=".pdf,application/pdf"
        className={`mt-1 block w-full rounded-md border border-transparent text-sm ${INVALID_FIELD}`}
        aria-invalid={fileError ? true : undefined}
        aria-describedby={describedBy(fileError && errorId, hintId)}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <FieldError id={errorId} message={fileError} />
      <p id={hintId} className="mt-1 text-xs text-muted-foreground">
        Solo PDF, máximo {formatSize(props.maxSizeBytes)}. Se valida el contenido y se analiza con
        antivirus.
        {props.isResubmission
          ? ' Las versiones anteriores se conservan; la última es la oficial.'
          : ''}
      </p>
      <button
        type="submit"
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        className={SUBMIT_BUTTON}
      >
        {pending ? 'Entregando…' : props.isResubmission ? 'Volver a entregar' : 'Entregar'}
      </button>
      <FormAlert message={formError} />
      <SuccessRegion regionRef={resultRef}>
        {progress ? <p>{progress}</p> : null}
        {receipt ? (
          <div className="rounded-md border bg-background p-3">
            <p className="font-medium">Entrega registrada.</p>
            <ReceiptView r={receipt} title={`Constancia de la versión ${receipt.versionNumber}`} />
          </div>
        ) : null}
      </SuccessRegion>
    </form>
  );
}
