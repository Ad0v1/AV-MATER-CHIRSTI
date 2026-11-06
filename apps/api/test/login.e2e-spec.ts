import { generateSync } from 'otplib';
import request from 'supertest';
import { createTestApp, type TestApp } from './helpers.js';
import { PasswordService } from './../src/modules/auth/password.service.js';
import { DniService } from './../src/modules/auth/dni.service.js';
import { TotpService } from './../src/modules/auth/totp.service.js';
import { luhnCheckDigit } from './../src/modules/auth/user-code.js';

const PASSWORD = 'Clave-Segura-123';
const DNI = '45678901';
const body9 = '260000000';
// Codigo valido (con digito de control) del usuario de prueba.
const CODE = body9 + luhnCheckDigit(body9);
// Otro codigo valido, sin ningun usuario.
const OTHER_CODE = '27123456' + '0' + luhnCheckDigit('271234560');

async function addUser(
  t: TestApp,
  overrides: {
    role?: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
    status?: 'ACTIVE' | 'INACTIVE';
    totp?: string;
    mustChangePassword?: boolean;
    emailVerified?: boolean;
  } = {},
) {
  const hash = await t.app.get(PasswordService).hash(PASSWORD);
  const totp = t.app.get(TotpService);
  t.prisma.users.push({
    id: 'user-1',
    institutionalEmail: 'admin@colegio.edu.pe',
    code: CODE,
    dniEncrypted: t.app.get(DniService).encrypt(DNI),
    contactEmail: 'usuario@correo.pe',
    contactEmailIsGuardian: false,
    phone: '987654321',
    address: null,
    emailVerifiedAt: overrides.emailVerified === false ? null : new Date(),
    fullName: 'Usuario de prueba',
    role: overrides.role ?? 'ADMIN',
    status: overrides.status ?? 'ACTIVE',
    localCredential: {
      userId: 'user-1',
      passwordHash: hash,
      totpSecretEncrypted: overrides.totp ? totp.encrypt(overrides.totp) : null,
      mustChangePassword: overrides.mustChangePassword ?? false,
      passwordChangedAt: null,
    },
  });
}

describe('Login por codigo de usuario (e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });

  afterEach(async () => {
    await t.app.close();
  });

  const login = (body: object) =>
    request(t.app.getHttpServer()).post('/api/v1/auth/login').send(body);

  it('inicia sesion con codigo y clave correctos y deja la cookie httpOnly', async () => {
    await addUser(t);
    const res = await login({ code: CODE, password: PASSWORD }).expect(200);

    expect(res.body).toEqual({
      id: 'user-1',
      role: 'ADMIN',
      mustAcceptPolicy: true,
      mustChangePassword: false,
      mustVerifyEmail: false,
      mustEnableTwoFactor: true,
      mustCompleteContact: false,
    });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('aula_sid=');
    expect(cookie).toContain('HttpOnly');
    expect(t.audit.records.map((r) => r.action)).toContain('auth.login');
  });

  it.each(['TEACHER', 'STUDENT', 'GUARDIAN'] as const)('deja entrar a un %s', async (role) => {
    await addUser(t, { role });
    const res = await login({ code: CODE, password: PASSWORD }).expect(200);
    expect(res.body.role).toBe(role);
  });

  it('la sesion obtenida sirve para GET /auth/me', async () => {
    await addUser(t);
    const res = await login({ code: CODE, password: PASSWORD });
    await request(t.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', res.headers['set-cookie'] ?? [])
      .expect(200)
      .expect({
        id: 'user-1',
        role: 'ADMIN',
        mustAcceptPolicy: true,
        mustChangePassword: false,
        mustVerifyEmail: false,
        mustEnableTwoFactor: true,
        mustCompleteContact: false,
      });
  });

  it('rechaza clave incorrecta con el mismo mensaje que un codigo inexistente', async () => {
    await addUser(t);
    const wrong = await login({ code: CODE, password: 'otra' }).expect(401);
    const unknown = await login({ code: OTHER_CODE, password: PASSWORD }).expect(401);

    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(t.audit.records.filter((r) => r.action === 'auth.login_failed')).toHaveLength(2);
  });

  it('un codigo con el digito de control mal responde igual y no se registra', async () => {
    await addUser(t);
    const badCode = CODE.slice(0, 9) + ((Number(CODE[9]) + 1) % 10);
    const res = await login({ code: badCode, password: PASSWORD }).expect(401);

    expect(res.body.error.message).toBe('Credenciales invalidas');
    expect(t.audit.records.filter((r) => r.action === 'auth.login_failed')).toHaveLength(0);
  });

  it('bloquea a un usuario inactivo aunque la clave sea correcta (RF-08)', async () => {
    await addUser(t, { status: 'INACTIVE' });
    const res = await login({ code: CODE, password: PASSWORD }).expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(t.audit.records.map((r) => r.action)).toContain('auth.login_blocked');
  });

  it('valida el cuerpo con 400', async () => {
    const res = await login({ code: 'abc', password: '' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('el campo antiguo email ya no sirve para entrar', async () => {
    await addUser(t);
    await login({ email: 'admin@colegio.edu.pe', password: PASSWORD }).expect(400);
  });

  describe('con 2FA activo', () => {
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

    it('pide el codigo si falta', async () => {
      await addUser(t, { totp: secret });
      const res = await login({ code: CODE, password: PASSWORD }).expect(401);
      expect(res.body.error.code).toBe('TOTP_REQUIRED');
    });

    it('rechaza un codigo incorrecto', async () => {
      await addUser(t, { totp: secret });
      const res = await login({ code: CODE, password: PASSWORD, totp: '000000' }).expect(401);
      expect(res.body.error.code).toBe('TOTP_INVALID');
    });

    it('rechaza reutilizar un codigo ya aceptado', async () => {
      await addUser(t, { totp: secret });
      const body = { code: CODE, password: PASSWORD, totp: generateSync({ secret }) };

      await login(body).expect(200);
      const replay = await login(body).expect(401);
      expect(replay.body.error.code).toBe('TOTP_INVALID');
    });

    it('acepta el codigo correcto', async () => {
      await addUser(t, { totp: secret });
      await login({ code: CODE, password: PASSWORD, totp: generateSync({ secret }) }).expect(200);
    });
  });

  it('limita los intentos de login por IP (5 por minuto)', async () => {
    for (let i = 0; i < 5; i++) {
      await login({ code: OTHER_CODE, password: 'mala' }).expect(401);
    }
    await login({ code: OTHER_CODE, password: 'mala' }).expect(429);
  });

  it('el quinto fallo seguido bloquea la cuenta y queda en la bitacora (RF-75)', async () => {
    await addUser(t);
    for (let i = 0; i < 5; i++) {
      await login({ code: CODE, password: 'mala' }).expect(401);
    }
    const actions = t.audit.records.map((r) => r.action);
    expect(actions.filter((a) => a === 'auth.login_failed')).toHaveLength(5);
    expect(actions.filter((a) => a === 'auth.account_locked')).toHaveLength(1);
  });

  it('registra la aceptacion de la politica (RF-07)', async () => {
    await addUser(t);
    const res = await login({ code: CODE, password: PASSWORD });
    const cookie = res.headers['set-cookie'] ?? [];

    await request(t.app.getHttpServer())
      .post('/api/v1/auth/policy/accept')
      .set('Cookie', cookie)
      .send({ privacy: true, terms: true })
      .expect(204);
    await request(t.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect((r) => expect(r.body.mustAcceptPolicy).toBe(false));
  });

  it('activa el 2FA confirmando un codigo real y luego lo exige al entrar', async () => {
    await addUser(t);
    const res = await login({ code: CODE, password: PASSWORD });
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
      .expect(200);

    const stored = t.prisma.users[0]!.localCredential!.totpSecretEncrypted!;
    expect(stored).not.toContain(setup.body.secret);
    await login({ code: CODE, password: PASSWORD }).expect(401);
  });

  it('el 2FA solo lo configura un administrador con sesion', async () => {
    await request(t.app.getHttpServer()).post('/api/v1/auth/2fa/setup').expect(401);
  });

  describe('cambio de contrasena (RF-71, RF-72, RF-73, RF-78)', () => {
    const NEW_PASSWORD = 'Nueva-clave-segura-9';
    const server = () => t.app.getHttpServer();

    it('con cambio pendiente solo deja ver la sesion, cerrarla y cambiar la clave', async () => {
      await addUser(t, { role: 'STUDENT', mustChangePassword: true });
      const res = await login({ code: CODE, password: PASSWORD }).expect(200);
      expect(res.body.mustChangePassword).toBe(true);
      const cookie = res.headers['set-cookie'] ?? [];

      await request(server()).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
      const blocked = await request(server())
        .post('/api/v1/auth/policy/accept')
        .set('Cookie', cookie)
        .send({ privacy: true, terms: true })
        .expect(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('cambia la clave, quita la marca y cierra las otras sesiones', async () => {
      await addUser(t, { role: 'STUDENT', mustChangePassword: true });
      const first = await login({ code: CODE, password: PASSWORD }).expect(200);
      const other = await login({ code: CODE, password: PASSWORD }).expect(200);

      const changed = await request(server())
        .post('/api/v1/auth/password')
        .set('Cookie', first.headers['set-cookie'] ?? [])
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(204);
      const freshCookie = changed.headers['set-cookie'] ?? [];

      expect(t.prisma.users[0]!.localCredential!.mustChangePassword).toBe(false);
      expect(t.prisma.users[0]!.localCredential!.passwordChangedAt).toBeInstanceOf(Date);
      expect(t.audit.records.map((r) => r.action)).toContain('auth.password_changed');

      // La sesion nueva sirve y ya no esta pendiente.
      await request(server())
        .get('/api/v1/auth/me')
        .set('Cookie', freshCookie)
        .expect(200)
        .expect((r) => expect(r.body.mustChangePassword).toBe(false));
      // La otra sesion y la anterior quedaron cerradas.
      await request(server())
        .get('/api/v1/auth/me')
        .set('Cookie', other.headers['set-cookie'] ?? [])
        .expect(401);
      await request(server())
        .get('/api/v1/auth/me')
        .set('Cookie', first.headers['set-cookie'] ?? [])
        .expect(401);
      // La clave nueva entra y la vieja no.
      await login({ code: CODE, password: NEW_PASSWORD }).expect(200);
      await login({ code: CODE, password: PASSWORD }).expect(401);
    });

    it('rechaza la clave actual incorrecta', async () => {
      await addUser(t);
      const res = await login({ code: CODE, password: PASSWORD });
      const wrong = await request(server())
        .post('/api/v1/auth/password')
        .set('Cookie', res.headers['set-cookie'] ?? [])
        .send({ currentPassword: 'mala', newPassword: NEW_PASSWORD })
        .expect(400);
      expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    });

    it.each([
      ['corta', 'Ab1-xy'],
      ['comun', 'contrasena123'],
      ['igual a la actual', PASSWORD],
      ['con el DNI', `abc${DNI}xyz`],
      ['con el codigo', `x${CODE}x`],
    ])('rechaza una clave nueva %s', async (_name, newPassword) => {
      await addUser(t);
      const res = await login({ code: CODE, password: PASSWORD });
      const rejected = await request(server())
        .post('/api/v1/auth/password')
        .set('Cookie', res.headers['set-cookie'] ?? [])
        .send({ currentPassword: PASSWORD, newPassword })
        .expect(400);
      expect(rejected.body.error.details.length).toBeGreaterThan(0);
      expect(t.prisma.users[0]!.localCredential!.passwordChangedAt).toBeNull();
    });

    it('exige sesion', async () => {
      await request(server())
        .post('/api/v1/auth/password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });
  });
});
