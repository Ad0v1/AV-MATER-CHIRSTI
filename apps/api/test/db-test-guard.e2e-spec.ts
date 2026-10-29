import { assertLocalTestDbEnv } from './db-test-guard.js';

// Guarda del DDL de los e2e (INFORME 6 de seguridad). Puro: no necesita MySQL.
describe('assertLocalTestDbEnv', () => {
  const ok = { DATABASE_URL: 'mysql://aula:x@127.0.0.1:3306/aula_virtual' };

  it('acepta BD local con el nombre esperado', () => {
    expect(assertLocalTestDbEnv(ok)).toBe('aula_virtual');
    for (const host of ['localhost', '[::1]', 'mysql']) {
      expect(() =>
        assertLocalTestDbEnv({ DATABASE_URL: `mysql://aula:x@${host}:3306/aula_virtual` }),
      ).not.toThrow();
    }
    expect(assertLocalTestDbEnv({ ...ok, CI: 'false' })).toBe('aula_virtual');
  });

  it('rechaza host remoto, otra base, producción, CI y falta de URL', () => {
    const cases = [
      { DATABASE_URL: 'mysql://aula:x@db.example.com:3306/aula_virtual' },
      { DATABASE_URL: 'mysql://aula:x@127.0.0.1:3306/otra' },
      { ...ok, E2E_DB_NAME: 'aula_test' },
      { ...ok, NODE_ENV: 'production' },
      { ...ok, CI: 'true' },
      { ...ok, CI: '1' },
      {},
    ];
    for (const env of cases) {
      expect(() => assertLocalTestDbEnv(env), JSON.stringify(env)).toThrow();
    }
  });

  it('los mensajes no incluyen la URL ni la contraseña', () => {
    try {
      assertLocalTestDbEnv({
        DATABASE_URL: 'mysql://aula:secreta@remoto.example:3306/aula_virtual',
      });
    } catch (error) {
      expect(String(error)).not.toContain('secreta');
      expect(String(error)).not.toContain('remoto.example');
    }
  });
});
