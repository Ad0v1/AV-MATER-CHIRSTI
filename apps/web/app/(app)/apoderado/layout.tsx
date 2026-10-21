import { RoleGate } from '@/components/layout/role-gate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RoleGate allow={['GUARDIAN']}>{children}</RoleGate>;
}
