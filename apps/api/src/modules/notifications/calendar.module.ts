import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';

// Calendario de plazos de Dev 5 (RF-54). Vive junto a las notificaciones (RF-53): ambos avisan de
// plazos. AcademicAccessService de Dev 2 resuelve el año activo y los vínculos del apoderado.
// Registrado en AppModule con autorización del usuario (30/10/2026).
@Module({
  imports: [AcademicModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
