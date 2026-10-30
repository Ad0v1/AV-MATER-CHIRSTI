import { Module } from '@nestjs/common';
import { AcademicAccessService } from './academic-access.service.js';
import { AcademicCloneService } from './academic-clone.service.js';
import { AcademicEventPublisher } from './academic-events.js';
import { AcademicPeriodsController } from './academic-periods.controller.js';
import { AcademicPeriodsService } from './academic-periods.service.js';
import { AcademicYearsController } from './academic-years.controller.js';
import { AcademicYearsService } from './academic-years.service.js';
import { CourseSectionsController } from './course-sections.controller.js';
import { CourseSectionsService } from './course-sections.service.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { MeCourseSectionsController } from './me-course-sections.controller.js';
import { SectionsController } from './sections.controller.js';
import { SectionsService } from './sections.service.js';

// Estructura académica (Dev 2, RF-09..15, RF-17, RN-10..12). PrismaModule y AuditModule son
// globales. Dev 3/4/5 importan este módulo para usar AcademicAccessService y los eventos.
@Module({
  controllers: [
    AcademicYearsController,
    AcademicPeriodsController,
    SectionsController,
    CoursesController,
    CourseSectionsController,
    MeCourseSectionsController,
  ],
  providers: [
    AcademicYearsService,
    AcademicCloneService,
    AcademicPeriodsService,
    SectionsService,
    CoursesService,
    CourseSectionsService,
    AcademicAccessService,
    AcademicEventPublisher,
  ],
  exports: [AcademicAccessService, AcademicEventPublisher],
})
export class AcademicModule {}
