import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AcademicAccessService, type ActiveYear } from '../../academic/academic-access.service.js';
import { MSG, mapPrismaError } from '../../academic/academic.errors.js';
import type { Actor } from '../../academic/request-user.js';
import { DniService } from '../../auth/dni.service.js';
import { hashInitialPassword } from '../../auth/password-hash.js';
import { generateInitialPassword } from '../../auth/password-policy.js';
import { UserCodeService } from '../../auth/user-code.service.js';
import { recordUsers } from '../users-audit.js';
import { lockUsersForUpdate, lockYearForShare } from '../users-locks.js';
import { USERS_MSG } from '../users.errors.js';
import { buildCredentialsSheet, type IssuedRow } from './credentials-sheet.js';
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

/** Hash de contraseñas en tandas: argon2 usa los hilos de libuv y no conviene lanzar miles a la vez. */
const HASH_CONCURRENCY = 50;
/** DNI por consulta `IN`. */
const LOOKUP_CHUNK = 1000;

/** Todos los DNI que menciona el archivo (de estudiantes, apoderados y docentes). */
export function dnisOf(valid: ValidRows): string[] {
  const dnis = new Set<string>();
  switch (valid.type) {
    case 'teachers':
      for (const r of valid.rows) dnis.add(r.dni);
      break;
    case 'students':
      for (const r of valid.rows) {
        dnis.add(r.dni);
        for (const g of r.guardians) dnis.add(g.dni);
      }
      break;
    case 'guardians':
      for (const r of valid.rows) {
        dnis.add(r.guardian.dni);
        dnis.add(r.studentDni);
      }
      break;
  }
  return [...dnis];
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
  return mapPrismaError(error, USERS_MSG.duplicate);
}

/**
 * RF-21: importación masiva de estudiantes (con matrícula en el año activo y sus apoderados),
 * docentes y apoderados. Las personas se identifican por DNI (D-058, D-059). Cada cuenta nueva
 * recibe su código y una contraseña inicial aleatoria, que sale en una hoja de Excel de descarga
 * única (RF-76, RF-77) y no se guarda. Sin estado entre llamadas: la confirmación vuelve a subir el
 * archivo y se compara su SHA-256 con el de la vista previa. Nunca registra filas, DNI, nombres,
 * contraseñas ni el nombre del archivo (RNF-09/11).
 */
@Injectable()
export class UserImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
    private readonly dni: DniService,
    private readonly codes: UserCodeService,
  ) {}

  template(type: ImportType, format: ImportFormat): Promise<ImportTemplate> {
    return buildTemplate(type, format);
  }

  /** Vista previa: valida el archivo y contra la BD con lecturas simples. No escribe. */
  async preview(type: ImportType, file: UploadedImportFile | undefined): Promise<ImportReport> {
    const parsed = await parseImportFile(file);
    const check = validateFileRows(type, parsed.rows);
    const year = type === 'students' ? await this.requireOpenActiveYear() : null;
    const lookups = await this.readLookups(this.prisma, check.valid, year?.id ?? null);
    const errors = [...check.errors, ...checkAgainstDb(check.valid, lookups)];
    return buildReport({
      type,
      format: parsed.format,
      sha256: parsed.sha256,
      totalRows: check.totalRows,
      errors,
      summary: summarize(check.valid, errors, lookups),
    });
  }

  /**
   * Confirmación: mismo archivo (SHA-256, si no → 409), se revalida todo dentro de una transacción
   * y se escribe todo o nada (errores → 422). Orden de bloqueos (Decisión 3): (1) personas que ya
   * existen y se vinculan, FOR UPDATE por id; (2) students: año activo FOR SHARE; (3) escrituras
   * con createMany en bloques. P2002, P2034 y deadlock → 409.
   */
  async commit(
    type: ImportType,
    sha256: string,
    file: UploadedImportFile | undefined,
    actor: Actor,
  ): Promise<ImportCommitResult> {
    const parsed = await parseImportFile(file, sha256);
    const check = validateFileRows(type, parsed.rows);
    if (check.errors.length > 0) rejectRows(type, check.errors);

    const year = type === 'students' ? await this.requireOpenActiveYear() : null;
    // Personas existentes que se vinculan: se leen fuera de la transacción para saber sus ids.
    const known = await this.readLookups(this.prisma, check.valid, year?.id ?? null);
    const now = new Date();

    const done = await this.prisma
      .$transaction(async (tx) => {
        // (1) Bloqueo de las personas existentes (estudiantes de la hoja de apoderados y apoderados
        // reutilizados), en orden de id; después se vuelve a leer todo con lo ya bloqueado.
        const existingIds = [...known.usersByDni.values()].map((u) => u.id);
        await lockUsersForUpdate(tx, existingIds);
        if (year) {
          // (2) Año activo FOR SHARE: cerrar el año espera a esta importación y viceversa.
          const lockedYear = await lockYearForShare(tx, year.id);
          if (!lockedYear?.isActive) throw new ConflictException(USERS_MSG.noActiveYear);
          if (!lockedYear.isOpen) throw new ConflictException(USERS_MSG.yearClosed);
        }
        const lookups = await this.readLookups(tx, check.valid, year?.id ?? null);
        const dbErrors = checkAgainstDb(check.valid, lookups);
        if (dbErrors.length > 0) rejectRows(type, dbErrors);

        const plan = buildPlan(check.valid, lookups, () => uuidv7());
        const issued = await this.issueCredentials(tx, plan, now);
        await this.write(tx, plan, issued, now);
        return { plan, issued };
      }, IMPORT_TX_OPTIONS)
      .catch(mapImportError);

    const { plan, issued } = done;
    const created = {
      users: plan.users.length,
      enrollments: plan.enrollments.length,
      links: plan.links.length,
    };
    // Un solo evento, después del commit, solo con ids y conteos (nunca DNI, nombres ni claves).
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
    // La hoja se arma con lo recién creado y viaja solo en esta respuesta (RF-76).
    const sheetRows: IssuedRow[] = issued.map((i) => ({
      role: i.role as IssuedRow['role'],
      fullName: i.fullName,
      section: i.sectionText,
      code: i.code,
      password: i.password,
    }));
    const credentialsSheet =
      sheetRows.length > 0 ? await buildCredentialsSheet(sheetRows, type, now) : null;
    return { type, created, credentialsSheet };
  }

  /** Código y contraseña inicial de cada persona nueva (el hash se calcula en tandas). */
  private async issueCredentials(tx: Db, plan: ImportPlan, now: Date) {
    const codes = await this.codes.generateMany(plan.users.length, now, tx);
    const rows = plan.users.map((u, index) => ({
      ...u,
      code: codes[index]!,
      password: generateInitialPassword(),
      passwordHash: '',
    }));
    for (const batch of chunks(rows, HASH_CONCURRENCY)) {
      await Promise.all(
        batch.map(async (row) => {
          row.passwordHash = await hashInitialPassword(row.password);
        }),
      );
    }
    return rows;
  }

  private async write(
    tx: Db,
    plan: ImportPlan,
    issued: Awaited<ReturnType<UserImportService['issueCredentials']>>,
    now: Date,
  ): Promise<void> {
    for (const batch of chunks(issued, BATCH_SIZE)) {
      await tx.user.createMany({
        data: batch.map((u) => ({
          id: u.id,
          code: u.code,
          fullName: u.fullName,
          role: u.role,
          dniEncrypted: this.dni.encrypt(u.dni),
          dniHash: this.dni.hash(u.dni),
        })),
      });
      await tx.localCredential.createMany({
        data: batch.map((u) => ({
          userId: u.id,
          passwordHash: u.passwordHash,
          mustChangePassword: true,
        })),
      });
    }
    for (const batch of chunks(plan.enrollments, BATCH_SIZE)) {
      await tx.enrollment.createMany({
        data: batch.map((e) => ({ ...e, isCurrent: true, effectiveFrom: now })),
      });
    }
    for (const batch of chunks(plan.links, BATCH_SIZE)) {
      await tx.guardianStudent.createMany({
        data: batch.map((l) => ({ ...l, isActive: true, createdAt: now })),
      });
    }
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
    const lookups: DbLookups = {
      hashDni: (dni) => this.dni.hash(dni),
      usersByDni: await this.readUsersByDni(db, dnisOf(valid)),
    };
    if (valid.type === 'students' && yearId !== null) {
      lookups.sections = await this.readSections(db, yearId);
    }
    if (valid.type === 'guardians') {
      const studentIds = valid.rows.flatMap((r) => {
        const student = lookups.usersByDni.get(lookups.hashDni(r.studentDni));
        return student?.role === 'STUDENT' ? [student.id] : [];
      });
      lookups.activeGuardians = await this.readActiveGuardians(db, [...new Set(studentIds)]);
    }
    return lookups;
  }

  /** Personas que ya tienen alguno de esos DNI, por hash. */
  private async readUsersByDni(db: Db, dnis: string[]): Promise<Map<string, ExistingUserRow>> {
    const result = new Map<string, ExistingUserRow>();
    for (const batch of chunks(
      dnis.map((d) => this.dni.hash(d)),
      LOOKUP_CHUNK,
    )) {
      const rows = await db.user.findMany({
        where: { dniHash: { in: batch } },
        select: { id: true, dniHash: true, role: true, status: true },
      });
      for (const u of rows) if (u.dniHash) result.set(u.dniHash, u);
    }
    return result;
  }

  private async readSections(db: Db, academicYearId: string): Promise<Map<string, SectionInfo>> {
    // Tres niveles (09/11/2026): la plantilla CSV aún no tiene columna de nivel, así que el grado
    // se busca solo en SECUNDARIA (comportamiento previo). Pendiente: columna `nivel`.
    const rows = await db.section.findMany({
      where: { academicYearId, level: 'SECUNDARIA' },
      select: { id: true, academicYearId: true, gradeLevel: true, code: true, isActive: true },
    });
    return new Map(
      rows.map((s) => [
        sectionKey(s.gradeLevel, s.code.toUpperCase()),
        { id: s.id, academicYearId: s.academicYearId, isActive: s.isActive },
      ]),
    );
  }

  /** Apoderados vigentes de cada estudiante. */
  private async readActiveGuardians(
    db: Db,
    studentIds: string[],
  ): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    for (const batch of chunks(studentIds, LOOKUP_CHUNK)) {
      const links = await db.guardianStudent.findMany({
        where: { studentId: { in: batch }, isActive: true },
        select: { studentId: true, guardianId: true },
      });
      for (const l of links) {
        const set = map.get(l.studentId) ?? new Set<string>();
        set.add(l.guardianId);
        map.set(l.studentId, set);
      }
    }
    return map;
  }
}

type ExistingUserRow = ExistingUser & { dniHash: string | null };
