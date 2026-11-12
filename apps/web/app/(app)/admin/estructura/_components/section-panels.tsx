'use client';

// Secciones de un año (RF-13): crear, cambiar código y activar/desactivar.
import Link from 'next/link';
import { useActionState, useState } from 'react';
import {
  EDUCATION_LEVELS,
  LEVEL_LABELS,
  gradeLabel,
  gradesForLevel,
  isEducationLevel,
  type EducationLevel,
} from '../_lib/levels';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  createSectionAction,
  setSectionActiveAction,
  updateSectionCodeAction,
} from '../_lib/actions';
import { sectionLabel } from '../_lib/format';
import { focusIds } from '../_lib/focus';
import { IDLE, type SectionView } from '../_lib/types';
import { ConfirmAction, InlineAction } from '@/app/(app)/admin/_shared/components/confirm-action';
import {
  FormMessage,
  SelectField,
  SubmitButton,
  TextField,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';
import { TOUCH } from '@/app/(app)/admin/_shared/components/styles';

const CODE_HINT = 'De 1 a 8 letras o dígitos, sin tildes ni ñ (por ejemplo, A o B2).';

export function CreateSectionForm({ yearId }: { yearId: string }) {
  const [state, formAction] = useActionState(createSectionAction.bind(null, yearId), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  const initialLevel = state.values?.level;
  const [level, setLevel] = useState<EducationLevel>(
    isEducationLevel(initialLevel) ? initialLevel : 'SECUNDARIA',
  );
  const grades = gradesForLevel(level);
  const savedGrade = Number(state.values?.gradeLevel);
  const defaultGrade = grades.includes(savedGrade) ? savedGrade : grades[0];
  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
      aria-label="Nueva sección"
    >
      <p className="text-sm font-medium">Nueva sección</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          name="level"
          label="Nivel"
          required
          value={level}
          onChange={(e) => {
            const next = e.target.value;
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
      </div>
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Creando…">Crear sección</SubmitButton>
      </div>
    </form>
  );
}

export function SectionItem({
  section,
  yearId,
  readOnly,
}: {
  section: SectionView;
  yearId: string;
  readOnly: boolean;
}) {
  const label = sectionLabel(section.gradeLevel, section.code, section.level);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/estructura/anios/${yearId}/secciones/${section.id}`}
          className={cn(buttonVariants({ variant: 'outline' }), TOUCH, 'inline-flex items-center')}
        >
          Cursos y docentes de {label}
        </Link>
        {readOnly ? null : section.isActive ? (
          <ConfirmAction
            action={setSectionActiveAction.bind(null, section.id, false)}
            triggerLabel={`Desactivar ${label}`}
            title={`¿Desactivar la sección ${label}?`}
            description="No se puede desactivar si tiene matrículas vigentes. Sus cursos dejarán de aceptar notas, tareas y materiales."
            confirmLabel="Desactivar"
            focusId={focusIds.section(section.id)}
            destructive
          />
        ) : (
          <InlineAction
            action={setSectionActiveAction.bind(null, section.id, true)}
            label={`Activar ${label}`}
            pendingText="Activando…"
            focusId={focusIds.section(section.id)}
          />
        )}
      </div>
      {readOnly ? null : <EditCodeForm section={section} label={label} />}
    </div>
  );
}

function EditCodeForm({ section, label }: { section: SectionView; label: string }) {
  const [state, formAction] = useActionState(updateSectionCodeAction.bind(null, section.id), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <details className="rounded-lg p-3 ring-1 ring-foreground/10">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
        Cambiar código de {label}
      </summary>
      <form ref={formRef} action={formAction} noValidate className="mt-3 flex flex-col gap-3">
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
    </details>
  );
}
