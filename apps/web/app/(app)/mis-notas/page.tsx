import { Suspense } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { ROUTE_META } from '@/lib/route-meta';
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

export const metadata = { title: 'Mis notas' };

export default function Page() {
  return (
    <PageShell className="gap-0">
      <h1 className="mb-4 text-2xl font-semibold">{ROUTE_META['/mis-notas'].title}</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando tus notas…</p>}>
        <Content />
      </Suspense>
    </PageShell>
  );
}
