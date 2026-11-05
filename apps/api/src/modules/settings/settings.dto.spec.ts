import { BadRequestException } from '@nestjs/common';
import { DEFAULT_LITERAL_SCALE } from '@aula/shared';
import { describe, expect, it } from 'vitest';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { assertValidScale, sortScale, updateSettingsSchema } from './settings.dto.js';

const pipe = new ZodValidationPipe(updateSettingsSchema);
const valid = {
  name: '  I.E. Mater Christi  ',
  literalScale: [
    { literal: 'c', min: 0, max: 10 },
    { literal: ' ad ', min: 18, max: 20 },
    { literal: 'B', min: 11, max: 13 },
    { literal: 'A', min: 14, max: 17 },
  ],
  purgeAfterDays: 60,
};

const detailsOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
      message: { path: string; message: string }[];
    };
  }
  throw new Error('no lanzó');
};

describe('updateSettingsSchema (RF-61)', () => {
  it('recorta el nombre y pasa los literales a mayúsculas', () => {
    const dto = pipe.transform(valid);
    expect(dto.name).toBe('I.E. Mater Christi');
    expect(dto.literalScale.map((b) => b.literal)).toEqual(['C', 'AD', 'B', 'A']);
  });

  it('purgeAfterDays entre 1 y 3650, entero', () => {
    for (const purgeAfterDays of [1, 3650]) {
      expect(pipe.transform({ ...valid, purgeAfterDays }).purgeAfterDays).toBe(purgeAfterDays);
    }
    for (const purgeAfterDays of [0, 3651, 1.5, '60', null]) {
      const r = detailsOf(() => pipe.transform({ ...valid, purgeAfterDays }));
      expect(r.message[0].path).toBe('purgeAfterDays');
    }
  });

  it('rechaza campos extra, campos faltantes y nombres con control o fuera de rango', () => {
    expect(detailsOf(() => pipe.transform({ ...valid, logoObjectKey: 'x' })).message).toHaveLength(
      1,
    );
    expect(detailsOf(() => pipe.transform({ name: 'Colegio' })).message.length).toBeGreaterThan(0);
    for (const name of ['ab', 'x'.repeat(151), 'Colegio\u0000', 'Mater\nChristi']) {
      expect(detailsOf(() => pipe.transform({ ...valid, name })).message[0].path).toBe('name');
    }
  });

  it('rechaza tramos con literales raros, decimales, fuera de 0..20 o más de 10 tramos', () => {
    const bad = [
      [{ literal: '<b>', min: 0, max: 20 }],
      [{ literal: 'ABCDE', min: 0, max: 20 }],
      [{ literal: '', min: 0, max: 20 }],
      [{ literal: 'A', min: 0.5, max: 20 }],
      [{ literal: 'A', min: -1, max: 20 }],
      [{ literal: 'A', min: 0, max: 21 }],
      [{ literal: 'A', min: 0, max: 20, extra: true }],
      [],
      Array.from({ length: 11 }, (_, i) => ({ literal: `L${i}`, min: i, max: i })),
    ];
    for (const literalScale of bad) {
      const r = detailsOf(() => pipe.transform({ ...valid, literalScale }));
      expect(r.message[0].path.startsWith('literalScale')).toBe(true);
    }
  });
});

describe('assertValidScale (RN-04, motor de Dev 4)', () => {
  it('acepta la tabla por defecto y una tabla de dos tramos', () => {
    expect(() => assertValidScale(DEFAULT_LITERAL_SCALE)).not.toThrow();
    expect(() =>
      assertValidScale([
        { literal: 'AP', min: 11, max: 20 },
        { literal: 'DE', min: 0, max: 10 },
      ]),
    ).not.toThrow();
  });

  it('traduce huecos, cruces y repetidos a 400 con details por tramo', () => {
    const gap = detailsOf(() =>
      assertValidScale([
        { literal: 'A', min: 12, max: 20 },
        { literal: 'C', min: 0, max: 10 },
      ]),
    );
    expect(gap.message).toEqual([
      { path: 'literalScale', message: expect.stringContaining('hueco') },
    ]);
    const dup = detailsOf(() =>
      assertValidScale([
        { literal: 'A', min: 11, max: 20 },
        { literal: 'A', min: 0, max: 10 },
      ]),
    );
    expect(dup.message[0].path).toBe('literalScale.1');
    const notTo20 = detailsOf(() => assertValidScale([{ literal: 'A', min: 0, max: 19 }]));
    expect(notTo20.message[0].message).toContain('20');
  });

  it('sortScale ordena de mayor a menor sin mutar la entrada', () => {
    const input = [...DEFAULT_LITERAL_SCALE].reverse();
    expect(sortScale(input).map((b) => b.literal)).toEqual(['AD', 'A', 'B', 'C']);
    expect(input[0].literal).toBe('C');
  });
});
