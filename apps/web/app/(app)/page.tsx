import { redirect } from 'next/navigation';
import { HOME_BY_ROLE } from '@/lib/roles';
import { apiServer } from '@/lib/api/server';
import { requireUser } from '@/lib/session';
import { cargarDatosInicio } from './_inicio/datos';
import { PanelInicio } from './_inicio/panel-inicio';

export const metadata = { title: 'Inicio' };

// Inicio de docentes y estudiantes. Los demás roles tienen su propia página de inicio.
export default async function Home() {
  const user = await requireUser();
  if (user.role !== 'TEACHER' && user.role !== 'STUDENT') redirect(HOME_BY_ROLE[user.role]);
  // El nombre solo adorna el saludo: si la API no responde, se muestra sin él.
  const [profile, datos] = await Promise.all([
    apiServer.get<{ fullName?: string }>('/auth/profile').catch(() => null),
    cargarDatosInicio(user.role === 'STUDENT'),
  ]);
  return <PanelInicio role={user.role} nombre={profile?.fullName?.trim() || null} datos={datos} />;
}
