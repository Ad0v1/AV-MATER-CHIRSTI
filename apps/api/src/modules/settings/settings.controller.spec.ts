import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AdminSettingsController, SETTINGS_THROTTLE } from './settings.controller.js';

/** Función del handler sin llamarla (solo se leen sus metadatos). */
const handlerOf = (name: 'get' | 'update'): object =>
  Object.getOwnPropertyDescriptor(AdminSettingsController.prototype, name)!.value as object;

// Seguridad 5c (vuelta 1/2): PUT /admin/settings limitado a 30 por minuto y por usuario.
describe('AdminSettingsController: límites', () => {
  it('PUT /admin/settings lleva @Throttle de 30/min por usuario', () => {
    const handler = handlerOf('update');
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(30);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
    expect(SETTINGS_THROTTLE.default.getTracker).toBeTypeOf('function');
  });

  it('GET /admin/settings no tiene un límite propio (usa el global)', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handlerOf('get'))).toBeUndefined();
  });
});
