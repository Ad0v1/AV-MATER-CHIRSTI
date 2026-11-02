import { Body, Controller, Get, Param, Put, Query, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { actorOf, currentUser, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import {
  gradebookQuerySchema,
  gradeInputSchema,
  idSchema,
  yearQuerySchema,
  type GradebookQueryDto,
  type GradeInputDto,
  type YearQueryDto,
} from './grading.dto.js';
import type {
  GradebookView,
  GradeSummaryView,
  GradeView,
  GuardianStudentsView,
  StudentGradesView,
} from './grading.types.js';
import { GradebookReadService } from './gradebook-read.service.js';
import { GradesService } from './grades.service.js';

// RF-41..52. Escriben y leen el registro: docente asignado o ADMIN. Mis notas: STUDENT.
// Apoderado: solo lectura de sus estudiantes vinculados (RF-52).
@Controller()
export class GradingController {
  constructor(
    private readonly grades: GradesService,
    private readonly reads: GradebookReadService,
  ) {}

  @Put('grades/:assignmentId/:enrollmentId')
  @Roles('TEACHER', 'ADMIN')
  put(
    @Param('assignmentId', new ZodValidationPipe(idSchema)) assignmentId: string,
    @Param('enrollmentId', new ZodValidationPipe(idSchema)) enrollmentId: string,
    @Body(new ZodValidationPipe(gradeInputSchema)) dto: GradeInputDto,
    @Req() req: RequestWithUser,
  ): Promise<GradeView> {
    return this.grades.put(assignmentId, enrollmentId, dto, currentUser(req), actorOf(req));
  }

  @Get('assignments/:id/grade-summary')
  @Roles('TEACHER', 'ADMIN')
  summary(
    @Param('id', new ZodValidationPipe(idSchema)) assignmentId: string,
    @Req() req: RequestWithUser,
  ): Promise<GradeSummaryView> {
    return this.reads.gradeSummary(assignmentId, currentUser(req));
  }

  @Get('course-sections/:id/gradebook')
  @Roles('TEACHER', 'ADMIN')
  gradebook(
    @Param('id', new ZodValidationPipe(idSchema)) courseSectionId: string,
    @Query(new ZodValidationPipe(gradebookQuerySchema)) query: GradebookQueryDto,
    @Req() req: RequestWithUser,
  ): Promise<GradebookView> {
    return this.reads.gradebook(courseSectionId, query.periodId, currentUser(req));
  }

  @Get('me/grades')
  @Roles('STUDENT')
  mine(
    @Query(new ZodValidationPipe(yearQuerySchema)) query: YearQueryDto,
    @Req() req: RequestWithUser,
  ): Promise<StudentGradesView> {
    return this.reads.myGrades(currentUser(req), query.academicYearId);
  }

  @Get('guardian/students')
  @Roles('GUARDIAN')
  guardianStudents(@Req() req: RequestWithUser): Promise<GuardianStudentsView> {
    return this.reads.guardianStudents(currentUser(req));
  }

  @Get('guardian/students/:studentId/grades')
  @Roles('GUARDIAN')
  guardianStudentGrades(
    @Param('studentId', new ZodValidationPipe(idSchema)) studentId: string,
    @Query(new ZodValidationPipe(yearQuerySchema)) query: YearQueryDto,
    @Req() req: RequestWithUser,
  ): Promise<StudentGradesView> {
    return this.reads.guardianStudentGrades(currentUser(req), studentId, query.academicYearId);
  }
}
