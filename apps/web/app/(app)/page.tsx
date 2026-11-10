import { redirect } from 'next/navigation';
import { HOME_BY_ROLE } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { PanelInicio } from './_inicio/panel-inicio';

export const metadata = { title: 'Inicio' };

// Inicio de docentes y estudiantes. Los demás roles tienen su propia página de inicio.
export default async function Home() {
  const user = await requireUser();
  if (user.role !== 'TEACHER' && user.role !== 'STUDENT') redirect(HOME_BY_ROLE[user.role]);
  return <PanelInicio role={user.role} />;
}
