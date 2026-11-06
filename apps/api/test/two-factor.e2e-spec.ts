import { generateSync } from 'otplib';
import request from 'supertest';
import { createTestApp, type TestApp } from './helpers.js';
import { DniService } from './../src/modules/auth/dni.service.js';
import { PasswordService } from './../src/modules/auth/password.service.js';
import { luhnCheckDigit } from './../src/modules/auth/user-code.js';

// RF-85: el administrador no entra al sistema hasta activar el 2FA; los codigos de recuperacion
// sirven una sola vez. Base de datos y sesiones en memoria (sin Docker).
const PASSWORD = 'Clave-Segura-123';
const code9 = (n: number) => `26000000${n}`;
const codeOf = (n: number) => code9(n) + luhnCheckDigit(code9(n));
const ID = (n: number) => `00000000-0000-7000-8000-00000000000${n}`;

type Role = 'ADMIN' | 'TEACHER';

async function addUser(
  t: TestApp,
  n: number,
  o: { role?: Role; verified?: boolean; totp?: string } = {},
) {
  const hash = await t.app.get(PasswordService).hash(PASSWORD);
  t.prisma.users.push({
    id: ID(n),
    email: `u${n}@colegio.example`,
    code: codeOf(n),
    dniEncrypted: t.app.get(DniService).encrypt('45678901'),
    contactEmail: 'usuario@correo.pe',
    contactEmailIsGuardian: false,
    phone: '987654321',
    address: null,
    emailVerifiedAt: o.verified === false ? null : new Date(),
    fullName: `Usuario ${n}`,
    role: o.role ?? 'ADMIN',
    status: 'ACTIVE',
    localCredential: {
      userId: ID(n),
      passwordHash: hash,
      totpSecretEncrypted: null,
      mustChangePassword: false,
      passwordChangedAt: null,
    },
  });
}

describe('2FA obligatorio del administrador (RF-85, e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });

  afterEach(async () => {
    await t.app.close();
  });

  const server = () => t.app.getHttpServer();
  const post = (path: string) => request(server()).post(`/api/v1/auth${path}`);
  const get = (path: string) => request(server()).get(`/api/v1/auth${path}`);
  const login = (n: number, extra: object = {}) =>
    post('/login').send({ code: codeOf(n), password: PASSWORD, ...extra });
  const cookieOf = async (n: number) => (await login(n).expect(200)).headers['set-cookie'] ?? [];

  /** Activa el 2FA del usuario n por la API; devuelve el secreto, los codigos y la sesion nueva. */
  async function activate(n: number) {
    const first = await cookieOf(n);
    const setup = await post('/2fa/setup').set('Cookie', first).expect(201);
    const secret = setup.body.secret as string;
    const enabled = await post('/2fa/enable')
      .set('Cookie', first)
      .send({ code: generateSync({ secret }) })
      .expect(200);
    return {
      secret,
      first,
      recoveryCodes: enabled.body.recoveryCodes as string[],
      cookie: enabled.headers['set-cookie'] ?? [],
    };
  }

  describe('primer ingreso', () => {
    it('el login del administrador sin 2FA avisa que debe activarlo; el de otro rol, no', async () => {
      await addUser(t, 1);
      await addUser(t, 2, { role: 'TEACHER' });
      expect((await login(1).expect(200)).body.mustEnableTwoFactor).toBe(true);
      expect((await login(2).expect(200)).body.mustEnableTwoFactor).toBe(false);
    });

    it('mientras no lo active solo puede ver su sesion, activarlo y cerrar sesion', async () => {
      await addUser(t, 1);
      const cookie = await cookieOf(1);
      await get('/me').set('Cookie', cookie).expect(200);
      await get('/2fa/status').set('Cookie', cookie).expect(200);
      await post('/2fa/setup').set('Cookie', cookie).expect(201);
      const blocked = await get('/profile').set('Cookie', cookie).expect(403);
      expect(blocked.body.error.code).toBe('TWO_FACTOR_REQUIRED');
      await request(server()).get('/api/v1/users').set('Cookie', cookie).expect(403);
      await post('/logout').set('Cookie', cookie).expect(204);
    });

    it('antes del 2FA van la contrasena y el correo (RF-71)', async () => {
      await addUser(t, 1, { verified: false });
      const cookie = await cookieOf(1);
      const res = await post('/2fa/setup').set('Cookie', cookie).expect(403);
      expect(res.body.error.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    });

    it('solo un administrador puede activarlo', async () => {
      await addUser(t, 2, { role: 'TEACHER' });
      const cookie = await cookieOf(2);
      await post('/2fa/setup').set('Cookie', cookie).expect(403);
      await post('/2fa/setup').expect(401);
    });
  });

  describe('activacion', () => {
    it('devuelve 10 codigos de recuperacion una sola vez, abre una sesion libre y cierra la anterior', async () => {
      await addUser(t, 1);
      const { first, recoveryCodes, cookie } = await activate(1);
      expect(recoveryCodes).toHaveLength(10);
      expect(new Set(recoveryCodes).size).toBe(10);
      for (const code of recoveryCodes)
        expect(code).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);

      const me = await get('/me').set('Cookie', cookie).expect(200);
      expect(me.body.mustEnableTwoFactor).toBe(false);
      // La sesion anterior ya no vale (RF-78).
      await get('/me').set('Cookie', first).expect(401);

      // Nunca quedan en claro: ni en la base ni en la bitacora.
      const stored = JSON.stringify(t.prisma.recoveryCodes);
      const audit = JSON.stringify(t.audit.records);
      for (const code of recoveryCodes) {
        expect(stored).not.toContain(code);
        expect(stored).not.toContain(code.replace('-', ''));
        expect(audit).not.toContain(code);
      }
      expect(t.audit.records.map((r) => r.action)).toContain('auth.2fa_enabled');
    });

    it('un codigo de la app incorrecto no activa nada', async () => {
      await addUser(t, 1);
      const cookie = await cookieOf(1);
      await post('/2fa/setup').set('Cookie', cookie).expect(201);
      await post('/2fa/enable').set('Cookie', cookie).send({ code: '000000' }).expect(400);
      expect(t.prisma.users[0]!.localCredential!.totpSecretEncrypted).toBeNull();
      expect(t.prisma.recoveryCodes).toHaveLength(0);
    });

    it('con el 2FA ya activo no se puede volver a empezar (409)', async () => {
      await addUser(t, 1);
      const { cookie } = await activate(1);
      await post('/2fa/setup').set('Cookie', cookie).expect(409);
    });

    it('el estado dice cuantos codigos quedan', async () => {
      await addUser(t, 1);
      const { cookie } = await activate(1);
      const res = await get('/2fa/status').set('Cookie', cookie).expect(200);
      expect(res.body).toEqual({ enabled: true, recoveryCodesLeft: 10 });
    });
  });

  describe('ingreso con 2FA y codigos de recuperacion', () => {
    it('sin codigo pide el segundo factor y un codigo de recuperacion sirve una sola vez', async () => {
      await addUser(t, 1);
      const { recoveryCodes } = await activate(1);
      const [first, second] = recoveryCodes as [string, string];

      const required = await login(1).expect(401);
      expect(required.body.error.code).toBe('TOTP_REQUIRED');

      const ok = await login(1, { recoveryCode: first.toLowerCase() }).expect(200);
      expect(ok.body.mustEnableTwoFactor).toBe(false);
      const again = await login(1, { recoveryCode: first }).expect(401);
      expect(again.body.error.code).toBe('RECOVERY_CODE_INVALID');
      // Con espacio en lugar de guion tambien se acepta.
      await login(1, { recoveryCode: second.replace('-', ' ') }).expect(200);

      const events = t.audit.records.filter((r) => r.action === 'auth.2fa_recovery_used');
      expect(events).toHaveLength(2);
      expect(events[1]!.afterState).toEqual({ remaining: 8 });
      expect(JSON.stringify(t.audit.records)).not.toContain(first);
    });

    it('un codigo de recuperacion inventado falla y cuenta como intento fallido', async () => {
      await addUser(t, 1);
      await activate(1);
      const before = t.audit.records.filter((r) => r.action === 'auth.login_failed').length;
      const res = await login(1, { recoveryCode: 'AAAAA-AAAAA' }).expect(401);
      expect(res.body.error.code).toBe('RECOVERY_CODE_INVALID');
      expect(t.audit.records.filter((r) => r.action === 'auth.login_failed')).toHaveLength(
        before + 1,
      );
    });

    it('enviar el codigo de la app y uno de recuperacion a la vez responde 400', async () => {
      await addUser(t, 1);
      const { secret, recoveryCodes } = await activate(1);
      await login(1, {
        totp: generateSync({ secret }),
        recoveryCode: recoveryCodes[0],
      }).expect(400);
    });

    it('un formato de recuperacion invalido responde 400', async () => {
      await addUser(t, 1);
      await activate(1);
      await login(1, { recoveryCode: 'corto' }).expect(400);
    });

    it('el codigo de recuperacion de otro administrador no sirve', async () => {
      await addUser(t, 1);
      await addUser(t, 2);
      const a = await activate(1);
      await activate(2);
      await login(2, { recoveryCode: a.recoveryCodes[0] }).expect(401);
    });
  });

  describe('codigos nuevos', () => {
    it('exige un codigo vigente de la app y deja sin efecto los anteriores', async () => {
      await addUser(t, 1);
      const { secret, recoveryCodes, cookie } = await activate(1);

      await post('/2fa/recovery-codes').set('Cookie', cookie).send({ code: '000000' }).expect(400);
      // El codigo de la app del paso de activacion ya se uso (cada uno vale una sola vez): se usa el
      // del intervalo siguiente, que la tolerancia de reloj de 30 s acepta y nunca es el gastado.
      const nextStep = Math.floor(Date.now() / 30_000) + 1;
      const previous = generateSync({ secret, epoch: nextStep * 30 });
      const res = await post('/2fa/recovery-codes')
        .set('Cookie', cookie)
        .send({ code: previous })
        .expect(200);
      const fresh = res.body.recoveryCodes as string[];
      expect(fresh).toHaveLength(10);
      expect(fresh).not.toEqual(recoveryCodes);

      await login(1, { recoveryCode: recoveryCodes[0] }).expect(401);
      await login(1, { recoveryCode: fresh[0] }).expect(200);
      expect(t.audit.records.map((r) => r.action)).toContain('auth.2fa_recovery_regenerated');
    });

    it('sin 2FA activo no hay nada que regenerar', async () => {
      await addUser(t, 1);
      const cookie = await cookieOf(1);
      await post('/2fa/recovery-codes').set('Cookie', cookie).send({ code: '123456' }).expect(403);
    });
  });

  describe('reinicio por otro administrador', () => {
    it('borra el 2FA y los codigos, cierra sus sesiones y le vuelve a exigir activarlo', async () => {
      await addUser(t, 1);
      await addUser(t, 2);
      const victim = await activate(2);
      const admin = await activate(1);

      await post(`/users/${ID(2)}/2fa/reset`)
        .set('Cookie', admin.cookie)
        .expect(204);

      expect(t.prisma.users[1]!.localCredential!.totpSecretEncrypted).toBeNull();
      expect(t.prisma.recoveryCodes.filter((r) => r.userId === ID(2))).toHaveLength(0);
      expect(t.prisma.recoveryCodes.filter((r) => r.userId === ID(1))).toHaveLength(10);
      await get('/me').set('Cookie', victim.cookie).expect(401);
      const again = await login(2).expect(200);
      expect(again.body.mustEnableTwoFactor).toBe(true);
      const record = t.audit.records.find((r) => r.action === 'auth.2fa_reset');
      expect(record).toMatchObject({ actorId: ID(1), entityId: ID(2) });
    });

    it('no se puede reiniciar el propio 2FA, ni lo hace un docente, ni con un usuario inexistente', async () => {
      await addUser(t, 1);
      await addUser(t, 3, { role: 'TEACHER' });
      const admin = await activate(1);
      await post(`/users/${ID(1)}/2fa/reset`)
        .set('Cookie', admin.cookie)
        .expect(400);
      await post('/users/00000000-0000-7000-8000-0000000000ff/2fa/reset')
        .set('Cookie', admin.cookie)
        .expect(404);
      const teacher = await cookieOf(3);
      await post(`/users/${ID(1)}/2fa/reset`)
        .set('Cookie', teacher)
        .expect(403);
      await post(`/users/${ID(1)}/2fa/reset`).expect(401);
    });
  });
});
