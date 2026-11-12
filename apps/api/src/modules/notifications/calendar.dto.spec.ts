import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { calendarQuerySchema } from './calendar.dto.js';

const pipe = new ZodValidationPipe(calendarQuerySchema);
const fails = (q: unknown) => {
  try {
    pipe.transform(q);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: { path: string }[] })
      .message;
  }
  throw new Error('no lanzó');
};

describe('calendarQuerySchema (RF-54)', () => {
  it('una fecha YYYY-MM-DD es las 00:00 de Lima', () => {
    const q = pipe.transform({ from: '2026-03-01', to: '2026-04-01' });
    expect(q.from.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(q.to.toISOString()).toBe('2026-04-01T05:00:00.000Z');
  });

  it('acepta instantes ISO con zona (como los manda FullCalendar)', () => {
    const q = pipe.transform({
      from: '2026-02-23T00:00:00-05:00',
      to: '2026-04-06T00:00:00Z',
      studentId: '0192f0c4-0000-7000-8000-000000000001',
    });
    expect(q.from.toISOString()).toBe('2026-02-23T05:00:00.000Z');
    expect(q.studentId).toBe('0192f0c4-0000-7000-8000-000000000001');
  });

  it('62 días exactos pasan; 62 días y 1 ms no', () => {
    expect(() =>
      pipe.transform({ from: '2026-01-01T00:00:00Z', to: '2026-03-04T00:00:00Z' }),
    ).not.toThrow();
    expect(fails({ from: '2026-01-01T00:00:00Z', to: '2026-03-04T00:00:00.001Z' })[0].path).toBe(
      'to',
    );
  });

  it('rechaza to <= from, fechas sin zona, inválidas, faltantes, repetidas o campos extra', () => {
    expect(fails({ from: '2026-03-02', to: '2026-03-01' })[0].path).toBe('to');
    expect(fails({ from: '2026-03-01', to: '2026-03-01' })[0].path).toBe('to');
    expect(fails({ from: '2026-03-01T00:00:00', to: '2026-03-02' })[0].path).toBe('from');
    expect(fails({ from: '2026-02-30', to: '2026-03-02' })[0].path).toBe('from');
    expect(fails({ to: '2026-03-02' })[0].path).toBe('from');
    expect(fails({ from: ['2026-03-01', '2026-03-02'], to: '2026-03-05' })[0].path).toBe('from');
    expect(fails({ from: '2026-03-01', to: '2026-03-05', x: '1' }).length).toBe(1);
    expect(fails({ from: '2026-03-01', to: '2026-03-05', studentId: 'abc' })[0].path).toBe(
      'studentId',
    );
  });
});
