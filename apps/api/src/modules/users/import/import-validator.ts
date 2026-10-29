import { BadRequestException } from '@nestjs/common';
import type { UserRole, UserStatus } from '../../../generated/prisma/enums.js';
import { sectionCode } from '../../academic/academic.dto.js';
import { checkEmailDomain } from '../users-policy.js';
import { emailSchema, fullNameSchema } from '../users.dto.js';
import { IMPORT_MSG } from '../users.errors.js';
import { IMPORT_COLUMNS, mapHeaders } from './import-columns.js';
import {
  isEmptyRow,
  MAX_CELL_CHARS,
  MAX_ERRORS,
  MAX_STUDENTS_PER_GUARDIAN,
  ROW_ERROR_MSG,
  type CellValue,
  type ImportFormat,
  type ImportReport,
  type ImportRowError,
  type ImportSummary,
  type ImportType,
  type RowErrorCode,
  type SheetRow,
} from './import.constants.js';

// Validación de la importación (Decisiones 2 y 3), sin BD (solo lanza los 400 del encabezado).
// Fase 1: celdas y reglas entre filas del archivo. Fase 2: contra los datos de la BD que el
// servicio ya consultó. Los mensajes nunca repiten el valor de la celda.

export type StudentRow = {
  row: number;
  email: string;
  fullName: string;
  gradeLevel: number;
  sectionCode: string;
};
export type TeacherRow = { row: number; email: string; fullName: string };
export type GuardianRow = {
  row: number;
  guardianEmail: string;
  guardianName: string;
  studentEmail: string;
};

export type ValidRows =
  | { type: 'students'; rows: StudentRow[] }
  | { type: 'teachers'; rows: TeacherRow[] }
  | { type: 'guardians'; rows: GuardianRow[] };

export type FileCheck = { totalRows: number; valid: ValidRows; errors: ImportRowError[] };

export type SectionInfo = { id: string; academicYearId: string; isActive: boolean };
export type ExistingUser = { id: string; role: UserRole; status: UserStatus };

/** Datos de la BD para la fase 2 (correos en minúsculas). */
export type DbLookups = {
  takenEmails: Set<string>;
  /** Secciones del año activo por clave `${grado}|${código}` (solo students). */
  sections?: Map<string, SectionInfo>;
  /** Usuarios existentes por correo del estudiante (solo guardians). */
  students?: Map<string, ExistingUser>;
};

export const sectionKey = (gradeLevel: number, code: string): string => `${gradeLevel}|${code}`;

export function rowError(
  row: number,
  column: string | null,
  code: RowErrorCode,
  firstRow?: number,
): ImportRowError {
  const base = ROW_ERROR_MSG[code];
  const message =
    firstRow === undefined ? base : `${base} (primera aparición en la fila ${firstRow})`;
  return { row, column, code, message };
}

const GRADE = /^[1-5]$/;

type FieldKind = 'email' | 'name' | 'grade' | 'section';
type FieldResult = { ok: true; value: string } | { ok: false; code: RowErrorCode };
type ParsedRow = { row: number; values: Record<string, string> };

const COLUMN_KIND: Record<string, FieldKind> = {
  correo: 'email',
  correo_apoderado: 'email',
  correo_estudiante: 'email',
  nombre_completo: 'name',
  nombre_apoderado: 'name',
  grado: 'grade',
  seccion: 'section',
};

/** Rol con el que se valida el dominio de cada columna de correo (null = sin dominio). */
const ROLE_OF_EMAIL_COLUMN: Record<ImportType, Record<string, UserRole | null>> = {
  students: { correo: 'STUDENT' },
  teachers: { correo: 'TEACHER' },
  // GUARDIAN exento por D-013; el estudiante ya existe y no se revalida su dominio.
  guardians: { correo_apoderado: 'GUARDIAN', correo_estudiante: null },
};

function readField(
  cell: CellValue | undefined,
  kind: FieldKind,
  role: UserRole | null,
  domain: string | null,
): FieldResult {
  const value = cell ?? '';
  if (typeof value !== 'string') return { ok: false, code: value.problem };
  if (value.length > MAX_CELL_CHARS) return { ok: false, code: 'TOO_LONG' };
  if (value.trim() === '') return { ok: false, code: 'REQUIRED' };
  switch (kind) {
    case 'email': {
      const parsed = emailSchema.safeParse(value);
      if (!parsed.success) return { ok: false, code: 'INVALID_EMAIL' };
      if (role !== null && !checkEmailDomain(parsed.data, role, domain)) {
        return { ok: false, code: 'EMAIL_DOMAIN' };
      }
      return { ok: true, value: parsed.data };
    }
    case 'name': {
      const parsed = fullNameSchema.safeParse(value);
      return parsed.success
        ? { ok: true, value: parsed.data }
        : { ok: false, code: 'INVALID_NAME' };
    }
    case 'grade': {
      const trimmed = value.trim();
      return GRADE.test(trimmed)
        ? { ok: true, value: trimmed }
        : { ok: false, code: 'INVALID_GRADE' };
    }
    case 'section': {
      const parsed = sectionCode.safeParse(value);
      return parsed.success
        ? { ok: true, value: parsed.data }
        : { ok: false, code: 'INVALID_SECTION' };
    }
  }
}

/**
 * Fase 1: encabezado (400 si no cumple la plantilla o no hay filas de datos), celdas de cada fila
 * y reglas entre filas. `valid` solo trae las filas sin errores.
 */
export function validateFileRows(
  type: ImportType,
  sheet: SheetRow[],
  domain: string | null,
): FileCheck {
  const header = sheet[0];
  if (!header || header.row !== 1 || isEmptyRow(header.cells)) {
    throw new BadRequestException(IMPORT_MSG.missingHeader);
  }
  const columns: Record<string, number> = mapHeaders(type, header.cells);
  const used = new Set(Object.values(columns));
  const dataRows = sheet.slice(1).filter((r) => r.row > 1 && !isEmptyRow(r.cells));
  if (dataRows.length === 0) throw new BadRequestException(IMPORT_MSG.noRows);

  const errors: ImportRowError[] = [];
  const parsedRows: ParsedRow[] = [];
  for (const { row, cells } of dataRows) {
    const rowErrors: ImportRowError[] = [];
    const extra = cells.some(
      (cell, index) => !used.has(index) && (typeof cell !== 'string' || cell.trim() !== ''),
    );
    if (extra) rowErrors.push(rowError(row, null, 'EXTRA_CELLS'));
    const values: Record<string, string> = {};
    for (const column of IMPORT_COLUMNS[type]) {
      const result = readField(
        cells[columns[column]],
        COLUMN_KIND[column],
        ROLE_OF_EMAIL_COLUMN[type][column] ?? null,
        domain,
      );
      if (result.ok) values[column] = result.value;
      else rowErrors.push(rowError(row, column, result.code));
    }
    errors.push(...rowErrors);
    if (rowErrors.length === 0) parsedRows.push({ row, values });
  }

  const valid =
    type === 'guardians'
      ? checkGuardianRows(parsedRows, errors)
      : checkUniqueEmails(type, parsedRows, errors);
  return { totalRows: dataRows.length, valid, errors };
}

/** students y teachers: el correo no se repite en el archivo (DUPLICATE_IN_FILE). */
function checkUniqueEmails(
  type: 'students' | 'teachers',
  rows: ParsedRow[],
  errors: ImportRowError[],
): ValidRows {
  const firstByEmail = new Map<string, number>();
  const kept: ParsedRow[] = [];
  for (const r of rows) {
    const first = firstByEmail.get(r.values.correo);
    if (first !== undefined) {
      errors.push(rowError(r.row, 'correo', 'DUPLICATE_IN_FILE', first));
      continue;
    }
    firstByEmail.set(r.values.correo, r.row);
    kept.push(r);
  }
  if (type === 'teachers') {
    return {
      type,
      rows: kept.map((r) => ({
        row: r.row,
        email: r.values.correo,
        fullName: r.values.nombre_completo,
      })),
    };
  }
  return {
    type,
    rows: kept.map((r) => ({
      row: r.row,
      email: r.values.correo,
      fullName: r.values.nombre_completo,
      gradeLevel: Number(r.values.grado),
      sectionCode: r.values.seccion,
    })),
  };
}

/**
 * guardians: una fila por par apoderado-estudiante. El mismo apoderado en varias filas debe tener
 * el mismo nombre (NAME_MISMATCH), sin pares repetidos (DUPLICATE_LINK) y hasta 10 estudiantes
 * (TOO_MANY_STUDENTS); apoderado y estudiante distintos (SAME_PERSON).
 */
function checkGuardianRows(rows: ParsedRow[], errors: ImportRowError[]): ValidRows {
  type Group = { firstRow: number; name: string; students: Map<string, number> };
  const groups = new Map<string, Group>();
  const kept: GuardianRow[] = [];
  for (const r of rows) {
    const guardianEmail = r.values.correo_apoderado;
    const guardianName = r.values.nombre_apoderado;
    const studentEmail = r.values.correo_estudiante;
    if (guardianEmail === studentEmail) {
      errors.push(rowError(r.row, 'correo_estudiante', 'SAME_PERSON'));
      continue;
    }
    let group = groups.get(guardianEmail);
    if (!group) {
      group = { firstRow: r.row, name: guardianName, students: new Map() };
      groups.set(guardianEmail, group);
    } else if (group.name !== guardianName) {
      errors.push(rowError(r.row, 'nombre_apoderado', 'NAME_MISMATCH', group.firstRow));
      continue;
    }
    const linkedAt = group.students.get(studentEmail);
    if (linkedAt !== undefined) {
      errors.push(rowError(r.row, 'correo_estudiante', 'DUPLICATE_LINK', linkedAt));
      continue;
    }
    if (group.students.size >= MAX_STUDENTS_PER_GUARDIAN) {
      errors.push(rowError(r.row, 'correo_estudiante', 'TOO_MANY_STUDENTS'));
      continue;
    }
    group.students.set(studentEmail, r.row);
    kept.push({ row: r.row, guardianEmail, guardianName, studentEmail });
  }
  return { type: 'guardians', rows: kept };
}

/** Fase 2: reglas contra la BD. Vacío si todo se puede crear. */
export function checkAgainstDb(valid: ValidRows, db: DbLookups): ImportRowError[] {
  const errors: ImportRowError[] = [];
  switch (valid.type) {
    case 'teachers':
      for (const r of valid.rows) {
        if (db.takenEmails.has(r.email)) errors.push(rowError(r.row, 'correo', 'EMAIL_TAKEN'));
      }
      break;
    case 'students':
      for (const r of valid.rows) {
        if (db.takenEmails.has(r.email)) errors.push(rowError(r.row, 'correo', 'EMAIL_TAKEN'));
        const section = db.sections?.get(sectionKey(r.gradeLevel, r.sectionCode));
        if (!section) errors.push(rowError(r.row, 'seccion', 'SECTION_NOT_FOUND'));
        else if (!section.isActive) errors.push(rowError(r.row, 'seccion', 'SECTION_INACTIVE'));
      }
      break;
    case 'guardians':
      for (const r of valid.rows) {
        if (db.takenEmails.has(r.guardianEmail)) {
          errors.push(rowError(r.row, 'correo_apoderado', 'EMAIL_TAKEN'));
        }
        const student = db.students?.get(r.studentEmail);
        if (!student) errors.push(rowError(r.row, 'correo_estudiante', 'STUDENT_NOT_FOUND'));
        else if (student.role !== 'STUDENT') {
          errors.push(rowError(r.row, 'correo_estudiante', 'NOT_STUDENT'));
        } else if (student.status === 'WITHDRAWN') {
          errors.push(rowError(r.row, 'correo_estudiante', 'STUDENT_WITHDRAWN'));
        }
      }
      break;
  }
  return errors;
}

/** Lo que se crearía con las filas válidas que no tienen errores. */
export function summarize(valid: ValidRows, errors: ImportRowError[]): ImportSummary {
  const bad = new Set(errors.map((e) => e.row));
  switch (valid.type) {
    case 'teachers': {
      const users = valid.rows.filter((r) => !bad.has(r.row)).length;
      return { users, enrollments: 0, links: 0 };
    }
    case 'students': {
      const n = valid.rows.filter((r) => !bad.has(r.row)).length;
      return { users: n, enrollments: n, links: 0 };
    }
    case 'guardians': {
      const ok = valid.rows.filter((r) => !bad.has(r.row));
      const users = new Set(ok.map((r) => r.guardianEmail)).size;
      return { users, enrollments: 0, links: ok.length };
    }
  }
}

/** Errores en orden de fila y de columna (los de la fila completa primero). */
export function sortErrors(type: ImportType, errors: ImportRowError[]): ImportRowError[] {
  const order: readonly string[] = IMPORT_COLUMNS[type];
  const col = (c: string | null) => (c === null ? -1 : order.indexOf(c));
  return [...errors].sort((a, b) => a.row - b.row || col(a.column) - col(b.column));
}

/** Reporte de la vista previa, con tope de MAX_ERRORS errores. */
export function buildReport(input: {
  type: ImportType;
  format: ImportFormat;
  sha256: string;
  totalRows: number;
  errors: ImportRowError[];
  summary: ImportSummary;
}): ImportReport {
  const sorted = sortErrors(input.type, input.errors);
  const errorRows = new Set(sorted.map((e) => e.row)).size;
  return {
    type: input.type,
    format: input.format,
    sha256: input.sha256,
    totalRows: input.totalRows,
    validRows: input.totalRows - errorRows,
    errorRows,
    errors: sorted.slice(0, MAX_ERRORS),
    errorsTruncated: sorted.length > MAX_ERRORS,
    summary: input.summary,
    canConfirm: sorted.length === 0,
  };
}

// --- Plan de escritura ------------------------------------------------------

export type NewUser = {
  id: string;
  institutionalEmail: string;
  fullName: string;
  role: UserRole;
};
export type NewEnrollment = {
  id: string;
  studentId: string;
  sectionId: string;
  academicYearId: string;
};
export type NewLink = { id: string; guardianId: string; studentId: string };
export type ImportPlan = { users: NewUser[]; enrollments: NewEnrollment[]; links: NewLink[] };

/**
 * Filas a crear. Solo se llama sin errores en las dos fases. `newId` genera los ids (uuidv7 en el
 * servicio). `sectionId` y `academicYearId` salen juntos de la misma Section.
 */
export function buildPlan(valid: ValidRows, db: DbLookups, newId: () => string): ImportPlan {
  const plan: ImportPlan = { users: [], enrollments: [], links: [] };
  switch (valid.type) {
    case 'teachers':
      for (const r of valid.rows) {
        plan.users.push({
          id: newId(),
          institutionalEmail: r.email,
          fullName: r.fullName,
          role: 'TEACHER',
        });
      }
      break;
    case 'students':
      for (const r of valid.rows) {
        const section = db.sections?.get(sectionKey(r.gradeLevel, r.sectionCode));
        if (!section) throw new Error('Plan de importación sin sección validada');
        const id = newId();
        plan.users.push({ id, institutionalEmail: r.email, fullName: r.fullName, role: 'STUDENT' });
        plan.enrollments.push({
          id: newId(),
          studentId: id,
          sectionId: section.id,
          academicYearId: section.academicYearId,
        });
      }
      break;
    case 'guardians': {
      const guardianIds = new Map<string, string>();
      for (const r of valid.rows) {
        let guardianId = guardianIds.get(r.guardianEmail);
        if (guardianId === undefined) {
          guardianId = newId();
          guardianIds.set(r.guardianEmail, guardianId);
          plan.users.push({
            id: guardianId,
            institutionalEmail: r.guardianEmail,
            fullName: r.guardianName,
            role: 'GUARDIAN',
          });
        }
        const student = db.students?.get(r.studentEmail);
        if (!student) throw new Error('Plan de importación sin estudiante validado');
        plan.links.push({ id: newId(), guardianId, studentId: student.id });
      }
      break;
    }
  }
  return plan;
}
