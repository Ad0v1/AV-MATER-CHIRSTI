'use client';

// Campos comunes de crear y editar tarea (Dev 3, RF-28/29). Mismas validaciones
// (assignment-format.ts) y accesibilidad (INFORME 15): aria-invalid + aria-describedby por campo.
// `prefix` hace únicos los id cuando hay varios formularios en la página.
import { describedBy, FieldError, INVALID_FIELD } from '../_materials/form-feedback';
import {
  DEFAULT_MAX_MIB,
  MAX_MIB_CAP,
  NO_SUBMISSION_LITERALS,
  type AssignmentField,
  type NewAssignmentInput,
} from './assignment-format';

const field = `mt-1 block h-11 w-full rounded-md border px-3 text-sm md:h-9 ${INVALID_FIELD}`;

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
          <select
            id={`${p}-period`}
            className={field}
            value={v.periodId}
            onChange={(e) => onChange({ periodId: e.target.value })}
            {...a11y('periodId')}
          >
            {props.periods.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError id={errorId('periodId')} message={errors.periodId} />
        </>
      )}

      <label className="mt-3 block text-sm font-medium" htmlFor={`${p}-title`}>
        Título
      </label>
      <input
        id={`${p}-title`}
        className={field}
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
      <textarea
        id={`${p}-instructions`}
        className={`mt-1 block min-h-28 w-full rounded-md border px-3 py-2 text-sm ${INVALID_FIELD}`}
        value={v.instructions}
        required
        onChange={(e) => onChange({ instructions: e.target.value })}
        {...a11y('instructions')}
      />
      <FieldError id={errorId('instructions')} message={errors.instructions} />

      <label className="mt-3 block text-sm font-medium" htmlFor={`${p}-due`}>
        Plazo de entrega
      </label>
      <input
        id={`${p}-due`}
        type="datetime-local"
        className={field}
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
            <select
              id={`${p}-literal`}
              className={field}
              value={v.noSubmissionLiteral ?? ''}
              onChange={(e) => onChange({ noSubmissionLiteral: e.target.value })}
              {...a11y('noSubmissionGrade', `${p}-literal-hint`)}
            >
              <option value="">Sin calificación</option>
              {NO_SUBMISSION_LITERALS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
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
            <input
              id={`${p}-grade`}
              inputMode="decimal"
              className={field}
              value={v.noSubmissionGrade}
              onChange={(e) => onChange({ noSubmissionGrade: e.target.value })}
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
            <input
              id={`${p}-size`}
              type="number"
              min={1}
              max={MAX_MIB_CAP}
              step={1}
              className={field}
              value={v.maxSizeMiB}
              onChange={(e) => onChange({ maxSizeMiB: e.target.value })}
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
            className="size-4"
            checked={v.allowLate}
            onChange={(e) => onChange({ allowLate: e.target.checked })}
          />
          Permitir entregas tardías (se marcan, sin descuento)
        </label>
      )}
    </>
  );
}
