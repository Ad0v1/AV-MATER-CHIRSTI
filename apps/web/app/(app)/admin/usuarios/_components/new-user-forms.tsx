'use client';

// Altas de estudiante (RF-18), docente y apoderado (RF-19, RF-25). Al crear, la acción redirige
// a la ficha del usuario. Los campos guardan lo escrito si la API responde con error.
import { useActionState, useState } from 'react';
import {
  FormMessage,
  SelectField,
  SubmitButton,
  TextField,
  useFormRefs,
} from '../../_shared/components/form-bits';
import { IDLE, type ActionState } from '../../_shared/lib/action-state';
import { sectionLabel } from '../../_shared/lib/format';
import { createGuardianAction, createStudentAction, createTeacherAction } from '../_lib/actions';
import type { SectionOption, StudentChoice } from '../_lib/types';
import { EMAIL_MAX, FULL_NAME_MAX, MAX_GUARDIAN_STUDENTS, enrollTargets } from '../_lib/users';
import { StudentPicker } from './student-picker';

function PersonFields({ state }: { state: ActionState }) {
  return (
    <>
      <TextField
        name="fullName"
        label="Nombre completo"
        autoComplete="off"
        required
        maxLength={FULL_NAME_MAX}
        defaultValue={state.values?.fullName}
        error={state.fieldErrors?.fullName}
        hint="Nombres y apellidos, de 3 a 120 caracteres."
      />
      <TextField
        name="institutionalEmail"
        label="Correo institucional"
        type="email"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        required
        maxLength={EMAIL_MAX}
        defaultValue={state.values?.institutionalEmail}
        error={state.fieldErrors?.institutionalEmail}
        hint="Será su usuario para ingresar. No puede estar en uso."
      />
    </>
  );
}

export function NewStudentForm({ sections, year }: { sections: SectionOption[]; year: number }) {
  const [state, formAction] = useActionState(createStudentAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  const options = enrollTargets(sections);
  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-xl flex-col gap-4">
      <PersonFields state={state} />
      <SelectField
        name="sectionId"
        label={`Sección (año ${year})`}
        required
        defaultValue={state.values?.sectionId ?? ''}
        error={state.fieldErrors?.sectionId}
        hint="Se matricula desde hoy en esta sección del año activo."
        options={[
          { value: '', label: 'Elige una sección' },
          ...options.map((s) => ({ value: s.id, label: sectionLabel(s.gradeLevel, s.code) })),
        ]}
      />
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Creando…">Crear estudiante</SubmitButton>
      </div>
    </form>
  );
}

export function NewTeacherForm() {
  const [state, formAction] = useActionState(createTeacherAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-xl flex-col gap-4">
      <PersonFields state={state} />
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Creando…">Crear docente</SubmitButton>
      </div>
    </form>
  );
}

export function NewGuardianForm() {
  const [state, formAction] = useActionState(createGuardianAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  // La selección vive en el estado del cliente: no se pierde si la API responde con error.
  const [selected, setSelected] = useState<StudentChoice[]>([]);
  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-2xl flex-col gap-4">
      <PersonFields state={state} />
      <StudentPicker
        legend="Estudiantes a su cargo"
        max={MAX_GUARDIAN_STUDENTS}
        selected={selected}
        onChange={setSelected}
        error={state.fieldErrors?.studentIds}
      />
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Creando…">Crear apoderado</SubmitButton>
      </div>
    </form>
  );
}
