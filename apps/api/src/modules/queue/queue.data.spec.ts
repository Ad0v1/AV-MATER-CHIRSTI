import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import { assertJobData, assertJobId, assertJobName, isQueueName } from './queue.data.js';
import { QueueService } from './queue.service.js';

describe('assertJobData: casos limite (RNF-09)', () => {
  it('64 caracteres pasan y 65 no', () => {
    expect(() => assertJobData({ a: 'x'.repeat(64) })).not.toThrow();
    expect(() => assertJobData({ a: 'x'.repeat(65) })).toThrow(/Valor invalido/);
  });

  it('rechaza "@", CR y LF en un valor, tambien dentro de una lista', () => {
    for (const bad of ['a@b', '@', 'a\nb', 'a\rb', '\n']) {
      expect(() => assertJobData({ v: bad })).toThrow(/Valor invalido/);
      expect(() => assertJobData({ ids: ['ok', bad] })).toThrow(/Valor invalido/);
    }
  });

  it('listas: 500 elementos pasan, 501 no; no admiten listas anidadas ni objetos', () => {
    expect(() => assertJobData({ ids: Array.from({ length: 500 }, () => 'x') })).not.toThrow();
    expect(() => assertJobData({ ids: Array.from({ length: 501 }, () => 'x') })).toThrow();
    expect(() => assertJobData({ ids: [['x']] })).toThrow();
    expect(() => assertJobData({ ids: [{ a: 1 }] })).toThrow();
  });

  it('20 claves pasan y 21 no; la clave empieza con letra y tiene hasta 41 caracteres', () => {
    const keys = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]));
    expect(() => assertJobData(keys(20))).not.toThrow();
    expect(() => assertJobData(keys(21))).toThrow(/demasiadas/);
    expect(() => assertJobData({ '1a': 1 })).toThrow(/Clave/);
    expect(() => assertJobData({ [`a${'b'.repeat(40)}`]: 1 })).not.toThrow();
    expect(() => assertJobData({ [`a${'b'.repeat(41)}`]: 1 })).toThrow(/Clave/);
  });

  it('rechaza null, texto, undefined, funciones, Infinity, fechas y objetos anidados', () => {
    expect(() => assertJobData(null)).toThrow();
    expect(() => assertJobData('texto')).toThrow();
    expect(() => assertJobData({ a: undefined })).toThrow();
    expect(() => assertJobData({ a: () => 1 })).toThrow();
    expect(() => assertJobData({ a: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => assertJobData({ a: { b: { c: 1 } } })).toThrow();
    expect(() => assertJobData({ a: new Date() })).toThrow();
  });

  it('nombre, id de trabajo y nombre de cola', () => {
    expect(() => assertJobName('ne-sweep')).not.toThrow();
    expect(() => assertJobName('Ne')).toThrow();
    expect(() => assertJobName('')).toThrow();
    expect(() => assertJobId('0192f0c4-0000-7000-8000-000000000001')).not.toThrow();
    expect(() => assertJobId('a b')).toThrow();
    expect(() => assertJobId('a:b')).toThrow();
    expect(() => assertJobId('x'.repeat(129))).toThrow();
    expect(isQueueName('exports')).toBe(true);
    expect(isQueueName('otra')).toBe(false);
  });
});

describe('QueueService: validacion previa y fallos', () => {
  function service() {
    const created: string[] = [];
    const q = {
      add: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
      upsertJobScheduler: vi.fn(() => Promise.resolve({})),
      on: vi.fn(),
      close: vi.fn(() => Promise.reject(new Error('cerrando'))),
    };
    return { created, q, svc: new QueueService(() => (created.push('x'), q as unknown as Queue)) };
  }

  it('enqueue y schedule validan los datos antes de crear la cola', async () => {
    const { created, svc } = service();
    await expect(svc.enqueue('exports', 'x', { to: 'a@b.pe' })).rejects.toThrow();
    await expect(svc.schedule('maintenance', 'x', 5000, { to: 'a@b.pe' })).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it('schedule acepta 1000 ms y rechaza no enteros y negativos', async () => {
    const { svc } = service();
    await expect(svc.schedule('maintenance', 'x', 1000)).resolves.toBeUndefined();
    await expect(svc.schedule('maintenance', 'x', 1500.5)).rejects.toThrow(/Intervalo/);
    await expect(svc.schedule('maintenance', 'x', -1)).rejects.toThrow(/Intervalo/);
    await expect(svc.schedule('maintenance', 'x', 999)).rejects.toThrow(/Intervalo/);
  });

  it('un Redis caido hace fallar enqueue con el error de la cola', async () => {
    const { svc } = service();
    await expect(svc.enqueue('exports', 'x', {})).rejects.toThrow('ECONNREFUSED');
  });

  it('al destruir el modulo, un close() que falla no impide cerrar el resto', async () => {
    const { svc, q } = service();
    await svc.schedule('maintenance', 'x', 5000);
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
    expect(q.close).toHaveBeenCalled();
  });
});
