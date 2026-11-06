import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { UserRole } from '../../generated/prisma/enums.js';
import { DniService } from './dni.service.js';
import { generateInitialPassword } from './password-policy.js';
import { PasswordService } from './password.service.js';
import { UserCodeService } from './user-code.service.js';

type Db = Prisma.TransactionClient;

export const DNI_TAKEN_MESSAGE = 'Ya existe una persona registrada con ese DNI';

// Credenciales recien emitidas. La contrasena inicial solo existe en esta respuesta: despues solo
// queda su hash (RF-70). Nunca se escribe en la bitacora ni en el log.
export type IssuedCredentials = { code: string; initialPassword: string };

export type NewLoginUser = {
  fullName: string;
  role: UserRole;
  dni: string;
  // Marca "verificado contra el documento" (RF-69), la pone quien da el alta.
  dniVerified?: boolean;
  email?: string;
};

// Da de alta a un usuario con su codigo, su DNI cifrado y su contrasena inicial aleatoria
// (RF-68 a RF-70). Todo corre dentro de la transaccion del llamador.
@Injectable()
export class CredentialIssuerService {
  constructor(
    private readonly dni: DniService,
    private readonly codes: UserCodeService,
    private readonly passwords: PasswordService,
  ) {}

  hashDni(dni: string): string {
    return this.dni.hash(dni);
  }

  // DNI listo para guardar: cifrado y con su hash de unicidad (D-059).
  dniData(dni: string): { dniEncrypted: string; dniHash: string } {
    return { dniEncrypted: this.dni.encrypt(dni), dniHash: this.dni.hash(dni) };
  }

  // Persona que ya tiene ese DNI, si existe.
  findByDni(db: Db, dni: string) {
    return db.user.findUnique({ where: { dniHash: this.dni.hash(dni) } });
  }

  // 409 si el DNI ya lo tiene otro usuario (el UNIQUE cubre la carrera).
  async assertDniFree(db: Db, dni: string, exceptUserId?: string): Promise<void> {
    const other = await this.findByDni(db, dni);
    if (other && other.id !== exceptUserId) throw new ConflictException(DNI_TAKEN_MESSAGE);
  }

  async createUser(tx: Db, input: NewLoginUser) {
    await this.assertDniFree(tx, input.dni);
    const code = await this.codes.generateUnique(new Date(), tx);
    const initialPassword = generateInitialPassword();
    const user = await tx.user.create({
      data: {
        ...(input.email ? { email: input.email } : {}),
        fullName: input.fullName,
        role: input.role,
        code,
        dniEncrypted: this.dni.encrypt(input.dni),
        dniHash: this.dni.hash(input.dni),
        ...(input.dniVerified ? { dniVerifiedAt: new Date() } : {}),
        localCredential: {
          create: {
            passwordHash: await this.passwords.hash(initialPassword),
            mustChangePassword: true,
          },
        },
      },
    });
    return { user, credentials: { code, initialPassword } satisfies IssuedCredentials };
  }

  // Contrasena temporal nueva (RF-74). Si el usuario aun no tiene codigo o credencial (usuarios
  // anteriores al login por codigo), se le asignan. `newCode` genera un codigo nuevo (RF-84).
  async reissue(
    tx: Db,
    userId: string,
    options: { newCode?: boolean } = {},
  ): Promise<IssuedCredentials & { previousCode: string | null }> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { code: true } });
    const code =
      user.code && !options.newCode ? user.code : await this.codes.generateUnique(new Date(), tx);
    const initialPassword = generateInitialPassword();
    const data = {
      passwordHash: await this.passwords.hash(initialPassword),
      mustChangePassword: true,
      passwordChangedAt: null,
    };
    await tx.localCredential.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    if (code !== user.code) await tx.user.update({ where: { id: userId }, data: { code } });
    return { code, initialPassword, previousCode: user.code };
  }
}
