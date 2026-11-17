import {
  BarChart3,
  CalendarDays,
  FileText,
  GraduationCap,
  HardDrive,
  Megaphone,
  UserRound,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '@/lib/routes';
import type { Role } from '@/lib/roles';

export type NavItem = { label: string; href: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

// Calendario de plazos (RF-54, Dev 5): autorizado por el usuario el 30/10/2026.
const agenda: NavGroup = {
  label: 'Agenda',
  items: [
    { label: 'Calendario', href: ROUTES.calendario, icon: CalendarDays },
    // RF-32 (Dev 5): bandeja de anuncios (autorizado 06/11/2026).
    { label: 'Anuncios', href: ROUTES.anuncios, icon: Megaphone },
  ],
};

// El menu es solo ayuda de navegacion: el backend valida rol y pertenencia (RNF-02).
const ACCOUNT_GROUP: NavGroup = {
  label: 'Cuenta',
  items: [{ label: 'Mi perfil', href: ROUTES.miPerfil, icon: UserRound }],
};

const BASE_NAV: Record<Role, NavGroup[]> = {
  ADMIN: [
    {
      label: 'Administración',
      items: [
        { label: 'Estructura académica', href: ROUTES.adminEstructura, icon: GraduationCap },
        { label: 'Usuarios', href: ROUTES.adminUsuarios, icon: Users },
        { label: 'Anuncios', href: ROUTES.adminAnuncios, icon: Megaphone },
        { label: 'Reportes', href: ROUTES.adminReportes, icon: BarChart3 },
        { label: 'Configuración', href: ROUTES.adminConfiguracion, icon: Settings },
        { label: 'Bitácora', href: ROUTES.adminBitacora, icon: ScrollText },
        { label: 'Almacenamiento', href: ROUTES.adminAlmacenamiento, icon: HardDrive },
      ],
    },
  ],
  TEACHER: [agenda],
  STUDENT: [
    {
      label: 'Calificaciones',
      items: [{ label: 'Mis notas', href: ROUTES.misNotas, icon: FileText }],
    },
    agenda,
  ],
  GUARDIAN: [
    {
      label: 'Familia',
      items: [{ label: 'Panel del apoderado', href: ROUTES.apoderado, icon: Users }],
    },
    agenda,
  ],
};

// Todos los perfiles tienen "Mi perfil" (RF-83).
export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  ADMIN: [...BASE_NAV.ADMIN, ACCOUNT_GROUP],
  TEACHER: [...BASE_NAV.TEACHER, ACCOUNT_GROUP],
  STUDENT: [...BASE_NAV.STUDENT, ACCOUNT_GROUP],
  GUARDIAN: [...BASE_NAV.GUARDIAN, ACCOUNT_GROUP],
};
