// Lo corre Vitest de apps/web (apps/web/vitest.config.mts): local-guard.ts no tiene dependencias.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REDIS_URL,
  assertLocalDatabase,
  assertLocalRedis,
  assertNotProductionOrCi,
  hostOf,
} from './local-guard';

const DB = 'mysql://aula:secreto-de-prueba@localhost:3306/aula_virtual';

describe('assertLocalDatabase', () => {
  it('devuelve la URL si es local', () => {
    expect(assertLocalDatabase({ DATABASE_URL: DB })).toBe(DB);
    for (const host of ['127.0.0.1', '[::1]', 'mysql', 'LOCALHOST']) {
      const url = `mysql://u:p@${host}:3306/db`;
      expect(assertLocalDatabase({ DATABASE_URL: url })).toBe(url);
    }
  });

  it('rechaza producción y CI con los mismos mensajes que el seed', () => {
    expect(() => assertLocalDatabase({ NODE_ENV: 'production', DATABASE_URL: DB })).toThrow(
      'El seed de datos ficticios no se ejecuta con NODE_ENV=production.',
    );
    expect(() => assertLocalDatabase({ CI: 'true', DATABASE_URL: DB })).toThrow(
      'El seed de datos ficticios no se ejecuta en CI (CI=true).',
    );
  });

  it('usa el sujeto indicado en el mensaje', () => {
    expect(() =>
      assertLocalDatabase(
        { NODE_ENV: 'production', DATABASE_URL: DB },
        'El script de sesion local',
      ),
    ).toThrow(/^El script de sesion local no se ejecuta/);
  });

  it('rechaza hosts no locales sin mostrar la URL ni la contraseña', () => {
    const remote = 'mysql://aula:secreto-de-prueba@db.example.com:3306/aula';
    let message = '';
    try {
      assertLocalDatabase({ DATABASE_URL: remote });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/no apunta a una base local/);
    expect(message).not.toContain('secreto-de-prueba');
    expect(message).not.toContain('db.example.com');
  });

  it('falta o URL inválida', () => {
    expect(() => assertLocalDatabase({})).toThrow(/Falta DATABASE_URL/);
    expect(() => assertLocalDatabase({ DATABASE_URL: 'no es url' })).toThrow(
      /no es una URL valida/,
    );
  });
});

describe('assertLocalRedis', () => {
  it('usa el valor por defecto de la API si no hay REDIS_URL', () => {
    expect(assertLocalRedis({})).toBe(DEFAULT_REDIS_URL);
  });

  it('acepta localhost y el servicio redis del compose', () => {
    expect(assertLocalRedis({ REDIS_URL: 'redis://redis:6379' })).toBe('redis://redis:6379');
    expect(assertLocalRedis({ REDIS_URL: 'redis://127.0.0.1:6379' })).toBe(
      'redis://127.0.0.1:6379',
    );
  });

  it('rechaza un Redis remoto', () => {
    expect(() => assertLocalRedis({ REDIS_URL: 'rediss://:clave@cache.example.com:6380' })).toThrow(
      /no apunta a un Redis local/,
    );
    expect(() => assertLocalRedis({ REDIS_URL: 'redis://mysql:6379' })).toThrow(/Redis local/);
  });
});

describe('QA: casos límite de local-guard (entrega 5a)', () => {
  it('assertNotProductionOrCi: producción y CI rechazan; CI distinto de "true" no', () => {
    expect(() => assertNotProductionOrCi({ NODE_ENV: 'production' }, 'X')).toThrow(
      'X no se ejecuta con NODE_ENV=production.',
    );
    expect(() => assertNotProductionOrCi({ CI: 'true' }, 'X')).toThrow('X no se ejecuta en CI');
    expect(() =>
      assertNotProductionOrCi({ CI: 'false', NODE_ENV: 'development' }, 'X'),
    ).not.toThrow();
    expect(() => assertNotProductionOrCi({}, 'X')).not.toThrow();
  });

  it('producción gana aunque la base sea local', () => {
    expect(() =>
      assertLocalDatabase({ NODE_ENV: 'production', DATABASE_URL: 'mysql://u:p@localhost/db' }),
    ).toThrow(/production/);
  });

  it('hosts que parecen locales pero no lo son se rechazan', () => {
    for (const host of [
      'localhost.evil.com',
      'evil.com',
      '127.0.0.2',
      '0.0.0.0',
      'mysql.prod.internal',
      'localhost.',
    ]) {
      expect(() => assertLocalDatabase({ DATABASE_URL: `mysql://u:p@${host}:3306/db` })).toThrow(
        /no apunta a una base local/,
      );
    }
  });

  it('credenciales engañosas: cuenta el host real', () => {
    expect(() =>
      assertLocalDatabase({ DATABASE_URL: 'mysql://localhost:x@db.example.com:3306/db' }),
    ).toThrow(/no apunta a una base local/);
  });

  it('DATABASE_URL vacía cuenta como faltante', () => {
    expect(() => assertLocalDatabase({ DATABASE_URL: '' })).toThrow(/Falta DATABASE_URL/);
  });

  it('REDIS_URL vacía usa el valor por defecto; IPv6 local y mayúsculas se aceptan', () => {
    expect(assertLocalRedis({ REDIS_URL: '' })).toBe(DEFAULT_REDIS_URL);
    expect(assertLocalRedis({ REDIS_URL: 'redis://[::1]:6379' })).toBe('redis://[::1]:6379');
    expect(assertLocalRedis({ REDIS_URL: 'redis://LOCALHOST:6379' })).toBe(
      'redis://LOCALHOST:6379',
    );
  });

  it('REDIS_URL remota o inválida se rechaza sin exponer la clave', () => {
    let message = '';
    try {
      assertLocalRedis({ REDIS_URL: 'redis://:claveSecreta@10.0.0.5:6379' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/Redis local/);
    expect(message).not.toContain('claveSecreta');
    expect(() => assertLocalRedis({ REDIS_URL: 'no es url' })).toThrow(/REDIS_URL no es una URL/);
  });

  it('hostOf nunca incluye la URL en el error', () => {
    expect(hostOf('mysql://U:p@HOST.Example.com/db', 'V')).toBe('host.example.com');
    expect(() => hostOf('secreto://???', 'V')).not.toThrow(/secreto/);
  });
});
