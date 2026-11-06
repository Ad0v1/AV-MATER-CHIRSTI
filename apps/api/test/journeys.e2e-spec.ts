import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import { generateSync } from 'otplib';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { MailSender } from './../src/common/mail/mail-sender.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { MemorySessionStore, SessionStore } from './../src/common/session/session.store.js';
import { loadEnv } from './../src/config/env.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { DniService } from './../src/modules/auth/dni.service.js';
import { PasswordService } from './../src/modules/auth/password.service.js';
import { UserCodeService } from './../src/modules/auth/user-code.service.js';
import { MemoryAuditSink, MemoryMailSender } from './helpers.js';

// Recorridos completos de punta a punta (Fase F, RF-68..RF-88): se usa la API como la usa la web,
// con MySQL real y el seed cargado. Sesiones, correo y bitacora en memoria. Usa los DNI ficticios
// 92000001..92000100 y limpia lo que crea.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const DOMAIN = 'colegio.example';
const NEW_PASSWORD = 'Clave-Nueva-Segura-77';
const NEWER_PASSWORD = 'Otra-Clave-Segura-88';

const QA_DNI_BASE = 92_000_000;
const QA_DNI_COUNT = 100;
let dniSeq = 0;
const nd = () => String(QA_DNI_BASE + ++dniSeq);
const dniPair = () => {
  const dni = nd();
  return { dni, dniConfirm: dni };
};
const dniService = new DniService(loadEnv());
const qaHashes = () =>
  Array.from({ length: QA_DNI_COUNT }, (_, i) => dniService.hash(String(QA_DNI_BASE + i + 1)));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Credentials = { code: string; initialPassword: string };

const noopThrottler = {
  increment: () =>
    Promise.resolve({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};

describe.skipIf(!process.env.DATABASE_URL)('Recorridos completos (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let mail: MemoryMailSender;
  let sink: MemoryAuditSink;
  let sessions: SessionService;
  let adminCookie: string;
  let sectionId: string;
  let baseline: { users: number; links: number; enrollments: number };

  const http = () => request(app.getHttpServer());
  const api = (method: 'get' | 'post' | 'patch', path: string, cookie?: string | string[]) => {
    const req = http()[method](API + path);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const asAdmin = (method: 'post' | 'get', path: string) => api(method, path, adminCookie);
  const login = (code: string, password: string) =>
    api('post', '/auth/login').send({ code, password });
  const cookieOf = (res: request.Response) =>
    (res.headers['set-cookie'] as unknown as string[]) ?? [];

  const counts = async () => ({
    users: await prisma.user.count(),
    links: await prisma.guardianStudent.count(),
    enrollments: await prisma.enrollment.count(),
  });

  const clean = async () => {
    const users = await prisma.user.findMany({
      where: { dniHash: { in: qaHashes() } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.policyAcceptance.deleteMany({ where: { userId: { in: ids } } });
    await prisma.guardianStudent.deleteMany({
      where: { OR: [{ guardianId: { in: ids } }, { studentId: { in: ids } }] },
    });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  };

  const createStudent = (guardians: object[], name: string) =>
    asAdmin('post', '/students').send({
      fullName: name,
      sectionId,
      ...dniPair(),
      guardians,
    });

  /** Primer ingreso completo de una cuenta nueva: clave, politica, correo y, si falta, telefono. */
  async function firstLogin(
    creds: Credentials,
    o: { email: string; guardian?: boolean; wards?: boolean; phone?: string },
  ) {
    const entered = await login(creds.code, creds.initialPassword).expect(200);
    expect(entered.body).toMatchObject({ mustChangePassword: true });
    let cookie = cookieOf(entered);

    // Con la clave inicial todo esta bloqueado salvo cambiarla (RN-18).
    const blocked = await api('get', '/auth/profile', cookie).expect(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const changed = await api('post', '/auth/password', cookie)
      .send({ currentPassword: creds.initialPassword, newPassword: NEW_PASSWORD })
      .expect(204);
    // La sesion de antes ya no sirve y la nueva conserva los pasos que faltan.
    await api('get', '/auth/me', cookie).expect(401);
    cookie = cookieOf(changed);

    await api('post', '/auth/policy/accept', cookie)
      .send({ privacy: true, terms: true, ...(o.wards ? { onBehalfOfWards: true } : {}) })
      .expect(204);

    await api('post', '/auth/email/start', cookie)
      .send({ email: o.email, ...(o.guardian ? { guardian: true } : {}) })
      .expect(204);
    const verified = await api('post', '/auth/email/verify', cookie)
      .send({ code: mail.lastCode() })
      .expect(204);
    cookie = cookieOf(verified);

    const me = await api('get', '/auth/me', cookie).expect(200);
    if (o.phone) {
      expect(me.body.mustCompleteContact).toBe(true);
      const patched = await api('patch', '/auth/profile', cookie)
        .send({ phone: o.phone })
        .expect(204);
      cookie = cookieOf(patched);
    }
    const done = await api('get', '/auth/me', cookie).expect(200);
    expect(done.body).toMatchObject({
      mustChangePassword: false,
      mustVerifyEmail: false,
      mustEnableTwoFactor: false,
      mustCompleteContact: false,
      mustAcceptPolicy: false,
    });
    return cookie;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    await clean();
    baseline = await counts();
    const year = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    sectionId = (
      await prisma.section.findFirstOrThrow({
        where: { academicYearId: year.id, gradeLevel: 3, code: 'A' },
      })
    ).id;

    mail = new MemoryMailSender();
    sink = new MemoryAuditSink();
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SessionStore)
      .useValue(new MemorySessionStore())
      .overrideProvider(AuditSink)
      .useValue(sink)
      .overrideProvider(MailSender)
      .useValue(mail)
      .overrideProvider(ThrottlerStorage)
      .useValue(noopThrottler)
      .compile();
    app = fixture.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    sessions = app.get(SessionService);

    // El administrador del seed, ya con su 2FA cumplido: la sesion se abre directamente.
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: `admin@${DOMAIN}` } });
    adminCookie = `${SESSION_COOKIE}=${await sessions.create({ id: admin.id, role: 'ADMIN' })}`;
  });

  afterAll(async () => {
    try {
      await clean();
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  describe('Alumno nuevo con su apoderado', () => {
    const state: {
      student?: Json;
      guardian?: Json;
      studentCreds?: Credentials;
      guardianCreds?: Credentials;
    } = {};

    it('el administrador da de alta al alumno con su apoderado y recibe las credenciales una sola vez', async () => {
      const res = await createStudent(
        [{ ...dniPair(), fullName: 'QA F5 Apoderado Nuevo' }],
        'QA F5 Alumno Nuevo',
      ).expect(201);
      state.student = res.body.user;
      state.guardian = res.body.guardians[0].user;
      state.studentCreds = res.body.credentials;
      state.guardianCreds = res.body.guardians[0].credentials;
      expect(state.studentCreds!.code).toMatch(/^\d{10}$/);
      expect(state.guardianCreds!.code).toMatch(/^\d{10}$/);
      expect(state.studentCreds!.code).not.toBe(state.guardianCreds!.code);
      expect(res.body.guardians[0]).toMatchObject({ created: true });
      expect(res.body.guardians[0].link.isPrimary).toBe(true);

      // Las credenciales no se pueden volver a ver ni estan en la bitacora.
      const detail = await asAdmin('get', `/users/${state.student!.id}`).expect(200);
      expect(JSON.stringify(detail.body)).not.toContain(state.studentCreds!.initialPassword);
      expect(detail.body.credentialStatus).toBe('PENDING');
      const audit = JSON.stringify(sink.records);
      for (const secret of [
        state.studentCreds!.initialPassword,
        state.guardianCreds!.initialPassword,
      ]) {
        expect(audit).not.toContain(secret);
      }
    });

    it('el alumno entra, cambia la clave, acepta la politica y verifica el correo de su apoderado', async () => {
      const cookie = await firstLogin(state.studentCreds!, {
        email: 'familia.qa@correo.example',
        guardian: true,
      });
      const row = await prisma.user.findUniqueOrThrow({ where: { id: state.student!.id } });
      expect(row.contactEmailIsGuardian).toBe(true);
      expect(row.emailVerifiedAt).not.toBeNull();
      // Con todo cumplido ya puede usar el sistema.
      await api('get', '/auth/me', cookie).expect(200);
      // La clave inicial ya no sirve; la nueva si.
      await login(state.studentCreds!.code, state.studentCreds!.initialPassword).expect(401);
      await login(state.studentCreds!.code, NEW_PASSWORD).expect(200);
    });

    it('el apoderado entra, y ademas debe registrar su telefono antes de usar el sistema', async () => {
      const cookie = await firstLogin(state.guardianCreds!, {
        email: 'apoderado.qa@correo.example',
        wards: true,
        phone: '987654321',
      });
      await api('get', '/auth/profile', cookie).expect(200);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: state.guardian!.id } });
      expect(row.phone).toBe('987654321');
      const accepted = await prisma.policyAcceptance.findFirstOrThrow({
        where: { userId: state.guardian!.id },
      });
      expect(accepted.onBehalfOfWards).toBe(true);
    });

    it('el administrador ve en la lista que ya cambiaron la clave y verificaron el correo (RF-87)', async () => {
      const detail = await asAdmin('get', `/users/${state.student!.id}`).expect(200);
      expect(detail.body).toMatchObject({ credentialStatus: 'READY', emailVerified: true });
    });
  });

  describe('Apoderado con dos hijos', () => {
    it('el segundo hijo reutiliza al apoderado por su DNI: no se crea otra cuenta ni otras credenciales', async () => {
      const guardianDni = dniPair();
      const first = await createStudent(
        [{ ...guardianDni, fullName: 'QA F5 Apoderado Dos Hijos' }],
        'QA F5 Hijo Uno',
      ).expect(201);
      const guardianId = first.body.guardians[0].user.id as string;
      const before = await counts();

      const second = await createStudent([guardianDni], 'QA F5 Hijo Dos').expect(201);
      expect(second.body.guardians[0]).toMatchObject({ created: false });
      expect(second.body.guardians[0].user.id).toBe(guardianId);
      expect(second.body.guardians[0].credentials).toBeUndefined();
      const after = await counts();
      expect(after.users).toBe(before.users + 1); // solo el hijo
      expect(after.links).toBe(before.links + 1);

      const links = await prisma.guardianStudent.findMany({
        where: { guardianId, isActive: true },
      });
      expect(links).toHaveLength(2);
      expect(links.every((l) => l.isPrimary === true)).toBe(true);
    });

    it('un alumno no admite un tercer apoderado (RN-17)', async () => {
      const kid = await createStudent(
        [
          { ...dniPair(), fullName: 'QA F5 Apo A' },
          { ...dniPair(), fullName: 'QA F5 Apo B' },
        ],
        'QA F5 Hijo Dos Apoderados',
      ).expect(201);
      const third = await asAdmin('post', '/guardians').send({
        fullName: 'QA F5 Apo C',
        ...dniPair(),
        studentIds: [kid.body.user.id],
      });
      expect(third.status).toBe(409);
    });
  });

  describe('Recuperar la contrasena (RF-82)', () => {
    it('con el codigo del correo se cambia la clave, se cierran las sesiones y la anterior deja de servir', async () => {
      const res = await createStudent(
        [{ ...dniPair(), fullName: 'QA F5 Apoderado Recupera' }],
        'QA F5 Alumno Recupera',
      ).expect(201);
      const creds = res.body.credentials as Credentials;
      const cookie = await firstLogin(creds, {
        email: 'recupera.qa@correo.example',
        guardian: true,
      });

      await api('post', '/auth/recover/request').send({ code: creds.code }).expect(204);
      const emailCode = mail.lastCode();
      expect(emailCode).toMatch(/^\d{6}$/);
      // Un usuario inexistente responde igual y no envia nada.
      const sentBefore = mail.sent.length;
      await api('post', '/auth/recover/request').send({ code: '2700000009' }).expect(204);
      expect(mail.sent).toHaveLength(sentBefore);

      await api('post', '/auth/recover/confirm')
        .send({ code: creds.code, emailCode, newPassword: NEWER_PASSWORD })
        .expect(204);
      await api('get', '/auth/me', cookie).expect(401);
      await login(creds.code, NEW_PASSWORD).expect(401);
      await login(creds.code, NEWER_PASSWORD).expect(200);
      // El codigo de correo ya se uso.
      await api('post', '/auth/recover/confirm')
        .send({ code: creds.code, emailCode, newPassword: NEW_PASSWORD })
        .expect(400);
    });
  });

  describe('Bloqueo por intentos fallidos (RF-75)', () => {
    it('5 fallos bloquean la cuenta aunque luego se use la clave correcta; el administrador la desbloquea', async () => {
      const res = await createStudent(
        [{ ...dniPair(), fullName: 'QA F5 Apoderado Bloqueo' }],
        'QA F5 Alumno Bloqueo',
      ).expect(201);
      const creds = res.body.credentials as Credentials;
      const userId = res.body.user.id as string;

      for (let i = 0; i < 5; i++) {
        await login(creds.code, 'clave-incorrecta').expect(401);
      }
      // Bloqueada: ni con la clave correcta, y sin decir que esta bloqueada.
      const blocked = await login(creds.code, creds.initialPassword).expect(401);
      expect(blocked.body.error.message).toBe('Credenciales invalidas');
      expect(sink.records.map((r) => r.action)).toContain('auth.account_locked');
      const detail = await asAdmin('get', `/users/${userId}`).expect(200);
      expect(detail.body.locked).toBe(true);

      // Restablecer la clave levanta el bloqueo y deja una clave temporal nueva.
      const reset = await asAdmin('post', `/users/${userId}/reset-password`).expect(200);
      const entered = await login(
        reset.body.credentials.code,
        reset.body.credentials.initialPassword,
      ).expect(200);
      expect(entered.body.mustChangePassword).toBe(true);
    });

    it('un login correcto reinicia el contador de fallos', async () => {
      const res = await createStudent(
        [{ ...dniPair(), fullName: 'QA F5 Apoderado Contador' }],
        'QA F5 Alumno Contador',
      ).expect(201);
      const creds = res.body.credentials as Credentials;
      for (let i = 0; i < 4; i++) await login(creds.code, 'mala').expect(401);
      await login(creds.code, creds.initialPassword).expect(200);
      for (let i = 0; i < 4; i++) await login(creds.code, 'mala').expect(401);
      await login(creds.code, creds.initialPassword).expect(200);
    });
  });

  describe('Administrador con 2FA (RF-85)', () => {
    it('un administrador nuevo queda bloqueado hasta activar el 2FA; luego entra con la app y una vez con cada codigo de recuperacion', async () => {
      const dni = nd();
      const code = await app.get(UserCodeService).generateUnique();
      const admin = await prisma.user.create({
        data: {
          fullName: 'QA F5 Admin Nuevo',
          role: 'ADMIN',
          code,
          dniEncrypted: dniService.encrypt(dni),
          dniHash: dniService.hash(dni),
          emailVerifiedAt: new Date(),
          contactEmail: 'admin.qa@correo.example',
          localCredential: {
            create: { passwordHash: await app.get(PasswordService).hash(NEW_PASSWORD) },
          },
        },
      });

      const entered = await login(code, NEW_PASSWORD).expect(200);
      expect(entered.body.mustEnableTwoFactor).toBe(true);
      const first = cookieOf(entered);
      const blocked = await api('get', '/users', first).expect(403);
      expect(blocked.body.error.code).toBe('TWO_FACTOR_REQUIRED');

      const setup = await api('post', '/auth/2fa/setup', first).expect(201);
      const secret = setup.body.secret as string;
      await api('post', '/auth/2fa/enable', first).send({ code: '000000' }).expect(400);
      const enabled = await api('post', '/auth/2fa/enable', first)
        .send({ code: generateSync({ secret }) })
        .expect(200);
      const recoveryCodes = enabled.body.recoveryCodes as string[];
      expect(recoveryCodes).toHaveLength(10);
      await api('get', '/users', cookieOf(enabled)).expect(200);

      // Solo quedan hashes en la base: 10 filas sin usar.
      const rows = await prisma.recoveryCode.findMany({ where: { userId: admin.id } });
      expect(rows).toHaveLength(10);
      expect(JSON.stringify(rows)).not.toContain(recoveryCodes[0]!.replace('-', ''));

      // Ahora el login exige el segundo factor; un codigo de recuperacion sirve una sola vez.
      const required = await login(code, NEW_PASSWORD).expect(401);
      expect(required.body.error.code).toBe('TOTP_REQUIRED');
      await api('post', '/auth/login')
        .send({ code, password: NEW_PASSWORD, recoveryCode: recoveryCodes[0] })
        .expect(200);
      const reused = await api('post', '/auth/login')
        .send({ code, password: NEW_PASSWORD, recoveryCode: recoveryCodes[0] })
        .expect(401);
      expect(reused.body.error.code).toBe('RECOVERY_CODE_INVALID');
      expect(await prisma.recoveryCode.count({ where: { userId: admin.id, usedAt: null } })).toBe(
        9,
      );

      // Otro administrador (el del seed) reinicia su 2FA: vuelve a quedar en la pantalla de activacion.
      await asAdmin('post', `/auth/users/${admin.id}/2fa/reset`).expect(204);
      expect(await prisma.recoveryCode.count({ where: { userId: admin.id } })).toBe(0);
      const again = await login(code, NEW_PASSWORD).expect(200);
      expect(again.body.mustEnableTwoFactor).toBe(true);
    });
  });

  describe('Cierre', () => {
    it('los datos de prueba se limpian y los conteos vuelven a los iniciales', async () => {
      await clean();
      expect(await counts()).toEqual(baseline);
    });
  });
});
