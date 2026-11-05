import Link from 'next/link';
import { Suspense } from 'react';
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { DISPLAY_STATUS_LABEL, formatDateTime } from '../../../tareas/assignment-format';
import { averageText, cellText } from '../../_lib/grading-format';
import type { GradeSummaryItem, GradeSummaryView } from '../../_lib/types';
import { GradeForm } from './grade-form';
import { PdfViewer } from './pdf-viewer';

// Calificar una tarea (Dev 4, RF-41..46, RF-50). Lista de estudiantes con su entrega, visor PDF
// (U4) y formulario. Con el período cerrado todo queda en solo lectura (el backend responde 409).

type Params = Promise<{ id: string; assignmentId: string }>;

function GradeLine({ item }: { item: GradeSummaryItem }) {
  const g = item.grade;
  return (
    <p className="text-sm">
      Estado: <strong>{DISPLAY_STATUS_LABEL[item.displayStatus] ?? item.displayStatus}</strong>
      {item.isLate ? ' · con retraso' : ''}
      {g.state ? ` · ${cellText(g)}` : ''}
      {g.state === 'NE' && g.source === 'AUTO' ? ' (automática)' : ''}
      {g.virtual ? ' (se registrará al guardar o al cerrar el período)' : ''}
    </p>
  );
}

function StudentItem({ item, view }: { item: GradeSummaryItem; view: GradeSummaryView }) {
  const a = view.assignment;
  const v = item.submission?.latestVersion;
  return (
    <li className="rounded-lg border p-4">
      <h3 className="text-base font-semibold break-words">
        {item.fullName}
        {!item.isCurrent && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            (matrícula anterior, trasladado)
          </span>
        )}
      </h3>
      <GradeLine item={item} />
      {item.grade.needsRegrade && (
        <p className="mt-1 text-sm font-medium">
          Llegó una entrega tardía después de la NE: revisa el PDF y pon la nota.
        </p>
      )}
      {v ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Entrega oficial: versión {v.versionNumber}, {formatDateTime(v.receivedAt)}
          {v.isLate ? ' (tardía, sin descuento)' : ''}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Sin entrega.</p>
      )}
      {item.grade.comment && (
        <p className="mt-1 text-sm break-words whitespace-pre-line">
          Comentario: {item.grade.comment}
        </p>
      )}
      {item.grade.state === 'EXEMPT' && item.grade.exemptionReason && (
        <p className="mt-1 text-sm break-words">Motivo: {item.grade.exemptionReason}</p>
      )}
      {v && <PdfViewer fileId={v.fileId} studentName={item.fullName} />}
      {a.periodIsOpen ? (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            {item.grade.state && !item.grade.virtual ? 'Editar calificación' : 'Calificar'}
          </summary>
          <GradeForm
            assignmentId={a.id}
            enrollmentId={item.enrollmentId}
            studentName={item.fullName}
            hasSubmission={item.submission !== null}
            noSubmissionGrade={a.noSubmissionGrade}
            initial={{
              state: item.grade.virtual ? null : item.grade.state,
              value: item.grade.virtual ? null : item.grade.value,
              comment: item.grade.comment,
              exemptionReason: item.grade.exemptionReason,
            }}
          />
        </details>
      ) : null}
    </li>
  );
}

async function Content({ params }: { params: Params }) {
  const { id, assignmentId } = await params;
  let view: GradeSummaryView;
  try {
    view = await apiServer.get<GradeSummaryView>(
      `/assignments/${encodeURIComponent(assignmentId)}/grade-summary`,
    );
  } catch (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {toUserMessage(error)}
      </p>
    );
  }
  const a = view.assignment;
  return (
    <>
      <h1 className="text-2xl font-semibold break-words">{a.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Plazo: {formatDateTime(a.dueAt)} · Nota NE: {a.noSubmissionGrade} ·{' '}
        {a.allowLate ? 'Admite tardías' : 'No admite tardías'}
      </p>
      {!a.periodIsOpen && (
        <p role="status" className="mt-3 rounded-md border p-3 text-sm">
          El período está cerrado: las calificaciones están en solo lectura.
        </p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Promedio</dt>
          <dd className="font-medium">{averageText(view.average)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">A tiempo</dt>
          <dd className="font-medium">{view.counts.onTime}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Con retraso</dt>
          <dd className="font-medium">{view.counts.late}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">No entregaron (NE)</dt>
          <dd className="font-medium">{view.counts.ne}</dd>
        </div>
      </dl>
      <h2 className="mt-6 text-base font-semibold">Estudiantes</h2>
      {view.items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No hay estudiantes matriculados.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {view.items.map((item) => (
            <StudentItem key={item.enrollmentId} item={item} view={view} />
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm">
        <Link
          href={`/curso/${encodeURIComponent(id)}/registro?periodo=${encodeURIComponent(a.periodId)}`}
          className="underline underline-offset-2"
        >
          Volver al registro auxiliar
        </Link>
      </p>
    </>
  );
}

export default function Page({ params }: { params: Params }) {
  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando la tarea…</p>}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}
