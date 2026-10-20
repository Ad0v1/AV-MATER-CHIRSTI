import { Global, Module } from '@nestjs/common';
import { AuditService, AuditSink, LogAuditSink } from './audit.service.js';

@Global()
@Module({
  providers: [{ provide: AuditSink, useClass: LogAuditSink }, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
