import type { PrismaClient } from './../src/generated/prisma/client.js';
import { assertLocalTestDbEnv, withoutSubmissionVersionTrigger } from './db-test-guard.js';

// Guarda del DDL de los e2e (INFORME 6 de seguridad). Puro: no necesita MySQL.
describe('assertLocalTestDbEnv', () => {
  const ok = { E2E_ALLOW_DDL: '1', DATABASE_URL: 'mysql://aula:x@127.0.0.1:3306/aula_virtual' };

  it('acepta BD local con el nombre esperado', () => {
    expect(assertLocalTestDbEnv(ok)).toBe('aula_virtual');
    for (const host of ['localhost', '[::1]', 'mysql']) {
      expect(() =>
        assertLocalTestDbEnv({ ...ok, DATABASE_URL: `mysql://aula:x@${host}:3306/aula_virtual` }),
      ).not.toThrow();
    }
    expect(assertLocalTestDbEnv({ ...ok, CI: 'false' })).toBe('aula_virtual');
  });

  it('rechaza sin confirmación E2E_ALLOW_DDL=1, host remoto, otra base, producción, CI y falta de URL', () => {
    const cases = [
      { DATABASE_URL: ok.DATABASE_URL },
      { ...ok, E2E_ALLOW_DDL: '0' },
      { ...ok, E2E_ALLOW_DDL: 'true' },
      { ...ok, E2E_ALLOW_DDL: '' },
      { ...ok, DATABASE_URL: 'mysql://aula:x@db.example.com:3306/aula_virtual' },
      { ...ok, DATABASE_URL: 'mysql://aula:x@127.0.0.1:3306/otra' },
      { ...ok, E2E_DB_NAME: 'aula_test' },
      { ...ok, NODE_ENV: 'production' },
      { ...ok, CI: 'true' },
      { ...ok, CI: '1' },
      {},
      { E2E_ALLOW_DDL: '1' },
    ];
    for (const env of cases) {
      expect(() => assertLocalTestDbEnv(env), JSON.stringify(env)).toThrow();
    }
  });

  it('los mensajes no incluyen la URL ni la contraseña', () => {
    try {
      assertLocalTestDbEnv({
        E2E_ALLOW_DDL: '1',
        DATABASE_URL: 'mysql://aula:secreta@remoto.example:3306/aula_virtual',
      });
    } catch (error) {
      expect(String(error)).not.toContain('secreta');
      expect(String(error)).not.toContain('remoto.example');
    }
  });
});

// Cliente falso: SELECT DATABASE() responde la base esperada y CREATE TRIGGER puede fallar.
function fakeDdl(createFails: boolean) {
  const executed: string[] = [];
  const client = {
    $queryRawUnsafe: () => Promise.resolve([{ db: 'aula_virtual' }]),
    $executeRawUnsafe: (sql: string) => {
      executed.push(sql.split(' ')[0]);
      if (createFails && sql.startsWith('CREATE')) return Promise.reject(new Error('reposicion'));
      return Promise.resolve(0);
    },
  };
  return { client: client as unknown as PrismaClient, executed };
}

describe('withoutSubmissionVersionTrigger', () => {
  const env = { E2E_ALLOW_DDL: '1', DATABASE_URL: 'mysql://aula:x@127.0.0.1:3306/aula_virtual' };

  it('sin la confirmación no ejecuta ningún DDL', async () => {
    const { client, executed } = fakeDdl(false);
    await expect(
      withoutSubmissionVersionTrigger(client, () => Promise.resolve(1), {
        ...env,
        E2E_ALLOW_DDL: undefined,
      }),
    ).rejects.toThrow(/E2E_ALLOW_DDL=1/);
    expect(executed).toEqual([]);
  });

  it('quita y repone el trigger y devuelve el resultado', async () => {
    const { client, executed } = fakeDdl(false);
    await expect(
      withoutSubmissionVersionTrigger(client, () => Promise.resolve(7), env),
    ).resolves.toBe(7);
    expect(executed).toEqual(['DROP', 'CREATE']);
  });

  it('si falla fn, repone el trigger y lanza el error original', async () => {
    const { client, executed } = fakeDdl(false);
    await expect(
      withoutSubmissionVersionTrigger(client, () => Promise.reject(new Error('borrado')), env),
    ).rejects.toThrow('borrado');
    expect(executed).toEqual(['DROP', 'CREATE']);
  });

  it('si fallan fn y la reposición, lanza un error con los dos', async () => {
    const { client } = fakeDdl(true);
    const error = await withoutSubmissionVersionTrigger(
      client,
      () => Promise.reject(new Error('borrado')),
      env,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map((e: Error) => e.message)).toEqual([
      'borrado',
      'reposicion',
    ]);
  });
});
