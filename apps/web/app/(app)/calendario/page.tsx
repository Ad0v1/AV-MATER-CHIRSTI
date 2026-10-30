// /calendario — plazos de tareas (RF-54, Dev 5). La API (GET /me/calendar) decide qué cursos ve
// cada rol; el apoderado elige entre sus estudiantes con vínculo vigente (GET /guardian/students).
import { Suspense } from 'react';
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { requireRole } from '@/lib/session';
import { DeadlineCalendar } from './_components/deadline-calendar';
import type { GuardianStudent } from './_lib/calendar';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Calendario</h1>
      <p className="text-sm text-muted-foreground">
        Fechas de vencimiento de las tareas de tus cursos.
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando calendario…</p>}>
        <Content />
      </Suspense>
    </div>
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
