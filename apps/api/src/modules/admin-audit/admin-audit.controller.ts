import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { trackByUser } from '../files/files-throttle.js';
import { ActiveActorGuard } from '../users/active-actor.guard.js';
import { type AuditQuery, auditQuerySchema } from './admin-audit.dto.js';
import { AdminAuditService, type AuditLogPage } from './admin-audit.service.js';

/** 60 consultas por minuto y ADMIN: cada una cuenta filas de una tabla que solo crece. */
const AUDIT_THROTTLE = { default: { limit: 60, ttl: 60_000, getTracker: trackByUser } };

// RF-62 (y RF-55/56, modo soporte derivado, U9): bitácora de solo lectura. Solo ADMIN activo.
// Sin POST, PUT ni DELETE: la bitácora es inmutable (la BD rechaza UPDATE y DELETE).
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  @Throttle(AUDIT_THROTTLE)
  list(@Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery): Promise<AuditLogPage> {
    return this.audit.list(query);
  }
}
