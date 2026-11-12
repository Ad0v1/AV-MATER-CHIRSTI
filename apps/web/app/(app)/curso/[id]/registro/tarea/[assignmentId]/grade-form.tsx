'use client';

// Formulario de nota, NE o exoneración (RF-41, RF-42, RF-45, RF-46). Errores por campo con
// aria-invalid y foco al primero; error general en role="alert"; éxito en role="status".
import { useId, useRef, useState, useTransition } from 'react';
import {
  describedBy,
  FieldError,
  FormAlert,
  INVALID_FIELD,
  SUBMIT_BUTTON,
  SuccessRegion,
  useFocusFirstInvalid,
  useFocusOn,
} from '../../../_materials/form-feedback';
import { saveGrade } from '../../_lib/actions';
import {
  buildGradeInput,
  COMMENT_MAX,
  GRADE_LITERALS,
  isLiteral,
  literalLabel,
  REASON_MAX,
  REASON_MIN,
  stateLabel,
  type GradeFormErrors,
} from '../../_lib/grading-format';
import type { GradeLiteral, GradeState, GradingScale } from '../../_lib/types';

const FIELD = `mt-1 block w-full rounded-md border bg-background px-3 py-2 text-base ${INVALID_FIELD}`;

export type GradeFormProps = {
  assignmentId: string;
  enrollmentId: string;
  studentName: string;
  hasSubmission: boolean;
  noSubmissionGrade: string;
  /** Escala del nivel (tres niveles): literal AD/A/B/C en inicial y primaria. */
  scale?: GradingScale;
  noSubmissionLiteral?: GradeLiteral | null;
  /** INICIAL: actividad sin entrega; arranca en GRADED y la NE se llama "Sin registro de logro". */
  noDelivery?: boolean;
  initial: {
    state: GradeState | null;
    value: string | null;
    literal?: GradeLiteral | null;
    comment: string | null;
    exemptionReason: string | null;
  };
};

export function GradeForm(props: GradeFormProps) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const okRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<GradeState>(
    props.initial.state ?? (props.hasSubmission || props.noDelivery ? 'GRADED' : 'NE'),
  );
  const [value, setValue] = useState(props.initial.value ?? '');
  const [literal, setLiteral] = useState<GradeLiteral | ''>(props.initial.literal ?? '');
  const literalScale = isLiteral(props.scale);
  const [comment, setComment] = useState(props.initial.comment ?? '');
  const [reason, setReason] = useState(props.initial.exemptionReason ?? '');
  const [errors, setErrors] = useState<GradeFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const [saved, setSaved] = useState(0);
  const [pending, startTransition] = useTransition();
  useFocusFirstInvalid(formRef, failures);
  useFocusOn(okRef, saved);

  const ids = {
    value: `${id}-value`,
    valueHint: `${id}-value-hint`,
    valueErr: `${id}-value-err`,
    literalHint: `${id}-literal-hint`,
    literalErr: `${id}-literal-err`,
    comment: `${id}-comment`,
    commentErr: `${id}-comment-err`,
    reason: `${id}-reason`,
    reasonHint: `${id}-reason-hint`,
    reasonErr: `${id}-reason-err`,
    reasonCount: `${id}-reason-count`,
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    const built = buildGradeInput({
      state,
      value,
      literal,
      scale: props.scale,
      comment,
      exemptionReason: reason,
    });
    if (!built.ok) {
      setErrors(built.errors);
      setFailures((n) => n + 1);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const r = await saveGrade(props.assignmentId, props.enrollmentId, built.body);
      if (r.ok) {
        setSaved((n) => n + 1);
        return;
      }
      setErrors(r.fieldErrors ?? {});
      setMessage(r.message);
      setFailures((n) => n + 1);
    });
  };

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="mt-3"
      aria-label={`Calificar a ${props.studentName}`}
    >
      <fieldset>
        <legend className="text-sm font-medium">Tipo de registro</legend>
        <div className="mt-1 flex flex-wrap gap-x-4">
          {(['GRADED', 'NE', 'EXEMPT'] as const).map((s) => (
            <label key={s} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-state`}
                value={s}
                checked={state === s}
                onChange={() => setState(s)}
                className="size-4"
              />
              {stateLabel(s, props.noDelivery)}
            </label>
          ))}
        </div>
      </fieldset>

      {state !== 'EXEMPT' && literalScale && (
        <fieldset
          className="mt-3"
          aria-invalid={errors.literal ? true : undefined}
          aria-describedby={describedBy(ids.literalHint, errors.literal && ids.literalErr)}
        >
          <legend className="text-sm font-medium">
            {state === 'GRADED'
              ? 'Nivel de logro'
              : props.noDelivery
                ? 'Nivel de logro sin registro (opcional)'
                : 'Nivel de logro de la NE (opcional)'}
          </legend>
          <div className="mt-1 flex flex-wrap gap-x-4">
            {GRADE_LITERALS.map((l) => (
              <label key={l} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${id}-literal`}
                  value={l}
                  checked={literal === l}
                  onChange={() => setLiteral(l)}
                  className="size-4"
                />
                {literalLabel(l)}
              </label>
            ))}
          </div>
          <p id={ids.literalHint} className="mt-1 text-xs text-muted-foreground">
            {state === 'GRADED'
              ? 'Escala literal de inicial y primaria. Sin descuento por entrega tardía.'
              : props.noSubmissionLiteral
                ? `Si no eliges, se usa el literal NE de la tarea (${props.noSubmissionLiteral}).`
                : 'La tarea no tiene literal NE: elige uno para registrarla.'}
          </p>
          <FieldError id={ids.literalErr} message={errors.literal} />
        </fieldset>
      )}

      {state !== 'EXEMPT' && !literalScale && (
        <div className="mt-3">
          <label htmlFor={ids.value} className="text-sm font-medium">
            {state === 'GRADED' ? 'Nota (0 a 20)' : 'Nota NE (opcional)'}
          </label>
          <input
            id={ids.value}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={errors.value ? true : undefined}
            aria-describedby={describedBy(ids.valueHint, errors.value && ids.valueErr)}
            className={`${FIELD} max-w-32`}
          />
          <p id={ids.valueHint} className="mt-1 text-xs text-muted-foreground">
            {state === 'GRADED'
              ? 'Hasta 2 decimales, por ejemplo 15 o 13,5. Sin descuento por entrega tardía.'
              : `Si lo dejas vacío se usa la nota NE de la tarea (${props.noSubmissionGrade}).`}
          </p>
          <FieldError id={ids.valueErr} message={errors.value} />
        </div>
      )}

      {state === 'EXEMPT' && (
        <div className="mt-3">
          <label htmlFor={ids.reason} className="text-sm font-medium">
            Motivo de la exoneración
          </label>
          <p id={ids.reasonHint} className="mt-1 text-xs text-muted-foreground">
            De {REASON_MIN} a {REASON_MAX} caracteres. Solo lo ven los docentes y la administración.{' '}
            <strong>No escribas datos de salud ni diagnósticos</strong>: basta con indicar, por
            ejemplo, &quot;justificación presentada por la familia&quot;.
          </p>
          <textarea
            id={ids.reason}
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={errors.exemptionReason ? true : undefined}
            aria-describedby={describedBy(
              ids.reasonHint,
              ids.reasonCount,
              errors.exemptionReason && ids.reasonErr,
            )}
            className={FIELD}
          />
          <p id={ids.reasonCount} className="mt-1 text-xs text-muted-foreground">
            {reason.length} de {REASON_MAX}
          </p>
          <FieldError id={ids.reasonErr} message={errors.exemptionReason} />
        </div>
      )}

      <div className="mt-3">
        <label htmlFor={ids.comment} className="text-sm font-medium">
          Comentario para el estudiante (opcional)
        </label>
        <textarea
          id={ids.comment}
          rows={3}
          maxLength={COMMENT_MAX}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          aria-invalid={errors.comment ? true : undefined}
          aria-describedby={describedBy(errors.comment && ids.commentErr)}
          className={FIELD}
        />
        <FieldError id={ids.commentErr} message={errors.comment} />
      </div>

      <button type="submit" aria-disabled={pending} className={SUBMIT_BUTTON}>
        {pending ? 'Guardando…' : 'Guardar'}
      </button>
      <FormAlert message={message} />
      <SuccessRegion regionRef={okRef}>
        {saved > 0 && !pending && !message ? <p>Calificación guardada.</p> : null}
      </SuccessRegion>
    </form>
  );
}
