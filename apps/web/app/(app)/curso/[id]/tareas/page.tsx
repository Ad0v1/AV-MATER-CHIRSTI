import { Suspense } from 'react';
import { apiServer } from '@/lib/api/server';
import { toUserMessage } from '@/lib/api/errors';
import { requireUser } from '@/lib/session';
import { acceptsSubmissions, formatDateTime, formatSize, statusLabel } from './assignment-format';
import { CreateAssignmentForm } from './create-assignment-form';
import { ReceiptView } from './receipt-view';
import { SubmitForm } from './submit-form';
import type {
  AssignmentItem,
  MySubmission,
  PeriodItem,
  SubmissionReceipt,
  TeacherSubmissionItem,
} from './types';

export const metadata = { title: 'Tareas' };

// Tareas del curso (Dev 3, fase 3f; RF-28, RF-33, RF-36..39). Lee con el BFF (D-037). La vista
// depende del rol de la sesión, pero los permisos reales los decide el backend en cada petición.

type Loaded<T> = { ok: true; data: T } | { ok: false; message: string };

async function load<T>(path: string): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await apiServer.get<T>(path) };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

function AssignmentHeader({ a }: { a: AssignmentItem }) {
  return (
    <>
      <h3 className="text-base font-semibold break-words">{a.title}</h3>
      <p className="text-xs text-muted-foreground">
        Plazo: {formatDateTime(a.dueAt)} · Máx. {formatSize(a.maxSizeBytes)} ·{' '}
        {a.allowLate ? 'Admite entregas tardías' : 'No admite entregas tardías'}
        {a.periodIsOpen ? '' : ' · Período cerrado'}
      </p>
      <p className="mt-2 text-sm whitespace-pre-line break-words">{a.instructions}</p>
    </>
  );
}

// ---------------------------------------------------------------- Docente y ADMIN

async function TeacherAssignment({ a }: { a: AssignmentItem }) {
  const list = await load<{ items: TeacherSubmissionItem[] }>(
    `/assignments/${encodeURIComponent(a.id)}/submissions`,
  );
  const delivered = list.ok ? list.data.items.filter((i) => i.latestVersion).length : 0;
  return (
    <li className="rounded-lg border p-4">
      <AssignmentHeader a={a} />
      <p className="mt-1 text-xs text-muted-foreground">
        Nota si no entrega (NE = no entregó): {a.noSubmissionGrade}
      </p>
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          Entregas{list.ok ? ` (${delivered} de ${list.data.items.length})` : ''}
        </summary>
        {!list.ok ? (
          <ErrorText>{list.message}</ErrorText>
        ) : list.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay estudiantes matriculados.</p>
        ) : (
          <div
            className="overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
            role="region"
            aria-label={`Entregas de ${a.title} (desplazable)`}
          >
            <table className="mt-2 w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">Entregas de la tarea {a.title}</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Estudiante
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Última entrega
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Versiones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.data.items.map((i) => (
                  <tr key={i.enrollmentId}>
                    <td className="py-2 pr-3">{i.fullName}</td>
                    <td className="py-2 pr-3">{statusLabel(i.displayStatus)}</td>
                    <td className="py-2 pr-3">
                      {i.latestVersion ? formatDateTime(i.latestVersion.receivedAt) : '—'}
                    </td>
                    <td className="py-2">{i.versionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </li>
  );
}

async function TeacherView({ courseSectionId }: { courseSectionId: string }) {
  const [list, context] = await Promise.all([
    load<{ items: AssignmentItem[] }>(`/course-sections/${courseSectionId}/assignments`),
    load<{ periods: PeriodItem[]; currentPeriodId: string | null }>(
      `/course-sections/${courseSectionId}/context`,
    ),
  ]);
  if (!list.ok) return <ErrorText>{list.message}</ErrorText>;
  const periods = context.ok ? context.data.periods.filter((p) => p.isOpen) : [];
  const current = context.ok ? context.data.currentPeriodId : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <CreateAssignmentForm
        courseSectionId={courseSectionId}
        periods={periods.map((p) => ({ id: p.id, label: p.label }))}
        defaultPeriodId={periods.some((p) => p.id === current) ? current : null}
      />
      <section aria-labelledby="t-list">
        <h2 id="t-list" className="text-base font-semibold">
          Tareas publicadas
        </h2>
        {list.data.items.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Todavía no hay tareas.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {list.data.items.map((a) => (
              <TeacherAssignment key={a.id} a={a} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Estudiante

function Receipt({ v }: { v: SubmissionReceipt }) {
  return (
    <li className="py-3">
      <ReceiptView r={v} />
    </li>
  );
}

async function StudentAssignment({
  a,
  courseSectionId,
}: {
  a: AssignmentItem;
  courseSectionId: string;
}) {
  const mine = await load<MySubmission>(`/assignments/${encodeURIComponent(a.id)}/submissions/me`);
  if (!mine.ok) {
    return (
      <li className="rounded-lg border p-4">
        <AssignmentHeader a={a} />
        <ErrorText>{mine.message}</ErrorText>
      </li>
    );
  }
  const m = mine.data;
  const canSubmit = acceptsSubmissions(a);
  return (
    <li className="rounded-lg border p-4">
      <AssignmentHeader a={a} />
      <p className="mt-2 text-sm">
        Estado: <strong>{statusLabel(m.displayStatus)}</strong>
        {m.isOverdue ? ' · Plazo vencido' : ''}
      </p>
      {canSubmit ? (
        <SubmitForm
          courseSectionId={courseSectionId}
          assignmentId={a.id}
          maxSizeBytes={a.maxSizeBytes}
          isResubmission={m.versions.length > 0}
        />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Esta tarea ya no recibe entregas.</p>
      )}
      {m.latestVersion && (
        <section
          className="mt-3 rounded-md border p-3"
          aria-label={`Constancia de tu entrega oficial de ${a.title}`}
        >
          <ReceiptView
            r={m.latestVersion}
            title={`Constancia de tu entrega oficial: versión ${m.latestVersion.versionNumber}`}
          />
        </section>
      )}
      {m.versions.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            Historial y constancias ({m.versions.length})
          </summary>
          <ul className="divide-y">
            {m.versions.map((v) => (
              <Receipt key={v.versionId} v={v} />
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

async function StudentView({ courseSectionId }: { courseSectionId: string }) {
  const list = await load<{ items: AssignmentItem[] }>(
    `/course-sections/${courseSectionId}/assignments`,
  );
  if (!list.ok) return <ErrorText>{list.message}</ErrorText>;
  if (list.data.items.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay tareas.</p>;
  }
  return (
    <ul className="grid gap-3">
      {list.data.items.map((a) => (
        <StudentAssignment key={a.id} a={a} courseSectionId={courseSectionId} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- Página

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const courseSectionId = encodeURIComponent(id);
  if (user.role === 'TEACHER' || user.role === 'ADMIN') {
    return <TeacherView courseSectionId={courseSectionId} />;
  }
  if (user.role === 'STUDENT') return <StudentView courseSectionId={courseSectionId} />;
  return (
    <p className="text-sm text-muted-foreground">Las tareas no están disponibles para tu rol.</p>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Tareas</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Tareas del curso con entrega en PDF. La hora de entrega es la del servidor.
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando tareas…</p>}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}
