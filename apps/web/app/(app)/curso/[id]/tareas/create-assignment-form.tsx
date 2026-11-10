'use client';

// Formulario del docente para crear una tarea (Dev 3, RF-28; RN-05 nota NE por defecto 0,
// RN-08 tamaño 20 MiB por defecto y tope 50). El backend valida de nuevo (RN-10 incluido).
// Accesibilidad (INFORME 15): validación por campo, foco al primer error, errores generales en
// role="alert" y éxito en role="status" enfocable. Los campos están en assignment-fields.tsx.
import { useRef, useState, useTransition } from 'react';
import {
  FormAlert,
  SUBMIT_BUTTON,
  SuccessRegion,
  useFocusFirstInvalid,
  useFocusOn,
} from '../_materials/form-feedback';
import { createAssignment } from './actions';
import { AssignmentFields } from './assignment-fields';
import {
  DEFAULT_MAX_MIB,
  isLiteralLevel,
  isNoDeliveryLevel,
  validateAssignment,
  type AssignmentField,
  type NewAssignmentInput,
} from './assignment-format';

export function CreateAssignmentForm(props: {
  courseSectionId: string;
  periods: { id: string; label: string }[];
  defaultPeriodId: string | null;
  /** Nivel de la sección (context.section.level): decide la escala de la NE. */
  level?: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<NewAssignmentInput>({
    periodId: props.defaultPeriodId ?? props.periods[0]?.id ?? '',
    title: '',
    instructions: '',
    dueLocal: '',
    noSubmissionGrade: '0',
    maxSizeMiB: String(DEFAULT_MAX_MIB),
    allowLate: false,
    ...(isLiteralLevel(props.level) ? { literalScale: true, noSubmissionLiteral: '' } : {}),
  });
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    setSuccess(null);
    const input = values;
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
      setValues((v) => ({ ...v, title: '', instructions: '', dueLocal: '' }));
      setSuccess(`Tarea publicada: ${check.body.title}.`);
      setSuccesses((n) => n + 1);
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="h-fit rounded-lg border p-4" noValidate>
      <h2 className="text-base font-semibold">Nueva tarea</h2>
      <AssignmentFields
        prefix="a"
        values={values}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        errors={errors}
        periods={props.periods}
        noDelivery={isNoDeliveryLevel(props.level)}
      />
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
