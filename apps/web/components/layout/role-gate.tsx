import { requireRole } from '@/lib/session';
import type { Role } from '@/lib/roles';

// Lleva al usuario a su pagina de inicio si su rol no corresponde a esta seccion.
// Es solo comodidad de navegacion: la API valida el rol en cada peticion (RNF-02).
export async function RoleGate({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  await requireRole(...allow);
  return children;
}
