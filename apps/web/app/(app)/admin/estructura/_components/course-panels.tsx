'use client';

// Catálogo de cursos (RF-14): crear, renombrar y activar/desactivar.
import { useActionState } from 'react';
import { createCourseAction, setCourseActiveAction, updateCourseNameAction } from '../_lib/actions';
import { focusIds } from '../_lib/focus';
import { IDLE, type CourseView } from '../_lib/types';
import { COURSE_NAME_MAX } from '../_lib/validation';
import { ConfirmAction, InlineAction } from '@/app/(app)/admin/_shared/components/confirm-action';
import {
  FormMessage,
  SubmitButton,
  TextField,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';

export function CreateCourseForm() {
  const [state, formAction] = useActionState(createCourseAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      aria-label="Nuevo curso"
      className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
    >
      <TextField
        name="name"
        label="Nombre del curso"
        required
        maxLength={COURSE_NAME_MAX}
        defaultValue={state.values?.name ?? ''}
        error={state.fieldErrors?.name}
        hint={`Hasta ${COURSE_NAME_MAX} caracteres. No se puede repetir.`}
      />
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Creando…">Crear curso</SubmitButton>
      </div>
    </form>
  );
}

export function CourseItem({ course }: { course: CourseView }) {
  return (
    <div className="flex flex-col gap-3">
      <RenameCourseForm course={course} />
      <div className="flex flex-wrap gap-2">
        {course.isActive ? (
          <ConfirmAction
            action={setCourseActiveAction.bind(null, course.id, false)}
            triggerLabel={`Desactivar ${course.name}`}
            title={`¿Desactivar ${course.name}?`}
            description="Un curso inactivo no se puede agregar a nuevas secciones. Las secciones que ya lo tienen lo conservan."
            confirmLabel="Desactivar"
            focusId={focusIds.course(course.id)}
            destructive
          />
        ) : (
          <InlineAction
            action={setCourseActiveAction.bind(null, course.id, true)}
            label={`Activar ${course.name}`}
            pendingText="Activando…"
            focusId={focusIds.course(course.id)}
          />
        )}
      </div>
    </div>
  );
}

function RenameCourseForm({ course }: { course: CourseView }) {
  const [state, formAction] = useActionState(updateCourseNameAction.bind(null, course.id), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <details className="rounded-lg p-3 ring-1 ring-foreground/10">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
        Cambiar nombre de {course.name}
      </summary>
      <form ref={formRef} action={formAction} noValidate className="mt-3 flex flex-col gap-3">
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
    </details>
  );
}
