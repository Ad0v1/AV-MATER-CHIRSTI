'use client';

// Acciones del año (RF-12, RN-11) y de sus períodos (RF-10, RF-11, RN-10).
import { useActionState } from 'react';
import {
  activateYearAction,
  closePeriodAction,
  closeYearAction,
  reopenPeriodAction,
  updatePeriodAction,
  updateYearAction,
} from '../_lib/actions';
import { PAGE_TITLE_ID, focusIds } from '../_lib/focus';
import { IDLE, type PeriodView } from '../_lib/types';
import { REASON_LIMITS } from '../_lib/validation';
import { ConfirmAction } from './confirm-action';
import { FormMessage, ReasonField, SubmitButton, TextField, useFormRefs } from './form-bits';

export function YearActions({
  yearId,
  year,
  isActive,
  isClosed,
  readOnly,
  openPeriods,
}: {
  yearId: string;
  year: number;
  isActive: boolean;
  isClosed: boolean;
  readOnly: boolean;
  openPeriods: number;
}) {
  if (isClosed) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {!isActive ? (
        <ConfirmAction
          action={activateYearAction.bind(null, yearId)}
          triggerLabel="Activar año"
          title={`¿Activar el año ${year}?`}
          description="Solo puede haber un año activo. El año activo actual pasará a inactivo y sus datos quedarán de solo lectura."
          confirmLabel="Activar"
          focusId={PAGE_TITLE_ID}
        />
      ) : null}
      <ConfirmAction
        action={closeYearAction.bind(null, yearId)}
        triggerLabel="Cerrar año"
        title={`¿Cerrar el año ${year}?`}
        description={
          openPeriods > 0
            ? `Primero cierra sus períodos: quedan ${openPeriods} abiertos. El cierre del año no se puede deshacer.`
            : 'El cierre no se puede deshacer: el año quedará de solo lectura.'
        }
        confirmLabel="Cerrar año"
        focusId={PAGE_TITLE_ID}
        destructive
      />
      {openPeriods > 0 ? (
        // Se deja pulsable (un botón deshabilitado no se descubre con teclado); el aviso se ve
        // antes de intentarlo y el diálogo lo repite.
        <p className="basis-full text-sm text-muted-foreground">
          Para cerrar el año, primero cierra{' '}
          {openPeriods === 1 ? 'su período abierto' : `sus ${openPeriods} períodos abiertos`}.
        </p>
      ) : null}
      {!isActive && !readOnly ? <EditYearForm yearId={yearId} year={year} /> : null}
    </div>
  );
}

function EditYearForm({ yearId, year }: { yearId: string; year: number }) {
  const [state, formAction] = useActionState(updateYearAction.bind(null, yearId), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <details className="w-full rounded-xl p-3 ring-1 ring-foreground/10 sm:w-auto">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
        Cambiar el número del año
      </summary>
      <form ref={formRef} action={formAction} noValidate className="mt-3 flex flex-col gap-3">
        <TextField
          name="year"
          label="Año"
          inputMode="numeric"
          required
          defaultValue={state.values?.year ?? String(year)}
          error={state.fieldErrors?.year}
          hint="Solo si el año no está activo ni tiene secciones. Las fechas de los períodos se mueven al nuevo año."
        />
        <FormMessage state={state} alertRef={alertRef} />
        <div>
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </form>
    </details>
  );
}

export function PeriodPanel({
  period,
  closedAtText,
  yearReadOnly,
  yearActive,
}: {
  period: PeriodView;
  closedAtText: string;
  yearReadOnly: boolean;
  yearActive: boolean;
}) {
  const closed = !!period.closedAt;
  const canEdit = !yearReadOnly && !closed;
  const canReopen = closed && yearActive && !yearReadOnly;
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Inicio</dt>
          <dd className="font-medium">{period.startDate}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fin</dt>
          <dd className="font-medium">{period.endDate}</dd>
        </div>
        {closed ? (
          <div className="col-span-2">
            <dt className="text-muted-foreground">Cerrado</dt>
            <dd>{closedAtText}</dd>
          </div>
        ) : null}
      </dl>
      {canEdit ? <EditPeriodForm period={period} /> : null}
      <div className="flex flex-wrap gap-2">
        {!closed && !yearReadOnly ? (
          <ConfirmAction
            action={closePeriodAction.bind(null, period.id)}
            triggerLabel={`Cerrar ${period.label}`}
            title={`¿Cerrar el ${period.label}?`}
            description="Con el período cerrado no se crean, editan ni califican actividades (RN-10). Se puede reabrir con un motivo."
            confirmLabel="Cerrar período"
            focusId={focusIds.period(period.id)}
            destructive
          >
            {(state) => (
              <ReasonField
                label="Motivo del cierre"
                limits={REASON_LIMITS.closePeriod}
                error={state.fieldErrors?.reason}
                defaultValue={state.values?.reason}
              />
            )}
          </ConfirmAction>
        ) : null}
        {canReopen ? (
          <ConfirmAction
            action={reopenPeriodAction.bind(null, period.id)}
            triggerLabel={`Reabrir ${period.label}`}
            title={`¿Reabrir el ${period.label}?`}
            description="Los docentes podrán volver a crear, editar y calificar actividades del período. El motivo es obligatorio."
            confirmLabel="Reabrir período"
            focusId={focusIds.period(period.id)}
          >
            {(state) => (
              <ReasonField
                label="Motivo de la reapertura"
                limits={REASON_LIMITS.reopenPeriod}
                error={state.fieldErrors?.reason}
                defaultValue={state.values?.reason}
              />
            )}
          </ConfirmAction>
        ) : null}
      </div>
    </div>
  );
}

function EditPeriodForm({ period }: { period: PeriodView }) {
  const [state, formAction] = useActionState(updatePeriodAction.bind(null, period.id), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <details className="rounded-lg p-3 ring-1 ring-foreground/10">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
        Editar fechas
      </summary>
      <form ref={formRef} action={formAction} noValidate className="mt-3 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            name="startDate"
            type="date"
            label="Inicio"
            required
            defaultValue={state.values?.startDate ?? period.startDate}
            error={state.fieldErrors?.startDate}
          />
          <TextField
            name="endDate"
            type="date"
            label="Fin"
            required
            defaultValue={state.values?.endDate ?? period.endDate}
            error={state.fieldErrors?.endDate}
          />
        </div>
        <FormMessage state={state} alertRef={alertRef} />
        <div>
          <SubmitButton>Guardar fechas</SubmitButton>
        </div>
      </form>
    </details>
  );
}
