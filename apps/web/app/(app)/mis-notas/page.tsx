import { Suspense } from 'react';
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import type { StudentGradesView } from '../curso/[id]/registro/_lib/types';
import { StudentGrades } from './_components/student-grades';

// Mis notas (Dev 4, RF-51): notas, NE, exoneraciones y comentarios del estudiante, con el
// promedio por período (sin promedio anual, D-014). La API solo devuelve lo propio.

async function Content() {
  let view: StudentGradesView;
  try {
    view = await apiServer.get<StudentGradesView>('/me/grades');
  } catch (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {toUserMessage(error)}
      </p>
    );
  }
  return <StudentGrades view={view} />;
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
      <h1 className="mb-4 text-2xl font-semibold">Mis notas</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando tus notas…</p>}>
        <Content />
      </Suspense>
    </div>
  );
}
