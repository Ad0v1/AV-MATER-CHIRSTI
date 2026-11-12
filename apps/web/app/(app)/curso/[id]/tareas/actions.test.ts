import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/server', () => ({ apiServer: api }));
vi.mock('next/cache', () => ({ refresh }));

import { ApiError } from '@/lib/api/errors';
import { deleteAssignment, getSubmissionDownloadUrl, updateAssignment } from './actions';
import { assignmentToInput } from './assignment-format';

const ID = '0190a6f0-0000-7000-8000-000000000001';
const FILE = '0190a6f0-0000-7000-8000-0000000000f1';
const PERIOD = '0190a6f0-0000-7000-8000-0000000000a1';

const published = {
  periodId: PERIOD,
  title: 'Práctica 1',
  instructions: 'Resolver los ejercicios',
  dueAt: '2099-11-06T04:59:00.000Z',
  noSubmissionGrade: '0.00',
  maxSizeBytes: 20 * 1024 * 1024,
  allowLate: false,
};
const original = assignmentToInput(published);

beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockResolvedValue({ url: 'https://bucket.local/x?sig=1', expiresAt: 'x' });
  api.patch.mockResolvedValue({});
  api.delete.mockResolvedValue(undefined);
});

describe('updateAssignment (RF-29, RN-10)', () => {
  it('RF-29: envía solo los campos cambiados y nunca periodId', async () => {
    const r = await updateAssignment(ID, original, {
      ...original,
      title: ' Nueva ',
      periodId: 'otro-periodo',
      allowLate: true,
    });
    expect(r).toEqual({ ok: true });
    expect(api.patch).toHaveBeenCalledWith(`/assignments/${ID}`, {
      title: 'Nueva',
      allowLate: true,
    });
    const body = api.patch.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('periodId');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('RF-29: sin cambios no llama a la API', async () => {
    const r = await updateAssignment(ID, original, original);
    expect(r).toEqual({ ok: false, message: 'No hay cambios que guardar.' });
    expect(api.patch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('RF-29: plazo vencido sin tocar se puede guardar (cambia solo el título)', async () => {
    const past = assignmentToInput({ ...published, dueAt: '2020-01-01T05:00:00.000Z' });
    const r = await updateAssignment(ID, past, { ...past, title: 'Corregida' });
    expect(r).toEqual({ ok: true });
    expect(api.patch).toHaveBeenCalledWith(`/assignments/${ID}`, { title: 'Corregida' });
  });

  it('RF-29: plazo cambiado a una fecha pasada se rechaza sin llamar a la API', async () => {
    const r = await updateAssignment(ID, original, { ...original, dueLocal: '2020-01-02T10:00' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/futura/);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('RF-29: plazo cambiado a futuro envía dueAt con zona de Lima', async () => {
    await updateAssignment(ID, original, { ...original, dueLocal: '2099-12-10T08:00' });
    expect(api.patch).toHaveBeenCalledWith(`/assignments/${ID}`, {
      dueAt: '2099-12-10T08:00:00-05:00',
    });
  });

  it('RF-29: id que no es uuid no llega a la API', async () => {
    const r = await updateAssignment('../x', original, { ...original, title: 'Z' });
    expect(r.ok).toBe(false);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('RN-10: error 409 o 403 del API se muestra y no refresca', async () => {
    api.patch.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'La tarea ya tiene notas.'));
    const r = await updateAssignment(ID, original, { ...original, title: 'Z' });
    expect(r).toEqual({ ok: false, message: 'La tarea ya tiene notas.' });
    api.patch.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'x'));
    const r2 = await updateAssignment(ID, original, { ...original, title: 'Z' });
    expect(r2).toEqual({ ok: false, message: 'No tienes permiso para realizar esta acción.' });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('deleteAssignment (RF-30, RN-10)', () => {
  it('RF-30: 204 devuelve ok y refresca', async () => {
    expect(await deleteAssignment(ID)).toEqual({ ok: true });
    expect(api.delete).toHaveBeenCalledWith(`/assignments/${ID}`);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('RN-10: 409 marca conflict para sugerir editar', async () => {
    api.delete.mockRejectedValueOnce(
      new ApiError(409, 'CONFLICT', 'La tarea tiene entregas y no se puede eliminar.'),
    );
    const r = await deleteAssignment(ID);
    expect(r).toEqual({
      ok: false,
      message: 'La tarea tiene entregas y no se puede eliminar.',
      conflict: true,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('RF-30: 403 muestra el aviso de permiso, sin conflict', async () => {
    api.delete.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Forbidden'));
    expect(await deleteAssignment(ID)).toEqual({
      ok: false,
      message: 'No tienes permiso para realizar esta acción.',
      conflict: false,
    });
  });

  it('RF-30: 422 muestra el mensaje del API, sin conflict', async () => {
    api.delete.mockRejectedValueOnce(
      new ApiError(422, 'UNPROCESSABLE', 'El período está cerrado.'),
    );
    expect(await deleteAssignment(ID)).toEqual({
      ok: false,
      message: 'El período está cerrado.',
      conflict: false,
    });
  });

  it('RF-30: id inválido no llega a la API', async () => {
    expect(await deleteAssignment('x')).toMatchObject({ ok: false, conflict: false });
    expect(api.delete).not.toHaveBeenCalled();
  });
});

describe('getSubmissionDownloadUrl (RNF-03, RF-39)', () => {
  it('RNF-03: rechaza un id que no es UUID sin llamar a la API', async () => {
    for (const bad of ['x', '../files', '', 'null']) {
      expect((await getSubmissionDownloadUrl(bad)).ok).toBe(false);
    }
    expect(api.post).not.toHaveBeenCalled();
  });

  it('RNF-03: devuelve la URL firmada', async () => {
    const r = await getSubmissionDownloadUrl(FILE);
    expect(r).toEqual({ ok: true, data: { url: 'https://bucket.local/x?sig=1' } });
    expect(api.post).toHaveBeenCalledWith(`/files/${FILE}/download-url`, {});
  });

  it('RNF-03: rechaza URLs que no son http(s) o faltan', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil', undefined]) {
      api.post.mockResolvedValueOnce({ url });
      const r = await getSubmissionDownloadUrl(FILE);
      expect(r).toEqual({ ok: false, message: 'El enlace no es válido.' });
    }
  });

  it('RNF-03: pide una URL nueva en cada llamada (sin caché)', async () => {
    api.post
      .mockResolvedValueOnce({ url: 'https://b/1' })
      .mockResolvedValueOnce({ url: 'https://b/2' });
    const a = await getSubmissionDownloadUrl(FILE);
    const b = await getSubmissionDownloadUrl(FILE);
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(a.ok && a.data?.url).toBe('https://b/1');
    expect(b.ok && b.data?.url).toBe('https://b/2');
  });

  it('RNF-03: error 403 del API se traduce', async () => {
    api.post.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'x'));
    expect(await getSubmissionDownloadUrl(FILE)).toEqual({
      ok: false,
      message: 'No tienes permiso para realizar esta acción.',
    });
  });
});

describe('BAJO-2: forma de los datos en las actions', () => {
  it('updateAssignment rechaza input con tipos inválidos sin llamar a la API', async () => {
    const bad = { ...original, title: 5 } as unknown as typeof original;
    expect(await updateAssignment(ID, original, bad)).toEqual({
      ok: false,
      message: 'Datos no válidos.',
    });
    expect(await updateAssignment(ID, null as unknown as typeof original, original)).toEqual({
      ok: false,
      message: 'Datos no válidos.',
    });
    expect(api.patch).not.toHaveBeenCalled();
  });
});
