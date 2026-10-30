import Link from 'next/link';
import { Suspense } from 'react';
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { isUuid } from '../curso/[id]/registro/_lib/grading-format';
import type { GuardianStudentsView, StudentGradesView } from '../curso/[id]/registro/_lib/types';
import { StudentGrades } from '../mis-notas/_components/student-grades';

// Panel del apoderado (Dev 4, RF-52): solo lectura de las notas de sus estudiantes vinculados.
// El backend valida el vínculo vigente en cada petición (403 si no). Anuncios: Dev 5 (RF-32).

type Search = Promise<{ estudiante?: string | string[] }>;

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

async function Content({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  let students: GuardianStudentsView;
  try {
    students = await apiServer.get<GuardianStudentsView>('/guardian/students');
  } catch (error) {
    return <ErrorText>{toUserMessage(error)}</ErrorText>;
  }
  if (students.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tienes estudiantes vinculados. Si es un error, comunícate con la institución.
      </p>
    );
  }
  const wanted =
    typeof search.estudiante === 'string' && isUuid(search.estudiante) ? search.estudiante : null;
  const selected = students.items.find((s) => s.studentId === wanted) ?? students.items[0];

  let grades: StudentGradesView | null = null;
  let error: string | null = null;
  try {
    grades = await apiServer.get<StudentGradesView>(
      `/guardian/students/${encodeURIComponent(selected.studentId)}/grades`,
    );
  } catch (e) {
    error = toUserMessage(e);
  }

  return (
    <>
      <nav aria-label="Estudiantes vinculados">
        <ul className="flex flex-wrap gap-2">
          {students.items.map((s) => {
            const current = s.studentId === selected.studentId;
            return (
              <li key={s.studentId}>
                <Link
                  href={`/apoderado?estudiante=${encodeURIComponent(s.studentId)}`}
                  aria-current={current ? 'page' : undefined}
                  className={`inline-flex min-h-11 flex-col justify-center rounded-md border px-3 py-1 text-sm ${
                    current ? 'bg-primary font-medium text-primary-foreground' : ''
                  }`}
                >
                  {s.fullName}
                  <span className="text-xs font-normal">
                    {s.currentSection
                      ? `${s.currentSection.gradeLevel}.° ${s.currentSection.code}`
                      : 'Sin sección vigente'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="ap-notas" className="mt-6">
        <h2 id="ap-notas" className="mb-3 text-lg font-semibold break-words">
          Notas de {selected.fullName}
        </h2>
        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : grades ? (
          <StudentGrades view={grades} headingLevel={3} />
        ) : null}
      </section>

      {/* Hueco para Dev 5 (RF-32): anuncios del curso y de la institución para el apoderado. */}
      <section aria-labelledby="ap-anuncios" className="mt-6 rounded-lg border p-4">
        <h2 id="ap-anuncios" className="text-lg font-semibold">
          Anuncios
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pronto verás aquí los anuncios del colegio.
        </p>
      </section>
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Panel del apoderado</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Consulta de solo lectura de las notas de tus estudiantes.
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
