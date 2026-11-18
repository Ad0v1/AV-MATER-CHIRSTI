'use client';

// Secciones de un año (RF-13): crear, cambiar código y activar/desactivar.
// Diseño limpio: cada sección es una fila con acciones de texto; el cambio de código se abre en
// línea y el formulario de alta va sin caja.
import Link from 'next/link';
import { useActionState, useId, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  EDUCATION_LEVELS,
  LEVEL_LABELS,
  gradeLabel,
  gradesForLevel,
  isEducationLevel,
  type EducationLevel,
} from '../_lib/levels';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  createSectionAction,
  setSectionActiveAction,
  updateSectionCodeAction,
} from '../_lib/actions';
import { sectionLabel } from '../_lib/format';
import { FOCUS_HEADING, focusIds } from '../_lib/focus';
import { IDLE, type SectionView } from '../_lib/types';
import { ConfirmAction, InlineAction } from '@/app/(app)/admin/_shared/components/confirm-action';
import {
  FormMessage,
  SelectField,
  SubmitButton,
  TextField,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';
import { CONTROL, SOFT_FIELDS, TOUCH } from '@/app/(app)/admin/_shared/components/styles';

const CODE_HINT = 'De 1 a 8 letras o dígitos, sin tildes ni ñ (por ejemplo, A o B2).';
// Botones de texto: 44 px en móvil (táctil) y 36 px en escritorio, para un resalte más delgado.
const QUIET = 'px-3 md:min-h-9 text-ink-2 hover:bg-foreground/5 hover:text-foreground';

export function CreateSectionForm({
  yearId,
  defaultLevel = 'SECUNDARIA',
}: {
  yearId: string;
  /** Nivel preseleccionado (el de la pestaña activa). */
  defaultLevel?: EducationLevel;
}) {
  const [state, formAction] = useActionState(createSectionAction.bind(null, yearId), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  const initialLevel = state.values?.level;
  const [level, setLevel] = useState<EducationLevel>(
    isEducationLevel(initialLevel) ? initialLevel : defaultLevel,
  );
  const grades = gradesForLevel(level);
  const savedGrade = Number(state.values?.gradeLevel);
  const defaultGrade = grades.includes(savedGrade) ? savedGrade : grades[0];
  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className={`flex flex-col gap-4 ${SOFT_FIELDS}`}
      aria-label="Nueva sección"
    >
      <h3 className="text-base font-semibold">Nueva sección</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start">
        <SelectField
          name="level"
          label="Nivel"
          required
          value={level}
          onValueChange={(next) => {
            if (isEducationLevel(next)) setLevel(next);
          }}
          error={state.fieldErrors?.level}
          options={EDUCATION_LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))}
        />
        <SelectField
          key={level}
          name="gradeLevel"
          label="Grado"
          required
          defaultValue={String(defaultGrade)}
          error={state.fieldErrors?.gradeLevel}
          options={grades.map((g) => ({ value: String(g), label: gradeLabel(level, g) }))}
        />
        <TextField
          name="code"
          label="Código"
          required
          maxLength={8}
          autoCapitalize="characters"
          defaultValue={state.values?.code ?? ''}
          error={state.fieldErrors?.code}
          hint={CODE_HINT}
        />
        {/* Misma estructura que un campo (etiqueta + control) para que el botón quede alineado
            con los controles; la etiqueta va invisible solo para ocupar su altura. */}
        <div className="flex flex-col gap-1.5">
          <Label aria-hidden="true" className="invisible hidden sm:flex">
            Crear
          </Label>
          <SubmitButton pendingText="Creando…" className={CONTROL}>
            Crear sección
          </SubmitButton>
        </div>
      </div>
      <FormMessage state={state} alertRef={alertRef} />
    </form>
  );
}

export function SectionItem({
  section,
  yearId,
  readOnly,
  badge,
}: {
  section: SectionView;
  yearId: string;
  readOnly: boolean;
  /** Estado de la sección (lo arma el servidor, para no cargar page-bits en el cliente). */
  badge: ReactNode;
}) {
  const label = sectionLabel(section.gradeLevel, section.code, section.level);
  const editId = useId();
  const [editing, setEditing] = useState(false);
  // El nombre completo va solo para lectores de pantalla: en pantalla basta el verbo.
  const forLabel = <span className="sr-only"> {label}</span>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-3">
          <h3
            id={focusIds.section(section.id)}
            tabIndex={-1}
            className={cn('text-base font-semibold', FOCUS_HEADING)}
          >
            Sección {label}
          </h3>
          {badge}
        </div>
        <div className="-mr-3 flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={`/admin/estructura/anios/${yearId}/secciones/${section.id}`} />}
            className={cn(
              TOUCH,
              'group/cursos h-auto gap-1.5 px-3 text-brand hover:bg-brand-soft hover:text-brand',
            )}
          >
            Cursos y docentes
            <span className="sr-only"> de {label}</span>
            <ArrowRight
              className="size-4 transition-transform group-hover/cursos:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </Button>
          {readOnly ? null : (
            <Button
              type="button"
              variant="ghost"
              className={cn(TOUCH, QUIET)}
              aria-expanded={editing}
              aria-controls={editId}
              onClick={() => setEditing((v) => !v)}
            >
              Cambiar código
              {forLabel}
            </Button>
          )}
          {readOnly ? null : section.isActive ? (
            <ConfirmAction
              action={setSectionActiveAction.bind(null, section.id, false)}
              triggerLabel={
                <>
                  Desactivar
                  {forLabel}
                </>
              }
              appearance="quiet-destructive"
              title={`¿Desactivar la sección ${label}?`}
              description="No se puede desactivar si tiene matrículas vigentes. Sus cursos dejarán de aceptar notas, tareas y materiales."
              confirmLabel="Desactivar"
              focusId={focusIds.section(section.id)}
              destructive
            />
          ) : (
            <InlineAction
              action={setSectionActiveAction.bind(null, section.id, true)}
              label={
                <>
                  Activar
                  {forLabel}
                </>
              }
              appearance="quiet"
              pendingText="Activando…"
              focusId={focusIds.section(section.id)}
            />
          )}
        </div>
      </div>
      {!readOnly && editing ? <EditCodeForm id={editId} section={section} /> : null}
    </div>
  );
}

function EditCodeForm({ id, section }: { id: string; section: SectionView }) {
  const [state, formAction] = useActionState(updateSectionCodeAction.bind(null, section.id), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <form
      id={id}
      ref={formRef}
      action={formAction}
      noValidate
      className={`flex max-w-sm flex-col gap-3 ${SOFT_FIELDS}`}
    >
      <TextField
        name="code"
        label="Código"
        required
        maxLength={8}
        defaultValue={state.values?.code ?? section.code}
        error={state.fieldErrors?.code}
        hint={CODE_HINT}
      />
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton>Guardar código</SubmitButton>
      </div>
    </form>
  );
}
