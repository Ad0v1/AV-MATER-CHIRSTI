import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { ActiveActorGuard } from './active-actor.guard.js';
import { EnrollmentsService } from './enrollments.service.js';
import { GuardianLinksController } from './guardian-links.controller.js';
import { GuardianLinksService } from './guardian-links.service.js';
import { GuardiansController } from './guardians.controller.js';
import { UserImportController } from './import/user-import.controller.js';
import { UserImportService } from './import/user-import.service.js';
import { institutionDomainProvider } from './institution-domain.js';
import { StudentsController } from './students.controller.js';
import { TeachersController } from './teachers.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

// Usuarios, matrículas, traslados y apoderados (Dev 2, F3: RF-18..25, RN-13) e importación masiva
// (F4: RF-21). Solo ADMIN.
// PrismaModule y AuditModule son globales; AcademicModule aporta AcademicAccessService y los eventos.
@Module({
  imports: [AcademicModule],
  controllers: [
    // Antes que UsersController: /users/import/* no debe caer en las rutas /users/:id.
    UserImportController,
    UsersController,
    StudentsController,
    TeachersController,
    GuardiansController,
    GuardianLinksController,
  ],
  providers: [
    UsersService,
    EnrollmentsService,
    GuardianLinksService,
    UserImportService,
    ActiveActorGuard,
    institutionDomainProvider,
  ],
})
export class UsersModule {}
