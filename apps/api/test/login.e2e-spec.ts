import { generateSync } from 'otplib';
import request from 'supertest';
import { createTestApp, type TestApp } from './helpers.js';
import { PasswordService } from './../src/modules/auth/password.service.js';
import { TotpService } from './../src/modules/auth/totp.service.js';

const PASSWORD = 'Clave-Segura-123';

async function addAdmin(
  t: TestApp,
  overrides: { status?: 'ACTIVE' | 'INACTIVE'; totp?: string } = {},
) {
  const hash = await t.app.get(PasswordService).hash(PASSWORD);
  const totp = t.app.get(TotpService);
  t.prisma.users.push({
    id: 'admin-1',
    institutionalEmail: 'admin@colegio.edu.pe',
    fullName: 'Admin',
    role: 'ADMIN',
    status: overrides.status ?? 'ACTIVE',
    localCredential: {
      userId: 'admin-1',
      passwordHash: hash,
      totpSecretEncrypted: overrides.totp ? totp.encrypt(overrides.totp) : null,
    },
  });
}

describe('Login local del admin (e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });

  afterEach(async () => {
    await t.app.close();
  });

  const login = (body: object) =>
    request(t.app.getHttpServer()).post('/api/v1/auth/login').send(body);

  it('inicia sesion con clave correcta y deja la cookie httpOnly', async () => {
    await addAdmin(t);
    const res = await login({ email: 'Admin@Colegio.edu.pe', password: PASSWORD }).expect(200);

    expect(res.body).toEqual({ id: 'admin-1', role: 'ADMIN', mustAcceptPolicy: true });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('aula_sid=');
    expect(cookie).toContain('HttpOnly');
    expect(t.audit.records.map((r) => r.action)).toContain('auth.login');
  });

  it('la sesion obtenida sirve para GET /auth/me', async () => {
    await addAdmin(t);
    const res = await login({ email: 'admin@colegio.edu.pe', password: PASSWORD });
    await request(t.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', res.headers['set-cookie'] ?? [])
      .expect(200)
      .expect({ id: 'admin-1', role: 'ADMIN', mustAcceptPolicy: true });
  });

  it('rechaza clave incorrecta con el mismo mensaje que un correo inexistente', async () => {
    await addAdmin(t);
    const wrong = await login({ email: 'admin@colegio.edu.pe', password: 'otra' }).expect(401);
    const unknown = await login({ email: 'nadie@colegio.edu.pe', password: PASSWORD }).expect(401);

    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(t.audit.records.filter((r) => r.action === 'auth.login_failed')).toHaveLength(2);
  });

  it('bloquea a un usuario inactivo aunque la clave sea correcta (RF-08)', async () => {
    await addAdmin(t, { status: 'INACTIVE' });
    const res = await login({ email: 'admin@colegio.edu.pe', password: PASSWORD }).expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(t.audit.records.map((r) => r.action)).toContain('auth.login_blocked');
  });

  it('no deja entrar a un usuario que no es administrador', async () => {
    await addAdmin(t);
    t.prisma.users[0]!.role = 'TEACHER';
    await login({ email: 'admin@colegio.edu.pe', password: PASSWORD }).expect(401);
  });

  it('valida el cuerpo con 400', async () => {
    const res = await login({ email: 'no-es-correo', password: '' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  describe('con 2FA activo', () => {
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

    it('pide el codigo si falta', async () => {
      await addAdmin(t, { totp: secret });
      const res = await login({ email: 'admin@colegio.edu.pe', password: PASSWORD }).expect(401);
      expect(res.body.error.code).toBe('TOTP_REQUIRED');
    });

    it('rechaza un codigo incorrecto', async () => {
      await addAdmin(t, { totp: secret });
      const res = await login({
        email: 'admin@colegio.edu.pe',
        password: PASSWORD,
        totp: '000000',
      }).expect(401);
      expect(res.body.error.code).toBe('TOTP_INVALID');
    });

    it('rechaza reutilizar un codigo ya aceptado', async () => {
      await addAdmin(t, { totp: secret });
      const code = generateSync({ secret });
      const body = { email: 'admin@colegio.edu.pe', password: PASSWORD, totp: code };

      await login(body).expect(200);
      const replay = await login(body).expect(401);
      expect(replay.body.error.code).toBe('TOTP_INVALID');
    });

    it('acepta el codigo correcto', async () => {
      await addAdmin(t, { totp: secret });
      await login({
        email: 'admin@colegio.edu.pe',
        password: PASSWORD,
        totp: generateSync({ secret }),
      }).expect(200);
    });
  });

  it('limita los intentos de login (5 por minuto)', async () => {
    for (let i = 0; i < 5; i++) {
      await login({ email: 'x@colegio.edu.pe', password: 'mala' }).expect(401);
    }
    await login({ email: 'x@colegio.edu.pe', password: 'mala' }).expect(429);
  });

  it('registra la aceptacion de la politica (RF-07)', async () => {
    await addAdmin(t);
    const res = await login({ email: 'admin@colegio.edu.pe', password: PASSWORD });
    const cookie = res.headers['set-cookie'] ?? [];

    await request(t.app.getHttpServer())
      .post('/api/v1/auth/policy/accept')
      .set('Cookie', cookie)
      .expect(204);
    await request(t.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect((r) => expect(r.body.mustAcceptPolicy).toBe(false));
  });

  it('activa el 2FA confirmando un codigo real y luego lo exige al entrar', async () => {
    await addAdmin(t);
    const res = await login({ email: 'admin@colegio.edu.pe', password: PASSWORD });
    const cookie = res.headers['set-cookie'] ?? [];
    const server = t.app.getHttpServer();

    const setup = await request(server)
      .post('/api/v1/auth/2fa/setup')
      .set('Cookie', cookie)
      .expect(201);
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');

    await request(server)
      .post('/api/v1/auth/2fa/enable')
      .set('Cookie', cookie)
      .send({ code: '000000' })
      .expect(400);
    await request(server)
      .post('/api/v1/auth/2fa/enable')
      .set('Cookie', cookie)
      .send({ code: generateSync({ secret: setup.body.secret }) })
      .expect(204);

    const stored = t.prisma.users[0]!.localCredential!.totpSecretEncrypted!;
    expect(stored).not.toContain(setup.body.secret);
    await login({ email: 'admin@colegio.edu.pe', password: PASSWORD }).expect(401);
  });

  it('el 2FA solo lo configura un administrador con sesion', async () => {
    await request(t.app.getHttpServer()).post('/api/v1/auth/2fa/setup').expect(401);
  });
});
