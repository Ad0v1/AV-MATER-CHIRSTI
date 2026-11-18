'use client';

// Cursos de una sección y su docente (RF-17, D-029).
// Diseño limpio: el alta va en una sola línea y sin caja; cada curso es una fila con su docente y
// acciones de texto, y el cambio de docente se abre en línea.
import { useActionState, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  assignTeacherAction,
  createCourseSectionAction,
  setCourseSectionActiveAction,
} from '../_lib/actions';
import { FOCUS_HEADING, focusIds } from '../_lib/focus';
import { IDLE, type CourseSectionView, type CourseView, type TeacherOption } from '../_lib/types';
import { ConfirmAction, InlineAction } from '@/app/(app)/admin/_shared/components/confirm-action';
import {
  FormMessage,
  SelectField,
  SubmitButton,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';
import { CONTROL, SOFT_FIELDS, TOUCH } from '@/app/(app)/admin/_shared/components/styles';

const NO_TEACHER = { value: '', label: 'Sin docente' };

// Botones de texto: 44 px en móvil (táctil) y 36 px en escritorio.
const QUIET = 'px-3 md:min-h-9 text-ink-2 hover:bg-foreground/5 hover:text-foreground';

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
      className={`flex flex-col gap-4 ${SOFT_FIELDS}`}
    >
      <h3 className="text-base font-semibold">Agregar curso</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
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
        {/* Misma estructura que un campo (etiqueta + control) para alinear el botón. */}
        <div className="flex flex-col gap-1.5">
          <Label aria-hidden="true" className="invisible hidden sm:flex">
            Agregar
          </Label>
          <SubmitButton pendingText="Agregando…" className={CONTROL}>
            Agregar curso
          </SubmitButton>
        </div>
      </div>
      <FormMessage state={state} alertRef={alertRef} />
    </form>
  );
}

export function CourseSectionItem({
  courseSection,
  teachers,
  readOnly,
  badge,
}: {
  courseSection: CourseSectionView;
  teachers: TeacherOption[];
  readOnly: boolean;
  /** Estado del curso (lo arma el servidor, para no cargar page-bits en el cliente). */
  badge: ReactNode;
}) {
  const name = courseSection.course.name;
  const editId = useId();
  const [editing, setEditing] = useState(false);
  const forName = <span className="sr-only"> {name}</span>;

  // Si el docente actual ya no está activo, igual se muestra como opción para no perderlo.
  const options = teacherOptions(teachers);
  const current = courseSection.teacher;
  if (current && !teachers.some((t) => t.id === current.id)) {
    options.push({ value: current.id, label: `${current.fullName} (no activo)` });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-3">
            <h3
              id={focusIds.courseSection(courseSection.id)}
              tabIndex={-1}
              className={cn('text-base font-semibold break-words', FOCUS_HEADING)}
            >
              {name}
            </h3>
            {badge}
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">Docente: </span>
            {current ? current.fullName : 'Sin docente asignado'}
          </p>
        </div>
        {readOnly ? null : (
          <div className="-mr-3 flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className={cn(TOUCH, QUIET)}
              aria-expanded={editing}
              aria-controls={editId}
              onClick={() => setEditing((v) => !v)}
            >
              Cambiar docente
              {forName}
            </Button>
            {courseSection.isActive ? (
              <ConfirmAction
                action={setCourseSectionActiveAction.bind(null, courseSection.id, false)}
                triggerLabel={
                  <>
                    Desactivar
                    {forName}
                  </>
                }
                appearance="quiet-destructive"
                title={`¿Desactivar ${name} en esta sección?`}
                description="El curso quedará de solo lectura en la sección: no se podrán crear tareas, materiales ni notas. Se conserva todo lo registrado."
                confirmLabel="Desactivar"
                focusId={focusIds.courseSection(courseSection.id)}
                destructive
              />
            ) : (
              <InlineAction
                action={setCourseSectionActiveAction.bind(null, courseSection.id, true)}
                label={
                  <>
                    Activar
                    {forName}
                  </>
                }
                appearance="quiet"
                pendingText="Activando…"
                focusId={focusIds.courseSection(courseSection.id)}
              />
            )}
          </div>
        )}
      </div>
      {!readOnly && editing ? (
        <AssignTeacherForm id={editId} courseSection={courseSection} options={options} />
      ) : null}
    </div>
  );
}

function AssignTeacherForm({
  id,
  courseSection,
  options,
}: {
  id: string;
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
      id={id}
      ref={formRef}
      action={formAction}
      noValidate
      className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start ${SOFT_FIELDS}`}
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
      {/* Misma estructura que un campo (etiqueta + control) para alinear el botón. */}
      <div className="flex flex-col gap-1.5">
        <Label aria-hidden="true" className="invisible hidden sm:flex">
          Guardar
        </Label>
        <SubmitButton className={CONTROL}>Guardar docente</SubmitButton>
      </div>
      <div className="sm:basis-full">
        <FormMessage state={state} alertRef={alertRef} />
      </div>
    </form>
  );
}
