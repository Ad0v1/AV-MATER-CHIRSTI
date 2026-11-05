import {
  changeStatusSchema,
  correctDniSchema,
  createGuardianSchema,
  createStudentSchema,
  createTeacherSchema,
  dniSchema,
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

    it('rechaza nombres que empiezan por = + - @ (inyección de fórmulas, RF-21)', () => {
      for (const name of ['=1+1 Ana', '+Ana Pérez', '-Ana Pérez', '@Ana Pérez', '  =Ana Pérez']) {
        expect(fullNameSchema.safeParse(name).success).toBe(false);
      }
      expect(fullNameSchema.parse('Ana-María Pérez')).toBe('Ana-María Pérez');
      expect(fullNameSchema.parse("María O'Neill")).toBe("María O'Neill");
    });
  });

  const dni = { dni: '45678901', dniConfirm: '45678901' };
  const guardian = { dni: '11111111', dniConfirm: '11111111', fullName: 'Madre Ficticia' };
  const student = { fullName: 'Ana Pérez', sectionId: ID, ...dni, guardians: [guardian] };

  it('cuerpos estrictos: un campo desconocido es 400', () => {
    expect(updateUserSchema.safeParse({ fullName: 'Ana Pérez', role: 'ADMIN' }).success).toBe(
      false,
    );
    expect(createStudentSchema.safeParse(student).success).toBe(true);
    expect(createStudentSchema.safeParse({ ...student, effectiveFrom: '2026-01-01' }).success).toBe(
      false,
    );
  });

  describe('DNI (RF-69)', () => {
    it('exige 8 dígitos', () => {
      expect(dniSchema.parse(' 45678901 ')).toBe('45678901');
      for (const bad of ['1234567', '123456789', '1234567a', '', '12 345678']) {
        expect(dniSchema.safeParse(bad).success).toBe(false);
      }
    });

    it('se escribe dos veces y los dos deben coincidir (alumno, docente y apoderado)', () => {
      const wrong = { dni: '45678901', dniConfirm: '45678902' };
      expect(createStudentSchema.safeParse({ ...student, ...wrong }).success).toBe(false);
      expect(createTeacherSchema.safeParse({ fullName: 'Docente Uno', ...wrong }).success).toBe(
        false,
      );
      expect(createTeacherSchema.safeParse({ fullName: 'Docente Uno', ...dni }).success).toBe(true);
      expect(
        createGuardianSchema.safeParse({ fullName: 'Padre Uno', ...wrong, studentIds: [ID] })
          .success,
      ).toBe(false);
    });

    it('el correo del colegio ya no es obligatorio', () => {
      expect(createTeacherSchema.safeParse({ fullName: 'Docente Uno', ...dni }).success).toBe(true);
      expect(
        createTeacherSchema.safeParse({
          fullName: 'Docente Uno',
          institutionalEmail: 'doc@colegio.example',
          ...dni,
        }).success,
      ).toBe(true);
    });

    it('corregir el DNI exige confirmación y un motivo de 10 a 500 caracteres', () => {
      const ok = { ...dni, reason: 'Error de digitación al registrar' };
      expect(correctDniSchema.safeParse(ok).success).toBe(true);
      expect(correctDniSchema.safeParse({ ...ok, reason: 'corto' }).success).toBe(false);
      expect(correctDniSchema.safeParse({ ...ok, dniConfirm: '00000000' }).success).toBe(false);
    });
  });

  describe('alumno y apoderados (RF-18, RF-86)', () => {
    it('exige de 1 a 2 apoderados', () => {
      expect(createStudentSchema.safeParse({ ...student, guardians: [] }).success).toBe(false);
      const second = { dni: '22222222', dniConfirm: '22222222' };
      expect(
        createStudentSchema.safeParse({ ...student, guardians: [guardian, second] }).success,
      ).toBe(true);
      const third = { dni: '33333333', dniConfirm: '33333333' };
      expect(
        createStudentSchema.safeParse({ ...student, guardians: [guardian, second, third] }).success,
      ).toBe(false);
    });

    it('el DNI de cada apoderado también se escribe dos veces', () => {
      expect(
        createStudentSchema.safeParse({
          ...student,
          guardians: [{ ...guardian, dniConfirm: '99999999' }],
        }).success,
      ).toBe(false);
    });

    it('el alumno y sus apoderados deben tener DNI distintos', () => {
      expect(
        createStudentSchema.safeParse({ ...student, guardians: [{ ...guardian, ...dni }] }).success,
      ).toBe(false);
      const same = { dni: '11111111', dniConfirm: '11111111' };
      expect(
        createStudentSchema.safeParse({ ...student, guardians: [guardian, same] }).success,
      ).toBe(false);
    });

    it('el nombre del apoderado es opcional (si ya existe, se reutiliza)', () => {
      expect(
        createStudentSchema.safeParse({
          ...student,
          guardians: [{ dni: '11111111', dniConfirm: '11111111' }],
        }).success,
      ).toBe(true);
    });
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
    const base = { institutionalEmail: 'p@correo.example', fullName: 'Padre Ficticio', ...dni };
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
