// Formas de respuesta de la API académica (docs/03, "API académica (Dev 2)").
// Si cambia el contrato, se actualiza aquí y en docs/03.

export type PeriodKind =
  'FIRST_BIMESTER' | 'SECOND_BIMESTER' | 'THIRD_TRIMESTER' | 'FOURTH_TRIMESTER';

export type YearSummary = {
  id: string;
  year: number;
  isActive: boolean;
  closedAt: string | null;
  readOnly: boolean;
};

export type PeriodView = {
  id: string;
  academicYearId: string;
  sequence: number;
  kind: PeriodKind;
  label: string;
  startDate: string;
  endDate: string;
  closedAt: string | null;
  isOpen: boolean;
};

export type YearDetail = YearSummary & { periods: PeriodView[] };

export type SectionView = {
  id: string;
  academicYearId: string;
  gradeLevel: number;
  code: string;
  isActive: boolean;
};

export type CourseView = { id: string; name: string; isActive: boolean };

export type CourseSectionView = {
  id: string;
  sectionId: string;
  course: { id: string; name: string };
  teacher: { id: string; fullName: string } | null;
  isActive: boolean;
};

export type TeacherOption = { id: string; fullName: string };

export type List<T> = { items: T[]; total: number };

export { IDLE, type ActionState } from '../../_shared/lib/action-state';
