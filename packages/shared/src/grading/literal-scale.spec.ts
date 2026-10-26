import { describe, expect, it } from 'vitest';
import { GradingError } from './errors';
import {
  DEFAULT_LITERAL_SCALE,
  assertLiteralScale,
  toLiteral,
  validateLiteralScale,
  type LiteralScale,
} from './literal-scale';

const codes = (scale: LiteralScale) => validateLiteralScale(scale).map((issue) => issue.code);

describe('toLiteral', () => {
  it('RN-04: tabla por defecto en los bordes de cada tramo', () => {
    expect(toLiteral(0)).toBe('C');
    expect(toLiteral(10)).toBe('C');
    expect(toLiteral(11)).toBe('B');
    expect(toLiteral(13)).toBe('B');
    expect(toLiteral(14)).toBe('A');
    expect(toLiteral(17)).toBe('A');
    expect(toLiteral(18)).toBe('AD');
    expect(toLiteral(20)).toBe('AD');
  });

  it('RN-04: exige un promedio ya redondeado, entero 0..20', () => {
    for (const value of [13.5, 21, -1, NaN]) {
      expect(() => toLiteral(value)).toThrow(GradingError);
    }
  });

  it('RN-04: usa una tabla configurada', () => {
    const scale: LiteralScale = [
      { literal: 'Aprobado', min: 11, max: 20 },
      { literal: 'Desaprobado', min: 0, max: 10 },
    ];
    expect(toLiteral(11, scale)).toBe('Aprobado');
    expect(toLiteral(10, scale)).toBe('Desaprobado');
  });

  it('RN-04: rechaza una tabla inválida con INVALID_SCALE', () => {
    try {
      toLiteral(15, [{ literal: 'X', min: 0, max: 19 }]);
      expect.unreachable();
    } catch (error) {
      expect((error as GradingError).code).toBe('INVALID_SCALE');
      expect((error as GradingError).issues.map((i) => i.code)).toEqual(['NOT_TO_20']);
    }
  });
});

describe('validateLiteralScale', () => {
  it('RN-04: la tabla por defecto es válida, está congelada y es AD/A/B/C', () => {
    expect(validateLiteralScale(DEFAULT_LITERAL_SCALE)).toEqual([]);
    expect(Object.isFrozen(DEFAULT_LITERAL_SCALE)).toBe(true);
    expect(Object.isFrozen(DEFAULT_LITERAL_SCALE[0])).toBe(true);
    expect(DEFAULT_LITERAL_SCALE.map((b) => [b.literal, b.min, b.max])).toEqual([
      ['AD', 18, 20],
      ['A', 14, 17],
      ['B', 11, 13],
      ['C', 0, 10],
    ]);
  });

  it('RN-04: una tabla en desorden es válida y no se muta', () => {
    const scale = [
      { literal: 'B', min: 11, max: 13 },
      { literal: 'AD', min: 18, max: 20 },
      { literal: 'C', min: 0, max: 10 },
      { literal: 'A', min: 14, max: 17 },
    ];
    const copy = JSON.parse(JSON.stringify(scale));
    expect(validateLiteralScale(scale)).toEqual([]);
    expect(scale).toEqual(copy);
    expect(toLiteral(12, scale)).toBe('B');
  });

  it('RN-04: detecta tabla vacía', () => {
    expect(codes([])).toEqual(['EMPTY']);
  });

  it('RN-04: detecta huecos (GAP)', () => {
    expect(
      codes([
        { literal: 'A', min: 12, max: 20 },
        { literal: 'C', min: 0, max: 10 },
      ]),
    ).toEqual(['GAP']);
  });

  it('RN-04: detecta cruces (OVERLAP)', () => {
    expect(
      codes([
        { literal: 'A', min: 10, max: 20 },
        { literal: 'C', min: 0, max: 10 },
      ]),
    ).toEqual(['OVERLAP']);
  });

  it('RN-04: detecta que no empiece en 0 ni termine en 20', () => {
    expect(codes([{ literal: 'A', min: 1, max: 20 }])).toEqual(['NOT_FROM_0']);
    expect(codes([{ literal: 'A', min: 0, max: 19 }])).toEqual(['NOT_TO_20']);
  });

  it('RN-04: detecta literales repetidos sin importar mayúsculas ni espacios', () => {
    expect(
      codes([
        { literal: 'A', min: 11, max: 20 },
        { literal: ' a ', min: 0, max: 10 },
      ]),
    ).toEqual(['DUPLICATE_LITERAL']);
  });

  it('RN-04: detecta literal vacío, no enteros, fuera de rango y min > max', () => {
    expect(codes([{ literal: '  ', min: 0, max: 20 }])).toEqual(['EMPTY_LITERAL']);
    expect(codes([{ literal: 'A', min: 0, max: 20.5 }])).toEqual(['NOT_INTEGER']);
    expect(codes([{ literal: 'A', min: -1, max: 20 }])).toEqual(['OUT_OF_RANGE']);
    expect(codes([{ literal: 'A', min: 0, max: 21 }])).toEqual(['OUT_OF_RANGE']);
    expect(codes([{ literal: 'A', min: 15, max: 5 }])).toEqual(['MIN_GT_MAX']);
  });

  it('RN-04: assertLiteralScale lanza INVALID_SCALE con la lista de problemas', () => {
    expect(() => assertLiteralScale(DEFAULT_LITERAL_SCALE)).not.toThrow();
    expect(() => assertLiteralScale([])).toThrow(GradingError);
  });
});

describe('toLiteral: tabla por defecto completa', () => {
  it('QA-020 / RN-04: cada entero 0..20 cae en su tramo, incluidos 10/11, 13/14 y 17/18', () => {
    const expected: Record<number, string> = {};
    for (let n = 0; n <= 10; n++) expected[n] = 'C';
    for (let n = 11; n <= 13; n++) expected[n] = 'B';
    for (let n = 14; n <= 17; n++) expected[n] = 'A';
    for (let n = 18; n <= 20; n++) expected[n] = 'AD';
    for (let n = 0; n <= 20; n++) expect(toLiteral(n), String(n)).toBe(expected[n]);
  });

  it('RN-04: rechaza -0.5, 20.5, Infinity, 21 y valores no numéricos', () => {
    for (const value of [-0.5, 20.5, Infinity, -Infinity, 21, -1, 10.5, '10', null, undefined]) {
      expect(() => toLiteral(value as number), String(value)).toThrow(GradingError);
    }
  });

  it('RN-04: -0 se trata como 0', () => {
    expect(toLiteral(-0)).toBe('C');
  });

  it('RN-04: toLiteral no muta la tabla pasada ni la por defecto', () => {
    const scale = [
      { literal: 'Alto', min: 11, max: 20 },
      { literal: 'Bajo', min: 0, max: 10 },
    ];
    const snapshot = JSON.stringify(scale);
    toLiteral(15, scale);
    expect(JSON.stringify(scale)).toBe(snapshot);
    toLiteral(15);
    expect(DEFAULT_LITERAL_SCALE.map((b) => b.literal)).toEqual(['AD', 'A', 'B', 'C']);
  });

  it('RN-04: tabla de un solo tramo 0..20 es válida y todo cae en él', () => {
    const scale: LiteralScale = [{ literal: 'Unico', min: 0, max: 20 }];
    expect(validateLiteralScale(scale)).toEqual([]);
    for (let n = 0; n <= 20; n++) expect(toLiteral(n, scale)).toBe('Unico');
  });

  it('RN-04: tabla personalizada en desorden con un tramo de un solo valor', () => {
    const scale: LiteralScale = [
      { literal: 'Sobresaliente', min: 20, max: 20 },
      { literal: 'Medio', min: 6, max: 19 },
      { literal: 'Bajo', min: 0, max: 5 },
    ];
    expect(validateLiteralScale(scale)).toEqual([]);
    expect(toLiteral(20, scale)).toBe('Sobresaliente');
    expect(toLiteral(19, scale)).toBe('Medio');
    expect(toLiteral(6, scale)).toBe('Medio');
    expect(toLiteral(5, scale)).toBe('Bajo');
    expect(toLiteral(0, scale)).toBe('Bajo');
  });
});

describe('validateLiteralScale: casos adicionales', () => {
  it('RN-04: detecta tramos anidados (OVERLAP) en cualquier orden', () => {
    expect(
      codes([
        { literal: 'A', min: 0, max: 20 },
        { literal: 'B', min: 5, max: 10 },
      ]),
    ).toEqual(['OVERLAP']);
    expect(
      codes([
        { literal: 'B', min: 5, max: 10 },
        { literal: 'A', min: 0, max: 20 },
      ]),
    ).toEqual(['OVERLAP']);
  });

  it('RN-04: un tramo anidado no oculta un hueco posterior', () => {
    expect(
      codes([
        { literal: 'A', min: 0, max: 10 },
        { literal: 'B', min: 2, max: 4 },
        { literal: 'C', min: 15, max: 20 },
      ]),
    ).toEqual(['OVERLAP', 'GAP']);
  });

  it('RN-04: tramos idénticos son OVERLAP', () => {
    expect(
      codes([
        { literal: 'A', min: 0, max: 20 },
        { literal: 'B', min: 0, max: 20 },
      ]),
    ).toEqual(['OVERLAP']);
  });

  it('RN-04: literales duplicados por mayúsculas o espacios, con cobertura correcta', () => {
    expect(
      codes([
        { literal: 'ad', min: 11, max: 20 },
        { literal: 'AD', min: 0, max: 10 },
      ]),
    ).toEqual(['DUPLICATE_LITERAL']);
    expect(
      codes([
        { literal: ' Bien', min: 11, max: 20 },
        { literal: 'bien ', min: 0, max: 10 },
      ]),
    ).toEqual(['DUPLICATE_LITERAL']);
  });

  it('RN-04: el problema indica el índice del tramo en la entrada original', () => {
    const issues = validateLiteralScale([
      { literal: 'A', min: 11, max: 20 },
      { literal: 'a', min: 0, max: 10 },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].index).toBe(1);
  });

  it('RN-04: tramos nulos o con campos faltantes no rompen la validación', () => {
    const bad = [null, {}, { literal: 'A' }, { min: 0, max: 20 }] as unknown as LiteralScale;
    expect(() => validateLiteralScale(bad)).not.toThrow();
    expect(codes(bad)).toContain('EMPTY_LITERAL');
    expect(codes(bad)).toContain('NOT_INTEGER');
    expect(codes('x' as unknown as LiteralScale)).toEqual(['EMPTY']);
  });

  it('RN-04: min y max NaN o como texto son NOT_INTEGER', () => {
    expect(codes([{ literal: 'A', min: NaN, max: 20 }])).toEqual(['NOT_INTEGER']);
    expect(codes([{ literal: 'A', min: '0', max: 20 }] as unknown as LiteralScale)).toEqual([
      'NOT_INTEGER',
    ]);
  });

  it('RN-04: la cobertura no se revisa si algún tramo es inválido', () => {
    expect(
      codes([
        { literal: 'A', min: 0, max: 21 },
        { literal: 'B', min: 30, max: 40 },
      ]),
    ).toEqual(['OUT_OF_RANGE', 'OUT_OF_RANGE']);
  });

  it('RN-04: un hueco y un final antes de 20 se reportan juntos', () => {
    expect(
      codes([
        { literal: 'A', min: 0, max: 5 },
        { literal: 'B', min: 8, max: 12 },
      ]),
    ).toEqual(['GAP', 'NOT_TO_20']);
  });

  it('RN-04: validar y asertar no mutan una entrada congelada', () => {
    const scale = Object.freeze([
      Object.freeze({ literal: 'B', min: 11, max: 20 }),
      Object.freeze({ literal: 'A', min: 5, max: 12 }),
      Object.freeze({ literal: 'C', min: 0, max: 4 }),
    ]);
    const snapshot = JSON.stringify(scale);
    expect(() => validateLiteralScale(scale)).not.toThrow();
    expect(() => assertLiteralScale(scale)).toThrow(GradingError);
    expect(JSON.stringify(scale)).toBe(snapshot);
  });

  it('RN-04: assertLiteralScale informa code INVALID_SCALE e issues', () => {
    try {
      assertLiteralScale([{ literal: 'A', min: 0, max: 10 }]);
      expect.unreachable();
    } catch (error) {
      expect((error as GradingError).code).toBe('INVALID_SCALE');
      expect((error as GradingError).issues.map((i) => i.code)).toEqual(['NOT_TO_20']);
    }
  });
});
