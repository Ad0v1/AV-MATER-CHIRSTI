import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuditModule } from './common/audit/audit.module.js';
import { RolesGuard } from './common/auth/roles.guard.js';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [AuditModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
