import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('aplica valores por defecto', () => {
    const env = loadEnv({});
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('convierte el puerto a numero', () => {
    expect(loadEnv({ API_PORT: '5000' }).API_PORT).toBe(5000);
  });

  it('rechaza un puerto invalido', () => {
    expect(() => loadEnv({ API_PORT: 'abc' })).toThrow(/API_PORT/);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('trata una variable vacia como no definida', () => {
    expect(loadEnv({ TOTP_ENCRYPTION_KEY: '' }).TOTP_ENCRYPTION_KEY).toBeUndefined();
  });

  it('exige la clave TOTP en produccion', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/TOTP_ENCRYPTION_KEY/);
  });

  it('rechaza una clave TOTP que no mide 32 bytes', () => {
    expect(() => loadEnv({ TOTP_ENCRYPTION_KEY: 'corta' })).toThrow(/TOTP_ENCRYPTION_KEY/);
  });
});
