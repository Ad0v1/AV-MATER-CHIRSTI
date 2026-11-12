import { describe, expect, it } from 'vitest';
import {
  adminAnnouncementSchema,
  courseAnnouncementSchema,
  meAnnouncementsQuerySchema,
  updateAnnouncementSchema,
} from './announcements.dto.js';

describe('DTO de anuncios (RF-32)', () => {
  it('título de hasta 150 caracteres, de una línea y sin vacíos', () => {
    expect(courseAnnouncementSchema.safeParse({ title: 'a'.repeat(150), body: 'x' }).success).toBe(
      true,
    );
    expect(courseAnnouncementSchema.safeParse({ title: 'a'.repeat(151), body: 'x' }).success).toBe(
      false,
    );
    expect(courseAnnouncementSchema.safeParse({ title: '   ', body: 'x' }).success).toBe(false);
    expect(courseAnnouncementSchema.safeParse({ title: 'a\nb', body: 'x' }).success).toBe(false);
  });

  it('el cuerpo es texto plano: normaliza CRLF y rechaza caracteres de control', () => {
    const ok = courseAnnouncementSchema.parse({ title: ' Hola ', body: ' línea 1\r\nlínea 2 ' });
    expect(ok).toEqual({ title: 'Hola', body: 'línea 1\nlínea 2' });
    expect(courseAnnouncementSchema.safeParse({ title: 't', body: 'a\u0000b' }).success).toBe(
      false,
    );
    expect(courseAnnouncementSchema.safeParse({ title: 't', body: 'a\u001bb' }).success).toBe(
      false,
    );
    // El HTML se acepta como texto: la web nunca lo interpreta.
    expect(
      courseAnnouncementSchema.safeParse({ title: 't', body: '<script>x</script>' }).success,
    ).toBe(true);
  });

  it('rechaza campos de más (strict) y cuerpos de más de 5000 caracteres', () => {
    expect(
      courseAnnouncementSchema.safeParse({ title: 't', body: 'b', scope: 'INSTITUTION' }).success,
    ).toBe(false);
    expect(courseAnnouncementSchema.safeParse({ title: 't', body: 'b'.repeat(5001) }).success).toBe(
      false,
    );
  });

  it('ADMIN: INSTITUTION sin grado, GRADE con nivel y grado del nivel, nunca COURSE_SECTION', () => {
    expect(
      adminAnnouncementSchema.safeParse({ scope: 'INSTITUTION', title: 't', body: 'b' }).success,
    ).toBe(true);
    expect(
      adminAnnouncementSchema.safeParse({
        scope: 'INSTITUTION',
        gradeLevel: 1,
        title: 't',
        body: 'b',
      }).success,
    ).toBe(false);
    expect(
      adminAnnouncementSchema.safeParse({
        scope: 'GRADE',
        level: 'SECUNDARIA',
        gradeLevel: 5,
        title: 't',
        body: 'b',
      }).success,
    ).toBe(true);
    expect(
      adminAnnouncementSchema.safeParse({
        scope: 'GRADE',
        level: 'SECUNDARIA',
        gradeLevel: 6,
        title: 't',
        body: 'b',
      }).success,
    ).toBe(false);
    expect(
      adminAnnouncementSchema.safeParse({
        scope: 'GRADE',
        level: 'PRIMARIA',
        gradeLevel: 6,
        title: 't',
        body: 'b',
      }).success,
    ).toBe(true);
    expect(
      adminAnnouncementSchema.safeParse({
        scope: 'GRADE',
        level: 'INICIAL',
        gradeLevel: 2,
        title: 't',
        body: 'b',
      }).success,
    ).toBe(false);
    expect(
      adminAnnouncementSchema.safeParse({ scope: 'GRADE', gradeLevel: 3, title: 't', body: 'b' })
        .success,
    ).toBe(false);
    expect(
      adminAnnouncementSchema.safeParse({ scope: 'GRADE', title: 't', body: 'b' }).success,
    ).toBe(false);
    expect(
      adminAnnouncementSchema.safeParse({ scope: 'COURSE_SECTION', title: 't', body: 'b' }).success,
    ).toBe(false);
  });

  it('PATCH exige al menos un campo', () => {
    expect(updateAnnouncementSchema.safeParse({}).success).toBe(false);
    expect(updateAnnouncementSchema.safeParse({ body: 'nuevo' }).success).toBe(true);
  });

  it('GET /me/announcements: page por defecto 1 y studentId uuid', () => {
    expect(meAnnouncementsQuerySchema.parse({})).toEqual({ page: 1 });
    expect(meAnnouncementsQuerySchema.safeParse({ studentId: 'x' }).success).toBe(false);
    expect(meAnnouncementsQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});
