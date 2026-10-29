'use client';

// Formulario de año nuevo con sus 4 períodos (RF-09, RF-10; D-002).
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createYearAction } from '../_lib/actions';
import { IDLE } from '../_lib/types';
import { PERIOD_COUNT, PERIOD_LABELS, defaultPeriodDates, parseYear } from '../_lib/validation';
import {
  FormMessage,
  SubmitButton,
  TextField,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';
import { TOUCH } from '@/app/(app)/admin/_shared/components/styles';

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
  // Campos controlados: no se pierden si la API responde con error.
  const [year, setYear] = useState(String(suggestedYear));
  const [dates, setDates] = useState<Dates>(() => datesFor(suggestedYear));
  const errors = state.fieldErrors ?? {};
  const parsedYear = parseYear(year);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-6">
      <TextField
        name="year"
        label="Año"
        inputMode="numeric"
        pattern="[0-9]{4}"
        required
        value={year}
        onChange={(e) => setYear(e.target.value)}
        error={errors.year}
        hint="Entre 2000 y 2100. Un año nuevo queda en preparación hasta que lo actives."
        className="max-w-xs"
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="text-base font-semibold">Períodos</legend>
        <p className="text-sm text-muted-foreground">
          Dos bimestres y dos trimestres, en orden y sin solaparse. Fechas en formato AAAA-MM-DD.
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            className={TOUCH}
            disabled={parsedYear === null}
            onClick={() => parsedYear !== null && setDates(datesFor(parsedYear))}
          >
            Usar fechas sugeridas para {parsedYear ?? 'el año'}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1).map((seq) => (
            <fieldset
              key={seq}
              className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
            >
              <legend className="px-1 text-sm font-medium">{PERIOD_LABELS[seq]}</legend>
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
                    onChange={(e) => setDates((d) => ({ ...d, [name]: e.target.value }))}
                    error={errors[name]}
                  />
                );
              })}
            </fieldset>
          ))}
        </div>
      </fieldset>

      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Creando…">Crear año</SubmitButton>
      </div>
    </form>
  );
}
