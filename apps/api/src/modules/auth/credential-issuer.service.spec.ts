import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { CredentialIssuerService } from './credential-issuer.service.js';
import { DniService } from './dni.service.js';
import { PasswordService } from './password.service.js';
import type { UserCodeService } from './user-code.service.js';
import type { Env } from '../../config/env.js';

const dni = new DniService({ PII_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64') } as Env);
const passwords = new PasswordService();
const codes = { generateUnique: vi.fn().mockResolvedValue('2600000000') };

function makeTx() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'u1', ...args.data }),
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    localCredential: { upsert: vi.fn().mockResolvedValue({}) },
  };
}
const asTx = (tx: ReturnType<typeof makeTx>) => tx as unknown as Prisma.TransactionClient;

describe('CredentialIssuerService', () => {
  const issuer = new CredentialIssuerService(dni, codes as unknown as UserCodeService, passwords);

  beforeEach(() => {
    codes.generateUnique.mockClear();
  });

  describe('createUser (RF-68 a RF-70)', () => {
    it('crea el usuario con código, DNI cifrado y contraseña aleatoria que debe cambiar', async () => {
      const tx = makeTx();
      const { user, credentials } = await issuer.createUser(asTx(tx), {
        fullName: 'Ana Pérez',
        role: 'STUDENT',
        dni: '45678901',
      });
      const data = tx.user.create.mock.calls[0]![0].data as Record<string, unknown> & {
        localCredential: { create: { passwordHash: string; mustChangePassword: boolean } };
      };
      expect(user.id).toBe('u1');
      expect(credentials.code).toBe('2600000000');
      expect(credentials.initialPassword).toHaveLength(12);
      expect(data.code).toBe('2600000000');
      expect(data.dniHash).toBe(dni.hash('45678901'));
      expect(String(data.dniEncrypted)).not.toContain('45678901');
      expect(dni.decrypt(String(data.dniEncrypted))).toBe('45678901');
      expect(data.localCredential.create.mustChangePassword).toBe(true);
      // Solo se guarda el hash de la contraseña, nunca la contraseña.
      expect(data.localCredential.create.passwordHash).not.toContain(credentials.initialPassword);
      await expect(
        passwords.verify(data.localCredential.create.passwordHash, credentials.initialPassword),
      ).resolves.toBe(true);
    });

    it('cada alta recibe una contraseña distinta', async () => {
      const a = await issuer.createUser(asTx(makeTx()), {
        fullName: 'A B',
        role: 'STUDENT',
        dni: '45678901',
      });
      const b = await issuer.createUser(asTx(makeTx()), {
        fullName: 'C D',
        role: 'STUDENT',
        dni: '45678902',
      });
      expect(a.credentials.initialPassword).not.toBe(b.credentials.initialPassword);
    });

    it('marca el DNI como verificado solo si se pidió, y guarda el correo solo si se envió', async () => {
      const tx = makeTx();
      await issuer.createUser(asTx(tx), {
        fullName: 'Ana Pérez',
        role: 'TEACHER',
        dni: '45678901',
        dniVerified: true,
        institutionalEmail: 'ana@colegio.example',
      });
      const data = tx.user.create.mock.calls[0]![0].data as Record<string, unknown>;
      expect(data.dniVerifiedAt).toBeInstanceOf(Date);
      expect(data.institutionalEmail).toBe('ana@colegio.example');

      const plain = makeTx();
      await issuer.createUser(asTx(plain), {
        fullName: 'Ana Pérez',
        role: 'TEACHER',
        dni: '45678903',
      });
      const plainData = plain.user.create.mock.calls[0]![0].data as Record<string, unknown>;
      expect(plainData).not.toHaveProperty('dniVerifiedAt');
      expect(plainData).not.toHaveProperty('institutionalEmail');
    });

    it('409 si el DNI ya lo tiene otra persona', async () => {
      const tx = makeTx();
      tx.user.findUnique.mockResolvedValue({ id: 'otro' });
      await expect(
        issuer.createUser(asTx(tx), { fullName: 'Ana Pérez', role: 'STUDENT', dni: '45678901' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });
  });

  describe('reissue (RF-74, RF-84)', () => {
    it('conserva el código y emite una contraseña temporal', async () => {
      const tx = makeTx();
      tx.user.findUniqueOrThrow.mockResolvedValue({ code: '2600000001' });
      const result = await issuer.reissue(asTx(tx), 'u1');
      expect(result).toMatchObject({ code: '2600000001', previousCode: '2600000001' });
      expect(codes.generateUnique).not.toHaveBeenCalled();
      expect(tx.localCredential.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ mustChangePassword: true, passwordChangedAt: null }),
        }),
      );
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('con newCode genera un código nuevo y lo guarda', async () => {
      const tx = makeTx();
      tx.user.findUniqueOrThrow.mockResolvedValue({ code: '2600000001' });
      const result = await issuer.reissue(asTx(tx), 'u1', { newCode: true });
      expect(result).toMatchObject({ code: '2600000000', previousCode: '2600000001' });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { code: '2600000000' },
      });
    });

    it('un usuario anterior al login por código recibe código y credencial', async () => {
      const tx = makeTx();
      tx.user.findUniqueOrThrow.mockResolvedValue({ code: null });
      const result = await issuer.reissue(asTx(tx), 'u1');
      expect(result).toMatchObject({ code: '2600000000', previousCode: null });
      expect(tx.user.update).toHaveBeenCalled();
      expect(tx.localCredential.upsert).toHaveBeenCalled();
    });
  });
});
