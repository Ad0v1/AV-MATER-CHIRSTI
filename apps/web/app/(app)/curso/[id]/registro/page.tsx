import Link from 'next/link';
import { Suspense } from 'react';
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { DISPLAY_STATUS_LABEL, formatDateTime } from '../tareas/assignment-format';
import { AchievementCell } from './_components/achievement-cell';
import {
  averageText,
  cellText,
  isLiteral,
  isUuid,
  literalLabel,
  sectionText,
} from './_lib/grading-format';
import type { GradebookCell, GradebookView } from './_lib/types';

export const metadata = { title: 'Registro auxiliar' };

// Registro auxiliar (Dev 4, RF-47..49): matriz estudiantes × tareas del período con NE virtual,
// promedios con literal (un solo redondeo, en la API) y dashboard. Solo lectura: se califica en
// registro/tarea/[assignmentId]. Permisos: docente asignado (lo valida el backend).

type Params = Promise<{ id: string }>;
type Search = Promise<{ periodo?: string | string[] }>;

const TH = 'py-2 pr-3 text-left align-bottom font-medium';
const TD = 'py-2 pr-3 align-top';

function CellContent({ cell }: { cell: GradebookCell }) {
  const notes: string[] = [];
  if (cell.isLate) notes.push('con retraso');
  if (cell.virtual) notes.push('NE pendiente de registrar');
  if (cell.needsRegrade) notes.push('recalificar');
  return (
    <>
      <span className="font-medium">{cellText(cell)}</span>
      <span className="block text-xs text-muted-foreground">
        {DISPLAY_STATUS_LABEL[cell.displayStatus] ?? cell.displayStatus}
        {notes.length > 0 ? ` · ${notes.join(' · ')}` : ''}
      </span>
    </>
  );
}

function Dashboard({ book }: { book: GradebookView }) {
  const d = book.dashboard;
  const atRisk = book.students.filter((s) => s.atRisk);
  const literal = isLiteral(book.courseSection.gradingScale);
  return (
    <section aria-labelledby="r-dash" className="mt-4 rounded-lg border p-4">
      <h2 id="r-dash" className="text-base font-semibold">
        Resumen del período
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Estudiantes por nivel de logro</h3>
          <ul className="mt-1 text-sm">
            {Object.entries(d.distribution).map(([literal, n]) => (
              <li key={literal}>
                {literalLabel(literal)}: <strong>{n}</strong>
              </li>
            ))}
            <li>
              {literal ? 'Sin logro del bimestre' : 'Sin notas'}: <strong>{d.noGrades}</strong>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-medium">Entregas</h3>
          <ul className="mt-1 text-sm">
            <li>
              A tiempo: <strong>{d.counts.onTime}</strong>
            </li>
            <li>
              Con retraso: <strong>{d.counts.late}</strong>
            </li>
            <li>
              No entregadas (NE): <strong>{d.counts.ne}</strong>
            </li>
          </ul>
        </div>
      </div>
      <h3 className="mt-3 text-sm font-medium">
        En riesgo ({literal ? 'logro' : 'promedio'} {literalLabel(d.riskLiteral)}): {atRisk.length}
      </h3>
      {atRisk.length > 0 ? (
        <ul className="mt-1 list-disc pl-5 text-sm">
          {atRisk.map((s) => (
            <li key={s.enrollmentId}>
              {s.fullName} —{' '}
              {literal && s.achievement
                ? literalLabel(s.achievement.literal)
                : averageText(s.average)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Ningún estudiante en riesgo.</p>
      )}
    </section>
  );
}

function PeriodNav({ book, courseId }: { book: GradebookView; courseId: string }) {
  return (
    <nav aria-label="Períodos" className="mt-3">
      <ul className="flex flex-wrap gap-2">
        {book.periods.map((p) => {
          const current = p.id === book.period.id;
          return (
            <li key={p.id}>
              <Link
                href={`/curso/${courseId}/registro?periodo=${encodeURIComponent(p.id)}`}
                aria-current={current ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm ${
                  current ? 'bg-primary font-medium text-primary-foreground' : ''
                }`}
              >
                {p.label}
                {p.isOpen ? '' : ' (cerrado)'}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Matrix({ book, courseId }: { book: GradebookView; courseId: string }) {
  const literal = isLiteral(book.courseSection.gradingScale);
  const editable = book.period.isOpen && !book.courseSection.readOnly;
  if (book.assignments.length === 0 && !literal) {
    return <p className="mt-4 text-sm text-muted-foreground">No hay tareas en este período.</p>;
  }
  return (
    <div
      className="mt-4 overflow-x-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      tabIndex={0}
      role="region"
      aria-label="Registro auxiliar (desplazable)"
    >
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <caption className="p-2 text-left text-sm text-muted-foreground">
          Notas de {book.courseSection.course.name}, {book.period.label}. Cada columna es una tarea;
          {literal
            ? ' la última, el logro del bimestre que elige el docente (escala AD, A, B, C).'
            : ' la última, el promedio simple del estudiante.'}
        </caption>
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className={`${TH} sticky left-0 bg-background pl-2`}>
              Estudiante
            </th>
            {book.assignments.map((a) => (
              <th key={a.id} scope="col" className={TH}>
                <Link
                  href={`/curso/${courseId}/registro/tarea/${encodeURIComponent(a.id)}`}
                  className="inline-flex min-h-11 items-center underline underline-offset-2"
                >
                  {a.title}
                </Link>
                <span className="block font-normal">{formatDateTime(a.dueAt)}</span>
              </th>
            ))}
            <th scope="col" className={TH}>
              {literal ? 'Logro del bimestre' : 'Promedio'}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {book.students.map((s) => (
            <tr key={s.enrollmentId}>
              <th
                scope="row"
                className={`${TD} sticky left-0 bg-background pl-2 text-left font-normal`}
              >
                {s.fullName}
                {!s.isCurrent && (
                  <span className="block text-xs text-muted-foreground">Trasladado</span>
                )}
                {s.atRisk && <span className="block text-xs font-medium">En riesgo</span>}
              </th>
              {s.cells.map((c) => (
                <td key={c.assignmentId} className={TD}>
                  <CellContent cell={c} />
                </td>
              ))}
              <td className={`${TD} font-medium`}>
                {literal ? (
                  <AchievementCell
                    courseSectionId={book.courseSection.id}
                    periodId={book.period.id}
                    enrollmentId={s.enrollmentId}
                    studentName={s.fullName}
                    achievement={s.achievement}
                    editable={editable}
                  />
                ) : (
                  averageText(s.average)
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {!literal && (
          <tfoot className="border-t">
            <tr>
              <th scope="row" className={`${TD} sticky left-0 bg-background pl-2 text-left`}>
                Promedio de la tarea
              </th>
              {book.assignments.map((a) => (
                <td key={a.id} className={TD}>
                  {averageText(a.average)}
                </td>
              ))}
              <td className={TD} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

async function Content({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const courseId = encodeURIComponent(id);
  const periodo =
    typeof search.periodo === 'string' && isUuid(search.periodo) ? search.periodo : null;
  let book: GradebookView;
  try {
    book = await apiServer.get<GradebookView>(
      `/course-sections/${courseId}/gradebook${periodo ? `?periodId=${periodo}` : ''}`,
    );
  } catch (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {toUserMessage(error)}
      </p>
    );
  }
  const cs = book.courseSection;
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {cs.course.name} · {sectionText(cs.section)}
        {isLiteral(cs.gradingScale) ? ' · Escala literal (AD, A, B, C)' : ' · Escala de 0 a 20'}
      </p>
      <PeriodNav book={book} courseId={courseId} />
      {!book.period.isOpen && (
        <p role="status" className="mt-3 rounded-md border p-3 text-sm">
          Este período está cerrado: el registro es de solo lectura.
        </p>
      )}
      <Dashboard book={book} />
      <h2 className="mt-6 text-base font-semibold">Notas por tarea</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {isLiteral(cs.gradingScale)
          ? 'NE = no entregó. Los literales de las tareas son apoyo: el logro del bimestre lo eliges tú. Para calificar una tarea, ábrela.'
          : 'NE = no entregó. La exoneración no cuenta en el promedio. Para calificar, abre la tarea.'}
      </p>
      <Matrix book={book} courseId={courseId} />
    </>
  );
}

export default function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Registro auxiliar</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando el registro…</p>}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
