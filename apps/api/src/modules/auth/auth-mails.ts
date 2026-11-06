import type { MailMessage } from '../../common/mail/mail-sender.js';

// Los correos solo llevan el codigo y su vigencia: ningun dato del alumno ni de su cuenta.
export function verificationMail(to: string, code: string): MailMessage {
  return {
    to,
    subject: 'Tu código de verificación del Aula Virtual',
    text: [
      `Tu código de verificación es: ${code}`,
      '',
      'Vale 5 minutos. Escríbelo en la pantalla del Aula Virtual para confirmar este correo.',
      'Si no lo pediste, ignora este mensaje: no se hará ningún cambio.',
    ].join('\n'),
  };
}

export function recoveryMail(to: string, code: string): MailMessage {
  return {
    to,
    subject: 'Recupera tu contraseña del Aula Virtual',
    text: [
      `Tu código para cambiar la contraseña es: ${code}`,
      '',
      'Vale 5 minutos. Escríbelo en la pantalla de recuperación junto con tu nueva contraseña.',
      'Si no lo pediste, ignora este mensaje y tu contraseña seguirá igual.',
    ].join('\n'),
  };
}
