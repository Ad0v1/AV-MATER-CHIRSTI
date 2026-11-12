import { DEFAULT_LITERAL_SCALE } from '@aula/shared';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { LITERAL_SCALE_CACHE_MS, LiteralScaleProvider, toScale } from './literal-scale.provider.js';

const custom = [
  { literal: 'AD', min: 17, max: 20 },
  { literal: 'A', min: 13, max: 16 },
  { literal: 'B', min: 11, max: 12 },
  { literal: 'C', min: 0, max: 10 },
];

function provider(findUnique: () => Promise<unknown>) {
  const prisma = { institutionSettings: { findUnique: vi.fn(findUnique) } };
  return { p: new LiteralScaleProvider(prisma as unknown as PrismaService), prisma };
}

describe('LiteralScaleProvider (RF-61)', () => {
  it('devuelve la tabla guardada (where id = 1)', async () => {
    const { p, prisma } = provider(() => Promise.resolve({ literalScale: custom }));
    expect(await p.current()).toEqual(custom);
    expect(prisma.institutionSettings.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { literalScale: true },
    });
  });

  it.each([
    ['sin fila', () => Promise.resolve(null)],
    ['BD caída', () => Promise.reject(new Error('down'))],
    ['JSON que no es arreglo', () => Promise.resolve({ literalScale: { a: 1 } })],
    ['tramo sin forma', () => Promise.resolve({ literalScale: [{ literal: 1, min: 0, max: 20 }] })],
    [
      'tabla con hueco',
      () => Promise.resolve({ literalScale: [{ literal: 'A', min: 0, max: 19 }] }),
    ],
  ])('%s → tabla por defecto, sin lanzar', async (_n, load) => {
    const { p } = provider(load);
    expect(await p.current()).toBe(DEFAULT_LITERAL_SCALE);
  });

  it('usa la caché 10 s y se puede invalidar', async () => {
    const { p, prisma } = provider(() => Promise.resolve({ literalScale: custom }));
    await p.current(1_000);
    await p.current(1_000 + LITERAL_SCALE_CACHE_MS - 1);
    expect(prisma.institutionSettings.findUnique).toHaveBeenCalledTimes(1);
    await p.current(1_000 + LITERAL_SCALE_CACHE_MS);
    expect(prisma.institutionSettings.findUnique).toHaveBeenCalledTimes(2);
    p.invalidate();
    await p.current(1_000 + LITERAL_SCALE_CACHE_MS);
    expect(prisma.institutionSettings.findUnique).toHaveBeenCalledTimes(3);
  });

  it('toScale congela la tabla', () => {
    const scale = toScale(custom)!;
    expect(Object.isFrozen(scale)).toBe(true);
    expect(Object.isFrozen(scale[0])).toBe(true);
    expect(toScale('x')).toBeNull();
    expect(toScale([null])).toBeNull();
  });
});
