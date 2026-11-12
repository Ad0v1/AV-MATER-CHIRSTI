'use client';

// Catálogo de cursos (RF-14): crear, renombrar y activar/desactivar.
// Diseño limpio: el alta va en una sola línea y sin caja; cada curso es una fila con acciones de
// texto y el cambio de nombre se abre en línea.
import { useActionState, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { createCourseAction, setCourseActiveAction, updateCourseNameAction } from '../_lib/actions';
import { FOCUS_HEADING, focusIds } from '../_lib/focus';
import { IDLE, type CourseView } from '../_lib/types';
import { COURSE_NAME_MAX } from '../_lib/validation';
import { ConfirmAction, InlineAction } from '@/app/(app)/admin/_shared/components/confirm-action';
import {
  FormMessage,
  SubmitButton,
  TextField,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';
import { CONTROL, SOFT_FIELDS, TOUCH } from '@/app/(app)/admin/_shared/components/styles';

// Botones de texto: 44 px en móvil (táctil) y 36 px en escritorio.
const QUIET = 'px-3 md:min-h-9 text-ink-2 hover:bg-foreground/5 hover:text-foreground';

export function CreateCourseForm() {
  const [state, formAction] = useActionState(createCourseAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      aria-label="Nuevo curso"
      className={`flex max-w-2xl flex-col gap-3 ${SOFT_FIELDS}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          name="name"
          label="Nombre del curso"
          required
          maxLength={COURSE_NAME_MAX}
          defaultValue={state.values?.name ?? ''}
          error={state.fieldErrors?.name}
          hint={`Hasta ${COURSE_NAME_MAX} caracteres. No se puede repetir.`}
          className="sm:flex-1"
        />
        {/* Misma estructura que un campo (etiqueta + control) para alinear el botón con el campo. */}
        <div className="flex flex-col gap-1.5">
          <Label aria-hidden="true" className="invisible hidden sm:flex">
            Crear
          </Label>
          <SubmitButton pendingText="Creando…" className={CONTROL}>
            Crear curso
          </SubmitButton>
        </div>
      </div>
      <FormMessage state={state} alertRef={alertRef} />
    </form>
  );
}

export function CourseItem({ course, badge }: { course: CourseView; badge: ReactNode }) {
  const editId = useId();
  const [editing, setEditing] = useState(false);
  // El nombre completo va solo para lectores de pantalla: en pantalla basta el verbo.
  const forName = <span className="sr-only"> {course.name}</span>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-center gap-3">
          <h3
            id={focusIds.course(course.id)}
            tabIndex={-1}
            className={cn('text-base font-semibold break-words', FOCUS_HEADING)}
          >
            {course.name}
          </h3>
          {badge}
        </div>
        <div className="-mr-3 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className={cn(TOUCH, QUIET)}
            aria-expanded={editing}
            aria-controls={editId}
            onClick={() => setEditing((v) => !v)}
          >
            Cambiar nombre
            {forName}
          </Button>
          {course.isActive ? (
            <ConfirmAction
              action={setCourseActiveAction.bind(null, course.id, false)}
              triggerLabel={
                <>
                  Desactivar
                  {forName}
                </>
              }
              appearance="quiet-destructive"
              title={`¿Desactivar ${course.name}?`}
              description="Un curso inactivo no se puede agregar a nuevas secciones. Las secciones que ya lo tienen lo conservan."
              confirmLabel="Desactivar"
              focusId={focusIds.course(course.id)}
              destructive
            />
          ) : (
            <InlineAction
              action={setCourseActiveAction.bind(null, course.id, true)}
              label={
                <>
                  Activar
                  {forName}
                </>
              }
              appearance="quiet"
              pendingText="Activando…"
              focusId={focusIds.course(course.id)}
            />
          )}
        </div>
      </div>
      {editing ? <RenameCourseForm id={editId} course={course} /> : null}
    </div>
  );
}

function RenameCourseForm({ id, course }: { id: string; course: CourseView }) {
  const [state, formAction] = useActionState(updateCourseNameAction.bind(null, course.id), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <form
      id={id}
      ref={formRef}
      action={formAction}
      noValidate
      className={`flex max-w-md flex-col gap-3 ${SOFT_FIELDS}`}
    >
      <TextField
        name="name"
        label="Nombre del curso"
        required
        maxLength={COURSE_NAME_MAX}
        defaultValue={state.values?.name ?? course.name}
        error={state.fieldErrors?.name}
      />
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton>Guardar nombre</SubmitButton>
      </div>
    </form>
  );
}
