// Lecturas de la API de usuarios para los Server Components de /admin/usuarios.
// Sin 'use cache': todo depende de la sesión (D-037). Nunca se registran respuestas.
import 'server-only';
import { apiServer } from '@/lib/api/server';
import { isUuid } from '../../_shared/lib/validation';
import type {
  ActiveYearSections,
  EnrollmentView,
  GuardianLinkView,
  List,
  SectionOption,
  UserDetail,
  UserListPage,
} from './types';
import { buildUserListQuery, type UserFilters } from './users';

const id = (value: string): string => {
  if (!isUuid(value)) throw new Error('Identificador no válido');
  return encodeURIComponent(value);
};

/** Lista con los filtros de la URL (sin búsqueda: `q` va por Server Action). */
export const listUsers = (filters: UserFilters) =>
  apiServer.get<UserListPage>(`/users?${buildUserListQuery(filters)}`);

export const getUser = (userId: string) => apiServer.get<UserDetail>(`/users/${id(userId)}`);

export const listEnrollments = (studentId: string) =>
  apiServer.get<List<EnrollmentView>>(`/students/${id(studentId)}/enrollments`);

/** Apoderados del estudiante, también los revocados (RN-13: se ve el historial). */
export const listGuardiansOf = (studentId: string) =>
  apiServer.get<List<GuardianLinkView>>(`/students/${id(studentId)}/guardians?includeRevoked=true`);

/** Estudiantes del apoderado, también los revocados. */
export const listStudentsOf = (guardianId: string) =>
  apiServer.get<List<GuardianLinkView>>(
    `/guardians/${id(guardianId)}/students?includeRevoked=true`,
  );

type YearSummary = { id: string; year: number; isActive: boolean; closedAt: string | null };

/** Año activo y sus secciones (todas; las pantallas filtran las activas). null si no hay. */
export async function getActiveYearSections(): Promise<ActiveYearSections | null> {
  const years = await apiServer.get<List<YearSummary>>('/academic-years');
  const active = years.items.find((y) => y.isActive && !y.closedAt);
  if (!active) return null;
  const sections = await apiServer.get<List<SectionOption>>(
    `/academic-years/${id(active.id)}/sections`,
  );
  return { yearId: active.id, year: active.year, sections: sections.items };
}
