'use client';

// Campos comunes de crear y editar tarea (Dev 3, RF-28/29). Mismas validaciones
// (assignment-format.ts) y accesibilidad (INFORME 15): aria-invalid + aria-describedby por campo.
// `prefix` hace únicos los id cuando hay varios formularios en la página.
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { onlyDecimal, onlyDigits } from '@/lib/digits';
import { describedBy, FieldError } from '../_materials/form-feedback';
import {
  DEFAULT_MAX_MIB,
  MAX_MIB_CAP,
  NO_SUBMISSION_LITERALS,
  type AssignmentField,
  type NewAssignmentInput,
} from './assignment-format';

export function AssignmentFields(props: {
  prefix: string;
  values: NewAssignmentInput;
  onChange: (patch: Partial<NewAssignmentInput>) => void;
  errors: Partial<Record<AssignmentField, string>>;
  /** Sin períodos no se muestra el selector (en la edición el período no se cambia). */
  periods?: { id: string; label: string }[];
  /** INICIAL: actividad sin entrega en PDF (sin tamaño ni tardías). */
  noDelivery?: boolean;
}) {
  const { prefix: p, values: v, onChange, errors } = props;
  const errorId = (f: AssignmentField) => `${p}-${f}-error`;
  const a11y = (f: AssignmentField, hintId?: string) => ({
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': describedBy(errors[f] && errorId(f), hintId),
  });
  return (
    <>
      {props.periods && (
        <>
          <label className="mt-3 block text-sm font-medium" htmlFor={`${p}-period`}>
            Período
          </label>
          <Select
            id={`${p}-period`}
            className="mt-1"
            value={v.periodId}
            onValueChange={(periodId) => onChange({ periodId })}
            options={props.periods.map((o) => ({ value: o.id, label: o.label }))}
            {...a11y('periodId')}
          />
          <FieldError id={errorId('periodId')} message={errors.periodId} />
        </>
      )}

      <label className="mt-3 block text-sm font-medium" htmlFor={`${p}-title`}>
        Título
      </label>
      <Input
        className="mt-1"
        id={`${p}-title`}
        value={v.title}
        maxLength={200}
        required
        onChange={(e) => onChange({ title: e.target.value })}
        {...a11y('title')}
      />
      <FieldError id={errorId('title')} message={errors.title} />

      <label className="mt-3 block text-sm font-medium" htmlFor={`${p}-instructions`}>
        Instrucciones
      </label>
      <Textarea
        id={`${p}-instructions`}
        className="mt-1 min-h-28"
        value={v.instructions}
        required
        onChange={(e) => onChange({ instructions: e.target.value })}
        {...a11y('instructions')}
      />
      <FieldError id={errorId('instructions')} message={errors.instructions} />

      <label className="mt-3 block text-sm font-medium" htmlFor={`${p}-due`}>
        Plazo de entrega
      </label>
      <Input
        className="mt-1"
        id={`${p}-due`}
        type="datetime-local"
        value={v.dueLocal}
        required
        onChange={(e) => onChange({ dueLocal: e.target.value })}
        {...a11y('dueLocal', `${p}-due-hint`)}
      />
      <FieldError id={errorId('dueLocal')} message={errors.dueLocal} />
      <p id={`${p}-due-hint`} className="mt-1 text-xs text-muted-foreground">
        Fecha y hora futura, en hora de Lima. Ejemplo: 05/11/2026, 23:59.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        {v.literalScale ? (
          <div>
            <label className="block text-sm font-medium" htmlFor={`${p}-literal`}>
              Calificación si no entrega (NE)
            </label>
            <Select
              id={`${p}-literal`}
              className="mt-1"
              value={v.noSubmissionLiteral ?? ''}
              onValueChange={(noSubmissionLiteral) => onChange({ noSubmissionLiteral })}
              options={[
                { value: '', label: 'Sin calificación' },
                ...NO_SUBMISSION_LITERALS.map((l) => ({ value: l, label: l })),
              ]}
              {...a11y('noSubmissionGrade', `${p}-literal-hint`)}
            />
            <FieldError id={errorId('noSubmissionGrade')} message={errors.noSubmissionGrade} />
            <p id={`${p}-literal-hint`} className="mt-1 text-xs text-muted-foreground">
              NE = no entregó. Escala AD, A, B, C; es opcional.
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium" htmlFor={`${p}-grade`}>
              Nota si no entrega (NE)
            </label>
            <Input
              className="mt-1"
              id={`${p}-grade`}
              inputMode="decimal"
              autoComplete="off"
              value={v.noSubmissionGrade}
              onChange={(e) => onChange({ noSubmissionGrade: onlyDecimal(e.target.value) })}
              {...a11y('noSubmissionGrade', `${p}-grade-hint`)}
            />
            <FieldError id={errorId('noSubmissionGrade')} message={errors.noSubmissionGrade} />
            <p id={`${p}-grade-hint`} className="mt-1 text-xs text-muted-foreground">
              NE = no entregó. Es la nota de quien no entrega: de 0 a 20, por defecto 0.
            </p>
          </div>
        )}
        {!props.noDelivery && (
          <div>
            <label className="block text-sm font-medium" htmlFor={`${p}-size`}>
              Tamaño máximo (MiB)
            </label>
            <Input
              className="mt-1"
              id={`${p}-size`}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={String(MAX_MIB_CAP).length}
              autoComplete="off"
              value={v.maxSizeMiB}
              onChange={(e) =>
                onChange({ maxSizeMiB: onlyDigits(e.target.value, String(MAX_MIB_CAP).length) })
              }
              {...a11y('maxSizeMiB', `${p}-size-hint`)}
            />
            <FieldError id={errorId('maxSizeMiB')} message={errors.maxSizeMiB} />
            <p id={`${p}-size-hint`} className="mt-1 text-xs text-muted-foreground">
              Del PDF de cada entrega: de 1 a {MAX_MIB_CAP} MiB, por defecto {DEFAULT_MAX_MIB}.
            </p>
          </div>
        )}
      </div>

      {!props.noDelivery && (
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.allowLate}
            onChange={(e) => onChange({ allowLate: e.target.checked })}
          />
          Permitir entregas tardías (se marcan, sin descuento)
        </label>
      )}
    </>
  );
}
