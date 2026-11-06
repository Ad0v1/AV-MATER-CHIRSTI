import { RoleGate } from '@/components/layout/role-gate';

// RF-32: bandeja de anuncios del estudiante, el docente y el apoderado. ADMIN usa /admin/anuncios.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <RoleGate allow={['STUDENT', 'TEACHER', 'GUARDIAN']}>{children}</RoleGate>;
}
