'use client';

// Altas de estudiante (RF-18), docente (RF-19) y apoderado (RF-20). Se pide el DNI dos veces
// (RF-69). Al crear, la pantalla muestra una sola vez el código y la contraseña inicial
// (RF-70): no se redirige con ellas en la URL. Los campos conservan lo escrito si la API falla.
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
import { DNI_LENGTH, FULL_NAME_MAX, MAX_GUARDIAN_STUDENTS, enrollTargets } from '../_lib/users';
import { CredentialsCard } from './credentials-card';
import { StudentPicker } from './student-picker';

function NameField({
  state,
  name = 'fullName',
  label = 'Nombre completo',
  hint,
  required = true,
}: {
  state: ActionState;
  name?: string;
  label?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <TextField
      name={name}
      label={label}
      autoComplete="off"
      required={required}
      maxLength={FULL_NAME_MAX}
      defaultValue={state.values?.[name]}
      error={state.fieldErrors?.[name]}
      hint={hint ?? 'Nombres y apellidos, de 3 a 120 caracteres.'}
    />
  );
}

/** DNI escrito dos veces y la marca de "comparado con el documento" (RF-69). */
function DniFields({
  state,
  dni = 'dni',
  confirm = 'dniConfirm',
  verified = 'dniVerified',
  who = 'la persona',
}: {
  state: ActionState;
  dni?: string;
  confirm?: string;
  verified?: string;
  who?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">DNI de {who}</legend>
      <TextField
        name={dni}
        label={`DNI de ${who}`}
        inputMode="numeric"
        autoComplete="off"
        required
        maxLength={DNI_LENGTH}
        defaultValue={state.values?.[dni]}
        error={state.fieldErrors?.[dni]}
        hint="8 dígitos. Solo lo ve el administrador."
      />
      <TextField
        name={confirm}
        label="Escribe el DNI otra vez"
        inputMode="numeric"
        autoComplete="off"
        required
        maxLength={DNI_LENGTH}
        defaultValue={state.values?.[confirm]}
        error={state.fieldErrors?.[confirm]}
      />
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          name={verified}
          defaultChecked={state.values?.[verified] === 'on'}
          className="mt-0.5 size-5 shrink-0 accent-brand"
        />
        <span>Ya comparé este DNI con el documento (DNI o partida de nacimiento).</span>
      </label>
    </fieldset>
  );
}

/** Si el alta salió bien, se muestran las credenciales en lugar del formulario. */
function Issued({ state }: { state: ActionState }) {
  if (state.status !== 'ok' || !state.issued) return null;
  return (
    <CredentialsCard message={state.message} issued={state.issued} nextHref={state.nextHref} />
  );
}

export function NewStudentForm({ sections, year }: { sections: SectionOption[]; year: number }) {
  const [state, formAction] = useActionState(createStudentAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state, { announceOk: false });
  const [second, setSecond] = useState(false);
  const options = enrollTargets(sections);
  if (state.status === 'ok' && state.issued) return <Issued state={state} />;
  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <NameField state={state} />
        <DniFields state={state} who="el estudiante" />
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
      </div>

      <fieldset className="flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
        <legend className="px-1 font-semibold">Apoderado principal</legend>
        <p className="text-sm text-muted-foreground">
          Todo estudiante tiene al menos un apoderado. Si el apoderado ya está registrado (por
          ejemplo, el de un hermano), basta su DNI: se vincula sin crear otra cuenta.
        </p>
        <DniFields
          state={state}
          dni="guardian1Dni"
          confirm="guardian1DniConfirm"
          verified="guardian1Verified"
          who="el apoderado"
        />
        <NameField
          state={state}
          name="guardian1Name"
          label="Nombre completo del apoderado"
          required={false}
          hint="Obligatorio solo si el apoderado es nuevo."
        />
      </fieldset>

      {second ? (
        <fieldset className="flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
          <legend className="px-1 font-semibold">Segundo apoderado (opcional)</legend>
          <DniFields
            state={state}
            dni="guardian2Dni"
            confirm="guardian2DniConfirm"
            verified="guardian2Verified"
            who="el segundo apoderado"
          />
          <NameField
            state={state}
            name="guardian2Name"
            label="Nombre completo del segundo apoderado"
            required={false}
            hint="Obligatorio solo si el apoderado es nuevo."
          />
        </fieldset>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setSecond(true)}
            className="min-h-11 text-sm text-brand underline underline-offset-4"
          >
            Agregar un segundo apoderado
          </button>
        </div>
      )}

      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Creando…">Crear estudiante</SubmitButton>
      </div>
    </form>
  );
}

export function NewTeacherForm() {
  const [state, formAction] = useActionState(createTeacherAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state, { announceOk: false });
  if (state.status === 'ok' && state.issued) return <Issued state={state} />;
  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-xl flex-col gap-4">
      <NameField state={state} />
      <DniFields state={state} who="el docente" />
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Creando…">Crear docente</SubmitButton>
      </div>
    </form>
  );
}

export function NewGuardianForm() {
  const [state, formAction] = useActionState(createGuardianAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state, { announceOk: false });
  // La selección vive en el estado del cliente: no se pierde si la API responde con error.
  const [selected, setSelected] = useState<StudentChoice[]>([]);
  if (state.status === 'ok' && state.issued) return <Issued state={state} />;
  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-2xl flex-col gap-4">
      <NameField state={state} />
      <DniFields state={state} who="el apoderado" />
      <StudentPicker
        legend="Estudiantes a su cargo"
        max={MAX_GUARDIAN_STUDENTS}
        selected={selected}
        onChange={setSelected}
        error={state.fieldErrors?.studentIds}
      />
      <p className="text-sm text-muted-foreground">
        Si el apoderado ya existe, no lo crees otra vez: ábrelo desde la lista y vincula al
        estudiante. Cada estudiante admite hasta 2 apoderados.
      </p>
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Creando…">Crear apoderado</SubmitButton>
      </div>
    </form>
  );
}
