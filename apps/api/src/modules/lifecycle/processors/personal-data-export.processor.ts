import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import {
  buildResultKey,
  JobError,
  JobProcessorRegistry,
  type JobProcessor,
  type JobResult,
  JobResultStorage,
  type StartedJob,
  type TrackedJobData,
  TrackedJobRunner,
  uploadZip,
} from '../../jobs/index.js';

/** Versión del formato del JSON: si cambia la forma, se sube (la lee quien atiende el pedido). */
// 2 (09/11/2026, tres niveles): nivel en matrículas, literal en notas y logrosDelPeriodo.
export const PERSONAL_DATA_FORMAT = 2;
export const PERSONAL_DATA_FILE = 'datos-personales.json';

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

/**
 * Arma el JSON de datos personales de un estudiante (RF-63, U8, derecho ARCO): User, matrículas,
 * vínculos con apoderados, aceptaciones de la política, entregas (solo metadatos, sin los PDF) y
 * notas con comentario y exemptionReason (valor numérico o literal AD/A/B/C según el nivel) y
 * logros del período (PeriodAchievement, escala literal) con su comentario. Del apoderado solo va el nombre: su correo es un dato
 * de un tercero. null si el id no es de un estudiante.
 */
export async function buildPersonalData(prisma: PrismaService, studentId: string, now: Date) {
  const user = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      email: true,
      contactEmail: true,
      emailVerifiedAt: true,
      fullName: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user || user.role !== 'STUDENT') return null;
  const [enrollments, guardians, policies, versions, grades, achievements] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId },
      orderBy: { effectiveFrom: 'asc' },
      select: {
        id: true,
        effectiveFrom: true,
        effectiveTo: true,
        endReason: true,
        isCurrent: true,
        section: {
          select: {
            level: true,
            gradeLevel: true,
            code: true,
            academicYear: { select: { year: true } },
          },
        },
      },
    }),
    prisma.guardianStudent.findMany({
      where: { studentId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        isActive: true,
        createdAt: true,
        revokedAt: true,
        guardian: { select: { fullName: true } },
      },
    }),
    prisma.policyAcceptance.findMany({
      where: { userId: studentId },
      orderBy: { acceptedAt: 'asc' },
      select: { policyVersion: true, acceptedAt: true, ip: true, userAgent: true },
    }),
    prisma.submissionVersion.findMany({
      where: { submission: { enrollment: { studentId } } },
      orderBy: [{ receivedAt: 'asc' }],
      select: {
        versionNumber: true,
        receivedAt: true,
        isLate: true,
        submission: {
          select: {
            assignment: {
              select: {
                id: true,
                title: true,
                dueAt: true,
                courseSection: { select: { course: { select: { name: true } } } },
              },
            },
          },
        },
        file: {
          select: { originalName: true, sizeBytes: true, sha256: true, purgedAt: true },
        },
      },
    }),
    prisma.grade.findMany({
      where: { enrollment: { studentId } },
      orderBy: { gradedAt: 'asc' },
      select: {
        state: true,
        value: true,
        literal: true,
        comment: true,
        exemptionReason: true,
        source: true,
        gradedAt: true,
        assignment: {
          select: {
            id: true,
            title: true,
            period: { select: { label: true } },
            courseSection: { select: { course: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.periodAchievement.findMany({
      where: { enrollment: { studentId } },
      orderBy: { gradedAt: 'asc' },
      select: {
        literal: true,
        comment: true,
        gradedAt: true,
        updatedAt: true,
        period: { select: { label: true } },
        courseSection: { select: { course: { select: { name: true } } } },
      },
    }),
  ]);

  return {
    formato: PERSONAL_DATA_FORMAT,
    generadoEn: now.toISOString(),
    usuario: {
      id: user.id,
      correoUsuario: user.email,
      correoContacto: user.contactEmail,
      correoVerificadoEl: user.emailVerifiedAt,
      nombreCompleto: user.fullName,
      rol: user.role,
      estado: user.status,
      creadoEn: iso(user.createdAt),
      actualizadoEn: iso(user.updatedAt),
    },
    matriculas: enrollments.map((e) => ({
      id: e.id,
      anio: e.section.academicYear.year,
      nivel: e.section.level,
      grado: e.section.gradeLevel,
      seccion: e.section.code,
      desde: iso(e.effectiveFrom),
      hasta: iso(e.effectiveTo),
      vigente: e.isCurrent === true,
      motivoDeCierre: e.endReason,
    })),
    apoderados: guardians.map((g) => ({
      vinculoId: g.id,
      nombreCompleto: g.guardian.fullName,
      vigente: g.isActive === true,
      desde: iso(g.createdAt),
      revocadoEn: iso(g.revokedAt),
    })),
    aceptacionesDePolitica: policies.map((p) => ({
      version: p.policyVersion,
      aceptadaEn: iso(p.acceptedAt),
      ip: p.ip,
      navegador: p.userAgent,
    })),
    entregas: versions.map((v) => ({
      tareaId: v.submission.assignment.id,
      tarea: v.submission.assignment.title,
      curso: v.submission.assignment.courseSection.course.name,
      venceEn: iso(v.submission.assignment.dueAt),
      version: v.versionNumber,
      recibidaEn: iso(v.receivedAt),
      tardia: v.isLate,
      archivo: v.file.originalName,
      bytes: v.file.sizeBytes,
      sha256: v.file.sha256,
      archivoPurgadoEn: iso(v.file.purgedAt),
    })),
    notas: grades.map((g) => ({
      tareaId: g.assignment.id,
      tarea: g.assignment.title,
      curso: g.assignment.courseSection.course.name,
      periodo: g.assignment.period.label,
      estado: g.state,
      valor: g.value === null ? null : Number(g.value),
      literal: g.literal,
      comentario: g.comment,
      motivoDeExoneracion: g.exemptionReason,
      origen: g.source,
      calificadaEn: iso(g.gradedAt),
    })),
    logrosDelPeriodo: achievements.map((a) => ({
      curso: a.courseSection.course.name,
      periodo: a.period.label,
      literal: a.literal,
      comentario: a.comment,
      calificadoEn: iso(a.gradedAt),
      actualizadoEn: iso(a.updatedAt),
    })),
  };
}

/**
 * exports:personal-data-export (RF-63). Sube un ZIP con datos-personales.json a exports/; vence
 * a los EXPORT_TTL_DAYS (U6). Lo descarga el ADMIN que atiende el pedido (Decisión 8), con
 * bitácora job.download.
 */
@Injectable()
export class PersonalDataExportProcessor implements JobProcessor<TrackedJobData>, OnModuleInit {
  readonly queue = 'exports' as const;
  readonly name = 'personal-data-export';

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly runner: TrackedJobRunner,
    private readonly prisma: PrismaService,
    private readonly results: JobResultStorage,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  handle(job: Job<TrackedJobData>): Promise<void> {
    return this.runner.run(job, (started) => this.work(started));
  }

  async work(started: StartedJob, now: Date = new Date()): Promise<JobResult> {
    const studentId = started.params.studentId;
    if (typeof studentId !== 'string') throw new JobError('INVALID_PARAMS', false);
    const data = await buildPersonalData(this.prisma, studentId, now);
    if (!data) throw new JobError('STUDENT_NOT_FOUND', false);
    const objectKey = buildResultKey('zip', now);
    const bytes = await uploadZip(this.results, objectKey, async (zip) => {
      await zip.addBuffer(PERSONAL_DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);
    });
    return { objectKey, bytes };
  }
}
