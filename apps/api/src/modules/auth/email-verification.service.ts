import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { MailSender } from '../../common/mail/mail-sender.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { verificationMail } from './auth-mails.js';
import { OneTimeCodeService, type SendGate } from './one-time-code.service.js';

const NAMESPACE = 'email';

type PendingEmail = { email: string; guardian: boolean };

// Mensajes de reenvio compartidos con la recuperacion de contrasena.
export function resendError(gate: Exclude<SendGate, 'OK'>): HttpException {
  return new HttpException(
    gate === 'COOLDOWN'
      ? { message: 'Espera un minuto antes de pedir otro código', code: 'RESEND_TOO_SOON' }
      : { message: 'Pediste demasiados códigos. Inténtalo en una hora', code: 'RESEND_LIMIT' },
    429,
  );
}

// Registro y verificacion del correo de contacto (RF-80, RF-81, RF-88).
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: OneTimeCodeService,
    private readonly mail: MailSender,
    private readonly audit: AuditService,
  ) {}

  // Envia un codigo al correo indicado. `guardian` marca que es el correo del apoderado (RF-81).
  async start(userId: string, email: string, guardian: boolean, ip?: string): Promise<void> {
    const gate = await this.codes.allowSend(NAMESPACE, userId);
    if (gate !== 'OK') throw resendError(gate);

    const code = await this.codes.issue<PendingEmail>(NAMESPACE, userId, { email, guardian });
    try {
      await this.mail.send(verificationMail(email, code));
    } catch {
      // El detalle ya se registro en el envio, sin destinatario ni codigo.
      this.logger.error('Falla del correo al enviar el codigo de verificacion');
      throw new ServiceUnavailableException({
        message: 'No se pudo enviar el correo. Inténtalo de nuevo en unos minutos',
        code: 'MAIL_UNAVAILABLE',
      });
    }
    // La bitacora no lleva el correo ni el codigo: solo que se envio.
    await this.audit.record({
      actorId: userId,
      action: 'auth.email_code_sent',
      module: 'auth',
      ip,
      afterState: { guardianEmail: guardian },
    });
  }

  async verify(userId: string, code: string, ip?: string): Promise<void> {
    const result = await this.codes.check<PendingEmail>(NAMESPACE, userId, code);
    if (!result.ok) {
      if (result.reason === 'WRONG') {
        throw new BadRequestException({
          message: 'El código no es correcto',
          code: 'CODE_INVALID',
        });
      }
      throw new BadRequestException({
        message: 'El código venció o se agotaron los intentos. Pide uno nuevo',
        code: 'CODE_EXPIRED',
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        contactEmail: result.payload.email,
        contactEmailIsGuardian: result.payload.guardian,
        emailVerifiedAt: new Date(),
      },
    });
    await this.codes.consume(NAMESPACE, userId);
    await this.audit.record({
      actorId: userId,
      action: 'auth.email_verified',
      module: 'auth',
      entityType: 'User',
      entityId: userId,
      ip,
      afterState: { guardianEmail: result.payload.guardian },
    });
  }

  // RF-88: el administrador marca un correo como verificado cuando el envio falla. El motivo es
  // texto libre y queda en la bitacora inmutable: no debe llevar datos personales ni de salud.
  async verifyManually(
    adminId: string,
    userId: string,
    email: string,
    reason: string,
    ip?: string,
  ): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    await this.prisma.user.update({
      where: { id: userId },
      data: { contactEmail: email, contactEmailIsGuardian: false, emailVerifiedAt: new Date() },
    });
    await this.audit.record({
      actorId: adminId,
      action: 'auth.email_verified_manually',
      module: 'auth',
      entityType: 'User',
      entityId: userId,
      ip,
      afterState: { reason },
    });
  }
}
