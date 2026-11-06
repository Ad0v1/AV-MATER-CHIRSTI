import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { parseInstitutionDomain } from './institution-domain.js';
import {
  assertEmailDomain,
  assertStatusChangeAllowed,
  buildUserSearchWhere,
  checkEmailDomain,
  closeInstant,
  normalizeEmail,
} from './users-policy.js';

describe('users-policy', () => {
  it('normalizeEmail quita espacios y pasa a minúsculas', () => {
    expect(normalizeEmail('  Ana.Perez@Colegio.EXAMPLE ')).toBe('ana.perez@colegio.example');
  });

  describe('checkEmailDomain (Decisión 4.3)', () => {
    it('sin dominio configurado no valida', () => {
      expect(checkEmailDomain('x@otro.example', 'STUDENT', null)).toBe(true);
    });

    it('exige el dominio exacto para STUDENT, TEACHER y ADMIN', () => {
      for (const role of ['STUDENT', 'TEACHER', 'ADMIN'] as const) {
        expect(checkEmailDomain('a@colegio.example', role, 'colegio.example')).toBe(true);
        expect(checkEmailDomain('a@otro.example', role, 'colegio.example')).toBe(false);
        // Un subdominio o un sufijo parecido no cuentan.
        expect(checkEmailDomain('a@xcolegio.example', role, 'colegio.example')).toBe(false);
      }
    });

    it('GUARDIAN está exento hasta D-013', () => {
      expect(checkEmailDomain('papa@gmail.example', 'GUARDIAN', 'colegio.example')).toBe(true);
    });

    it('assertEmailDomain responde 422', () => {
      expect(() => assertEmailDomain('a@otro.example', 'TEACHER', 'colegio.example')).toThrow(
        UnprocessableEntityException,
      );
    });

    it('parseInstitutionDomain normaliza la variable y devuelve null si falta', () => {
      expect(parseInstitutionDomain(' @Colegio.Example ')).toBe('colegio.example');
      expect(parseInstitutionDomain('')).toBeNull();
      expect(parseInstitutionDomain('   ')).toBeNull();
      expect(parseInstitutionDomain(undefined)).toBeNull();
    });
  });

  describe('closeInstant (Decisión 4.5)', () => {
    const from = new Date('2026-06-15T10:00:00.000Z');

    it('usa la hora del servidor si es posterior al inicio', () => {
      const now = new Date('2026-10-26T12:00:00.000Z');
      expect(closeInstant(now, from)).toEqual(now);
    });

    it('nunca devuelve un instante anterior al inicio', () => {
      const now = new Date('2026-06-15T09:59:59.000Z');
      expect(closeInstant(now, from)).toEqual(from);
    });
  });

  describe('assertStatusChangeAllowed (Decisión 4.2)', () => {
    const admin = { id: 'adm2', role: 'ADMIN' as const, status: 'ACTIVE' as const };

    it('409 si el ADMIN cambia su propio estado', () => {
      expect(() =>
        assertStatusChangeAllowed({
          actorId: 'adm2',
          target: admin,
          status: 'INACTIVE',
          otherActiveAdmins: 3,
        }),
      ).toThrow(ConflictException);
    });

    it('409 si deja el sistema sin ADMIN activo', () => {
      expect(() =>
        assertStatusChangeAllowed({
          actorId: 'adm1',
          target: admin,
          status: 'WITHDRAWN',
          otherActiveAdmins: 0,
        }),
      ).toThrow(ConflictException);
    });

    it('permite desactivar un ADMIN si queda otro activo', () => {
      expect(() =>
        assertStatusChangeAllowed({
          actorId: 'adm1',
          target: admin,
          status: 'INACTIVE',
          otherActiveAdmins: 1,
        }),
      ).not.toThrow();
    });

    it('reactivar un ADMIN o cambiar a un no ADMIN no depende del conteo', () => {
      expect(() =>
        assertStatusChangeAllowed({
          actorId: 'adm1',
          target: { ...admin, status: 'INACTIVE' },
          status: 'ACTIVE',
          otherActiveAdmins: 0,
        }),
      ).not.toThrow();
      expect(() =>
        assertStatusChangeAllowed({
          actorId: 'adm1',
          target: { id: 'e1', role: 'STUDENT', status: 'ACTIVE' },
          status: 'WITHDRAWN',
          otherActiveAdmins: 0,
        }),
      ).not.toThrow();
    });
  });

  describe('buildUserSearchWhere (RF-25)', () => {
    it('sin filtros devuelve un where vacío', () => {
      expect(buildUserSearchWhere({}, 'y1')).toEqual({});
    });

    it('rol, estado e ids del texto', () => {
      expect(buildUserSearchWhere({ role: 'TEACHER', status: 'ACTIVE' }, 'y1', ['a', 'b'])).toEqual(
        { role: 'TEACHER', status: 'ACTIVE', id: { in: ['a', 'b'] } },
      );
    });

    it('grado y sección sobre la matrícula vigente del año', () => {
      expect(
        buildUserSearchWhere({ role: 'STUDENT', gradeLevel: 3, sectionId: 's1' }, 'y1'),
      ).toEqual({
        role: 'STUDENT',
        enrollments: {
          some: {
            academicYearId: 'y1',
            isCurrent: true,
            sectionId: 's1',
            section: { gradeLevel: 3 },
          },
        },
      });
    });

    it('grado sin año activo no devuelve resultados', () => {
      expect(buildUserSearchWhere({ role: 'STUDENT', gradeLevel: 3 }, null)).toEqual({
        role: 'STUDENT',
        id: { in: [] },
      });
    });
  });

  describe('filtros de credenciales (RF-87)', () => {
    it('NONE busca usuarios sin contraseña', () => {
      expect(buildUserSearchWhere({ credentials: 'NONE' }, null)).toEqual({
        localCredential: { is: null },
      });
    });

    it('PENDING y READY separan a quien aún no cambió la contraseña inicial', () => {
      expect(buildUserSearchWhere({ credentials: 'PENDING' }, null)).toEqual({
        localCredential: { is: { mustChangePassword: true } },
      });
      expect(buildUserSearchWhere({ credentials: 'READY' }, null)).toEqual({
        localCredential: { is: { mustChangePassword: false } },
      });
    });

    it('emailVerified filtra por correo verificado o sin verificar', () => {
      expect(buildUserSearchWhere({ emailVerified: 'true' }, null)).toEqual({
        emailVerifiedAt: { not: null },
      });
      expect(buildUserSearchWhere({ emailVerified: 'false' }, null)).toEqual({
        emailVerifiedAt: null,
      });
    });
  });
});
