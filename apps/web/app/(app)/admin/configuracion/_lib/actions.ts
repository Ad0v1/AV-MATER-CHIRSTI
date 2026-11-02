'use server';

// Escrituras de /admin/configuracion (RF-61, U5) como Server Actions (D-037). La API comprueba
// sesión y rol ADMIN, valida la tabla con el motor de notas y pasa el logo por el antivirus; aquí
// solo se valida la forma para dar mensajes junto al campo.
//
// El logo viaja como multipart a la API con la misma regla que lib/api/server.ts: solo la cookie
// `aula_sid` validada, sin caché, sin seguir redirecciones, con tiempo máximo y sin registrar el
// archivo ni la respuesta.
import { refresh } from 'next/cache';
import { cookies } from 'next/headers';
import { detailMessages, networkError, parseApiError, toUserMessage } from '@/lib/api/errors';
import { SESSION_COOKIE, sessionCookieHeader } from '@/lib/api/request-guards';
import { apiServer } from '@/lib/api/server';
import type { ActionState } from '@/app/(app)/admin/_shared/lib/action-state';
import {
  checkLogoFile,
  parseSettingsForm,
  settingsPathLabel,
  type SettingsView,
} from './settings-form';

const API_BASE = `${(process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}/api/v1`;
/** Antivirus incluido: igual que la confirmación de archivos de Dev 3. */
const LOGO_TIMEOUT_MS = 45_000;

const failure = (error: unknown, values?: Record<string, string>): ActionState => ({
  status: 'error',
  message: toUserMessage(error),
  details: detailMessages(error, settingsPathLabel),
  values,
});

export async function saveSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseSettingsForm(fd);
  if (!parsed.ok) {
    return {
      status: 'error',
      message: 'Revisa los campos marcados.',
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }
  try {
    await apiServer.put<SettingsView>('/admin/settings', parsed.input);
  } catch (error) {
    return failure(error, parsed.values);
  }
  refresh();
  return { status: 'ok', message: 'Configuración guardada.' };
}

export async function uploadLogoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const file = fd.get('logo');
  const blob = file instanceof Blob ? file : null;
  const check = checkLogoFile(blob ? { size: blob.size, type: blob.type } : null);
  if (!check.ok) {
    return { status: 'error', message: check.message, fieldErrors: { logo: check.message } };
  }
  const body = new FormData();
  // checkLogoFile ya limitó el tamaño a LOGO_MAX_BYTES (la API vuelve a cortar en 512 KB).
  // Nombre fijo: el de la PC del usuario no se envía a la API.
  body.set('file', blob!, blob!.type === 'image/png' ? 'logo.png' : 'logo.jpg');
  const headers: Record<string, string> = { Accept: 'application/json' };
  const cookie = sessionCookieHeader((await cookies()).get(SESSION_COOKIE)?.value);
  if (cookie) headers.Cookie = cookie;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/admin/settings/logo`, {
      method: 'PUT',
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
    });
  } catch {
    return failure(networkError());
  }
  if (!res.ok) {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      // cuerpo vacío o no JSON: solo el status
    }
    const error = parseApiError(res.status, payload);
    return { ...failure(error), fieldErrors: { logo: toUserMessage(error) } };
  }
  await res.body?.cancel();
  refresh();
  return { status: 'ok', message: 'Logo actualizado.' };
}
