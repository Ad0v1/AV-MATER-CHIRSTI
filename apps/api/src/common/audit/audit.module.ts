import { Global, Module } from '@nestjs/common';
import { AuditService, AuditSink } from './audit.service.js';
import { PrismaAuditSink } from './prisma-audit.sink.js';

@Global()
@Module({
  providers: [{ provide: AuditSink, useClass: PrismaAuditSink }, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
