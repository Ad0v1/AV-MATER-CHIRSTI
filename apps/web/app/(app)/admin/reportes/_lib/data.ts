// Lecturas de /admin/reportes (RF-57, RF-60) para Server Components. Sin 'use cache': dependen
// de la sesión (D-037).
import 'server-only';
import { apiServer } from '@/lib/api/server';
import {
  courseSectionsQuery,
  type ReportCourseSectionsView,
  type ReportFilters,
  type ReportsDashboardView,
} from './reports';

export const getReportCourseSections = (filters: ReportFilters) =>
  apiServer.get<ReportCourseSectionsView>(
    `/admin/reports/course-sections${courseSectionsQuery(filters)}`,
  );

export const getReportsDashboard = (
  academicYearId: string,
  periodId: string,
  gradeLevel: number | null = null,
) => {
  const q = new URLSearchParams({ academicYearId, periodId });
  if (gradeLevel !== null) q.set('gradeLevel', String(gradeLevel));
  return apiServer.get<ReportsDashboardView>(`/admin/reports/dashboard?${q.toString()}`);
};
