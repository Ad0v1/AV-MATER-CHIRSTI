import { ConflictException, NotFoundException } from '@nestjs/common';
import { isDeadlock, mapPrismaError } from './academic.errors.js';
import { diffFields, fromDateOnly, hasChanges, marker, toDateOnly } from './academic.mappers.js';

describe('diffFields (D-024)', () => {
  it('RNF-14: devuelve solo los campos que cambiaron', () => {
    const diff = diffFields(
      { code: 'A', isActive: true, gradeLevel: 3 },
      { code: 'B', isActive: true },
    );
    expect(diff).toEqual({ before: { code: 'A' }, after: { code: 'B' } });
    expect(hasChanges(diff)).toBe(true);
  });

  it('RNF-14: ignora los campos no enviados (undefined)', () => {
    const diff = diffFields({ code: 'A', isActive: true }, { code: undefined, isActive: true });
    expect(diff).toEqual({ before: {}, after: {} });
    expect(hasChanges(diff)).toBe(false);
  });

  it('RNF-14: compara fechas por valor y las serializa en ISO', () => {
    const same = diffFields(
      { closedAt: new Date('2026-05-05T00:00:00Z') },
      { closedAt: new Date('2026-05-05T00:00:00Z') },
    );
    expect(hasChanges(same)).toBe(false);

    const changed = diffFields({ closedAt: null }, { closedAt: new Date('2026-05-05T00:00:00Z') });
    expect(changed).toEqual({
      before: { closedAt: null },
      after: { closedAt: '2026-05-05T00:00:00.000Z' },
    });
  });

  it('RNF-14: registra null como valor nuevo (quitar docente)', () => {
    expect(diffFields({ teacherId: 'u1' }, { teacherId: null })).toEqual({
      before: { teacherId: 'u1' },
      after: { teacherId: null },
    });
  });
});

describe('mappers', () => {
  it('convierte fechas solo-día sin depender de la zona horaria', () => {
    expect(toDateOnly(fromDateOnly('2026-03-01'))).toBe('2026-03-01');
    expect(fromDateOnly('2026-03-01').toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('RN-11: el marcador TRUE/NULL se expone como boolean', () => {
    expect(marker(true)).toBe(true);
    expect(marker(null)).toBe(false);
    expect(marker(undefined)).toBe(false);
  });
});

describe('mapPrismaError', () => {
  it('P2002 y P2003 → 409; P2025 → 404', () => {
    expect(() => mapPrismaError({ code: 'P2002' }, 'duplicado')).toThrow(ConflictException);
    expect(() => mapPrismaError({ code: 'P2003' })).toThrow(ConflictException);
    expect(() => mapPrismaError({ code: 'P2025' })).toThrow(NotFoundException);
  });

  it('relanza cualquier otro error', () => {
    const error = new Error('boom');
    expect(() => mapPrismaError(error)).toThrow(error);
  });

  it('deadlock de MySQL (1213) → 409: P2034, P2010 de $queryRaw y errno del driver', () => {
    const raw1213 = {
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '1213', kind: 'mysql' } } },
    };
    const rawConflict = {
      code: 'P2010',
      meta: { driverAdapterError: { cause: { kind: 'TransactionWriteConflict' } } },
    };
    expect(() => mapPrismaError({ code: 'P2034' })).toThrow(ConflictException);
    expect(() => mapPrismaError(raw1213)).toThrow(ConflictException);
    expect(() => mapPrismaError(rawConflict)).toThrow(ConflictException);
    expect(() => mapPrismaError({ errno: 1213 })).toThrow(ConflictException);
    expect(isDeadlock({ code: 'P2010', meta: {} })).toBe(false);
  });

  it('P2010 que no es deadlock se relanza tal cual', () => {
    const other = {
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '1064', kind: 'mysql' } } },
    };
    let thrown: unknown;
    try {
      mapPrismaError(other);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBe(other);
  });
});
