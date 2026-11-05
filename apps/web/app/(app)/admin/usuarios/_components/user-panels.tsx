'use client';

// Acciones de la ficha de un usuario: datos (RF-22), estado (RF-23), matrícula y traslado
// (RF-18, RF-20, RF-24) y vínculos con apoderados (RF-25; RN-13).
// Tras el éxito, el resultado se anuncia en la región de estado y el foco va al encabezado de la
// sección afectada (ux-accesibilidad, Decisiones 1–3 de 5a).
import { useActionState, useEffect, useState } from 'react';
import { useAnnounce } from '../../_shared/components/action-feedback';
import { ConfirmAction } from '../../_shared/components/confirm-action';
import {
  FormMessage,
  ReasonField,
  SelectField,
  SubmitButton,
  TextField,
  useFormRefs,
} from '../../_shared/components/form-bits';
import { sectionTitleId } from '../../_shared/components/page-bits';
import { IDLE } from '../../_shared/lib/action-state';
import { focusAfterSuccess } from '../../_shared/lib/focus';
import { sectionLabel } from '../../_shared/lib/format';
import {
  changeStatusAction,
  correctDniAction,
  enrollAction,
  linkStudentAction,
  makePrimaryAction,
  resetPasswordAction,
  revokeLinkAction,
  transferAction,
  updateUserAction,
  verifyDniAction,
} from '../_lib/actions';
import { CredentialsCard } from './credentials-card';
import type { SectionOption, StudentChoice, UserRole, UserStatus } from '../_lib/types';
import {
  DNI_LENGTH,
  FULL_NAME_MAX,
  STATUS_LABELS,
  USER_REASON_LIMITS,
  statusChoices,
  userFocusIds,
} from '../_lib/users';
import { StudentPicker } from './student-picker';

const sectionOptions = (sections: SectionOption[], placeholder: string) => [
  { value: '', label: placeholder },
  ...sections.map((s) => ({ value: s.id, label: sectionLabel(s.gradeLevel, s.code) })),
];

// --- Datos (RF-22) ------------------------------------------------------------

export function EditUserForm({ userId, fullName }: { userId: string; fullName: string }) {
  const [state, formAction] = useActionState(updateUserAction.bind(null, userId), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <details className="rounded-xl p-3 ring-1 ring-foreground/10">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
        Editar el nombre
      </summary>
      <form ref={formRef} action={formAction} noValidate className="mt-3 flex flex-col gap-3">
        <TextField
          name="fullName"
          label="Nombre completo"
          autoComplete="off"
          required
          maxLength={FULL_NAME_MAX}
          defaultValue={state.values?.fullName ?? fullName}
          error={state.fieldErrors?.fullName}
        />
        <p className="text-sm text-muted-foreground">
          El rol no se puede cambiar. El correo lo registra la propia persona en su primer ingreso.
        </p>
        <FormMessage state={state} alertRef={alertRef} />
        <div>
          <SubmitButton>Guardar datos</SubmitButton>
        </div>
      </form>
    </details>
  );
}

// --- Estado (RF-23) -----------------------------------------------------------

export function StatusAction({
  userId,
  role,
  status,
}: {
  userId: string;
  role: UserRole;
  status: UserStatus;
}) {
  const choices = statusChoices(status);
  return (
    <ConfirmAction
      action={changeStatusAction.bind(null, userId)}
      triggerLabel="Cambiar estado"
      title="Cambiar el estado de la cuenta"
      description={
        role === 'STUDENT'
          ? 'Inactivo: no puede ingresar, pero conserva su matrícula. Retirado: además se cierran sus matrículas vigentes y no se reabren al volver a activarlo.'
          : 'Inactivo o Retirado: la persona ya no puede ingresar al aula virtual.'
      }
      confirmLabel="Cambiar estado"
      focusId={sectionTitleId(userFocusIds.status)}
    >
      {(state) => (
        <>
          <SelectField
            name="status"
            label={`Nuevo estado (ahora: ${STATUS_LABELS[status]})`}
            required
            defaultValue={state.values?.status ?? ''}
            error={state.fieldErrors?.status}
            options={[
              { value: '', label: 'Elige el nuevo estado' },
              ...choices.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
            ]}
          />
          {role === 'STUDENT' ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              Atención: pasar a <strong>Retirado</strong> cierra sus matrículas vigentes.
            </p>
          ) : null}
          <ReasonField
            label="Motivo del cambio"
            limits={USER_REASON_LIMITS.status}
            error={state.fieldErrors?.reason}
            defaultValue={state.values?.reason}
          />
        </>
      )}
    </ConfirmAction>
  );
}

// --- Matrícula y traslado (RF-18, RF-20, RF-24) -------------------------------

export function EnrollForm({
  studentId,
  sections,
  year,
}: {
  studentId: string;
  sections: SectionOption[];
  year: number;
}) {
  const [state, formAction] = useActionState(enrollAction.bind(null, studentId), IDLE);
  const { formRef, alertRef } = useFormRefs(state, { announceOk: false });
  useSuccess(state, sectionTitleId(userFocusIds.enrollments));
  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
    >
      <SelectField
        name="sectionId"
        label={`Matricular en la sección (año ${year})`}
        required
        defaultValue={state.values?.sectionId ?? ''}
        error={state.fieldErrors?.sectionId}
        hint="La matrícula empieza hoy."
        options={sectionOptions(sections, 'Elige una sección')}
      />
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Matriculando…">Matricular</SubmitButton>
      </div>
    </form>
  );
}

export function TransferAction({
  studentId,
  currentLabel,
  targets,
}: {
  studentId: string;
  currentLabel: string;
  /** Solo secciones activas del mismo año y grado, distintas de la actual (transferTargets). */
  targets: SectionOption[];
}) {
  return (
    <ConfirmAction
      action={transferAction.bind(null, studentId)}
      triggerLabel="Trasladar de sección"
      title="Trasladar a otra sección"
      description={`Hoy se cierra su matrícula en ${currentLabel} y empieza otra en la sección elegida, del mismo grado y año.`}
      confirmLabel="Trasladar"
      focusId={sectionTitleId(userFocusIds.enrollments)}
    >
      {(state) => (
        <>
          <SelectField
            name="sectionId"
            label="Sección de destino"
            required
            defaultValue={state.values?.sectionId ?? ''}
            error={state.fieldErrors?.sectionId}
            options={sectionOptions(targets, 'Elige la sección')}
          />
          <ReasonField
            label="Motivo del traslado"
            limits={USER_REASON_LIMITS.transfer}
            error={state.fieldErrors?.reason}
            defaultValue={state.values?.reason}
          />
        </>
      )}
    </ConfirmAction>
  );
}

// --- Vínculos con apoderados (RF-25; RN-13) -----------------------------------

export function RevokeLinkAction({
  linkId,
  otherName,
  focusSection,
}: {
  linkId: string;
  /** Nombre de la otra persona del vínculo (para el texto del botón y del diálogo). */
  otherName: string;
  focusSection: string;
}) {
  return (
    <ConfirmAction
      action={revokeLinkAction.bind(null, linkId)}
      triggerLabel="Revocar vínculo"
      title="Revocar el vínculo"
      description={`Se revoca el vínculo con ${otherName}. El apoderado deja de ver la información de ese estudiante. El vínculo queda en el historial y se puede volver a crear.`}
      confirmLabel="Revocar"
      focusId={focusSection}
      destructive
    >
      {(state) => (
        <ReasonField
          label="Motivo de la revocación"
          limits={USER_REASON_LIMITS.revoke}
          error={state.fieldErrors?.reason}
          defaultValue={state.values?.reason}
        />
      )}
    </ConfirmAction>
  );
}

export function LinkStudentForm({ guardianId }: { guardianId: string }) {
  const [state, formAction] = useActionState(linkStudentAction.bind(null, guardianId), IDLE);
  const { formRef, alertRef } = useFormRefs(state, { announceOk: false });
  const [selected, setSelected] = useState<StudentChoice[]>([]);
  // Tras vincular, se vacía la selección (ajuste de estado durante el render, sin efecto).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === 'ok') setSelected([]);
  }
  useSuccess(state, sectionTitleId(userFocusIds.students));
  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-3">
      <StudentPicker
        legend="Vincular otro estudiante"
        max={1}
        selected={selected}
        onChange={setSelected}
        error={state.fieldErrors?.studentIds}
      />
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Vinculando…">Vincular estudiante</SubmitButton>
      </div>
    </form>
  );
}

/** Tras el éxito: anuncia y lleva el foco al encabezado de la sección afectada. */
function useSuccess(state: { status: string; message?: string }, focusId: string) {
  const announce = useAnnounce();
  useEffect(() => {
    if (state.status !== 'ok') return;
    if (state.message) announce(state.message);
    requestAnimationFrame(() => focusAfterSuccess(focusId));
  }, [state, announce, focusId]);
}

// --- Credenciales (RF-69, RF-74, RF-84) ----------------------------------------

/** Contraseña temporal nueva (RF-74): cierra sus sesiones y se muestra una sola vez. */
export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(resetPasswordAction.bind(null, userId), IDLE);
  const { formRef, alertRef } = useFormRefs(state, { announceOk: false });
  if (state.status === 'ok' && state.issued) {
    return <CredentialsCard message={state.message} issued={state.issued} />;
  }
  return (
    <details className="rounded-xl p-3 ring-1 ring-foreground/10">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
        Restablecer la contraseña
      </summary>
      <form ref={formRef} action={formAction} noValidate className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Se genera una contraseña temporal nueva, se cierran todas sus sesiones, se levanta el
          bloqueo si lo tenía y deberá cambiarla en su siguiente ingreso. El código de usuario no
          cambia.
        </p>
        <FormMessage state={state} alertRef={alertRef} />
        <div>
          <SubmitButton pendingText="Generando…" variant="outline">
            Generar contraseña temporal
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

/** Corrige el DNI (RF-84): código y contraseña nuevos, y el código anterior queda en la bitácora. */
export function CorrectDniForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(correctDniAction.bind(null, userId), IDLE);
  const { formRef, alertRef } = useFormRefs(state, { announceOk: false });
  if (state.status === 'ok' && state.issued) {
    return <CredentialsCard message={state.message} issued={state.issued} />;
  }
  return (
    <details className="rounded-xl p-3 ring-1 ring-foreground/10">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
        Corregir el DNI
      </summary>
      <form ref={formRef} action={formAction} noValidate className="mt-3 flex flex-col gap-3">
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Atención: se genera un <strong>código de usuario nuevo</strong> y una contraseña temporal.
          El código anterior deja de servir y se cierran sus sesiones.
        </p>
        <TextField
          name="dni"
          label="DNI correcto"
          inputMode="numeric"
          autoComplete="off"
          required
          maxLength={DNI_LENGTH}
          defaultValue={state.values?.dni}
          error={state.fieldErrors?.dni}
        />
        <TextField
          name="dniConfirm"
          label="Escribe el DNI otra vez"
          inputMode="numeric"
          autoComplete="off"
          required
          maxLength={DNI_LENGTH}
          defaultValue={state.values?.dniConfirm}
          error={state.fieldErrors?.dniConfirm}
        />
        <ReasonField
          label="Motivo de la corrección"
          limits={USER_REASON_LIMITS.revoke}
          error={state.fieldErrors?.reason}
          defaultValue={state.values?.reason}
        />
        <FormMessage state={state} alertRef={alertRef} />
        <div>
          <SubmitButton pendingText="Corrigiendo…" variant="outline">
            Corregir el DNI
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

/** Marca que el DNI se comparó con el documento físico (RF-69). */
export function VerifyDniForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(verifyDniAction.bind(null, userId), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Marcando…" variant="outline">
          Marcar el DNI como verificado
        </SubmitButton>
      </div>
    </form>
  );
}

/** Cambia cuál de los apoderados vigentes recibe los avisos (RF-86). */
export function MakePrimaryForm({ linkId, name }: { linkId: string; name: string }) {
  const [state, formAction] = useActionState(makePrimaryAction.bind(null, linkId), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Cambiando…" variant="outline">
          Hacer principal<span className="sr-only">: {name}</span>
        </SubmitButton>
      </div>
    </form>
  );
}
