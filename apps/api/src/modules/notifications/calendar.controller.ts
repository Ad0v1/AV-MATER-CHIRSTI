import { Controller, Get, Query, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { currentUser, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { calendarQuerySchema, type CalendarQuery } from './calendar.dto.js';
import { CalendarService, type CalendarView } from './calendar.service.js';

// RF-54: plazos de tareas del usuario. ADMIN no tiene calendario propio (403 por rol).
@Roles('STUDENT', 'TEACHER', 'GUARDIAN')
@Controller('me/calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  get(
    @Query(new ZodValidationPipe(calendarQuerySchema)) query: CalendarQuery,
    @Req() req: RequestWithUser,
  ): Promise<CalendarView> {
    return this.calendar.forUser(currentUser(req), query);
  }
}
