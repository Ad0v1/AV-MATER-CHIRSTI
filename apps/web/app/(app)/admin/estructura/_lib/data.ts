// Lecturas de la API académica para los Server Components de /admin/estructura.
// Sin 'use cache': todo depende de la sesión (D-037).
import 'server-only';
import { apiServer } from '@/lib/api/server';
import type {
  CourseSectionView,
  CourseView,
  List,
  SectionView,
  TeacherOption,
  YearDetail,
  YearSummary,
} from './types';
import { isUuid } from './validation';

const id = (value: string): string => {
  if (!isUuid(value)) throw new Error('Identificador no válido');
  return encodeURIComponent(value);
};

export const listYears = () => apiServer.get<List<YearSummary>>('/academic-years');

export const getYear = (yearId: string) =>
  apiServer.get<YearDetail>(`/academic-years/${id(yearId)}`);

export const listSections = (yearId: string) =>
  apiServer.get<List<SectionView>>(`/academic-years/${id(yearId)}/sections`);

export const listCourses = (includeInactive: boolean) =>
  apiServer.get<List<CourseView>>(`/courses?includeInactive=${includeInactive ? 'true' : 'false'}`);

export const listCourseSections = (sectionId: string) =>
  apiServer.get<List<CourseSectionView>>(`/sections/${id(sectionId)}/course-sections`);

type UserListPage = {
  items: { id: string; fullName: string }[];
  total: number;
  page: number;
  pageSize: number;
};

const TEACHER_PAGE_SIZE = 100;
const MAX_TEACHER_PAGES = 10;

/** Docentes ACTIVE para asignar a un curso-sección (solo id y nombre). */
export async function listActiveTeachers(): Promise<TeacherOption[]> {
  const teachers: TeacherOption[] = [];
  for (let page = 1; page <= MAX_TEACHER_PAGES; page++) {
    const res = await apiServer.get<UserListPage>(
      `/users?role=TEACHER&status=ACTIVE&pageSize=${TEACHER_PAGE_SIZE}&page=${page}`,
    );
    teachers.push(...res.items.map((u) => ({ id: u.id, fullName: u.fullName })));
    if (teachers.length >= res.total || res.items.length < TEACHER_PAGE_SIZE) break;
  }
  return teachers;
}
