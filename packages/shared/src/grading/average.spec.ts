import { describe, expect, it } from 'vitest';
import { calculateAverage, type GradeEntry } from './average';
import { GradingError } from './errors';
import { toLiteral } from './literal-scale';

const graded = (value: string | number): GradeEntry => ({ state: 'GRADED', value });

function roundedOf(entries: GradeEntry[]): number {
  const result = calculateAverage(entries);
  if (result.status !== 'OK') throw new Error('se esperaba status OK');
  return result.rounded;
}

describe('calculateAverage', () => {
  it('RN-02: promedio simple sin ponderación', () => {
    const result = calculateAverage([graded('10'), graded('20'), graded('15')]);
    expect(result).toEqual({ status: 'OK', rounded: 15, sumCents: 4500, counted: 3, exempt: 0 });
  });

  it('RN-03: .5 se redondea hacia arriba y menos de .5 hacia abajo', () => {
    expect(roundedOf([graded('13.50')])).toBe(14);
    expect(roundedOf([graded('13.40')])).toBe(13);
    expect(roundedOf([graded('17.50')])).toBe(18);
    expect(roundedOf([graded('17.49')])).toBe(17);
  });

  it('RN-03: redondea una sola vez, no cada nota por separado', () => {
    // 12.50 y 12.40 → 12.45 → 12 (redondeando cada nota daría 13).
    expect(roundedOf([graded('12.50'), graded('12.40')])).toBe(12);
  });

  it('RN-03: suma exacta en centésimas, sin error de coma flotante', () => {
    const result = calculateAverage([graded('0.10'), graded('0.20')]);
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.sumCents).toBe(30);
      expect(result.rounded).toBe(0);
    }
  });

  it('RN-05: NE cuenta en el promedio con su valor', () => {
    expect(roundedOf([graded('20'), { state: 'NE', value: '0' }])).toBe(10);
    expect(roundedOf([graded('20'), { state: 'NE', value: '10' }])).toBe(15);
  });

  it('RN-06: una entrega tardía se promedia sin descuento automático', () => {
    // GradeEntry no tiene isLate: un campo extra no altera el cálculo.
    const late = { state: 'GRADED', value: '18', isLate: true } as GradeEntry;
    expect(roundedOf([late])).toBe(18);
    expect(roundedOf([late, graded('18')])).toBe(18);
  });

  it('RN-07: la exoneración no cuenta en el promedio', () => {
    const result = calculateAverage([graded('20'), { state: 'EXEMPT' }]);
    expect(result).toEqual({ status: 'OK', rounded: 20, sumCents: 2000, counted: 1, exempt: 1 });
  });

  it('RN-07: sin notas o todo exonerado devuelve NO_GRADES, nunca 0', () => {
    expect(calculateAverage([])).toEqual({ status: 'NO_GRADES', counted: 0, exempt: 0 });
    expect(calculateAverage([{ state: 'EXEMPT' }, { state: 'EXEMPT' }])).toEqual({
      status: 'NO_GRADES',
      counted: 0,
      exempt: 2,
    });
  });

  it('RN-01: una nota inválida lanza INVALID_GRADE', () => {
    expect(() => calculateAverage([graded('21')])).toThrow(GradingError);
  });

  it('RN-02: un estado desconocido lanza INVALID_STATE', () => {
    try {
      calculateAverage([{ state: 'LATE', value: '10' } as unknown as GradeEntry]);
      expect.unreachable();
    } catch (error) {
      expect((error as GradingError).code).toBe('INVALID_STATE');
    }
  });

  it('RN-02: no muta la entrada', () => {
    const entries = Object.freeze([graded('10'), Object.freeze({ state: 'EXEMPT' } as const)]);
    const copy = JSON.parse(JSON.stringify(entries));
    calculateAverage(entries);
    expect(entries).toEqual(copy);
  });
});

const exempt: GradeEntry = { state: 'EXEMPT' };
const ne = (value: string | number): GradeEntry => ({ state: 'NE', value });

/** Generador pseudoaleatorio determinista (LCG) para no depender de Math.random. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomEntries(rand: () => number, size: number): GradeEntry[] {
  return Array.from({ length: size }, () => {
    const cents = Math.floor(rand() * 2001);
    const value = (cents / 100).toFixed(2);
    return rand() < 0.3 ? ne(value) : graded(value);
  });
}

describe('calculateAverage: un solo redondeo (RN-03)', () => {
  it('QA-020 / RN-03: 13.50 da 14 (A) y 13.40 da 13 (B), sin redondeo intermedio', () => {
    expect(roundedOf([graded('13.50')])).toBe(14);
    expect(roundedOf([graded('13.40')])).toBe(13);
    expect(toLiteral(roundedOf([graded('13.50')]))).toBe('A');
    expect(toLiteral(roundedOf([graded('13.40')]))).toBe('B');
  });

  it('RN-03: redondear cada nota antes cambiaría el resultado (10.45 y 0.45)', () => {
    // Promedio real 10.45 → 10. Redondeando antes: 11,10,11,10 → 10.5 → 11.
    expect(roundedOf([graded('10.5'), graded('10.4'), graded('10.5'), graded('10.4')])).toBe(10);
    // 0.45 → 0; redondeando antes: 1,0 → 0.5 → 1.
    expect(roundedOf([graded('0.5'), graded('0.4')])).toBe(0);
  });

  it('RN-03: promedios x.5 exactos suben y x.49 bajan', () => {
    expect(roundedOf([graded('10'), graded('10'), graded('11.5')])).toBe(11); // 10.5
    expect(roundedOf([graded('10'), graded('10'), graded('11.49')])).toBe(10); // 10.4966...
    expect(roundedOf([graded('10'), graded('11')])).toBe(11); // 10.5
    expect(roundedOf([graded('10'), graded('10.99')])).toBe(10); // 10.495
    expect(roundedOf([graded('10.01'), graded('10.99')])).toBe(11); // 10.5
    expect(roundedOf([graded('10.99'), graded('11')])).toBe(11); // 10.995
  });

  it('RN-03: .50 sube y .49 baja en todo el rango, con bordes 0 y 20', () => {
    for (let n = 0; n <= 19; n++) {
      expect(roundedOf([graded(`${n}.50`)])).toBe(n + 1);
      expect(roundedOf([graded(`${n}.49`)])).toBe(n);
    }
    expect(roundedOf([graded('0')])).toBe(0);
    expect(roundedOf([graded('20')])).toBe(20);
    expect(roundedOf([graded('19.99')])).toBe(20);
  });

  it('RN-03: el resultado es entero 0..20 en cualquier combinación', () => {
    const rand = lcg(7);
    for (let i = 0; i < 300; i++) {
      const rounded = roundedOf(randomEntries(rand, 1 + Math.floor(rand() * 12)));
      expect(Number.isInteger(rounded)).toBe(true);
      expect(rounded).toBeGreaterThanOrEqual(0);
      expect(rounded).toBeLessThanOrEqual(20);
    }
  });

  it('RN-03: coincide con una referencia en BigInt para entradas aleatorias', () => {
    const rand = lcg(2024);
    for (let i = 0; i < 300; i++) {
      const entries = randomEntries(rand, 1 + Math.floor(rand() * 40));
      const cents = entries.map((e) => {
        const [i2, f = ''] = String((e as { value: string }).value).split('.');
        return BigInt(i2) * 100n + BigInt(f.padEnd(2, '0'));
      });
      const sum = cents.reduce((a, b) => a + b, 0n);
      const n = BigInt(entries.length);
      const expected = Number((2n * sum + 100n * n) / (200n * n));
      expect(roundedOf(entries)).toBe(expected);
    }
  });
});

describe('calculateAverage: listas largas', () => {
  it('RN-02: 100 notas de 20 dan 20 con suma segura y exacta', () => {
    const result = calculateAverage(Array.from({ length: 100 }, () => graded('20.00')));
    expect(result).toEqual({
      status: 'OK',
      rounded: 20,
      sumCents: 200000,
      counted: 100,
      exempt: 0,
    });
    if (result.status === 'OK') expect(Number.isSafeInteger(result.sumCents)).toBe(true);
  });

  it('RN-03: 100 notas 13.33/13.34 alternadas (13.335) dan 13 y suma exacta', () => {
    const entries = Array.from({ length: 100 }, (_, i) => graded(i % 2 === 0 ? '13.33' : '13.34'));
    const result = calculateAverage(entries);
    expect(result).toMatchObject({ status: 'OK', rounded: 13, sumCents: 133350, counted: 100 });
  });

  it('RN-03: 10000 notas de 0.07 suman exactamente 70000 centésimas (sin deriva)', () => {
    const result = calculateAverage(Array.from({ length: 10000 }, () => graded('0.07')));
    expect(result).toMatchObject({ status: 'OK', rounded: 0, sumCents: 70000, counted: 10000 });
  });

  it('RN-05: muchos NE (1000 NE=0 y una nota 20) bajan el promedio a 0', () => {
    const entries = [graded('20'), ...Array.from({ length: 1000 }, () => ne('0'))];
    const result = calculateAverage(entries);
    expect(result).toMatchObject({ status: 'OK', rounded: 0, sumCents: 2000, counted: 1001 });
    if (result.status === 'OK') expect(Number.isSafeInteger(result.sumCents)).toBe(true);
  });

  it('RN-03: 100000 notas de 19.99 dan 20 y la suma sigue siendo entero seguro', () => {
    const result = calculateAverage(Array.from({ length: 100000 }, () => graded('19.99')));
    expect(result).toMatchObject({ status: 'OK', rounded: 20, sumCents: 199900000 });
    if (result.status === 'OK') {
      expect(Number.isSafeInteger(result.sumCents)).toBe(true);
      expect(Number.isInteger(result.rounded)).toBe(true);
    }
  });

  it('RN-05: NE al límite (20) cuenta como 20', () => {
    expect(roundedOf([graded('0'), ne('20')])).toBe(10);
    expect(roundedOf([ne('20.00'), ne(20)])).toBe(20);
  });
});

describe('calculateAverage: propiedades', () => {
  it('RN-07: añadir EXEMPT en cualquier posición no cambia el resultado salvo el contador', () => {
    const rand = lcg(99);
    for (let i = 0; i < 200; i++) {
      const base = randomEntries(rand, 1 + Math.floor(rand() * 10));
      const baseline = calculateAverage(base);
      const withExempt = [...base];
      const extra = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < extra; k++) {
        withExempt.splice(Math.floor(rand() * (withExempt.length + 1)), 0, exempt);
      }
      expect(calculateAverage(withExempt)).toEqual({ ...baseline, exempt: extra });
    }
  });

  it('RN-07: solo EXEMPT da NO_GRADES con el contador correcto; un value en EXEMPT se ignora', () => {
    const odd = { state: 'EXEMPT', value: '20' } as unknown as GradeEntry;
    expect(calculateAverage([odd, exempt])).toEqual({ status: 'NO_GRADES', counted: 0, exempt: 2 });
    expect(roundedOf([graded('10'), odd])).toBe(10);
  });

  it('RN-02: el orden de las notas no altera el resultado', () => {
    const rand = lcg(5);
    for (let i = 0; i < 100; i++) {
      const entries = randomEntries(rand, 2 + Math.floor(rand() * 10));
      expect(calculateAverage([...entries].reverse())).toEqual(calculateAverage(entries));
    }
  });

  it('RN-05: GRADED y NE con el mismo valor pesan igual', () => {
    expect(calculateAverage([graded('7.5'), graded('12')])).toEqual(
      calculateAverage([ne('7.5'), ne('12')]),
    );
  });
});

describe('calculateAverage: tardías y entradas', () => {
  it('QA-008 / RN-06: una nota de entrega tardía cuenta igual, sin descuento', () => {
    const late = { state: 'GRADED', value: '15', isLate: true, lateMinutes: 4000 } as GradeEntry;
    const onTime = graded('15');
    expect(calculateAverage([late])).toEqual(calculateAverage([onTime]));
    expect(calculateAverage([late, graded('20')])).toEqual(
      calculateAverage([onTime, graded('20')]),
    );
    expect(roundedOf([late, graded('20')])).toBe(18); // 17.5 → 18
  });

  it('QA-008 / RN-06: una nota tardía de 20 sigue valiendo 20', () => {
    const late = { state: 'GRADED', value: 20, isLate: true } as GradeEntry;
    expect(calculateAverage([late])).toMatchObject({ rounded: 20, sumCents: 2000 });
  });

  it('RN-02: estados nulos, ausentes o mal escritos lanzan INVALID_STATE', () => {
    for (const bad of [
      null,
      undefined,
      {},
      { state: 'graded', value: '10' },
      { state: 'EXEMPT ' },
    ]) {
      try {
        calculateAverage([bad as unknown as GradeEntry]);
        expect.unreachable();
      } catch (error) {
        expect((error as GradingError).code).toBe('INVALID_STATE');
      }
    }
  });

  it('RN-01: GRADED o NE sin valor o con valor inválido lanzan INVALID_GRADE', () => {
    for (const bad of [
      { state: 'GRADED' },
      { state: 'NE', value: null },
      { state: 'NE', value: '20.01' },
      { state: 'GRADED', value: '-1' },
    ]) {
      try {
        calculateAverage([bad as unknown as GradeEntry]);
        expect.unreachable();
      } catch (error) {
        expect((error as GradingError).code).toBe('INVALID_GRADE');
      }
    }
  });

  it('RN-01: una nota inválida al final no devuelve resultado parcial', () => {
    expect(() => calculateAverage([graded('10'), graded('abc')])).toThrow(GradingError);
  });

  it('RN-03: el resultado no expone el promedio en coma flotante', () => {
    const result = calculateAverage([graded('10'), graded('11')]);
    expect(Object.keys(result).sort()).toEqual([
      'counted',
      'exempt',
      'rounded',
      'status',
      'sumCents',
    ]);
  });

  it('RN-02: no muta la entrada ni los objetos de las notas', () => {
    const entries: GradeEntry[] = [graded('13.5'), ne('0'), exempt];
    const snapshot = JSON.stringify(entries);
    calculateAverage(entries);
    calculateAverage(entries);
    expect(JSON.stringify(entries)).toBe(snapshot);
    expect(entries).toHaveLength(3);
  });
});
