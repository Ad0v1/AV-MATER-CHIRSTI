import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV, type Env } from '../../config/config.module.js';

export type MailMessage = { to: string; subject: string; text: string };

// Destino del correo saliente. SmtpMailSender envia por SMTP; las pruebas usan uno en memoria.
export abstract class MailSender {
  abstract send(message: MailMessage): Promise<void>;
}

@Injectable()
export class SmtpMailSender extends MailSender {
  private readonly logger = new Logger(SmtpMailSender.name);
  private transporter?: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.getTransporter().sendMail({
        from: this.env.SMTP_FROM ?? 'Aula Virtual <no-reply@aula.local>',
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    } catch (error) {
      // Nunca se registra el destinatario ni el texto: llevan un codigo de verificacion.
      this.logger.error(
        `No se pudo enviar el correo: ${error instanceof Error ? error.message : 'error'}`,
      );
      throw error;
    }
  }

  private getTransporter(): Transporter {
    this.transporter ??= createTransport({
      host: this.env.SMTP_HOST ?? '127.0.0.1',
      port: this.env.SMTP_PORT,
      secure: this.env.SMTP_SECURE,
      // En produccion, si no es TLS directo, se exige STARTTLS.
      requireTLS: this.env.NODE_ENV === 'production' && !this.env.SMTP_SECURE,
      ...(this.env.SMTP_USER && this.env.SMTP_PASS
        ? { auth: { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS } }
        : {}),
    });
    return this.transporter;
  }
}
