import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FileText,
  GraduationCap,
  HardDrive,
  Notebook,
  School,
  UserRound,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { COURSE_ROUTES, ROUTES } from '@/lib/routes';
import type { Role } from '@/lib/roles';

export type NavItem = { label: string; href: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

// Curso de ejemplo hasta que Dev 2 entregue la lista real de cursos (RF-14).
const DEMO_COURSE = 'demo';

const courseItems = (withRegistro: boolean): NavItem[] => [
  { label: 'Clases', href: COURSE_ROUTES.clases(DEMO_COURSE), icon: School },
  { label: 'Lecturas', href: COURSE_ROUTES.lecturas(DEMO_COURSE), icon: BookOpen },
  { label: 'Tareas', href: COURSE_ROUTES.tareas(DEMO_COURSE), icon: ClipboardList },
  ...(withRegistro
    ? [{ label: 'Registro auxiliar', href: COURSE_ROUTES.registro(DEMO_COURSE), icon: Notebook }]
    : []),
];

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
        { label: 'Reportes', href: ROUTES.adminReportes, icon: BarChart3 },
        { label: 'Configuración', href: ROUTES.adminConfiguracion, icon: Settings },
        { label: 'Bitácora', href: ROUTES.adminBitacora, icon: ScrollText },
        { label: 'Almacenamiento', href: ROUTES.adminAlmacenamiento, icon: HardDrive },
      ],
    },
  ],
  TEACHER: [{ label: 'Curso de ejemplo', items: courseItems(true) }],
  STUDENT: [
    { label: 'Curso de ejemplo', items: courseItems(false) },
    {
      label: 'Calificaciones',
      items: [{ label: 'Mis notas', href: ROUTES.misNotas, icon: FileText }],
    },
  ],
  GUARDIAN: [
    {
      label: 'Familia',
      items: [{ label: 'Panel del apoderado', href: ROUTES.apoderado, icon: Users }],
    },
  ],
};

// Todos los perfiles tienen "Mi perfil" (RF-83).
export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  ADMIN: [...BASE_NAV.ADMIN, ACCOUNT_GROUP],
  TEACHER: [...BASE_NAV.TEACHER, ACCOUNT_GROUP],
  STUDENT: [...BASE_NAV.STUDENT, ACCOUNT_GROUP],
  GUARDIAN: [...BASE_NAV.GUARDIAN, ACCOUNT_GROUP],
};
