import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { createTestApp } from './helpers.js';

describe('Sesion (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = (await createTestApp()).app;
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /auth/me responde 401 sin sesion', () => {
    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401)
      .expect((res) => expect(res.body.error.code).toBe('UNAUTHENTICATED'));
  });

  it('GET /auth/me devuelve el usuario con una sesion valida', async () => {
    const token = await app.get(SessionService).create({ id: 'u1', role: 'TEACHER' });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${token}`)
      .expect(200)
      .expect({
        id: 'u1',
        role: 'TEACHER',
        mustAcceptPolicy: true,
        mustChangePassword: false,
        mustVerifyEmail: false,
        mustEnableTwoFactor: false,
        mustCompleteContact: false,
      });
  });

  it('GET /auth/me rechaza un token inventado', () => {
    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=token-falso`)
      .expect(401);
  });

  it('POST /auth/logout cierra la sesion', async () => {
    const token = await app.get(SessionService).create({ id: 'u1', role: 'ADMIN' });
    const cookie = `${SESSION_COOKIE}=${token}`;

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
  });
});

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.RATE_LIMIT_PER_MINUTE = '3';
    app = (await createTestApp()).app;
  });

  afterEach(async () => {
    delete process.env.RATE_LIMIT_PER_MINUTE;
    await app.close();
  });

  it('responde 429 al superar el limite de peticiones', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    }
    await request(app.getHttpServer()).get('/api/v1/health').expect(429);
  });
});
