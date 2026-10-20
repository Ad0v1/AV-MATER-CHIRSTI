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
});
