import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/server', () => ({ apiServer: api }));
vi.mock('next/cache', () => ({ refresh }));

import { ApiError } from '@/lib/api/errors';
import {
  createAdminAnnouncement,
  createCourseAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
} from './actions';

const ID = '0190a6f0-0000-7000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockResolvedValue({});
  api.patch.mockResolvedValue({});
  api.delete.mockResolvedValue(undefined);
});

describe('Server Actions de anuncios (RF-32)', () => {
  it('RF-32: crear en un curso reenvía el texto normalizado y refresca', async () => {
    const r = await createCourseAnnouncement(ID, '  Aviso ', 'a\r\nb');
    expect(r).toEqual({ ok: true });
    expect(api.post).toHaveBeenCalledWith(`/course-sections/${ID}/announcements`, {
      title: 'Aviso',
      body: 'a\nb',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('RF-32: id de curso que no es uuid no llega a la API', async () => {
    for (const bad of ['x', '../admin', undefined, 5, '']) {
      const r = await createCourseAnnouncement(bad, 't', 'b');
      expect(r.ok).toBe(false);
    }
    expect(api.post).not.toHaveBeenCalled();
  });

  it('RF-32: título de 150 pasa y de 151 se rechaza en la web sin llamar a la API', async () => {
    expect((await createCourseAnnouncement(ID, 'a'.repeat(150), 'b')).ok).toBe(true);
    const r = await createCourseAnnouncement(ID, 'a'.repeat(151), 'b');
    expect(r).toMatchObject({ ok: false, errors: { title: expect.any(String) } });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('RF-32: el HTML viaja como texto, sin modificar', async () => {
    await createCourseAnnouncement(ID, 't', '<script>alert(1)</script>');
    expect(api.post).toHaveBeenCalledWith(expect.any(String), {
      title: 't',
      body: '<script>alert(1)</script>',
    });
  });

  it('RF-32: ADMIN INSTITUTION no envía grado; GRADE exige 1..5', async () => {
    await createAdminAnnouncement('INSTITUTION', 3, 't', 'b');
    expect(api.post).toHaveBeenLastCalledWith('/announcements', {
      scope: 'INSTITUTION',
      title: 't',
      body: 'b',
    });
    await createAdminAnnouncement('GRADE', '4', 't', 'b');
    expect(api.post).toHaveBeenLastCalledWith('/announcements', {
      scope: 'GRADE',
      gradeLevel: 4,
      title: 't',
      body: 'b',
    });
    api.post.mockClear();
    for (const g of ['0', '6', '', undefined, 'x']) {
      const r = await createAdminAnnouncement('GRADE', g, 't', 'b');
      expect(r).toMatchObject({ ok: false, errors: { gradeLevel: expect.any(String) } });
    }
    expect(api.post).not.toHaveBeenCalled();
  });

  it('RF-32: COURSE_SECTION u otro valor no se acepta en la acción de ADMIN', async () => {
    for (const s of ['COURSE_SECTION', 'ALL', undefined, 1]) {
      expect((await createAdminAnnouncement(s, 1, 't', 'b')).ok).toBe(false);
    }
    expect(api.post).not.toHaveBeenCalled();
  });

  it('RF-32: editar y retirar validan el id y reenvían; sin refresco si la API falla', async () => {
    expect((await updateAnnouncement('x', 't', 'b')).ok).toBe(false);
    expect((await deleteAnnouncement('x')).ok).toBe(false);
    expect(await updateAnnouncement(ID, 'Nuevo', 'b')).toEqual({ ok: true });
    expect(api.patch).toHaveBeenCalledWith(`/announcements/${ID}`, { title: 'Nuevo', body: 'b' });
    expect(await deleteAnnouncement(ID)).toEqual({ ok: true });
    expect(api.delete).toHaveBeenCalledWith(`/announcements/${ID}`);
    refresh.mockClear();
    api.delete.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'No tienes permiso'));
    const r = await deleteAnnouncement(ID);
    expect(r.ok).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('RF-32: un 403 de la API (docente ajeno, apoderado) llega como mensaje', async () => {
    api.post.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'No tienes permiso'));
    const r = await createCourseAnnouncement(ID, 't', 'b');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.message).toBe('string');
  });

  it('RF-32: errores de campo de la API se devuelven por campo (title/body/gradeLevel)', async () => {
    api.post.mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION', 'Datos no válidos', [
        { path: 'title', message: 'Máximo 150 caracteres' },
        { path: 'otro', message: 'ignorado' },
      ]),
    );
    const r = await createCourseAnnouncement(ID, 't', 'b');
    expect(r).toMatchObject({ ok: false, errors: { title: 'Máximo 150 caracteres' } });
    if (!r.ok) expect(r.errors).not.toHaveProperty('otro');
  });
});
