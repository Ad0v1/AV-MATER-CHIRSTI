'use client';

// Formulario de RF-61: nombre, tabla de literales editable (RN-04) y plazo de purga (RF-66).
// WCAG 2.1 AA desde 360 px: cada celda tiene etiqueta (visible en móvil, en la cabecera de la
// tabla desde sm), botones de 44 px y foco en el primer error. Al agregar o quitar un tramo el
// foco va al literal correspondiente y una región de estado lo anuncia; la cobertura se ve como
// lista y solo se anuncia cuando la tabla pasa de válida a inválida o al revés.
import { useActionState, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  FormMessage,
  SubmitButton,
  TextField,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';
import { CONTROL, TOUCH } from '@/app/(app)/admin/_shared/components/styles';
import { IDLE } from '@/app/(app)/admin/_shared/lib/action-state';
import { saveSettingsAction } from '../_lib/actions';
import {
  LITERAL_MAX,
  MAX_BANDS,
  NAME_MAX,
  PURGE_MAX,
  PURGE_MIN,
  bandField,
  coverageProblems,
  type LiteralBand,
  type SettingsView,
} from '../_lib/settings-form';

type Row = { key: number; literal: string; min: string; max: string };

const toRows = (scale: LiteralBand[]): Row[] =>
  scale.map((b, i) => ({ key: i, literal: b.literal, min: String(b.min), max: String(b.max) }));

export function SettingsForm({ settings }: { settings: SettingsView }) {
  const [state, formAction] = useActionState(saveSettingsAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  const [rows, setRows] = useState<Row[]>(() => toRows(settings.literalScale));
  const nextKey = useRef(rows.length);
  const tableId = useId();
  const coverageId = `${tableId}-cobertura`;
  const bandsErrorId = `${tableId}-tramos-error`;
  const lastRowId = `${tableId}-ultimo`;
  const err = state.fieldErrors ?? {};
  // Anuncio de agregar o quitar tramo (sr-only).
  const [rowsMessage, setRowsMessage] = useState('');

  const focusLiteral = (index: number) =>
    requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>(
        `[name="${bandField(Math.max(0, index), 'literal')}"]`,
      );
      (target ?? formRef.current?.querySelector<HTMLElement>('[data-add-band]'))?.focus();
    });

  const problems = useMemo(() => {
    const parsed = rows.map((r) => ({
      literal: r.literal.trim().toUpperCase() || '?',
      min: Number(r.min),
      max: Number(r.max),
    }));
    if (parsed.some((b) => !Number.isInteger(b.min) || !Number.isInteger(b.max) || b.min > b.max)) {
      return [];
    }
    return coverageProblems(parsed);
  }, [rows]);

  const update = (key: number, field: 'literal' | 'min' | 'max', value: string) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const add = () => {
    if (rows.length >= MAX_BANDS) return;
    const count = rows.length + 1;
    setRows((list) => [...list, { key: nextKey.current++, literal: '', min: '', max: '' }]);
    setRowsMessage(`Tramo agregado. Ahora hay ${count} tramos.`);
    // El foco va al literal de la fila nueva.
    focusLiteral(count - 1);
  };

  const remove = (key: number, index: number) => {
    const count = rows.length - 1;
    setRows((list) => list.filter((r) => r.key !== key));
    setRowsMessage(
      count === 1 ? 'Tramo quitado. Queda 1 tramo.' : `Tramo quitado. Quedan ${count} tramos.`,
    );
    // El botón desaparece: el foco va al literal de la fila anterior (o a "Agregar tramo").
    focusLiteral(index - 1);
  };

  const coverageOk = problems.length === 0;

  // useFormRefs enfoca el primer campo con aria-invalid o, si no hay, el aviso general. Si el único
  // error es el de la cantidad de tramos, el foco va a ese mensaje (corre después de useFormRefs).
  useEffect(() => {
    if (state.status !== 'error' || !state.fieldErrors?.bands) return;
    if (formRef.current?.querySelector('[aria-invalid="true"]')) return;
    document.getElementById(bandsErrorId)?.focus();
  }, [state, formRef, bandsErrorId]);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      aria-label="Datos de la institución"
      className="flex flex-col gap-5 rounded-xl p-4 ring-1 ring-foreground/10"
    >
      <TextField
        name="name"
        label="Nombre de la institución"
        required
        maxLength={NAME_MAX}
        autoComplete="organization"
        defaultValue={state.values?.name ?? settings.name}
        error={err.name}
        hint={`Aparece en la cabecera y en los reportes. Hasta ${NAME_MAX} caracteres.`}
      />

      <fieldset
        className="flex flex-col gap-3"
        aria-describedby={err.bands ? `${bandsErrorId} ${coverageId}` : coverageId}
      >
        <legend className="text-sm font-medium">Tabla de literales</legend>
        <p className="text-sm text-muted-foreground">
          Cada tramo va de un mínimo a un máximo (enteros de 0 a 20). Entre todos deben cubrir de 0
          a 20 sin huecos ni cruces. El tramo que contiene el 0 marca a los estudiantes en riesgo.
          Cambiarla recalcula los literales al consultar; no modifica las notas.
        </p>
        <input type="hidden" name="bands" value={rows.length} />
        {err.bands ? (
          // tabIndex -1: recibe el foco si es el único error (efecto de abajo).
          <p
            id={bandsErrorId}
            role="alert"
            tabIndex={-1}
            className="text-sm text-destructive outline-none focus:ring-3 focus:ring-ring/60"
          >
            {err.bands}
          </p>
        ) : null}
        <div
          role="table"
          aria-label="Tramos de la tabla de literales"
          className="flex flex-col gap-2"
        >
          <div role="rowgroup" className="hidden sm:block">
            <div role="row" className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-sm font-medium">
              <span role="columnheader">Literal</span>
              <span role="columnheader">Mínimo</span>
              <span role="columnheader">Máximo</span>
              <span role="columnheader" className="w-24">
                <span className="sr-only">Acciones</span>
              </span>
            </div>
          </div>
          <div role="rowgroup" className="flex flex-col gap-3 sm:gap-2">
            {rows.map((row, i) => (
              <BandRow
                key={row.key}
                index={i}
                row={row}
                errors={err}
                canRemove={rows.length > 1}
                removeHintId={rows.length > 1 ? undefined : lastRowId}
                onChange={update}
                onRemove={() => remove(row.key, i)}
              />
            ))}
          </div>
        </div>
        {rows.length === 1 ? (
          <p id={lastRowId} className="text-sm text-muted-foreground">
            Debe quedar al menos un tramo.
          </p>
        ) : null}
        {/* Lista visible sin aria-live (no habla en cada tecla). */}
        <div id={coverageId} className="text-sm">
          {!coverageOk ? (
            <ul className="list-disc pl-5 text-amber-900 dark:text-amber-200">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">La tabla cubre de 0 a 20.</p>
          )}
        </div>
        {/* Solo cambia (y se anuncia) cuando la tabla pasa de válida a inválida o al revés. */}
        <p role="status" className="sr-only">
          {coverageOk
            ? 'La tabla cubre de 0 a 20.'
            : 'La tabla tiene problemas de cobertura. Revisa la lista debajo de los tramos.'}
        </p>
        <p role="status" className="sr-only">
          {rowsMessage}
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={add}
            disabled={rows.length >= MAX_BANDS}
            data-add-band
            className={TOUCH}
          >
            Agregar tramo
          </Button>
          {rows.length >= MAX_BANDS ? (
            <p className="mt-1 text-sm text-muted-foreground">Máximo {MAX_BANDS} tramos.</p>
          ) : null}
        </div>
      </fieldset>

      <TextField
        name="purgeAfterDays"
        label="Plazo de purga (días)"
        type="number"
        inputMode="numeric"
        min={PURGE_MIN}
        max={PURGE_MAX}
        step={1}
        required
        defaultValue={state.values?.purgeAfterDays ?? String(settings.purgeAfterDays)}
        error={err.purgeAfterDays}
        hint={`Días que se esperan después de cerrar un año y respaldarlo antes de poder purgar sus archivos (entre ${PURGE_MIN} y ${PURGE_MAX}). La purga siempre pide confirmación.`}
        className="max-w-xs"
      />

      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton>Guardar configuración</SubmitButton>
      </div>
    </form>
  );
}

function BandRow({
  index,
  row,
  errors,
  canRemove,
  removeHintId,
  onChange,
  onRemove,
}: {
  index: number;
  row: Row;
  errors: Record<string, string>;
  canRemove: boolean;
  /** Id del texto que explica por qué "Quitar" está deshabilitado. */
  removeHintId?: string;
  onChange: (key: number, field: 'literal' | 'min' | 'max', value: string) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const n = index + 1;
  const cell = (field: 'literal' | 'min' | 'max', label: string, extra: object) => {
    const name = bandField(index, field);
    const error = errors[name];
    const inputId = `${id}-${field}`;
    return (
      <div role="cell" className="flex flex-col gap-1">
        {/* Etiqueta visible en móvil; desde sm la da la cabecera, pero sigue para el lector. */}
        <Label htmlFor={inputId} className="sm:sr-only">
          {label} del tramo {n}
        </Label>
        <Input
          id={inputId}
          name={name}
          value={row[field]}
          onChange={(e) => onChange(row.key, field, e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={CONTROL}
          required
          {...extra}
        />
        {error ? (
          <p id={`${inputId}-error`} className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  };
  return (
    <div
      role="row"
      className={cn(
        'grid grid-cols-3 gap-2 rounded-lg p-3 ring-1 ring-foreground/10 sm:grid-cols-[1fr_1fr_1fr_auto] sm:p-0 sm:ring-0',
      )}
    >
      {cell('literal', 'Literal', { maxLength: LITERAL_MAX, autoCapitalize: 'characters' })}
      {cell('min', 'Mínimo', { type: 'number', inputMode: 'numeric', min: 0, max: 20, step: 1 })}
      {cell('max', 'Máximo', { type: 'number', inputMode: 'numeric', min: 0, max: 20, step: 1 })}
      <div role="cell" className="col-span-3 sm:col-span-1 sm:w-24">
        <Button
          type="button"
          variant="ghost"
          onClick={onRemove}
          disabled={!canRemove}
          aria-describedby={removeHintId}
          className={cn(TOUCH, 'w-full')}
          aria-label={`Quitar el tramo ${n}${row.literal ? ` (${row.literal.toUpperCase()})` : ''}`}
        >
          Quitar
        </Button>
      </div>
    </div>
  );
}
