'use client';

// Edición de una tarea (Dev 3, RF-29; RN-10 lo decide el backend). Solo envía los campos
// cambiados y nunca el período. Se abre dentro de <details> en la tarjeta del docente.
import { useRef, useState, useTransition } from 'react';
import {
  FormAlert,
  SUBMIT_BUTTON,
  SuccessRegion,
  useFocusFirstInvalid,
  useFocusOn,
} from '../_materials/form-feedback';
import { updateAssignment } from './actions';
import { AssignmentFields } from './assignment-fields';
import {
  assignmentToInput,
  buildAssignmentPatch,
  type AssignmentField,
  type NewAssignmentInput,
} from './assignment-format';
import type { AssignmentItem } from './types';

export function EditAssignmentForm({ assignment }: { assignment: AssignmentItem }) {
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [original, setOriginal] = useState<NewAssignmentInput>(() => assignmentToInput(assignment));
  const [values, setValues] = useState<NewAssignmentInput>(original);
  const [errors, setErrors] = useState<Partial<Record<AssignmentField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invalidTries, setInvalidTries] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [pending, start] = useTransition();
  useFocusFirstInvalid(formRef, invalidTries);
  useFocusOn(resultRef, successes);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    setSuccess(null);
    const input = values;
    const check = buildAssignmentPatch(original, input);
    if (!check.ok) {
      setErrors(check.errors);
      setInvalidTries((n) => n + 1);
      return;
    }
    setErrors({});
    if (!check.changed) return setFormError('No hay cambios que guardar.');
    start(async () => {
      const result = await updateAssignment(assignment.id, original, input);
      if (!result.ok) return setFormError(result.message);
      setOriginal(input);
      setSuccess('Cambios guardados.');
      setSuccesses((n) => n + 1);
    });
  }

  const p = `e-${assignment.id.slice(0, 8)}`;
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label={`Editar ${assignment.title}`}>
      <AssignmentFields
        prefix={p}
        values={values}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        errors={errors}
      />
      <button
        type="submit"
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        className={SUBMIT_BUTTON}
      >
        {pending ? 'Guardando…' : 'Guardar cambios'}
      </button>
      <FormAlert message={formError} />
      <SuccessRegion regionRef={resultRef}>
        {pending ? <p>Guardando los cambios…</p> : success ? <p>{success}</p> : null}
      </SuccessRegion>
    </form>
  );
}
