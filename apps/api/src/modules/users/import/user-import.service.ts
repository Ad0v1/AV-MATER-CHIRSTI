import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AcademicAccessService, type ActiveYear } from '../../academic/academic-access.service.js';
import { MSG, mapPrismaError } from '../../academic/academic.errors.js';
import type { Actor } from '../../academic/request-user.js';
import { INSTITUTION_EMAIL_DOMAIN } from '../institution-domain.js';
import { recordUsers } from '../users-audit.js';
import { lockUsersForUpdate, lockYearForShare } from '../users-locks.js';
import { USERS_MSG } from '../users.errors.js';
import { parseImportFile, type UploadedImportFile } from './import-file.js';
import { buildTemplate, type ImportTemplate } from './import-template.js';
import {
  buildPlan,
  buildReport,
  checkAgainstDb,
  sectionKey,
  sortErrors,
  summarize,
  validateFileRows,
  type DbLookups,
  type ExistingUser,
  type ImportPlan,
  type SectionInfo,
  type ValidRows,
} from './import-validator.js';
import {
  BATCH_SIZE,
  IMPORT_TX_OPTIONS,
  MAX_ERRORS,
  type ImportCommitResult,
  type ImportFormat,
  type ImportReport,
  type ImportRowError,
  type ImportType,
} from './import.constants.js';
import { uuidv7 } from './uuid-v7.js';

type Db = Prisma.TransactionClient;

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Correos de los usuarios que se crearían. */
function newEmails(valid: ValidRows): string[] {
  switch (valid.type) {
    case 'guardians':
      return [...new Set(valid.rows.map((r) => r.guardianEmail))];
    default:
      return valid.rows.map((r) => r.email);
  }
}

/** 422 con los errores de fila en `details` (sin escribir nada). */
function rejectRows(type: ImportType, errors: ImportRowError[]): never {
  throw new UnprocessableEntityException({
    message: sortErrors(type, errors).slice(0, MAX_ERRORS),
  });
}

/** P2028 (transacción expirada o cerrada por el tiempo límite) también es un 409 reintentable. */
function mapImportError(error: unknown): never {
  if ((error as { code?: unknown } | null)?.code === 'P2028') {
    throw new ConflictException(MSG.conflict);
  }
  return mapPrismaError(error, USERS_MSG.emailTaken);
}

/**
 * RF-21: importación masiva de estudiantes (con matrícula en el año activo), docentes y
 * apoderados (con vínculos). Sin estado entre llamadas: la confirmación vuelve a subir el archivo
 * y se compara su SHA-256 con el de la vista previa. Nunca registra filas, correos, nombres ni el
 * nombre del archivo (RNF-09/11).
 */
@Injectable()
export class UserImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
    @Inject(INSTITUTION_EMAIL_DOMAIN) private readonly domain: string | null,
  ) {}

  template(type: ImportType, format: ImportFormat): Promise<ImportTemplate> {
    return buildTemplate(type, format);
  }

  /** Vista previa: valida el archivo y contra la BD con lecturas simples. No escribe. */
  async preview(type: ImportType, file: UploadedImportFile | undefined): Promise<ImportReport> {
    const parsed = await parseImportFile(file);
    const check = validateFileRows(type, parsed.rows, this.domain);
    const year = type === 'students' ? await this.requireOpenActiveYear() : null;
    const lookups = await this.readLookups(this.prisma, check.valid, year?.id ?? null);
    const errors = [...check.errors, ...checkAgainstDb(check.valid, lookups)];
    return buildReport({
      type,
      format: parsed.format,
      sha256: parsed.sha256,
      totalRows: check.totalRows,
      errors,
      summary: summarize(check.valid, errors),
    });
  }

  /**
   * Confirmación: mismo archivo (SHA-256, si no → 409), se revalida todo dentro de una transacción
   * y se escribe todo o nada (errores → 422). Orden de bloqueos (Decisión 3): (1) guardians:
   * estudiantes FOR UPDATE por id; (2) students: año activo FOR SHARE; (3) correos usados;
   * (4) escrituras con createMany en bloques. P2002, P2034 y deadlock → 409.
   */
  async commit(
    type: ImportType,
    sha256: string,
    file: UploadedImportFile | undefined,
    actor: Actor,
  ): Promise<ImportCommitResult> {
    const parsed = await parseImportFile(file, sha256);
    const check = validateFileRows(type, parsed.rows, this.domain);
    if (check.errors.length > 0) rejectRows(type, check.errors);

    // Ids leídos fuera de la transacción; dentro se bloquean y se vuelven a leer.
    const year = type === 'students' ? await this.requireOpenActiveYear() : null;
    const studentIds =
      check.valid.type === 'guardians'
        ? [...(await this.readStudents(this.prisma, check.valid)).values()].map((s) => s.id)
        : [];
    const now = new Date();

    const plan = await this.prisma
      .$transaction(async (tx): Promise<ImportPlan> => {
        const lookups: DbLookups = { takenEmails: new Set() };
        if (check.valid.type === 'guardians') {
          // (1) Estudiantes FOR UPDATE en orden de id; luego se releen sus correos.
          const locked = await lockUsersForUpdate(tx, studentIds);
          lookups.students = await this.readStudents(tx, check.valid, [...locked.keys()]);
        }
        if (year) {
          // (2) Año activo FOR SHARE: cerrar el año espera a esta importación y viceversa.
          const lockedYear = await lockYearForShare(tx, year.id);
          if (!lockedYear?.isActive) throw new ConflictException(USERS_MSG.noActiveYear);
          if (!lockedYear.isOpen) throw new ConflictException(USERS_MSG.yearClosed);
          lookups.sections = await this.readSections(tx, year.id);
        }
        // (3) Correos ya usados (el UNIQUE con P2002 cubre la carrera → 409).
        lookups.takenEmails = await this.readTakenEmails(tx, newEmails(check.valid));
        const dbErrors = checkAgainstDb(check.valid, lookups);
        if (dbErrors.length > 0) rejectRows(type, dbErrors);

        // (4) Escrituras. Marcadores TRUE (vigente) y fechas del servidor.
        const result = buildPlan(check.valid, lookups, () => uuidv7());
        for (const batch of chunks(result.users, BATCH_SIZE)) {
          await tx.user.createMany({ data: batch });
        }
        for (const batch of chunks(result.enrollments, BATCH_SIZE)) {
          await tx.enrollment.createMany({
            data: batch.map((e) => ({ ...e, isCurrent: true, effectiveFrom: now })),
          });
        }
        for (const batch of chunks(result.links, BATCH_SIZE)) {
          await tx.guardianStudent.createMany({
            data: batch.map((l) => ({ ...l, isActive: true, createdAt: now })),
          });
        }
        return result;
      }, IMPORT_TX_OPTIONS)
      .catch(mapImportError);

    const created = {
      users: plan.users.length,
      enrollments: plan.enrollments.length,
      links: plan.links.length,
    };
    // Un solo evento, después del commit, solo con ids y conteos (nunca correos ni nombres).
    await recordUsers(this.audit, actor, 'import.commit', undefined, undefined, {
      after: {
        type,
        format: parsed.format,
        rows: check.totalRows,
        usersCreated: created.users,
        enrollmentsCreated: created.enrollments,
        linksCreated: created.links,
        userIds: plan.users.map((u) => u.id),
      },
    });
    return { type, created };
  }

  /** Año activo y abierto (students): 409 si no hay o si está cerrado. */
  private async requireOpenActiveYear(): Promise<ActiveYear> {
    const year = await this.access.getActiveYear();
    if (!year) throw new ConflictException(USERS_MSG.noActiveYear);
    const row = await this.prisma.academicYear.findUnique({
      where: { id: year.id },
      select: { closedAt: true },
    });
    if (row?.closedAt !== null) throw new ConflictException(USERS_MSG.yearClosed);
    return year;
  }

  private async readLookups(db: Db, valid: ValidRows, yearId: string | null): Promise<DbLookups> {
    const lookups: DbLookups = { takenEmails: await this.readTakenEmails(db, newEmails(valid)) };
    if (valid.type === 'students' && yearId !== null) {
      lookups.sections = await this.readSections(db, yearId);
    }
    if (valid.type === 'guardians') lookups.students = await this.readStudents(db, valid);
    return lookups;
  }

  private async readTakenEmails(db: Db, emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();
    const rows = await db.user.findMany({
      where: { institutionalEmail: { in: emails } },
      select: { institutionalEmail: true },
    });
    return new Set(
      rows.flatMap((r) => (r.institutionalEmail ? [r.institutionalEmail.toLowerCase()] : [])),
    );
  }

  private async readSections(db: Db, academicYearId: string): Promise<Map<string, SectionInfo>> {
    const rows = await db.section.findMany({
      where: { academicYearId },
      select: { id: true, academicYearId: true, gradeLevel: true, code: true, isActive: true },
    });
    return new Map(
      rows.map((s) => [
        sectionKey(s.gradeLevel, s.code.toUpperCase()),
        { id: s.id, academicYearId: s.academicYearId, isActive: s.isActive },
      ]),
    );
  }

  /** Usuarios con los correos de estudiante del archivo (opcionalmente solo esos ids). */
  private async readStudents(
    db: Db,
    valid: Extract<ValidRows, { type: 'guardians' }>,
    onlyIds?: string[],
  ): Promise<Map<string, ExistingUser>> {
    const emails = [...new Set(valid.rows.map((r) => r.studentEmail))];
    if (emails.length === 0 || onlyIds?.length === 0) return new Map();
    const rows = await db.user.findMany({
      where: {
        institutionalEmail: { in: emails },
        ...(onlyIds !== undefined ? { id: { in: onlyIds } } : {}),
      },
      select: { id: true, institutionalEmail: true, role: true, status: true },
    });
    return new Map(
      rows.flatMap((u) =>
        u.institutionalEmail
          ? [
              [
                u.institutionalEmail.toLowerCase(),
                { id: u.id, role: u.role, status: u.status },
              ] as const,
            ]
          : [],
      ),
    );
  }
}
