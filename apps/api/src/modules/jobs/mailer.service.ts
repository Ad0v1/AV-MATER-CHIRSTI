import { Inject, Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.js';
import { ENV } from '../../config/config.module.js';
import type { NotificationType } from '../../generated/prisma/enums.js';

// Correo saliente minimo (U3): solo dice que hay algo nuevo y remite a la plataforma.
// Nunca lleva nombres, notas, titulos, comentarios ni enlaces a un recurso concreto: el aviso
// completo se lee en el Aula Virtual con sesion. Solo texto plano, sin HTML ni adjuntos.

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export type MailKind = NotificationType | 'MAIL_CHECK';

const SUBJECTS: Record<MailKind, string> = {
  ASSIGNMENT_CREATED: 'Tienes una tarea nueva',
  ASSIGNMENT_DUE_SOON: 'Tienes una tarea por vencer',
  GRADE_PUBLISHED: 'Tienes una calificación nueva',
  ANNOUNCEMENT_PUBLISHED: 'Hay un anuncio nuevo',
  MAIL_CHECK: 'Prueba de correo',
};

// Correo simple: sin espacios, saltos de linea, comillas ni separadores de lista.
const EMAIL = /^[^\s@"<>,;]+@[^\s@"<>,;]+\.[^\s@"<>,;]+$/;

export function isSafeEmail(value: string): boolean {
  return value.length <= 191 && EMAIL.test(value);
}

/**
 * Correo al que se puede escribir a un usuario: solo el de contacto ya verificado (RF-80, D-062).
 * El institucional es opcional desde el login por codigo y no se usa para avisos.
 */
export function deliverableEmail(user: {
  contactEmail: string | null;
  emailVerifiedAt: Date | null;
}): string | null {
  const email = user.contactEmail;
  return email && user.emailVerifiedAt && isSafeEmail(email) ? email : null;
}

/** Remitente si SMTP_FROM no esta definido (solo en local; en produccion es obligatorio). */
export const DEFAULT_SMTP_FROM = 'Aula Virtual <no-responder@aula.local>';

/** Direccion de SMTP_FROM, sea "Nombre <dir>" o solo "dir". */
export function fromAddress(from: string): string {
  const match = /<([^>]+)>\s*$/.exec(from);
  return (match ? match[1] : from).trim();
}

export function buildMinimalMail(kind: MailKind, webOrigin: string) {
  const subject = `${SUBJECTS[kind]} - Aula Virtual`;
  const text = [
    'Hola:',
    '',
    `${SUBJECTS[kind]} en el Aula Virtual.`,
    `Ingresa a ${webOrigin} para verlo.`,
    '',
    'Este correo es automático; por favor no lo respondas.',
  ].join('\n');
  return { subject, text };
}

@Injectable()
export class MailerService {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: Transporter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Envia el aviso minimo. Lanza si el SMTP falla (el procesador decide si reintenta). */
  async sendNotice(to: string, kind: MailKind): Promise<void> {
    if (!isSafeEmail(to)) throw new Error('Destinatario de correo invalido');
    const { subject, text } = buildMinimalMail(kind, this.env.WEB_ORIGIN);
    await this.transport.sendMail({
      from: this.env.SMTP_FROM ?? DEFAULT_SMTP_FROM,
      to,
      subject,
      text,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
}

export function createMailTransport(
  env: Pick<Env, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS'>,
): Transporter {
  return nodemailer.createTransport({
    host: env.SMTP_HOST ?? '127.0.0.1',
    port: env.SMTP_PORT,
    // 465 o SMTP_SECURE = TLS implicito; si no, nodemailer usa STARTTLS si el servidor lo ofrece.
    secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}
