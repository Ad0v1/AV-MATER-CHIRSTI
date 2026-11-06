import request from 'supertest';
import { createTestApp, type TestApp } from './helpers.js';
import { DniService } from './../src/modules/auth/dni.service.js';
import { PasswordService } from './../src/modules/auth/password.service.js';
import { luhnCheckDigit } from './../src/modules/auth/user-code.js';

const PASSWORD = 'Clave-Segura-123';
const body9 = '260000003';
const CODE = body9 + luhnCheckDigit(body9);
const USER_ID = '00000000-0000-7000-8000-000000000003';

async function addUser(
  t: TestApp,
  o: { role?: 'STUDENT' | 'GUARDIAN'; phone?: string | null; verified?: boolean } = {},
) {
  t.prisma.users.push({
    id: USER_ID,
    email: null as unknown as string,
    code: CODE,
    dniEncrypted: t.app.get(DniService).encrypt('45678901'),
    contactEmail: 'familia@correo.pe',
    contactEmailIsGuardian: false,
    emailVerifiedAt: o.verified === false ? null : new Date(),
    phone: o.phone === undefined ? null : o.phone,
    address: null,
    fullName: 'Usuario de prueba',
    role: o.role ?? 'GUARDIAN',
    status: 'ACTIVE',
    localCredential: {
      userId: USER_ID,
      passwordHash: await t.app.get(PasswordService).hash(PASSWORD),
      totpSecretEncrypted: null,
      mustChangePassword: false,
      passwordChangedAt: null,
    },
  });
}

describe('Datos de contacto del primer ingreso (RF-83, e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });

  afterEach(async () => {
    await t.app.close();
  });

  const server = () => t.app.getHttpServer();
  const api = (method: 'get' | 'post' | 'patch', path: string) =>
    request(server())[method](`/api/v1/auth${path}`);
  async function login() {
    const res = await api('post', '/login').send({ code: CODE, password: PASSWORD }).expect(200);
    return { body: res.body, cookie: res.headers['set-cookie'] ?? [] };
  }

  it('el apoderado sin teléfono debe completarlo antes de usar el sistema', async () => {
    await addUser(t);
    const { body, cookie } = await login();
    expect(body.mustCompleteContact).toBe(true);

    const blocked = await api('post', '/2fa/setup').set('Cookie', cookie).expect(403);
    expect(['FORBIDDEN', 'CONTACT_DATA_REQUIRED']).toContain(blocked.body.error.code);
    await api('get', '/me').set('Cookie', cookie).expect(200);
    await api('get', '/profile').set('Cookie', cookie).expect(200);
  });

  it('guarda el teléfono y la dirección, y abre una sesión sin el paso pendiente', async () => {
    await addUser(t);
    const { cookie } = await login();
    const res = await api('patch', '/profile')
      .set('Cookie', cookie)
      .send({ phone: '987654321', address: 'Jr. Los Pinos 123' })
      .expect(204);

    expect(t.prisma.users[0]!.phone).toBe('987654321');
    expect(t.prisma.users[0]!.address).toBe('Jr. Los Pinos 123');
    const fresh = res.headers['set-cookie'] ?? [];
    await api('get', '/me')
      .set('Cookie', fresh)
      .expect(200)
      .expect((r) => expect(r.body.mustCompleteContact).toBe(false));
    // La sesión anterior queda cerrada.
    await api('get', '/me').set('Cookie', cookie).expect(401);
  });

  it('el teléfono debe tener 9 dígitos y el apoderado no puede borrarlo', async () => {
    await addUser(t, { phone: '987654321' });
    const { cookie } = await login();
    await api('patch', '/profile').set('Cookie', cookie).send({ phone: '12345' }).expect(400);
    await api('patch', '/profile').set('Cookie', cookie).send({ phone: 'abcdefghi' }).expect(400);
    await api('patch', '/profile').set('Cookie', cookie).send({}).expect(400);
    await api('patch', '/profile').set('Cookie', cookie).send({ phone: null }).expect(400);
    expect(t.prisma.users[0]!.phone).toBe('987654321');
  });

  it('el alumno no está obligado a dar teléfono ni dirección, y puede dejarlos en blanco', async () => {
    await addUser(t, { role: 'STUDENT' });
    const { body, cookie } = await login();
    expect(body.mustCompleteContact).toBe(false);
    await api('patch', '/profile')
      .set('Cookie', cookie)
      .send({ address: 'Av. Lima 45' })
      .expect(204);
    expect(t.prisma.users[0]!.address).toBe('Av. Lima 45');
    expect(t.prisma.users[0]!.phone).toBeNull();
  });

  it('un apoderado sin correo verificado hace primero el correo y después el teléfono', async () => {
    await addUser(t, { verified: false });
    const { body, cookie } = await login();
    expect(body).toMatchObject({ mustVerifyEmail: true, mustCompleteContact: true });
    // El perfil todavía no se puede usar: falta el correo.
    const early = await api('patch', '/profile')
      .set('Cookie', cookie)
      .send({ phone: '987654321' })
      .expect(403);
    expect(early.body.error.code).toBe('EMAIL_VERIFICATION_REQUIRED');

    await api('post', '/email/start')
      .set('Cookie', cookie)
      .send({ email: 'a@correo.pe' })
      .expect(204);
    const verified = await api('post', '/email/verify')
      .set('Cookie', cookie)
      .send({ code: t.mail.lastCode() })
      .expect(204);
    // Verificado el correo, queda el teléfono: la sesión nueva lo conserva.
    const next = verified.headers['set-cookie'] ?? [];
    await api('get', '/me')
      .set('Cookie', next)
      .expect(200)
      .expect((r) =>
        expect(r.body).toMatchObject({ mustVerifyEmail: false, mustCompleteContact: true }),
      );
    await api('patch', '/profile').set('Cookie', next).send({ phone: '987654321' }).expect(204);
  });

  it('la bitácora guarda solo los nombres de los campos, no el teléfono ni la dirección', async () => {
    await addUser(t);
    const { cookie } = await login();
    await api('patch', '/profile')
      .set('Cookie', cookie)
      .send({ phone: '987654321', address: 'Jr. Los Pinos 123' })
      .expect(204);
    const record = t.audit.records.find((r) => r.action === 'auth.profile_updated');
    expect(record?.afterState).toEqual({ changedFields: ['phone', 'address'] });
    const text = JSON.stringify(t.audit.records);
    expect(text).not.toContain('987654321');
    expect(text).not.toContain('Los Pinos');
  });

  it('exige sesión', async () => {
    await api('get', '/profile').expect(401);
    await api('patch', '/profile').send({ phone: '987654321' }).expect(401);
  });
});
