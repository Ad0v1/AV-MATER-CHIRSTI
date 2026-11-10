import { describe, expect, it } from 'vitest';
import {
  notificationHref,
  unreadLabel,
  type NotificationItem,
} from '../../_notifications/notifications';
import {
  BODY_MAX,
  TITLE_MAX,
  pageCount,
  parseGradeLevel,
  parseLevel,
  parsePage,
  scopeLabel,
  validateAnnouncement,
} from './announcements';

describe('validateAnnouncement (RF-32)', () => {
  it('normaliza saltos de línea y recorta', () => {
    expect(validateAnnouncement({ title: '  Hola ', body: 'a\r\nb ' })).toEqual({
      ok: true,
      value: { title: 'Hola', body: 'a\nb' },
    });
  });

  it('rechaza vacíos, largos, títulos de varias líneas y caracteres de control', () => {
    const bad = (title: string, body: string) => {
      const r = validateAnnouncement({ title, body });
      return r.ok ? {} : r.errors;
    };
    expect(bad('', '')).toMatchObject({ title: expect.any(String), body: expect.any(String) });
    expect(bad('x'.repeat(TITLE_MAX + 1), 'y')).toHaveProperty('title');
    expect(bad('a\nb', 'y')).toHaveProperty('title');
    expect(bad('a', 'x'.repeat(BODY_MAX + 1))).toHaveProperty('body');
    expect(bad('a\u0007', 'y')).toHaveProperty('title');
    expect(validateAnnouncement({ title: 1, body: null }).ok).toBe(false);
  });
});

describe('utilidades', () => {
  it('parseGradeLevel y parsePage', () => {
    expect(parseGradeLevel('SECUNDARIA', '3')).toBe(3);
    expect(parseGradeLevel('SECUNDARIA', '6')).toBeNull();
    expect(parseGradeLevel('PRIMARIA', '6')).toBe(6);
    expect(parseGradeLevel('INICIAL', '2')).toBeNull();
    expect(parseGradeLevel('SECUNDARIA', '')).toBeNull();
    expect(parseLevel('INICIAL')).toBe('INICIAL');
    expect(parseLevel('BASICA')).toBeNull();
    expect(parsePage('2')).toBe(2);
    expect(parsePage(['2'])).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('501')).toBe(1);
  });

  it('scopeLabel y pageCount', () => {
    expect(
      scopeLabel({
        scope: 'INSTITUTION',
        level: null,
        gradeLevel: null,
        course: null,
        section: null,
      }),
    ).toBe('Toda la institución');
    const grade = (level: 'INICIAL' | 'PRIMARIA' | 'SECUNDARIA', gradeLevel: number) =>
      scopeLabel({ scope: 'GRADE', level, gradeLevel, course: null, section: null });
    expect(grade('SECUNDARIA', 2)).toBe('2.° Secundaria');
    expect(grade('PRIMARIA', 3)).toBe('3.° Primaria');
    expect(grade('INICIAL', 5)).toBe('5 años');
    expect(
      scopeLabel({
        scope: 'COURSE_SECTION',
        level: null,
        gradeLevel: null,
        course: { id: 'c', name: 'Arte' },
        section: { level: 'PRIMARIA', gradeLevel: 3, code: 'A' },
      }),
    ).toBe('Arte · 3.° Primaria A');
    expect(pageCount({ total: 0, pageSize: 20 })).toBe(1);
    expect(pageCount({ total: 41, pageSize: 20 })).toBe(3);
  });
});

describe('campana (RF-53)', () => {
  const base: NotificationItem = {
    id: 'n',
    type: 'ASSIGNMENT_CREATED',
    createdAt: '2026-11-06T10:00:00Z',
    readAt: null,
    message: 'x',
    target: 'ASSIGNMENT',
    courseSectionId: 'cs1',
    studentId: null,
  };

  it('enlaces según el rol y el destino', () => {
    expect(notificationHref(base, 'STUDENT')).toBe('/curso/cs1/tareas');
    expect(notificationHref(base, 'GUARDIAN')).toBe('/calendario');
    expect(notificationHref({ ...base, target: 'GRADE' }, 'STUDENT')).toBe('/mis-notas');
    expect(notificationHref({ ...base, target: 'GRADE' }, 'GUARDIAN')).toBe('/apoderado');
    expect(notificationHref({ ...base, target: 'ANNOUNCEMENT' }, 'TEACHER')).toBe('/anuncios');
    expect(notificationHref({ ...base, target: null }, 'STUDENT')).toBeNull();
  });

  it('contador accesible con tope de 99+', () => {
    expect(unreadLabel(0)).toEqual({ badge: null, aria: 'Avisos, ninguno sin leer' });
    expect(unreadLabel(3).aria).toBe('Avisos, 3 sin leer');
    expect(unreadLabel(150).badge).toBe('99+');
  });
});
