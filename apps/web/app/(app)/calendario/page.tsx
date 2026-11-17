// /calendario — plazos de tareas (RF-54, Dev 5). La API (GET /me/calendar) decide qué cursos ve
// cada rol; el apoderado elige entre sus estudiantes con vínculo vigente (GET /guardian/students).
import { Suspense } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { ROUTE_META } from '@/lib/route-meta';
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { requireRole } from '@/lib/session';
import { DeadlineCalendar } from './_components/deadline-calendar';
import type { GuardianStudent } from './_lib/calendar';

export const metadata = { title: ROUTE_META['/calendario'].title };

export default function Page() {
  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold">{ROUTE_META['/calendario'].title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ROUTE_META['/calendario'].description}
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando calendario…</p>}>
        <Content />
      </Suspense>
    </PageShell>
  );
}

async function Content() {
  const user = await requireRole('STUDENT', 'TEACHER', 'GUARDIAN');
  let students: GuardianStudent[] = [];
  if (user.role === 'GUARDIAN') {
    try {
      const res = await apiServer.get<{ items: GuardianStudent[] }>('/guardian/students');
      students = res.items.map((s) => ({ studentId: s.studentId, fullName: s.fullName }));
    } catch (error) {
      return (
        <p role="alert" className="text-sm text-destructive">
          {toUserMessage(error)}
        </p>
      );
    }
    if (students.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No tienes estudiantes vinculados. Comunícate con la institución.
        </p>
      );
    }
  }
  return <DeadlineCalendar role={user.role} students={students} />;
}
