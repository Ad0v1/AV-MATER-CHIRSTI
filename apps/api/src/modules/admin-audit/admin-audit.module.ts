import { Module } from '@nestjs/common';
import { AdminAuditController } from './admin-audit.controller.js';
import { AdminAuditService } from './admin-audit.service.js';

// Bitácora para el ADMIN (Dev 5, RF-62, RF-55/56 con U9). Solo lectura sobre AuditLog (Dev 1).
// PrismaModule es global. Registrado en AppModule con autorización del usuario (30/10/2026).
@Module({
  controllers: [AdminAuditController],
  providers: [AdminAuditService],
})
export class AdminAuditModule {}
