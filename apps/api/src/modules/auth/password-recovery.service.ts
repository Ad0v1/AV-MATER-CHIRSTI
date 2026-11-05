import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { MailSender } from '../../common/mail/mail-sender.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { recoveryMail } from './auth-mails.js';
import { DniService } from './dni.service.js';
import { LoginAttemptsService } from './login-attempts.service.js';
import { OneTimeCodeService } from './one-time-code.service.js';
import { checkPasswordPolicy } from './password-policy.js';
import { PasswordService } from './password.service.js';
import { isValidUserCode } from './user-code.js';

const NAMESPACE = 'recovery';

const INVALID = {
  message: 'El código de verificación no es válido o venció',
  code: 'INVALID_RECOVERY',
};

// Recuperacion de contrasena por correo verificado (RF-82). Nada de lo que responde revela si un
// codigo de usuario existe, si tiene correo o si el envio ocurrio.
@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: OneTimeCodeService,
    private readonly mail: MailSender,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly attempts: LoginAttemptsService,
    private readonly dni: DniService,
  ) {}

  // Siempre termina sin error: si el usuario no existe, esta inactivo o no tiene correo
  // verificado, simplemente no se envia nada.
  async request(code: string, ip?: string): Promise<void> {
    if (!isValidUserCode(code)) return;
    const user = await this.prisma.user.findUnique({
      where: { code },
      include: { localCredential: true },
    });
    if (!user?.localCredential || user.status !== 'ACTIVE') return;
    if (!user.contactEmail || !user.emailVerifiedAt) return;

    if ((await this.codes.allowSend(NAMESPACE, user.id)) !== 'OK') return;
    const otp = await this.codes.issue(NAMESPACE, user.id, {});
    try {
      await this.mail.send(recoveryMail(user.contactEmail, otp));
    } catch {
      this.logger.error('Falla del correo al enviar el codigo de recuperacion');
      return;
    }
    await this.audit.record({
      actorId: user.id,
      action: 'auth.recovery_requested',
      module: 'auth',
      ip,
    });
  }

  async confirm(
    code: string,
    emailCode: string,
    newPassword: string,
    ip?: string,
  ): Promise<{ userId: string }> {
    const user = isValidUserCode(code)
      ? await this.prisma.user.findUnique({ where: { code } })
      : null;
    if (!user || user.status !== 'ACTIVE') throw new BadRequestException(INVALID);

    // El codigo se comprueba sin consumirlo: si la contrasena nueva no cumple la politica, el
    // usuario puede corregirla con el mismo codigo.
    const result = await this.codes.check(NAMESPACE, user.id, emailCode);
    if (!result.ok) throw new BadRequestException(INVALID);

    const identity = [user.code, this.decryptDni(user.dniEncrypted)].filter(
      (v): v is string => typeof v === 'string',
    );
    const issues = checkPasswordPolicy(newPassword, { identity });
    if (issues.length > 0) throw new BadRequestException({ message: issues });

    await this.prisma.localCredential.update({
      where: { userId: user.id },
      data: {
        passwordHash: await this.passwords.hash(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    await this.codes.consume(NAMESPACE, user.id);
    // Quien recupera la clave por su correo tambien recupera el acceso si estaba bloqueado.
    await this.attempts.unlock(user.code!);
    await this.audit.record({
      actorId: user.id,
      action: 'auth.password_recovered',
      module: 'auth',
      ip,
    });
    return { userId: user.id };
  }

  private decryptDni(encrypted: string | null): string | null {
    if (!encrypted) return null;
    try {
      return this.dni.decrypt(encrypted);
    } catch {
      return null;
    }
  }
}
