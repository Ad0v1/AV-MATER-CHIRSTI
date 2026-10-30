'use client';

// Formulario del docente para crear una tarea (Dev 3, RF-28; RN-05 nota NE por defecto 0,
// RN-08 tamaño 20 MiB por defecto y tope 50). El backend valida de nuevo (RN-10 incluido).
// Accesibilidad (INFORME 15): validación por campo, foco al primer error, errores generales en
// role="alert" y éxito en role="status" enfocable.
import { useRef, useState, useTransition } from 'react';
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
import { createAssignment } from './actions';
import {
  DEFAULT_MAX_MIB,
  MAX_MIB_CAP,
  validateAssignment,
  type AssignmentField,
} from './assignment-format';

const field = `mt-1 block h-11 w-full rounded-md border px-3 text-sm md:h-9 ${INVALID_FIELD}`;
const errorId = (f: AssignmentField) => `a-${f}-error`;

export function CreateAssignmentForm(props: {
  courseSectionId: string;
  periods: { id: string; label: string }[];
  defaultPeriodId: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [periodId, setPeriodId] = useState(props.defaultPeriodId ?? props.periods[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [grade, setGrade] = useState('0');
  const [maxMiB, setMaxMiB] = useState(String(DEFAULT_MAX_MIB));
  const [allowLate, setAllowLate] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<AssignmentField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invalidTries, setInvalidTries] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [pending, start] = useTransition();
  useFocusFirstInvalid(formRef, invalidTries);
  useFocusOn(resultRef, successes);

  if (props.periods.length === 0) {
    return (
      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">Nueva tarea</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No hay períodos abiertos: no se pueden crear tareas.
        </p>
      </section>
    );
  }

  // Props de accesibilidad de cada campo: aria-invalid y aria-describedby (error + pista).
  const a11y = (f: AssignmentField, hintId?: string) => ({
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': describedBy(errors[f] && errorId(f), hintId),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    setSuccess(null);
    const input = {
      periodId,
      title,
      instructions,
      dueLocal,
      noSubmissionGrade: grade,
      maxSizeMiB: maxMiB,
      allowLate,
    };
    const check = validateAssignment(input);
    if (!check.ok) {
      setErrors(check.errors);
      setInvalidTries((n) => n + 1);
      return;
    }
    setErrors({});
    start(async () => {
      const result = await createAssignment(props.courseSectionId, input);
      if (!result.ok) return setFormError(result.message);
      setTitle('');
      setInstructions('');
      setDueLocal('');
      setSuccess(`Tarea publicada: ${check.body.title}.`);
      setSuccesses((n) => n + 1);
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="h-fit rounded-lg border p-4" noValidate>
      <h2 className="text-base font-semibold">Nueva tarea</h2>
      <label className="mt-3 block text-sm font-medium" htmlFor="a-period">
        Período
      </label>
      <select
        id="a-period"
        className={field}
        value={periodId}
        onChange={(e) => setPeriodId(e.target.value)}
        {...a11y('periodId')}
      >
        {props.periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <FieldError id={errorId('periodId')} message={errors.periodId} />

      <label className="mt-3 block text-sm font-medium" htmlFor="a-title">
        Título
      </label>
      <input
        id="a-title"
        className={field}
        value={title}
        maxLength={200}
        required
        onChange={(e) => setTitle(e.target.value)}
        {...a11y('title')}
      />
      <FieldError id={errorId('title')} message={errors.title} />

      <label className="mt-3 block text-sm font-medium" htmlFor="a-instructions">
        Instrucciones
      </label>
      <textarea
        id="a-instructions"
        className={`mt-1 block min-h-28 w-full rounded-md border px-3 py-2 text-sm ${INVALID_FIELD}`}
        value={instructions}
        required
        onChange={(e) => setInstructions(e.target.value)}
        {...a11y('instructions')}
      />
      <FieldError id={errorId('instructions')} message={errors.instructions} />

      <label className="mt-3 block text-sm font-medium" htmlFor="a-due">
        Plazo de entrega
      </label>
      <input
        id="a-due"
        type="datetime-local"
        className={field}
        value={dueLocal}
        required
        onChange={(e) => setDueLocal(e.target.value)}
        {...a11y('dueLocal', 'a-due-hint')}
      />
      <FieldError id={errorId('dueLocal')} message={errors.dueLocal} />
      <p id="a-due-hint" className="mt-1 text-xs text-muted-foreground">
        Fecha y hora futura, en hora de Lima. Ejemplo: 05/11/2026, 23:59.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="a-grade">
            Nota si no entrega (NE)
          </label>
          <input
            id="a-grade"
            inputMode="decimal"
            className={field}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            {...a11y('noSubmissionGrade', 'a-grade-hint')}
          />
          <FieldError id={errorId('noSubmissionGrade')} message={errors.noSubmissionGrade} />
          <p id="a-grade-hint" className="mt-1 text-xs text-muted-foreground">
            NE = no entregó. Es la nota de quien no entrega: de 0 a 20, por defecto 0.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="a-size">
            Tamaño máximo (MiB)
          </label>
          <input
            id="a-size"
            type="number"
            min={1}
            max={MAX_MIB_CAP}
            step={1}
            className={field}
            value={maxMiB}
            onChange={(e) => setMaxMiB(e.target.value)}
            {...a11y('maxSizeMiB', 'a-size-hint')}
          />
          <FieldError id={errorId('maxSizeMiB')} message={errors.maxSizeMiB} />
          <p id="a-size-hint" className="mt-1 text-xs text-muted-foreground">
            Del PDF de cada entrega: de 1 a {MAX_MIB_CAP} MiB, por defecto {DEFAULT_MAX_MIB}.
          </p>
        </div>
      </div>

      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={allowLate}
          onChange={(e) => setAllowLate(e.target.checked)}
        />
        Permitir entregas tardías (se marcan, sin descuento)
      </label>
      <button
        type="submit"
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        className={SUBMIT_BUTTON}
      >
        {pending ? 'Guardando…' : 'Publicar tarea'}
      </button>
      <FormAlert message={formError} />
      <SuccessRegion regionRef={resultRef}>
        {pending ? <p>Guardando la tarea…</p> : success ? <p>{success}</p> : null}
      </SuccessRegion>
    </form>
  );
}
