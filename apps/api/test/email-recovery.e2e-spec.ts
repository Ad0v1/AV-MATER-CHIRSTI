import { generateSync } from 'otplib';
import request from 'supertest';
import { createTestApp, type TestApp } from './helpers.js';
import { DniService } from './../src/modules/auth/dni.service.js';
import { PasswordService } from './../src/modules/auth/password.service.js';
import { luhnCheckDigit } from './../src/modules/auth/user-code.js';

const PASSWORD = 'Clave-Segura-123';
const NEW_PASSWORD = 'Otra-clave-segura-8';
const body9 = '260000001';
const CODE = body9 + luhnCheckDigit(body9);
const UNKNOWN_CODE = '271234560' + luhnCheckDigit('271234560');
const ADMIN_ID = '00000000-0000-7000-8000-000000000001';
const USER_ID = '00000000-0000-7000-8000-000000000002';

type Overrides = {
  id?: string;
  role?: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
  code?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  email?: string | null;
  verified?: boolean;
};

async function addUser(t: TestApp, o: Overrides = {}) {
  const hash = await t.app.get(PasswordService).hash(PASSWORD);
  const verified = o.verified ?? true;
  const email = o.email === undefined ? 'familia@correo.pe' : o.email;
  t.prisma.users.push({
    id: o.id ?? USER_ID,
    institutionalEmail: `${o.id ?? USER_ID}@colegio.example`,
    code: o.code ?? CODE,
    dniEncrypted: t.app.get(DniService).encrypt('45678901'),
    contactEmail: email,
    contactEmailIsGuardian: false,
    phone: '987654321',
    address: null,
    emailVerifiedAt: verified && email ? new Date() : null,
    fullName: 'Usuario de prueba',
    role: o.role ?? 'STUDENT',
    status: o.status ?? 'ACTIVE',
    localCredential: {
      userId: o.id ?? USER_ID,
      passwordHash: hash,
      totpSecretEncrypted: null,
      mustChangePassword: false,
      passwordChangedAt: null,
    },
  });
}

describe('Correo verificado, politica y recuperacion (e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });

  afterEach(async () => {
    await t.app.close();
  });

  const server = () => t.app.getHttpServer();
  const post = (path: string) => request(server()).post(`/api/v1/auth${path}`);
  const login = (code = CODE) => post('/login').send({ code, password: PASSWORD });

  async function cookieOf(code = CODE) {
    const res = await login(code).expect(200);
    return res.headers['set-cookie'] ?? [];
  }

  // El administrador no puede hacer nada hasta activar el 2FA (RF-85): se activa por la API y se
  // devuelve la sesion nueva, ya sin ese paso pendiente.
  async function adminCookieOf(code = CODE) {
    const first = await cookieOf(code);
    const setup = await post('/2fa/setup').set('Cookie', first).expect(201);
    const enabled = await post('/2fa/enable')
      .set('Cookie', first)
      .send({ code: generateSync({ secret: setup.body.secret }) })
      .expect(200);
    return enabled.headers['set-cookie'] ?? [];
  }

  describe('primer ingreso con el correo pendiente (RN-18, RF-80)', () => {
    it('el login avisa que falta verificar el correo', async () => {
      await addUser(t, { verified: false, email: null });
      const res = await login().expect(200);
      expect(res.body.mustVerifyEmail).toBe(true);
    });

    it('solo deja ver la sesion, aceptar la politica y verificar el correo', async () => {
      await addUser(t, { verified: false, email: null });
      const cookie = await cookieOf();

      await request(server()).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
      await post('/policy/accept')
        .set('Cookie', cookie)
        .send({ privacy: true, terms: true })
        .expect(204);
      const blocked = await post('/2fa/setup').set('Cookie', cookie).expect(403);
      // La ruta de 2FA es de ADMIN: para un estudiante gana el permiso por rol.
      expect(['FORBIDDEN', 'EMAIL_VERIFICATION_REQUIRED']).toContain(blocked.body.error.code);
    });

    it('rechaza una ruta cualquiera con EMAIL_VERIFICATION_REQUIRED', async () => {
      await addUser(t, { verified: false, email: null, role: 'ADMIN' });
      const cookie = await cookieOf();
      const res = await post('/2fa/setup').set('Cookie', cookie).expect(403);
      expect(res.body.error.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    });

    it('envia un codigo, lo verifica y abre una sesion sin el paso pendiente', async () => {
      await addUser(t, { verified: false, email: null });
      const cookie = await cookieOf();

      await post('/email/start')
        .set('Cookie', cookie)
        .send({ email: 'Padre@Correo.PE' })
        .expect(204);
      expect(t.mail.sent).toHaveLength(1);
      expect(t.mail.sent[0]!.to).toBe('padre@correo.pe');

      const verified = await post('/email/verify')
        .set('Cookie', cookie)
        .send({ code: t.mail.lastCode() })
        .expect(204);
      expect(t.prisma.users[0]!.contactEmail).toBe('padre@correo.pe');
      expect(t.prisma.users[0]!.emailVerifiedAt).toBeInstanceOf(Date);

      const fresh = verified.headers['set-cookie'] ?? [];
      await request(server())
        .get('/api/v1/auth/me')
        .set('Cookie', fresh)
        .expect(200)
        .expect((r) => expect(r.body.mustVerifyEmail).toBe(false));
      // La sesion anterior ya no sirve (se cerraron todas, RF-78).
      await request(server()).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    });

    it('marca el correo del apoderado cuando el alumno no tiene uno (RF-81)', async () => {
      await addUser(t, { verified: false, email: null });
      const cookie = await cookieOf();
      await post('/email/start')
        .set('Cookie', cookie)
        .send({ email: 'madre@correo.pe', guardian: true })
        .expect(204);
      await post('/email/verify')
        .set('Cookie', cookie)
        .send({ code: t.mail.lastCode() })
        .expect(204);
      expect(t.prisma.users[0]!.contactEmailIsGuardian).toBe(true);
    });

    it('un codigo incorrecto se rechaza y al quinto intento se invalida', async () => {
      await addUser(t, { verified: false, email: null });
      const cookie = await cookieOf();
      await post('/email/start').set('Cookie', cookie).send({ email: 'a@correo.pe' }).expect(204);
      const good = t.mail.lastCode();
      const wrong = good === '000000' ? '111111' : '000000';

      for (let i = 0; i < 4; i++) {
        const res = await post('/email/verify')
          .set('Cookie', cookie)
          .send({ code: wrong })
          .expect(400);
        expect(res.body.error.code).toBe('CODE_INVALID');
      }
      const last = await post('/email/verify')
        .set('Cookie', cookie)
        .send({ code: wrong })
        .expect(400);
      expect(last.body.error.code).toBe('CODE_EXPIRED');
      // Con el codigo invalidado, ni el correcto sirve.
      await post('/email/verify').set('Cookie', cookie).send({ code: good }).expect(400);
      expect(t.prisma.users[0]!.emailVerifiedAt).toBeNull();
    });

    it('limita el reenvio: espera de un minuto entre codigos', async () => {
      await addUser(t, { verified: false, email: null });
      const cookie = await cookieOf();
      await post('/email/start').set('Cookie', cookie).send({ email: 'a@correo.pe' }).expect(204);
      const again = await post('/email/start')
        .set('Cookie', cookie)
        .send({ email: 'a@correo.pe' })
        .expect(429);
      expect(again.body.error.code).toBe('RESEND_TOO_SOON');
      expect(t.mail.sent).toHaveLength(1);
    });

    it('si el correo falla responde 503 y no deja rastro del codigo', async () => {
      await addUser(t, { verified: false, email: null });
      const cookie = await cookieOf();
      t.mail.failNext = true;
      const res = await post('/email/start')
        .set('Cookie', cookie)
        .send({ email: 'a@correo.pe' })
        .expect(503);
      expect(res.body.error.code).toBe('MAIL_UNAVAILABLE');
      const text = JSON.stringify(t.audit.records);
      expect(text).not.toContain('a@correo.pe');
    });

    it('la bitacora no guarda el correo ni el codigo', async () => {
      await addUser(t, { verified: false, email: null });
      const cookie = await cookieOf();
      await post('/email/start').set('Cookie', cookie).send({ email: 'a@correo.pe' }).expect(204);
      const code = t.mail.lastCode();
      await post('/email/verify').set('Cookie', cookie).send({ code }).expect(204);

      const text = JSON.stringify(t.audit.records);
      expect(text).not.toContain('a@correo.pe');
      expect(text).not.toContain(code);
      expect(t.audit.records.map((r) => r.action)).toEqual(
        expect.arrayContaining(['auth.email_code_sent', 'auth.email_verified']),
      );
    });

    it('valida el correo y el codigo con 400', async () => {
      await addUser(t);
      const cookie = await cookieOf();
      await post('/email/start').set('Cookie', cookie).send({ email: 'no-es-correo' }).expect(400);
      await post('/email/verify').set('Cookie', cookie).send({ code: '12' }).expect(400);
    });

    it('exige sesion', async () => {
      await post('/email/start').send({ email: 'a@correo.pe' }).expect(401);
      await post('/email/verify').send({ code: '123456' }).expect(401);
    });
  });

  describe('casillas de la politica (RF-07)', () => {
    it('exige las dos casillas', async () => {
      await addUser(t);
      const cookie = await cookieOf();
      await post('/policy/accept').set('Cookie', cookie).send({}).expect(400);
      await post('/policy/accept').set('Cookie', cookie).send({ privacy: true }).expect(400);
      await post('/policy/accept')
        .set('Cookie', cookie)
        .send({ privacy: true, terms: false })
        .expect(400);
      await post('/policy/accept')
        .set('Cookie', cookie)
        .send({ privacy: true, terms: true })
        .expect(204);
      expect(t.prisma.lastAcceptance?.onBehalfOfWards).toBe(false);
    });

    it('el apoderado debe marcar tambien la aceptacion en nombre de sus alumnos', async () => {
      await addUser(t, { role: 'GUARDIAN' });
      const cookie = await cookieOf();
      await post('/policy/accept')
        .set('Cookie', cookie)
        .send({ privacy: true, terms: true })
        .expect(400);
      await post('/policy/accept')
        .set('Cookie', cookie)
        .send({ privacy: true, terms: true, onBehalfOfWards: true })
        .expect(204);
      expect(t.prisma.lastAcceptance?.onBehalfOfWards).toBe(true);
    });
  });

  describe('recuperacion de contrasena (RF-82)', () => {
    it('envia un codigo al correo verificado y cambia la contrasena con el', async () => {
      await addUser(t);
      await post('/recover/request').send({ code: CODE }).expect(204);
      expect(t.mail.sent).toHaveLength(1);
      expect(t.mail.sent[0]!.to).toBe('familia@correo.pe');

      await post('/recover/confirm')
        .send({ code: CODE, emailCode: t.mail.lastCode(), newPassword: NEW_PASSWORD })
        .expect(204);

      await post('/login').send({ code: CODE, password: NEW_PASSWORD }).expect(200);
      await post('/login').send({ code: CODE, password: PASSWORD }).expect(401);
      expect(t.audit.records.map((r) => r.action)).toEqual(
        expect.arrayContaining(['auth.recovery_requested', 'auth.password_recovered']),
      );
    });

    it('responde 204 igual si el usuario no existe, no tiene correo verificado o esta inactivo', async () => {
      await addUser(t, { id: ADMIN_ID, code: CODE, verified: false, email: null });
      await post('/recover/request').send({ code: UNKNOWN_CODE }).expect(204);
      await post('/recover/request').send({ code: CODE }).expect(204);
      expect(t.mail.sent).toHaveLength(0);

      t.prisma.users.length = 0;
      await addUser(t, { status: 'INACTIVE' });
      await post('/recover/request').send({ code: CODE }).expect(204);
      expect(t.mail.sent).toHaveLength(0);
    });

    it('cierra las sesiones abiertas y levanta el bloqueo de la cuenta', async () => {
      await addUser(t);
      const cookie = await cookieOf();
      await post('/recover/request').send({ code: CODE }).expect(204);
      await post('/recover/confirm')
        .send({ code: CODE, emailCode: t.mail.lastCode(), newPassword: NEW_PASSWORD })
        .expect(204);
      await request(server()).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    });

    it('un codigo equivocado da el mismo error generico que un usuario inexistente', async () => {
      await addUser(t);
      await post('/recover/request').send({ code: CODE }).expect(204);
      const wrong = t.mail.lastCode() === '000000' ? '111111' : '000000';
      const a = await post('/recover/confirm')
        .send({ code: CODE, emailCode: wrong, newPassword: NEW_PASSWORD })
        .expect(400);
      const b = await post('/recover/confirm')
        .send({ code: UNKNOWN_CODE, emailCode: '123456', newPassword: NEW_PASSWORD })
        .expect(400);
      expect(a.body.error.code).toBe('INVALID_RECOVERY');
      expect(b.body.error).toEqual(a.body.error);
    });

    it('una contrasena que no cumple la politica no gasta el codigo', async () => {
      await addUser(t);
      await post('/recover/request').send({ code: CODE }).expect(204);
      const emailCode = t.mail.lastCode();

      const weak = await post('/recover/confirm')
        .send({ code: CODE, emailCode, newPassword: '12345678' })
        .expect(400);
      expect(weak.body.error.details.length).toBeGreaterThan(0);
      await post('/recover/confirm')
        .send({ code: CODE, emailCode, newPassword: NEW_PASSWORD })
        .expect(204);
    });

    it('el codigo no se puede reutilizar', async () => {
      await addUser(t);
      await post('/recover/request').send({ code: CODE }).expect(204);
      const emailCode = t.mail.lastCode();
      await post('/recover/confirm')
        .send({ code: CODE, emailCode, newPassword: NEW_PASSWORD })
        .expect(204);
      await post('/recover/confirm')
        .send({ code: CODE, emailCode, newPassword: 'Y-otra-mas-segura-3' })
        .expect(400);
    });

    it('si el correo falla no revela nada', async () => {
      await addUser(t);
      t.mail.failNext = true;
      await post('/recover/request').send({ code: CODE }).expect(204);
      expect(t.mail.sent).toHaveLength(0);
    });
  });

  describe('verificacion manual del correo (RF-88)', () => {
    it('el administrador marca el correo de otro usuario con motivo y queda en la bitacora', async () => {
      await addUser(t, { id: ADMIN_ID, code: '2600000000', role: 'ADMIN' });
      await addUser(t, { verified: false, email: null });
      const cookie = await adminCookieOf('2600000000');
      const reason = 'El servidor de correo estuvo caido el dia de la matricula';

      await post(`/users/${USER_ID}/email/manual-verification`)
        .set('Cookie', cookie)
        .send({ email: 'Familia@Correo.pe', reason })
        .expect(204);

      const target = t.prisma.users.find((u) => u.id === USER_ID)!;
      expect(target.contactEmail).toBe('familia@correo.pe');
      expect(target.emailVerifiedAt).toBeInstanceOf(Date);
      const record = t.audit.records.find((r) => r.action === 'auth.email_verified_manually');
      expect(record).toMatchObject({ actorId: ADMIN_ID, entityId: USER_ID });
      expect(JSON.stringify(record)).not.toContain('familia@correo.pe');
    });

    it('exige motivo de al menos 10 caracteres y rol administrador', async () => {
      await addUser(t, { id: ADMIN_ID, code: '2600000000', role: 'ADMIN' });
      await addUser(t, { verified: false, email: null });
      const adminCookie = await adminCookieOf('2600000000');
      await post(`/users/${USER_ID}/email/manual-verification`)
        .set('Cookie', adminCookie)
        .send({ email: 'a@correo.pe', reason: 'corto' })
        .expect(400);
      await post(`/users/${USER_ID}/email/manual-verification`)
        .send({ email: 'a@correo.pe', reason: 'Motivo suficientemente largo' })
        .expect(401);
    });

    it('un usuario que no es administrador no puede usarla', async () => {
      await addUser(t, { id: ADMIN_ID, code: '2600000000', role: 'TEACHER' });
      await addUser(t, { verified: false, email: null });
      const cookie = await cookieOf('2600000000');
      await post(`/users/${USER_ID}/email/manual-verification`)
        .set('Cookie', cookie)
        .send({ email: 'a@correo.pe', reason: 'Motivo suficientemente largo' })
        .expect(403);
    });

    it('responde 404 si el usuario no existe', async () => {
      await addUser(t, { id: ADMIN_ID, code: '2600000000', role: 'ADMIN' });
      const cookie = await adminCookieOf('2600000000');
      await post('/users/00000000-0000-7000-8000-0000000000ff/email/manual-verification')
        .set('Cookie', cookie)
        .send({ email: 'a@correo.pe', reason: 'Motivo suficientemente largo' })
        .expect(404);
    });
  });
});
