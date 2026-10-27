import {
  changeStatusSchema,
  createGuardianSchema,
  createStudentSchema,
  emailSchema,
  fullNameSchema,
  listLinksQuerySchema,
  listUsersQuerySchema,
  revokeLinkSchema,
  transferSchema,
  updateUserSchema,
} from './users.dto.js';

const ID = '01890000-0000-7000-8000-000000000001';
const ID2 = '01890000-0000-7000-8000-000000000002';

describe('users.dto (Decisión 4)', () => {
  describe('correo', () => {
    it('normaliza a minúsculas sin espacios', () => {
      expect(emailSchema.parse('  QA.F3@Colegio.Example ')).toBe('qa.f3@colegio.example');
    });

    it('rechaza formatos inválidos y más de 191 caracteres', () => {
      expect(emailSchema.safeParse('no-es-correo').success).toBe(false);
      expect(emailSchema.safeParse(`${'a'.repeat(180)}@colegio.example`).success).toBe(false);
    });
  });

  describe('nombre', () => {
    it('recorta y colapsa espacios', () => {
      expect(fullNameSchema.parse('  Ana   María  Pérez ')).toBe('Ana María Pérez');
    });

    it('rechaza caracteres de control, menos de 3 y más de 120', () => {
      expect(fullNameSchema.safeParse('Ana\u0000Pérez').success).toBe(false);
      expect(fullNameSchema.safeParse('Ana\nPérez').success).toBe(false);
      expect(fullNameSchema.safeParse('  A  ').success).toBe(false);
      expect(fullNameSchema.safeParse('A'.repeat(121)).success).toBe(false);
    });
  });

  it('cuerpos estrictos: un campo desconocido es 400', () => {
    expect(updateUserSchema.safeParse({ fullName: 'Ana Pérez', role: 'ADMIN' }).success).toBe(
      false,
    );
    expect(
      createStudentSchema.safeParse({
        institutionalEmail: 'a@colegio.example',
        fullName: 'Ana Pérez',
        sectionId: ID,
        effectiveFrom: '2026-01-01',
      }).success,
    ).toBe(false);
  });

  it('PATCH exige al menos un campo', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
  });

  it('estado válido y motivo opcional de 1..500', () => {
    expect(changeStatusSchema.parse({ status: 'WITHDRAWN' })).toEqual({ status: 'WITHDRAWN' });
    expect(changeStatusSchema.safeParse({ status: 'DELETED' }).success).toBe(false);
    expect(changeStatusSchema.safeParse({ status: 'ACTIVE', reason: '' }).success).toBe(false);
    expect(transferSchema.safeParse({ sectionId: ID, reason: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });

  it('apoderado: 1..10 estudiantes sin repetir', () => {
    const base = { institutionalEmail: 'p@correo.example', fullName: 'Padre Ficticio' };
    expect(createGuardianSchema.safeParse({ ...base, studentIds: [] }).success).toBe(false);
    expect(createGuardianSchema.safeParse({ ...base, studentIds: [ID, ID] }).success).toBe(false);
    expect(createGuardianSchema.safeParse({ ...base, studentIds: [ID, ID2] }).success).toBe(true);
  });

  it('revocar exige motivo de 10..500', () => {
    expect(revokeLinkSchema.safeParse({}).success).toBe(false);
    expect(revokeLinkSchema.safeParse({ reason: 'corto' }).success).toBe(false);
    expect(revokeLinkSchema.safeParse({ reason: 'Cambio de tutor legal' }).success).toBe(true);
  });

  describe('búsqueda (RF-25)', () => {
    it('valores por defecto y conversión de la query', () => {
      expect(listUsersQuerySchema.parse({ role: 'STUDENT', gradeLevel: '3' })).toEqual({
        role: 'STUDENT',
        gradeLevel: 3,
        page: 1,
        pageSize: 20,
      });
    });

    it('pageSize 1..100, q 2..100 y parámetros desconocidos → 400', () => {
      expect(listUsersQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
      expect(listUsersQuerySchema.safeParse({ pageSize: '0' }).success).toBe(false);
      expect(listUsersQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
      expect(listUsersQuerySchema.safeParse({ foo: '1' }).success).toBe(false);
    });

    it('page 1..1000 → 400 fuera de rango', () => {
      expect(listUsersQuerySchema.safeParse({ page: '1000' }).success).toBe(true);
      expect(listUsersQuerySchema.safeParse({ page: '1001' }).success).toBe(false);
      expect(listUsersQuerySchema.safeParse({ page: '100000' }).success).toBe(false);
      expect(listUsersQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    });

    it('grado o sección solo con role=STUDENT', () => {
      expect(listUsersQuerySchema.safeParse({ role: 'TEACHER', gradeLevel: '3' }).success).toBe(
        false,
      );
      expect(listUsersQuerySchema.safeParse({ sectionId: ID }).success).toBe(false);
      expect(listUsersQuerySchema.safeParse({ role: 'STUDENT', sectionId: ID }).success).toBe(true);
    });

    it('includeRevoked como texto true/false', () => {
      expect(listLinksQuerySchema.parse({})).toEqual({ includeRevoked: false });
      expect(listLinksQuerySchema.parse({ includeRevoked: 'true' })).toEqual({
        includeRevoked: true,
      });
      expect(listLinksQuerySchema.safeParse({ includeRevoked: 'si' }).success).toBe(false);
    });
  });
});
