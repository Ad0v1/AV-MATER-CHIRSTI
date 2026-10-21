import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from './helpers.js';

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('GET /api/v1/health responde ok', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('ok'));
  });

  it('incluye cabeceras de seguridad de helmet', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect((res) => expect(res.headers['x-content-type-options']).toBe('nosniff'));
  });

  it('devuelve errores en el formato acordado', () => {
    return request(app.getHttpServer())
      .get('/api/v1/no-existe')
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('NOT_FOUND');
        expect(res.body.requestId).toEqual(expect.any(String));
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
