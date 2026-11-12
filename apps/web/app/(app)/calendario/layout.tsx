import { RoleGate } from '@/components/layout/role-gate';

// RF-54: estudiante, docente y apoderado. ADMIN no tiene calendario propio (la API responde 403).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <RoleGate allow={['STUDENT', 'TEACHER', 'GUARDIAN']}>{children}</RoleGate>;
}
