'use client';

// Formulario de año nuevo con sus 4 períodos (RF-09, RF-10; D-002).
// Sin tarjeta ni cajas internas: va directo sobre el fondo y los períodos son filas separadas
// por espacio.
import { useActionState, useId, useState } from 'react';
import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { onlyDigits } from '@/lib/digits';
import { createYearAction } from '../_lib/actions';
import { IDLE } from '../_lib/types';
import { PERIOD_COUNT, PERIOD_LABELS, defaultPeriodDates, parseYear } from '../_lib/validation';
import {
  FormMessage,
  SubmitButton,
  TextField,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';
import { CONTROL, SOFT_FIELDS, TOUCH } from '@/app/(app)/admin/_shared/components/styles';

const YEAR_HINT = 'Entre 2000 y 2100. Queda en preparación hasta que lo actives.';

type Dates = Record<string, string>;

const datesFor = (year: number): Dates =>
  Object.fromEntries(
    defaultPeriodDates(year).flatMap((p) => [
      [`p${p.sequence}_start`, p.startDate],
      [`p${p.sequence}_end`, p.endDate],
    ]),
  );

export function NewYearForm({ suggestedYear }: { suggestedYear: number }) {
  const [state, formAction] = useActionState(createYearAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  const periodsId = useId();
  const yearId = useId();
  // Campos controlados: no se pierden si la API responde con error.
  const [year, setYear] = useState(String(suggestedYear));
  const [dates, setDates] = useState<Dates>(() => datesFor(suggestedYear));
  const errors = state.fieldErrors ?? {};
  const parsedYear = parseYear(year);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className={`flex max-w-3xl flex-col gap-10 ${SOFT_FIELDS}`}
    >
      {/* Año en horizontal: etiqueta, campo y un icono con la ayuda en un tooltip. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <Label htmlFor={yearId} className="font-medium text-foreground">
            Año
          </Label>
          <Input
            id={yearId}
            name="year"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="off"
            required
            value={year}
            onChange={(e) => setYear(onlyDigits(e.target.value, 4))}
            aria-invalid={errors.year ? true : undefined}
            aria-describedby={errors.year ? `${yearId}-error ${yearId}-hint` : `${yearId}-hint`}
            className={`${CONTROL} w-28`}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Más información sobre el año"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active motion-reduce:transition-none"
                />
              }
            >
              <CircleAlert className="size-5" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-56 text-sm">
              {YEAR_HINT}
            </TooltipContent>
          </Tooltip>
          {/* El mismo texto para lectores de pantalla, que no leen el tooltip de forma fiable. */}
          <span id={`${yearId}-hint`} className="sr-only">
            {YEAR_HINT}
          </span>
        </div>
        {errors.year ? (
          <p id={`${yearId}-error`} className="text-sm text-destructive">
            {errors.year}
          </p>
        ) : null}
      </div>

      <section aria-labelledby={periodsId} className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div>
            <h2 id={periodsId} className="text-lg font-semibold">
              Períodos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Dos bimestres y dos trimestres, en orden y sin solaparse.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="-mx-2 min-h-11 md:min-h-9 px-2 text-brand hover:bg-brand-soft"
            disabled={parsedYear === null}
            onClick={() => parsedYear !== null && setDates(datesFor(parsedYear))}
          >
            Usar fechas sugeridas para {parsedYear ?? 'el año'}
          </Button>
        </div>

        <div className="flex flex-col gap-6">
          {Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1).map((seq) => (
            <PeriodRow key={seq} seq={seq} dates={dates} errors={errors} onChange={setDates} />
          ))}
        </div>
      </section>

      <FormMessage state={state} alertRef={alertRef} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Creando…">Crear año</SubmitButton>
        <Link
          href="/admin/estructura"
          className={`${TOUCH} inline-flex items-center rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active`}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

// Una fila por período: nombre a la izquierda y las dos fechas a la derecha (en móvil, apiladas).
function PeriodRow({
  seq,
  dates,
  errors,
  onChange,
}: {
  seq: number;
  dates: Dates;
  errors: Record<string, string | undefined>;
  onChange: React.Dispatch<React.SetStateAction<Dates>>;
}) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="grid items-start gap-x-4 gap-y-3 sm:grid-cols-[8rem_1fr_1fr]"
    >
      <p id={labelId} className="font-medium sm:pt-8">
        {PERIOD_LABELS[seq]}
      </p>
      {(['start', 'end'] as const).map((edge) => {
        const name = `p${seq}_${edge}`;
        return (
          <TextField
            key={name}
            name={name}
            type="date"
            label={edge === 'start' ? 'Inicio' : 'Fin'}
            required
            value={dates[name] ?? ''}
            onChange={(e) => onChange((d) => ({ ...d, [name]: e.target.value }))}
            error={errors[name]}
          />
        );
      })}
    </div>
  );
}
