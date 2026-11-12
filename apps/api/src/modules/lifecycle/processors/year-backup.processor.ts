import type { Readable } from 'node:stream';
import { Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
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
  zipPath,
  zipSegment,
  type ZipWriter,
} from '../../jobs/index.js';
import { StorageService } from '../../storage/index.js';
import { toCsvLine } from '../../users/import/csv-escape.js';

export const BACKUP_INDEX_FILE = 'indice.csv';
const INDEX_HEADER = [
  'ruta',
  'tipo',
  'curso',
  'periodo',
  'titulo',
  'estudiante',
  'version',
  'recibido',
  'tardia',
  'bytes',
  'sha256',
  'estado',
];

type FileRow = {
  objectKey: string;
  sizeBytes: number | null;
  sha256: string | null;
  scanStatus: string;
  uploadStatus: string;
  purgedAt: Date | null;
};

const fileSelect = {
  objectKey: true,
  sizeBytes: true,
  sha256: true,
  scanStatus: true,
  uploadStatus: true,
  purgedAt: true,
} as const;

/** Solo PDF limpios, confirmados y sin purgar (RF-40): lo demás no se puede descargar. */
const usable = (f: FileRow | null | undefined): f is FileRow =>
  !!f && f.scanStatus === 'CLEAN' && f.uploadStatus === 'COMPLETED' && f.purgedAt === null;

/** Sufijo corto del id para que dos tareas con el mismo título no compartan carpeta. */
const tag = (id: string) => id.slice(-8);

interface IndexEntry {
  path: string;
  kind: 'MATERIAL' | 'ENUNCIADO' | 'ENTREGA';
  course: string;
  period: string;
  title: string;
  student?: string;
  version?: number;
  receivedAt?: Date;
  isLate?: boolean;
  file: FileRow;
  /** Archivo infectado, sin confirmar o ya purgado: va al índice como EXCLUIDO, sin el PDF. */
  excluded?: boolean;
}

/**
 * lifecycle:year-backup (RF-65, U6). Un trabajo por sección del año cerrado: ZIP con los
 * materiales, los enunciados y todas las versiones de las entregas, más indice.csv (escapado
 * contra inyección de fórmulas). Se sube a backups/ y no vence: lo borra la purga del año (U7).
 * Un objeto ausente en S3 no corta el respaldo: queda en el índice como FALTANTE. Los archivos
 * infectados, sin confirmar o purgados no se copian: quedan en el índice como EXCLUIDO.
 */
@Injectable()
export class YearBackupProcessor implements JobProcessor<TrackedJobData>, OnModuleInit {
  readonly queue = 'lifecycle' as const;
  readonly name = 'year-backup';

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly runner: TrackedJobRunner,
    private readonly prisma: PrismaService,
    private readonly results: JobResultStorage,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  handle(job: Job<TrackedJobData>): Promise<void> {
    return this.runner.run(job, (started) => this.work(started));
  }

  async work(started: StartedJob, now: Date = new Date()): Promise<JobResult> {
    const { academicYearId, sectionId } = started.params;
    if (typeof academicYearId !== 'string' || typeof sectionId !== 'string') {
      throw new JobError('INVALID_PARAMS', false);
    }
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, academicYearId },
      select: {
        gradeLevel: true,
        code: true,
        academicYear: { select: { year: true, closedAt: true } },
      },
    });
    if (!section) throw new JobError('SECTION_NOT_FOUND', false);
    if (!section.academicYear.closedAt) throw new JobError('YEAR_NOT_CLOSED', false);

    const entries = await this.collect(sectionId);
    const root = zipSegment(`${section.academicYear.year} ${section.gradeLevel}${section.code}`);
    const objectKey = buildResultKey('zip', now, undefined, 'backups');
    const bytes = await uploadZip(this.results, objectKey, async (zip) => {
      const lines = [toCsvLine(INDEX_HEADER)];
      for (const entry of entries) {
        const path = `${root}/${entry.path}`;
        if (entry.excluded) {
          lines.push(indexLine({ ...entry, path }, 'EXCLUIDO'));
          continue;
        }
        const state = await this.addFile(zip, path, entry.file.objectKey);
        lines.push(indexLine({ ...entry, path }, state));
      }
      await zip.addBuffer(`${root}/${BACKUP_INDEX_FILE}`, `﻿${lines.join('\r\n')}\r\n`);
    });
    return { objectKey, bytes, keepUntilPurge: true };
  }

  /** Agrega el PDF; si el objeto ya no está en S3 devuelve FALTANTE y sigue. */
  private async addFile(zip: ZipWriter, path: string, key: string): Promise<string> {
    let stream: Readable;
    try {
      stream = await this.storage.openObjectStream(key);
    } catch (error) {
      if (error instanceof NotFoundException) return 'FALTANTE';
      throw error;
    }
    try {
      const name = await zip.addStream(path, () => Promise.resolve(stream));
      return `INCLUIDO:${name}`;
    } catch (error) {
      stream.destroy();
      throw error;
    }
  }

  private async collect(sectionId: string): Promise<IndexEntry[]> {
    const courseSections = await this.prisma.courseSection.findMany({
      where: { sectionId },
      select: { id: true, course: { select: { name: true } } },
      orderBy: { course: { name: 'asc' } },
    });
    const entries: IndexEntry[] = [];
    for (const cs of courseSections) {
      const course = cs.course.name;
      const [materials, assignments, versions] = await Promise.all([
        this.prisma.material.findMany({
          where: { courseSectionId: cs.id },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            kind: true,
            title: true,
            period: { select: { label: true } },
            file: { select: fileSelect },
          },
        }),
        this.prisma.assignment.findMany({
          where: { courseSectionId: cs.id },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            title: true,
            period: { select: { label: true } },
            attachmentFile: { select: fileSelect },
          },
        }),
        this.prisma.submissionVersion.findMany({
          where: { submission: { assignment: { courseSectionId: cs.id } } },
          orderBy: [{ submissionId: 'asc' }, { versionNumber: 'asc' }],
          select: {
            versionNumber: true,
            receivedAt: true,
            isLate: true,
            file: { select: fileSelect },
            submission: {
              select: {
                assignment: {
                  select: { id: true, title: true, period: { select: { label: true } } },
                },
                enrollment: { select: { student: { select: { fullName: true } } } },
              },
            },
          },
        }),
      ]);
      for (const m of materials) {
        if (!m.file) continue;
        const kind = m.kind === 'CLASS' ? 'Clase' : 'Lectura';
        entries.push({
          path: zipPath(course, 'Materiales', `${kind} - ${m.title} [${tag(m.id)}].pdf`),
          kind: 'MATERIAL',
          course,
          period: m.period?.label ?? '',
          title: m.title,
          file: m.file,
          excluded: !usable(m.file),
        });
      }
      for (const a of assignments) {
        if (!a.attachmentFile) continue;
        entries.push({
          path: zipPath(course, 'Tareas', `${a.title} [${tag(a.id)}]`, 'Enunciado.pdf'),
          kind: 'ENUNCIADO',
          course,
          period: a.period.label,
          title: a.title,
          file: a.attachmentFile,
          excluded: !usable(a.attachmentFile),
        });
      }
      for (const v of versions) {
        const a = v.submission.assignment;
        const student = v.submission.enrollment.student.fullName;
        entries.push({
          path: zipPath(
            course,
            'Tareas',
            `${a.title} [${tag(a.id)}]`,
            'Entregas',
            `${student} - v${v.versionNumber}.pdf`,
          ),
          kind: 'ENTREGA',
          course,
          period: a.period.label,
          title: a.title,
          student,
          version: v.versionNumber,
          receivedAt: v.receivedAt,
          isLate: v.isLate,
          file: v.file,
          excluded: !usable(v.file),
        });
      }
    }
    return entries;
  }
}

function indexLine(entry: IndexEntry, state: string): string {
  const included = state.startsWith('INCLUIDO:');
  return toCsvLine([
    included ? state.slice('INCLUIDO:'.length) : entry.path,
    entry.kind,
    entry.course,
    entry.period,
    entry.title,
    entry.student ?? '',
    entry.version === undefined ? '' : String(entry.version),
    entry.receivedAt?.toISOString() ?? '',
    entry.isLate === undefined ? '' : entry.isLate ? 'SI' : 'NO',
    entry.file.sizeBytes === null ? '' : String(entry.file.sizeBytes),
    entry.file.sha256 ?? '',
    included ? 'INCLUIDO' : state === 'EXCLUIDO' ? 'EXCLUIDO' : 'FALTANTE',
  ]);
}
