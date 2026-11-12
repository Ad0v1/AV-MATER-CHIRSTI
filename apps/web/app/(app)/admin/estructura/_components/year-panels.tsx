'use client';

// Acciones del año (RF-12, RN-11) y de sus períodos (RF-10, RF-11, RN-10).
// Diseño limpio: botones de texto (una sola acción principal) y formularios que se abren en línea,
// sin cajas ni bordes alrededor.
import { useActionState, useId, useState } from 'react';
import { restrictDigits } from '@/lib/digits';
import { Button } from '@/components/ui/button';
import {
  activateYearAction,
  closePeriodAction,
  closeYearAction,
  reopenPeriodAction,
  updatePeriodAction,
  updateYearAction,
} from '../_lib/actions';
import { PAGE_TITLE_ID, focusIds } from '../_lib/focus';
import { formatDateOnly } from '../_lib/format';
import { IDLE, type PeriodView } from '../_lib/types';
import { REASON_LIMITS } from '../_lib/validation';
import { ConfirmAction } from '@/app/(app)/admin/_shared/components/confirm-action';
import {
  FormMessage,
  ReasonField,
  SubmitButton,
  TextField,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';
import { SOFT_FIELDS, TOUCH } from '@/app/(app)/admin/_shared/components/styles';

// Botones de texto: 44 px en móvil (táctil) y 36 px en escritorio, para un resalte más delgado.
const QUIET = 'px-3 md:min-h-9 text-ink-2 hover:bg-foreground/5 hover:text-foreground';

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
  const openNoticeId = useId();
  const editId = useId();
  const [editing, setEditing] = useState(false);
  if (isClosed) return null;
  const canEdit = !isActive && !readOnly;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {!isActive ? (
          <ConfirmAction
            action={activateYearAction.bind(null, yearId)}
            triggerLabel="Activar año"
            appearance="primary"
            title={`¿Activar el año ${year}?`}
            description="Solo puede haber un año activo. El año activo actual pasará a inactivo y sus datos quedarán de solo lectura."
            confirmLabel="Activar"
            focusId={PAGE_TITLE_ID}
          />
        ) : null}
        <ConfirmAction
          action={closeYearAction.bind(null, yearId)}
          triggerLabel="Cerrar año"
          appearance="quiet-destructive"
          title={`¿Cerrar el año ${year}?`}
          description={
            openPeriods > 0
              ? `Primero cierra sus períodos: quedan ${openPeriods} abiertos. El cierre del año no se puede deshacer.`
              : 'El cierre no se puede deshacer: el año quedará de solo lectura.'
          }
          confirmLabel="Cerrar año"
          focusId={PAGE_TITLE_ID}
          triggerDescribedBy={openPeriods > 0 ? openNoticeId : undefined}
          destructive
        />
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            className={`${TOUCH} ${QUIET}`}
            aria-expanded={editing}
            aria-controls={editId}
            onClick={() => setEditing((v) => !v)}
          >
            Cambiar el número del año
          </Button>
        ) : null}
      </div>
      {openPeriods > 0 ? (
        // Se deja pulsable (un botón deshabilitado no se descubre con teclado); el aviso se ve
        // antes de intentarlo y el diálogo lo repite.
        <p id={openNoticeId} className="text-sm text-muted-foreground">
          Para cerrar el año, primero cierra{' '}
          {openPeriods === 1 ? 'su período abierto' : `sus ${openPeriods} períodos abiertos`}.
        </p>
      ) : null}
      {canEdit && editing ? <EditYearForm id={editId} yearId={yearId} year={year} /> : null}
    </div>
  );
}

function EditYearForm({ id, yearId, year }: { id: string; yearId: string; year: number }) {
  const [state, formAction] = useActionState(updateYearAction.bind(null, yearId), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <form
      id={id}
      ref={formRef}
      action={formAction}
      noValidate
      className={`mt-2 flex max-w-sm flex-col gap-3 ${SOFT_FIELDS}`}
    >
      <TextField
        name="year"
        label="Año"
        inputMode="numeric"
        maxLength={4}
        autoComplete="off"
        onInput={restrictDigits}
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
  const editId = useId();
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div>
            <dt className="text-muted-foreground">Inicio</dt>
            <dd className="font-medium">{formatDateOnly(period.startDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fin</dt>
            <dd className="font-medium">{formatDateOnly(period.endDate)}</dd>
          </div>
          {closed ? (
            <div>
              <dt className="text-muted-foreground">Cerrado</dt>
              <dd>{closedAtText}</dd>
            </div>
          ) : null}
        </dl>
        <div className="-mr-3 flex flex-wrap items-center gap-1">
          {canEdit ? (
            <Button
              type="button"
              variant="ghost"
              className={`${TOUCH} ${QUIET}`}
              aria-expanded={editing}
              aria-controls={editId}
              onClick={() => setEditing((v) => !v)}
            >
              Editar fechas
            </Button>
          ) : null}
          {!closed && !yearReadOnly ? (
            <ConfirmAction
              action={closePeriodAction.bind(null, period.id)}
              triggerLabel={`Cerrar ${period.label}`}
              appearance="quiet-destructive"
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
              appearance="quiet"
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
      {canEdit && editing ? <EditPeriodForm id={editId} period={period} /> : null}
    </div>
  );
}

function EditPeriodForm({ id, period }: { id: string; period: PeriodView }) {
  const [state, formAction] = useActionState(updatePeriodAction.bind(null, period.id), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <form
      id={id}
      ref={formRef}
      action={formAction}
      noValidate
      className={`flex flex-col gap-3 ${SOFT_FIELDS}`}
    >
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
  );
}
