import { uuidv7 } from './uuid-v7.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7 (RFC 9562)', () => {
  it('tiene versión 7, variante 10xx y es válido para z.uuid()', () => {
    for (let i = 0; i < 100; i++) expect(uuidv7()).toMatch(UUID_V7);
  });

  it('codifica los milisegundos en los primeros 48 bits', () => {
    const ms = Date.UTC(2026, 9, 27, 12, 0, 0);
    const id = uuidv7(ms, Buffer.alloc(10, 0));
    expect(parseInt(id.slice(0, 8) + id.slice(9, 13), 16)).toBe(ms);
    expect(id).toBe(
      `${ms
        .toString(16)
        .padStart(12, '0')
        .replace(/^(.{8})/, '$1-')}-7000-8000-000000000000`,
    );
  });

  it('aplica versión y variante aunque los bytes aleatorios sean 0xff', () => {
    expect(uuidv7(0, Buffer.alloc(10, 0xff))).toBe('00000000-0000-7fff-bfff-ffffffffffff');
  });

  it('se ordena por tiempo y no se repite', () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(a < b).toBe(true);
    const ids = new Set(Array.from({ length: 5000 }, () => uuidv7()));
    expect(ids.size).toBe(5000);
  });

  it('rechaza marcas de tiempo fuera de rango y pocos bytes aleatorios', () => {
    expect(() => uuidv7(-1)).toThrow(RangeError);
    expect(() => uuidv7(2 ** 48)).toThrow(RangeError);
    expect(() => uuidv7(0, Buffer.alloc(9))).toThrow(RangeError);
  });
});
