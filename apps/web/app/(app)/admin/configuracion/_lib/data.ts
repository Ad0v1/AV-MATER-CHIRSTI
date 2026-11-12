// Lecturas de /admin/configuracion (RF-61) para Server Components. Sin 'use cache': dependen de
// la sesión (D-037).
import 'server-only';
import { apiServer } from '@/lib/api/server';
import type { SettingsView } from './settings-form';

export const getSettings = () => apiServer.get<SettingsView>('/admin/settings');
