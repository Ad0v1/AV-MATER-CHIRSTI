import { describe, expect, it, vi } from 'vitest';
import type { Transporter } from 'nodemailer';
import type { Env } from '../../config/env.js';
import {
  buildMinimalMail,
  createMailTransport,
  fromAddress,
  isSafeEmail,
  MailerService,
} from './mailer.service.js';

// SMTP simulado: no se abre ninguna conexion.
function setup() {
  const sendMail = vi.fn(() => Promise.resolve({ messageId: 'm1' }));
  const transport = { sendMail } as unknown as Transporter;
  const env = {
    SMTP_FROM: 'Aula Virtual <no-responder@aula.local>',
    WEB_ORIGIN: 'http://localhost:3000',
  } as Env;
  return { sendMail, service: new MailerService(transport, env) };
}

describe('MailerService (U3)', () => {
  it('envia solo texto plano minimo, sin archivos ni URLs externas', async () => {
    const { sendMail, service } = setup();
    await service.sendNotice('apoderado@correo.pe', 'GRADE_PUBLISHED');
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Aula Virtual <no-responder@aula.local>',
      to: 'apoderado@correo.pe',
      subject: 'Tienes una calificación nueva - Aula Virtual',
      text: expect.stringContaining('Ingresa a http://localhost:3000 para verlo.'),
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const arg = (sendMail.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('html');
    expect(arg).not.toHaveProperty('attachments');
  });

  it('el cuerpo no tiene datos: es igual para cualquier destinatario', () => {
    const a = buildMinimalMail('ASSIGNMENT_CREATED', 'http://x');
    expect(a.text).not.toMatch(/\d{2}|nota|@/i);
  });

  it('rechaza destinatarios con saltos de linea, listas o sin dominio', async () => {
    const { sendMail, service } = setup();
    for (const to of ['a@b.pe\r\nBcc: c@d.pe', 'a@b.pe,c@d.pe', 'sin-arroba', '"x"@b.pe']) {
      await expect(service.sendNotice(to, 'MAIL_CHECK')).rejects.toThrow(/Destinatario/);
    }
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('propaga el fallo del SMTP para que el procesador reintente', async () => {
    const { sendMail, service } = setup();
    sendMail.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.sendNotice('a@b.pe', 'MAIL_CHECK')).rejects.toThrow('ECONNREFUSED');
  });

  it('helpers: direccion de SMTP_FROM, correo seguro y transporte de Mailpit', () => {
    expect(fromAddress('Aula <no@aula.local>')).toBe('no@aula.local');
    expect(fromAddress('no@aula.local')).toBe('no@aula.local');
    expect(isSafeEmail('a.b+c@colegio.edu.pe')).toBe(true);
    const t = createMailTransport({ SMTP_HOST: '127.0.0.1', SMTP_PORT: 1025, SMTP_SECURE: false });
    expect(t.options).toMatchObject({ host: '127.0.0.1', port: 1025, secure: false });
    t.close();
  });
});
