'use client';

// Cursos de una sección y su docente (RF-17, D-029).
import { useActionState } from 'react';
import {
  assignTeacherAction,
  createCourseSectionAction,
  setCourseSectionActiveAction,
} from '../_lib/actions';
import { focusIds } from '../_lib/focus';
import { IDLE, type CourseSectionView, type CourseView, type TeacherOption } from '../_lib/types';
import { ConfirmAction, InlineAction } from '@/app/(app)/admin/_shared/components/confirm-action';
import {
  FormMessage,
  SelectField,
  SubmitButton,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';

const NO_TEACHER = { value: '', label: 'Sin docente' };

const teacherOptions = (teachers: TeacherOption[]) => [
  NO_TEACHER,
  ...teachers.map((t) => ({ value: t.id, label: t.fullName })),
];

export function AddCourseForm({
  sectionId,
  courses,
  teachers,
}: {
  sectionId: string;
  courses: CourseView[];
  teachers: TeacherOption[];
}) {
  const [state, formAction] = useActionState(createCourseSectionAction.bind(null, sectionId), IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  if (courses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todos los cursos activos del catálogo ya están en esta sección.
      </p>
    );
  }
  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      aria-label="Agregar curso a la sección"
      className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
    >
      <p className="text-sm font-medium">Agregar curso</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          name="courseId"
          label="Curso"
          required
          defaultValue={state.values?.courseId ?? ''}
          error={state.fieldErrors?.courseId}
          options={[
            { value: '', label: 'Elige un curso' },
            ...courses.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <SelectField
          name="teacherId"
          label="Docente"
          defaultValue={state.values?.teacherId ?? ''}
          error={state.fieldErrors?.teacherId}
          hint="Puedes asignarlo después."
          options={teacherOptions(teachers)}
        />
      </div>
      <FormMessage state={state} alertRef={alertRef} />
      <div>
        <SubmitButton pendingText="Agregando…">Agregar curso</SubmitButton>
      </div>
    </form>
  );
}

export function CourseSectionItem({
  courseSection,
  teachers,
  readOnly,
}: {
  courseSection: CourseSectionView;
  teachers: TeacherOption[];
  readOnly: boolean;
}) {
  const name = courseSection.course.name;
  if (readOnly) return null;
  // Si el docente actual ya no está activo, igual se muestra como opción para no perderlo.
  const options = teacherOptions(teachers);
  const current = courseSection.teacher;
  if (current && !teachers.some((t) => t.id === current.id)) {
    options.push({ value: current.id, label: `${current.fullName} (no activo)` });
  }
  return (
    <div className="flex flex-col gap-3">
      <AssignTeacherForm courseSection={courseSection} options={options} />
      <div className="flex flex-wrap gap-2">
        {courseSection.isActive ? (
          <ConfirmAction
            action={setCourseSectionActiveAction.bind(null, courseSection.id, false)}
            triggerLabel={`Desactivar ${name}`}
            title={`¿Desactivar ${name} en esta sección?`}
            description="El curso quedará de solo lectura en la sección: no se podrán crear tareas, materiales ni notas. Se conserva todo lo registrado."
            confirmLabel="Desactivar"
            focusId={focusIds.courseSection(courseSection.id)}
            destructive
          />
        ) : (
          <InlineAction
            action={setCourseSectionActiveAction.bind(null, courseSection.id, true)}
            label={`Activar ${name}`}
            pendingText="Activando…"
            focusId={focusIds.courseSection(courseSection.id)}
          />
        )}
      </div>
    </div>
  );
}

function AssignTeacherForm({
  courseSection,
  options,
}: {
  courseSection: CourseSectionView;
  options: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState(
    assignTeacherAction.bind(null, courseSection.id),
    IDLE,
  );
  const { formRef, alertRef } = useFormRefs(state);
  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <SelectField
        name="teacherId"
        label={`Docente de ${courseSection.course.name}`}
        // `key` fuerza el valor actual tras refrescar (el select no es controlado).
        key={courseSection.teacher?.id ?? 'none'}
        defaultValue={state.values?.teacherId ?? courseSection.teacher?.id ?? ''}
        error={state.fieldErrors?.teacherId}
        options={options}
        className="sm:min-w-72"
      />
      <SubmitButton>Guardar docente</SubmitButton>
      <div className="sm:basis-full">
        <FormMessage state={state} alertRef={alertRef} />
      </div>
    </form>
  );
}
