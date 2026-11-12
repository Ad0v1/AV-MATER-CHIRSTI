// Lecturas de /admin/almacenamiento (RF-65..67) para Server Components. Sin 'use cache':
// dependen de la sesión (D-037).
import 'server-only';
import { apiServer } from '@/lib/api/server';
import type { StorageUsageView, YearBackupsView } from './storage';

export const getStorageUsage = () => apiServer.get<StorageUsageView>('/admin/storage-usage');

export const getYearBackups = (academicYearId: string) =>
  apiServer.get<YearBackupsView>(
    `/admin/academic-years/${encodeURIComponent(academicYearId)}/backups`,
  );
