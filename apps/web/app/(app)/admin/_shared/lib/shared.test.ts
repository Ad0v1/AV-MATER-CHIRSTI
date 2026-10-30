import { describe, expect, it } from 'vitest';
import { IDLE } from './action-state';
import { formatInstant, sectionLabel } from './format';
import { PAGE_TITLE_ID, pickFocusTarget } from './focus';
import { isStrictBoolean, isUuid, reasonCounter, reasonLength, validateReason } from './validation';

const U = '00000000-0000-4000-8000-000000000001';

describe('QA 5b: _shared/lib (común a estructura y usuarios)', () => {
  it('isUuid: acepta mayúsculas; rechaza espacios, llaves, vacío y no cadenas', () => {
    expect(isUuid(U)).toBe(true);
    expect(isUuid(U.toUpperCase())).toBe(true);
    for (const bad of [` ${U}`, `${U}\n`, `{${U}}`, '', 'abc', null, undefined, 5, {}]) {
      expect(isUuid(bad)).toBe(false);
    }
  });

  it('isStrictBoolean solo acepta booleanos', () => {
    expect(isStrictBoolean(true)).toBe(true);
    expect(isStrictBoolean(false)).toBe(true);
    for (const bad of ['true', 1, 0, null, undefined, {}]) expect(isStrictBoolean(bad)).toBe(false);
  });

  it('reasonLength y validateReason cuentan tras trim', () => {
    expect(reasonLength('  ab  ')).toBe(2);
    const req = { required: true, min: 10, max: 500 };
    expect(validateReason('', req)).toMatch(/mínimo 10/);
    expect(validateReason('123456789', req)).toMatch(/al menos 10/);
    expect(validateReason('1234567890', req)).toBeNull();
    expect(validateReason('x'.repeat(501), req)).toMatch(/500/);
  });

  it('reasonCounter muestra el mínimo solo si es obligatorio', () => {
    expect(reasonCounter(' abc ', { required: true, min: 10, max: 500 })).toBe(
      '3 de 500 caracteres (mínimo 10)',
    );
    expect(reasonCounter('', { required: false, min: 1, max: 500 })).toBe('0 de 500 caracteres');
  });

  it('pickFocusTarget: primer existente; si no, el título; si tampoco, null', () => {
    expect(pickFocusTarget(['a', 'b'], (id) => id === 'b')).toBe('b');
    expect(pickFocusTarget([undefined, null, 'x'], (id) => id === PAGE_TITLE_ID)).toBe(
      PAGE_TITLE_ID,
    );
    expect(pickFocusTarget(['x'], () => false)).toBeNull();
    expect(pickFocusTarget([], () => true)).toBe(PAGE_TITLE_ID);
  });

  it('sectionLabel y formatInstant (vacío si inválido)', () => {
    expect(sectionLabel(3, 'A')).toBe('3.º A');
    expect(formatInstant(null)).toBe('');
    expect(formatInstant('no es fecha')).toBe('');
    expect(formatInstant('2026-03-01T05:00:00.000Z')).toMatch(/2026/);
  });

  it('IDLE es el estado inicial de las acciones', () => {
    expect(IDLE).toEqual({ status: 'idle' });
  });
});
