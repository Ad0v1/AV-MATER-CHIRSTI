'use client';

// Promoción en bloque (RF-16, RN-15): el sistema propone, el admin corrige fila a fila o por
// sección y confirma todo o nada. La lógica vive en _lib/promotion-machine.ts.
// - Confirmar usa ConfirmAction (foco, anuncio y diálogo comunes). ConfirmAction no se desmonta
//   al terminar (solo se oculta su contenedor), para que cierre el diálogo y mueva el foco.
// - 409 (la propuesta cambió) → se cierra el diálogo, se anuncia y el foco va al aviso con
//   "Volver a cargar", que pide la propuesta nueva (router.refresh) y la carga con LOAD.
// - 422 (filas que no se pueden aplicar) → se cierra el diálogo, se anuncia el número de filas y
//   el foco va al primer selector con error (UX 6b, ALTO 2). Nada se guardó.
// - Acciones en bloque: se anuncian con conteos (UX 6b, ALTO 1).
// - Cada selector tiene un nombre único: "Acción de {nombre}", "Sección de destino de {nombre}"
//   (el texto visible está contenido en el nombre, 2.5.3).
// - Desde 360 px: cada fila es un grupo (fieldset) con selectores apilados; teclado nativo.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useReducer, useState, useTransition, type ReactNode } from 'react';
import { promotionCommitAction } from '../_lib/actions';
import { FOCUS_HEADING, PAGE_TITLE_ID } from '../_lib/focus';
import { sectionLabel } from '../_lib/format';
import {
  ACTION_LABELS,
  FLAG_LABELS,
  STALE_MESSAGE,
  allowedActions,
  bulkActions,
  bulkAnnouncement,
  canConfirm,
  confirmBlockReason,
  firstErrorFieldId,
  groupBySection,
  initPromotionState,
  invalidRowsMessage,
  onlyExcludeNote,
  promotionReducer,
  resultMessage,
  rowError,
  rowFieldIds,
  rowsWithError,
  sectionChoices,
  summarize,
  summaryLines,
  targetGradeFor,
  toPayload,
  type PromotionAction,
  type PromotionItem,
  type PromotionProposal,
  type PromotionState,
  type SectionGroup,
} from '../_lib/promotion-machine';
import type { ActionState } from '../_lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAnnounce } from '@/app/(app)/admin/_shared/components/action-feedback';
import { ConfirmAction } from '@/app/(app)/admin/_shared/components/confirm-action';
import { TOUCH } from '@/app/(app)/admin/_shared/components/styles';
import { cn } from '@/lib/utils';

const RESULT_ID = 'resultado-promocion';
const STALE_ID = 'propuesta-desactualizada';
const ERRORS_ID = 'promocion-errores';
const NO_SECTION = '';

type Dispatch = (event: Parameters<typeof promotionReducer>[1]) => void;

/** Destino del foco al cerrar el diálogo de confirmación, según cómo terminó. */
function focusTargetOf(state: PromotionState): string {
  if (state.phase === 'desactualizada') return STALE_ID;
  if (state.phase === 'editando' && state.message) {
    return firstErrorFieldId(state) ?? ERRORS_ID;
  }
  return RESULT_ID;
}

export function PromotionScreen({
  proposal,
  targetHref,
}: {
  proposal: PromotionProposal;
  targetHref: string;
}) {
  const [state, dispatch] = useReducer(promotionReducer, proposal, initPromotionState);
  const router = useRouter();
  const announce = useAnnounce();
  const [reloading, startReload] = useTransition();
  const summaryId = useId();
  const reasonId = useId();

  // Propuesta nueva tras "Volver a cargar" (o tras un refresco): se carga si no hay envío ni
  // resultado (el reductor decide).
  if (proposal.fingerprint !== state.proposal.fingerprint) {
    const next = promotionReducer(state, { type: 'LOAD', proposal });
    if (next !== state) dispatch({ type: 'LOAD', proposal });
  }

  const summary = summarize(state);
  const groups = groupBySection(state.proposal.items);
  const { sourceYear, targetYear } = state.proposal;
  const confirmable = canConfirm(state);
  const blockReason = confirmBlockReason(state);

  const action = async (): Promise<ActionState> => {
    const payload = toPayload(state);
    const confirming = promotionReducer(state, { type: 'CONFIRM' });
    dispatch({ type: 'CONFIRM' });
    const outcome = await promotionCommitAction(
      targetYear.id,
      sourceYear.id,
      state.proposal.fingerprint,
      payload,
    );
    if (outcome.ok) {
      dispatch({ type: 'COMMIT_OK', result: outcome.result });
      return { status: 'ok', message: resultMessage(outcome.result) };
    }
    const failed: Parameters<typeof promotionReducer>[1] = {
      type: 'COMMIT_FAILED',
      status: outcome.status,
      message: outcome.message,
      details: outcome.details,
    };
    dispatch(failed);
    // 409: se cierra el diálogo (estado 'ok' para ConfirmAction), se anuncia el aviso y el foco
    // va al aviso con "Volver a cargar" (focusId cambia con la fase). No se guardó nada.
    if (outcome.status === 409) return { status: 'ok', message: STALE_MESSAGE };
    // 422: igual, pero el foco va al primer selector con error y se anuncia cuántas filas son.
    if (outcome.status === 422) {
      const after = promotionReducer(confirming, failed);
      return { status: 'ok', message: invalidRowsMessage(rowsWithError(after).length) };
    }
    return { status: 'error', message: outcome.message };
  };

  const errorCount = state.message ? rowsWithError(state).length : 0;

  return (
    <div className="flex flex-col gap-6">
      {state.phase === 'hecho' && state.result ? (
        <section aria-labelledby={RESULT_ID} className="flex flex-col gap-3">
          <h2 id={RESULT_ID} tabIndex={-1} className={cn('text-lg font-semibold', FOCUS_HEADING)}>
            Promoción confirmada
          </h2>
          <ul className="list-disc pl-5 text-sm">
            <li>{state.result.promoted} promovidos</li>
            <li>{state.result.repeated} repiten</li>
            <li>{state.result.graduated} egresados</li>
            <li>
              {state.result.excluded} excluidos (siguen en {sourceYear.year})
            </li>
            <li>
              {state.result.closedEnrollments} matrículas cerradas en {sourceYear.year} y{' '}
              {state.result.createdEnrollments} creadas en {targetYear.year}
            </li>
          </ul>
          <p className="text-sm">
            Si excluiste estudiantes, vuelve a abrir esta página para promoverlos en otra tanda.
          </p>
          <p>
            <Link href={targetHref} className="underline underline-offset-4">
              Volver al año {targetYear.year}
            </Link>
          </p>
        </section>
      ) : null}

      {state.phase === 'desactualizada' ? (
        <Alert
          id={STALE_ID}
          tabIndex={-1}
          role="group"
          aria-labelledby={`${STALE_ID}-titulo`}
          className="outline-none focus:ring-3 focus:ring-ring/60"
        >
          <AlertTitle id={`${STALE_ID}-titulo`}>{STALE_MESSAGE}</AlertTitle>
          <AlertDescription>
            <p>
              Otra persona o proceso cambió las matrículas o las secciones. No se guardó nada:
              vuelve a cargar la propuesta y revisa tus cambios.
            </p>
            <Button
              type="button"
              className={cn(TOUCH, 'mt-2')}
              disabled={reloading}
              aria-busy={reloading || undefined}
              onClick={() => startReload(() => router.refresh())}
            >
              {reloading ? 'Cargando…' : 'Volver a cargar la propuesta'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div hidden={state.phase === 'hecho'} className="flex flex-col gap-6">
        {state.proposal.items.length === 0 ? (
          <p className="text-sm">
            No quedan matrículas vigentes en {sourceYear.year}: no hay nada que promover.
          </p>
        ) : (
          <>
            <section aria-labelledby={`${summaryId}-titulo`} className="flex flex-col gap-2">
              <h2 id={`${summaryId}-titulo`} className="text-lg font-semibold">
                Resumen
              </h2>
              <ul id={summaryId} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {summaryLines(summary).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {state.phase === 'editando' && state.message ? (
                <Alert
                  id={ERRORS_ID}
                  variant="destructive"
                  tabIndex={-1}
                  role="group"
                  aria-labelledby={`${ERRORS_ID}-titulo`}
                  className="outline-none focus:ring-3 focus:ring-ring/60"
                >
                  <AlertTitle id={`${ERRORS_ID}-titulo`}>
                    {errorCount > 0 ? invalidRowsMessage(errorCount) : state.message}
                  </AlertTitle>
                  {state.generalErrors.length > 0 ? (
                    <AlertDescription>
                      <ul className="list-disc pl-5">
                        {state.generalErrors.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  ) : null}
                </Alert>
              ) : null}
              <div className="flex flex-wrap items-start gap-2">
                <ConfirmAction
                  action={action}
                  triggerLabel="Confirmar promoción"
                  title={`¿Confirmar la promoción de ${sourceYear.year} a ${targetYear.year}?`}
                  description={`Se aplica todo o nada: ${summaryLines(summary).join(', ')}. Las matrículas de ${sourceYear.year} se cierran por fin de año y las de ${targetYear.year} se crean ahora. Las notas no cambian.`}
                  confirmLabel="Confirmar"
                  focusId={focusTargetOf(state)}
                  disabled={!confirmable}
                  triggerDescribedBy={blockReason ? reasonId : summaryId}
                />
                <Button
                  type="button"
                  variant="outline"
                  className={TOUCH}
                  disabled={state.phase !== 'editando'}
                  onClick={() => {
                    dispatch({ type: 'RESET_ROWS' });
                    announce('Se descartaron tus cambios: se volvió a la propuesta del sistema.');
                    requestAnimationFrame(() => document.getElementById(PAGE_TITLE_ID)?.focus());
                  }}
                >
                  Descartar mis cambios
                </Button>
              </div>
              {blockReason ? (
                <p id={reasonId} className="text-sm text-muted-foreground">
                  {blockReason}
                </p>
              ) : null}
            </section>

            {groups.map((group) => (
              <GroupPanel
                key={group.sectionId}
                group={group}
                state={state}
                dispatch={dispatch}
                sourceYear={sourceYear.year}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Selector con id propio (destino de foco) y nombre accesible único (`hiddenSuffix`). */
function RowSelect({
  id,
  label,
  hiddenSuffix,
  options,
  value,
  disabled,
  describedBy,
  invalid,
  onChange,
}: {
  id: string;
  label: string;
  hiddenSuffix: string;
  options: { value: string; label: string }[];
  value: string;
  disabled: boolean;
  describedBy?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        <span className="sr-only"> {hiddenSuffix}</span>
      </Label>
      <NativeSelect
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className="w-full [&_select]:h-11 md:[&_select]:h-9"
      >
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function GroupPanel({
  group,
  state,
  dispatch,
  sourceYear,
}: {
  group: SectionGroup;
  state: PromotionState;
  dispatch: Dispatch;
  sourceYear: number;
}) {
  const headingId = useId();
  const baseId = useId();
  const announce = useAnnounce();
  const actions = bulkActions(group);
  const [bulkAction, setBulkAction] = useState<PromotionAction>(actions[0]);
  const [bulkSection, setBulkSection] = useState(NO_SECTION);
  const choices = sectionChoices(group.items[0], bulkAction, state.proposal.targetSections);
  const needsSection = targetGradeFor(bulkAction, group) !== null;
  const editable = state.phase === 'editando';
  const label = sectionLabel(group.gradeLevel, group.code, group.level);
  const suffix = `para toda la sección ${label}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        Sección {label} ({sourceYear}): {group.items.length}{' '}
        {group.items.length === 1 ? 'estudiante' : 'estudiantes'}
      </h2>
      <fieldset className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
        <legend className="px-1 text-sm font-semibold">Aplicar a toda la sección {label}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <RowSelect
            id={`${baseId}-accion`}
            label="Acción"
            hiddenSuffix={suffix}
            options={actions.map((a) => ({ value: a, label: ACTION_LABELS[a] }))}
            value={bulkAction}
            disabled={!editable}
            onChange={(v) => {
              setBulkAction(v as PromotionAction);
              setBulkSection(NO_SECTION);
            }}
          />
          {needsSection ? (
            <RowSelect
              id={`${baseId}-seccion`}
              label="Sección de destino"
              hiddenSuffix={suffix}
              options={[
                { value: NO_SECTION, label: 'La propuesta para cada fila' },
                ...choices.map((s) => ({
                  value: s.id,
                  label: sectionLabel(s.gradeLevel, s.code, s.level),
                })),
              ]}
              value={bulkSection}
              disabled={!editable}
              onChange={setBulkSection}
            />
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Los retirados y los ya matriculados en el año de destino se mantienen excluidos.
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            className={TOUCH}
            disabled={!editable}
            onClick={() => {
              dispatch({
                type: 'BULK',
                fromSectionId: group.sectionId,
                action: bulkAction,
                sectionId: needsSection && bulkSection !== NO_SECTION ? bulkSection : null,
              });
              announce(bulkAnnouncement(state, group.sectionId, bulkAction));
            }}
          >
            Aplicar a la sección {label}
          </Button>
        </div>
      </fieldset>
      <ul className="flex flex-col gap-3">
        {group.items.map((item) => (
          <li key={item.enrollmentId}>
            <RowPanel item={item} state={state} dispatch={dispatch} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RowPanel({
  item,
  state,
  dispatch,
}: {
  item: PromotionItem;
  state: PromotionState;
  dispatch: Dispatch;
}) {
  const decision = state.decisions[item.enrollmentId];
  const editable = state.phase === 'editando';
  const actions = allowedActions(item);
  const ids = rowFieldIds(item.enrollmentId);
  const choices = sectionChoices(item, decision.action, state.proposal.targetSections);
  const needsSection = targetGradeFor(decision.action, item.from) !== null;
  const error = rowError(state, item);
  const note = actions.length === 1 ? onlyExcludeNote(item) : null;
  const flags = item.flags.map((f) => FLAG_LABELS[f]);
  const suffix = `de ${item.fullName}`;
  const describedBy = (...list: (string | false | null)[]): string | undefined =>
    list.filter(Boolean).join(' ') || undefined;
  // Sin selector de sección, el error de la fila se asocia al de acción.
  const actionError = error !== null && !needsSection;

  let errorNode: ReactNode = null;
  if (error) {
    errorNode = (
      <p id={ids.error} className="text-sm text-destructive">
        {error}
      </p>
    );
  }

  return (
    <fieldset
      className={cn(
        'flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10',
        error && 'ring-destructive',
      )}
    >
      <legend className="px-1 font-medium break-words">{item.fullName}</legend>
      {flags.length > 0 ? (
        <p className="text-sm text-muted-foreground">{flags.join(' · ')}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <RowSelect
            id={ids.action}
            label="Acción"
            hiddenSuffix={suffix}
            options={actions.map((a) => ({ value: a, label: ACTION_LABELS[a] }))}
            value={decision.action}
            disabled={!editable || actions.length === 1}
            invalid={actionError}
            describedBy={describedBy(note && ids.note, actionError && ids.error)}
            onChange={(v) =>
              dispatch({
                type: 'SET_ACTION',
                enrollmentId: item.enrollmentId,
                action: v as PromotionAction,
              })
            }
          />
          {note ? (
            <p id={ids.note} className="text-sm text-muted-foreground">
              {note}
            </p>
          ) : null}
        </div>
        {needsSection ? (
          <div className="flex flex-col gap-1.5">
            <RowSelect
              id={ids.section}
              label="Sección de destino"
              hiddenSuffix={suffix}
              options={[
                { value: NO_SECTION, label: 'Elige una sección' },
                ...choices.map((s) => ({
                  value: s.id,
                  label: sectionLabel(s.gradeLevel, s.code, s.level),
                })),
              ]}
              value={decision.sectionId ?? NO_SECTION}
              disabled={!editable}
              invalid={error !== null}
              describedBy={describedBy(error !== null && ids.error)}
              onChange={(v) =>
                dispatch({
                  type: 'SET_SECTION',
                  enrollmentId: item.enrollmentId,
                  sectionId: v === NO_SECTION ? null : v,
                })
              }
            />
            {errorNode}
          </div>
        ) : (
          errorNode
        )}
      </div>
    </fieldset>
  );
}
