// Notas de un estudiante por curso y período (Dev 4, RF-51 y RF-52). Solo lectura; la usan
// Mis notas y el panel del apoderado. Nunca muestra el motivo de exoneración (U2: la API no lo
// envía a estas vistas). Lista en vez de tabla para que se lea bien desde 360 px.
import { DISPLAY_STATUS_LABEL, formatDateTime } from '../../curso/[id]/tareas/assignment-format';
import { averageText, cellText } from '../../curso/[id]/registro/_lib/grading-format';
import type { StudentGradesView } from '../../curso/[id]/registro/_lib/types';

export function StudentGrades({
  view,
  headingLevel = 2,
}: {
  view: StudentGradesView;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const Hp = headingLevel === 2 ? 'h3' : 'h4';
  if (!view.academicYear) {
    return <p className="text-sm text-muted-foreground">No hay un año académico activo.</p>;
  }
  if (view.courses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay notas en el año {view.academicYear.year}.
      </p>
    );
  }
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        Año {view.academicYear.year}. NE = no entregó. La exoneración no cuenta en el promedio.
      </p>
      {view.courses.map((c) => (
        <section
          key={`${c.enrollmentId}-${c.courseSectionId}`}
          aria-label={`${c.course.name}, ${c.section.gradeLevel}.° ${c.section.code}`}
          className="rounded-lg border p-4"
        >
          <H className="text-base font-semibold break-words">
            {c.course.name}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              · {c.section.gradeLevel}.° {c.section.code}
              {c.isCurrent ? '' : ' (sección anterior)'}
            </span>
          </H>
          {c.periods.map((p) => (
            <div key={p.id} className="mt-3">
              <Hp className="text-sm font-medium">
                {p.label}: promedio {averageText(p.average)}
                {p.isOpen ? '' : ' (período cerrado)'}
              </Hp>
              {p.assignments.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">Sin tareas.</p>
              ) : (
                <ul className="mt-1 divide-y text-sm">
                  {p.assignments.map((a) => (
                    <li key={a.assignmentId} className="py-2">
                      <p className="break-words">
                        <span className="font-medium">{a.title}</span>
                        {a.state
                          ? ` — ${cellText({ ...a, virtual: false, needsRegrade: false })}`
                          : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {DISPLAY_STATUS_LABEL[a.displayStatus] ?? a.displayStatus}
                        {a.isLate ? ' · con retraso' : ''} · Plazo: {formatDateTime(a.dueAt)}
                      </p>
                      {a.comment && (
                        <p className="mt-1 break-words whitespace-pre-line">
                          Comentario del docente: {a.comment}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
