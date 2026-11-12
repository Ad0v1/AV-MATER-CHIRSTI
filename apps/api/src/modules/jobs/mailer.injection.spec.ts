import { describe, expect, it, vi } from 'vitest';
import type { Transporter } from 'nodemailer';
import type { Env } from '../../config/env.js';
import { buildMinimalMail, isSafeEmail, MailerService } from './mailer.service.js';

function setup() {
  const sendMail = vi.fn(() => Promise.resolve({ messageId: 'm1' }));
  const env = { SMTP_FROM: 'Aula <no@aula.local>', WEB_ORIGIN: 'http://localhost:3000' } as Env;
  return { sendMail, service: new MailerService({ sendMail } as unknown as Transporter, env) };
}

describe('MailerService: inyeccion de cabeceras (RNF-09)', () => {
  it('rechaza LF, CR, tab, NUL, ;, angulos, nombre visible, vacio y sin dominio', async () => {
    const { sendMail, service } = setup();
    const bad = [
      'a@b.pe\nBcc: x@y.pe',
      'a@b.pe\rBcc: x@y.pe',
      'a@b.pe\tx',
      'a\u0000@b.pe\n',
      'a@b.pe;c@d.pe',
      '<a@b.pe>',
      'Ana <a@b.pe>',
      `${'a'.repeat(190)}@b.pe`,
      '',
      '@b.pe',
      'a@b',
    ];
    for (const to of bad) {
      await expect(service.sendNotice(to, 'GRADE_PUBLISHED')).rejects.toThrow(/Destinatario/);
    }
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('el asunto es fijo por tipo y nunca tiene saltos de linea', () => {
    for (const kind of [
      'ASSIGNMENT_CREATED',
      'ASSIGNMENT_DUE_SOON',
      'GRADE_PUBLISHED',
      'ANNOUNCEMENT_PUBLISHED',
      'MAIL_CHECK',
    ] as const) {
      const m = buildMinimalMail(kind, 'http://localhost:3000');
      expect(m.subject).not.toMatch(/[\r\n]/);
      expect(m.text).toContain('http://localhost:3000');
    }
  });

  it('un solo destinatario, sin cc ni bcc', async () => {
    const { sendMail, service } = setup();
    await service.sendNotice('a.b@colegio.edu.pe', 'MAIL_CHECK');
    const arg = (sendMail.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(arg.to).toBe('a.b@colegio.edu.pe');
    expect(arg).not.toHaveProperty('cc');
    expect(arg).not.toHaveProperty('bcc');
  });

  it('isSafeEmail acepta el limite de 191 caracteres y rechaza 192', () => {
    const local = 'a'.repeat(191 - '@b.pe'.length);
    expect(isSafeEmail(`${local}@b.pe`)).toBe(true);
    expect(isSafeEmail(`${local}a@b.pe`)).toBe(false);
  });
});
