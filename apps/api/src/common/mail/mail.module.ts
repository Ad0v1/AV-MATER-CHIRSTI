import { Global, Module } from '@nestjs/common';
import { MailSender, SmtpMailSender } from './mail-sender.js';

@Global()
@Module({
  providers: [{ provide: MailSender, useClass: SmtpMailSender }],
  exports: [MailSender],
})
export class MailModule {}
