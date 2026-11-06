import { BadRequestException } from '@nestjs/common';
import type { UserRole, UserStatus } from '../../../generated/prisma/enums.js';
import { sectionCode } from '../../academic/academic.dto.js';
import { fullNameSchema } from '../users.dto.js';
import { IMPORT_MSG } from '../users.errors.js';
import { IMPORT_COLUMNS, OPTIONAL_CELLS, mapHeaders } from './import-columns.js';
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
// servicio ya consultó. Las personas se identifican por DNI (D-058, D-059). Los mensajes nunca
// repiten el valor de la celda.

/** Apoderado de una fila. `name` es el que se escribió en alguna fila del archivo, o null. */
export type GuardianRef = { dni: string; name: string | null };

export type StudentRow = {
  row: number;
  dni: string;
  fullName: string;
  gradeLevel: number;
  sectionCode: string;
  /** De 1 a 2; el primero es el principal (RF-86). */
  guardians: GuardianRef[];
};
export type TeacherRow = { row: number; dni: string; fullName: string };
export type GuardianRow = {
  row: number;
  guardian: GuardianRef;
  studentDni: string;
};

export type ValidRows =
  | { type: 'students'; rows: StudentRow[] }
  | { type: 'teachers'; rows: TeacherRow[] }
  | { type: 'guardians'; rows: GuardianRow[] };

export type FileCheck = { totalRows: number; valid: ValidRows; errors: ImportRowError[] };

export type SectionInfo = { id: string; academicYearId: string; isActive: boolean };
export type ExistingUser = { id: string; role: UserRole; status: UserStatus };

/** Datos de la BD para la fase 2. Las personas se buscan por el hash de su DNI. */
export type DbLookups = {
  /** Hash con clave de un DNI (D-059). Se inyecta para que esta fase no dependa del cifrado. */
  hashDni: (dni: string) => string;
  /** Personas que ya existen, por hash de DNI. */
  usersByDni: Map<string, ExistingUser>;
  /** Secciones del año activo por clave `${grado}|${código}` (solo students). */
  sections?: Map<string, SectionInfo>;
  /** Apoderados vigentes de cada estudiante existente (solo guardians). */
  activeGuardians?: Map<string, Set<string>>;
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
const DNI = /^\d{8}$/;

type FieldKind = 'dni' | 'name' | 'grade' | 'section';
type FieldResult = { ok: true; value: string } | { ok: false; code: RowErrorCode };
type ParsedRow = { row: number; values: Record<string, string> };

const COLUMN_KIND: Record<string, FieldKind> = {
  dni: 'dni',
  dni_apoderado: 'dni',
  dni_apoderado_2: 'dni',
  dni_estudiante: 'dni',
  nombre_completo: 'name',
  nombre_apoderado: 'name',
  nombre_apoderado_2: 'name',
  grado: 'grade',
  seccion: 'section',
};

function readField(cell: CellValue | undefined, kind: FieldKind, optional: boolean): FieldResult {
  const value = cell ?? '';
  if (typeof value !== 'string') return { ok: false, code: value.problem };
  if (value.length > MAX_CELL_CHARS) return { ok: false, code: 'TOO_LONG' };
  if (value.trim() === '')
    return optional ? { ok: true, value: '' } : { ok: false, code: 'REQUIRED' };
  switch (kind) {
    case 'dni': {
      const trimmed = value.trim();
      return DNI.test(trimmed) ? { ok: true, value: trimmed } : { ok: false, code: 'INVALID_DNI' };
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
export function validateFileRows(type: ImportType, sheet: SheetRow[]): FileCheck {
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
        OPTIONAL_CELLS.has(column),
      );
      if (result.ok) values[column] = result.value;
      else rowErrors.push(rowError(row, column, result.code));
    }
    // El nombre del segundo apoderado sin su DNI no se puede usar.
    if (
      type === 'students' &&
      values.dni_apoderado_2 === '' &&
      values.nombre_apoderado_2 !== undefined &&
      values.nombre_apoderado_2 !== ''
    ) {
      rowErrors.push(rowError(row, 'dni_apoderado_2', 'REQUIRED'));
    }
    errors.push(...rowErrors);
    if (rowErrors.length === 0) parsedRows.push({ row, values });
  }

  const valid =
    type === 'guardians'
      ? checkGuardianRows(parsedRows, errors)
      : type === 'teachers'
        ? checkTeacherRows(parsedRows, errors)
        : checkStudentRows(parsedRows, errors);
  return { totalRows: dataRows.length, valid, errors };
}

/** Nombres de apoderado ya vistos: el mismo DNI debe llevar el mismo nombre en todas sus filas. */
class GuardianNames {
  private readonly byDni = new Map<string, { name: string; row: number }>();

  /** Registra el nombre de la fila. Devuelve la fila del primer nombre distinto, si lo hay. */
  note(dni: string, name: string, row: number): { conflictRow: number } | null {
    if (name === '') return null;
    const seen = this.byDni.get(dni);
    if (!seen) {
      this.byDni.set(dni, { name, row });
      return null;
    }
    return seen.name === name ? null : { conflictRow: seen.row };
  }

  /** Nombre escrito en alguna fila, o null. */
  nameOf(dni: string): string | null {
    return this.byDni.get(dni)?.name ?? null;
  }
}

/** teachers: el DNI no se repite en el archivo (DUPLICATE_IN_FILE). */
function checkTeacherRows(rows: ParsedRow[], errors: ImportRowError[]): ValidRows {
  const firstByDni = new Map<string, number>();
  const kept: TeacherRow[] = [];
  for (const r of rows) {
    const first = firstByDni.get(r.values.dni);
    if (first !== undefined) {
      errors.push(rowError(r.row, 'dni', 'DUPLICATE_IN_FILE', first));
      continue;
    }
    firstByDni.set(r.values.dni, r.row);
    kept.push({ row: r.row, dni: r.values.dni, fullName: r.values.nombre_completo });
  }
  return { type: 'teachers', rows: kept };
}

/**
 * students: el DNI del estudiante no se repite; sus apoderados son otras personas (SAME_PERSON), no
 * se repiten en la fila (DUPLICATE_GUARDIAN) y llevan el mismo nombre en todas sus filas
 * (NAME_MISMATCH). Un apoderado tiene hasta 10 estudiantes en el archivo (TOO_MANY_STUDENTS).
 */
function checkStudentRows(rows: ParsedRow[], errors: ImportRowError[]): ValidRows {
  const studentDnis = new Set(rows.map((r) => r.values.dni));
  const firstByDni = new Map<string, number>();
  const names = new GuardianNames();
  const studentsOf = new Map<string, number>();
  const kept: StudentRow[] = [];

  for (const r of rows) {
    const v = r.values;
    const before = errors.length;
    const first = firstByDni.get(v.dni);
    if (first !== undefined) {
      errors.push(rowError(r.row, 'dni', 'DUPLICATE_IN_FILE', first));
      continue;
    }
    firstByDni.set(v.dni, r.row);

    const refs: Array<{ dni: string; name: string; dniColumn: string; nameColumn: string }> = [
      {
        dni: v.dni_apoderado,
        name: v.nombre_apoderado,
        dniColumn: 'dni_apoderado',
        nameColumn: 'nombre_apoderado',
      },
    ];
    if (v.dni_apoderado_2 !== '') {
      refs.push({
        dni: v.dni_apoderado_2,
        name: v.nombre_apoderado_2,
        dniColumn: 'dni_apoderado_2',
        nameColumn: 'nombre_apoderado_2',
      });
    }
    for (const ref of refs) {
      if (ref.dni === v.dni || studentDnis.has(ref.dni)) {
        errors.push(rowError(r.row, ref.dniColumn, 'SAME_PERSON'));
        continue;
      }
      const conflict = names.note(ref.dni, ref.name, r.row);
      if (conflict)
        errors.push(rowError(r.row, ref.nameColumn, 'NAME_MISMATCH', conflict.conflictRow));
      const count = (studentsOf.get(ref.dni) ?? 0) + 1;
      if (count > MAX_STUDENTS_PER_GUARDIAN) {
        errors.push(rowError(r.row, ref.dniColumn, 'TOO_MANY_STUDENTS'));
      }
      studentsOf.set(ref.dni, count);
    }
    if (refs.length === 2 && refs[0]!.dni === refs[1]!.dni) {
      errors.push(rowError(r.row, 'dni_apoderado_2', 'DUPLICATE_GUARDIAN'));
    }
    if (errors.length > before) continue;

    kept.push({
      row: r.row,
      dni: v.dni,
      fullName: v.nombre_completo,
      gradeLevel: Number(v.grado),
      sectionCode: v.seccion,
      guardians: refs.map((ref) => ({ dni: ref.dni, name: null })),
    });
  }
  // El nombre de cada apoderado es el escrito en cualquiera de sus filas.
  for (const row of kept) {
    for (const g of row.guardians) g.name = names.nameOf(g.dni);
  }
  return { type: 'students', rows: kept };
}

/**
 * guardians: una fila por par apoderado-estudiante. El mismo apoderado en varias filas lleva el
 * mismo nombre (NAME_MISMATCH), sin pares repetidos (DUPLICATE_LINK) y hasta 10 estudiantes
 * (TOO_MANY_STUDENTS); apoderado y estudiante son personas distintas (SAME_PERSON).
 */
function checkGuardianRows(rows: ParsedRow[], errors: ImportRowError[]): ValidRows {
  const names = new GuardianNames();
  const linked = new Map<string, Map<string, number>>();
  const kept: GuardianRow[] = [];
  for (const r of rows) {
    const guardianDni = r.values.dni_apoderado;
    const studentDni = r.values.dni_estudiante;
    if (guardianDni === studentDni) {
      errors.push(rowError(r.row, 'dni_estudiante', 'SAME_PERSON'));
      continue;
    }
    const conflict = names.note(guardianDni, r.values.nombre_apoderado, r.row);
    if (conflict) {
      errors.push(rowError(r.row, 'nombre_apoderado', 'NAME_MISMATCH', conflict.conflictRow));
      continue;
    }
    let students = linked.get(guardianDni);
    if (!students) {
      students = new Map();
      linked.set(guardianDni, students);
    }
    const linkedAt = students.get(studentDni);
    if (linkedAt !== undefined) {
      errors.push(rowError(r.row, 'dni_estudiante', 'DUPLICATE_LINK', linkedAt));
      continue;
    }
    if (students.size >= MAX_STUDENTS_PER_GUARDIAN) {
      errors.push(rowError(r.row, 'dni_estudiante', 'TOO_MANY_STUDENTS'));
      continue;
    }
    students.set(studentDni, r.row);
    kept.push({ row: r.row, guardian: { dni: guardianDni, name: null }, studentDni });
  }
  for (const row of kept) row.guardian.name = names.nameOf(row.guardian.dni);
  return { type: 'guardians', rows: kept };
}

/** Apoderado de una fila contra la BD: existente (reutilizable) o nuevo (necesita nombre). */
function checkGuardianRef(
  row: number,
  ref: GuardianRef,
  column: string,
  db: DbLookups,
): ImportRowError[] {
  const existing = db.usersByDni.get(db.hashDni(ref.dni));
  if (existing) {
    if (existing.role !== 'GUARDIAN') return [rowError(row, column, 'NOT_GUARDIAN')];
    if (existing.status === 'WITHDRAWN') return [rowError(row, column, 'GUARDIAN_WITHDRAWN')];
    return [];
  }
  return ref.name === null ? [rowError(row, column, 'GUARDIAN_NAME_REQUIRED')] : [];
}

/** Fase 2: reglas contra la BD. Vacío si todo se puede crear. */
export function checkAgainstDb(valid: ValidRows, db: DbLookups): ImportRowError[] {
  const errors: ImportRowError[] = [];
  switch (valid.type) {
    case 'teachers':
      for (const r of valid.rows) {
        if (db.usersByDni.has(db.hashDni(r.dni))) errors.push(rowError(r.row, 'dni', 'DNI_TAKEN'));
      }
      break;
    case 'students':
      for (const r of valid.rows) {
        if (db.usersByDni.has(db.hashDni(r.dni))) errors.push(rowError(r.row, 'dni', 'DNI_TAKEN'));
        const section = db.sections?.get(sectionKey(r.gradeLevel, r.sectionCode));
        if (!section) errors.push(rowError(r.row, 'seccion', 'SECTION_NOT_FOUND'));
        else if (!section.isActive) errors.push(rowError(r.row, 'seccion', 'SECTION_INACTIVE'));
        r.guardians.forEach((g, index) => {
          errors.push(
            ...checkGuardianRef(r.row, g, index === 0 ? 'dni_apoderado' : 'dni_apoderado_2', db),
          );
        });
      }
      break;
    case 'guardians': {
      // Apoderados que se sumarían a cada estudiante en este archivo (en orden de fila).
      const added = new Map<string, number>();
      for (const r of valid.rows) {
        errors.push(...checkGuardianRef(r.row, r.guardian, 'dni_apoderado', db));
        const student = db.usersByDni.get(db.hashDni(r.studentDni));
        if (!student) {
          errors.push(rowError(r.row, 'dni_estudiante', 'STUDENT_NOT_FOUND'));
          continue;
        }
        if (student.role !== 'STUDENT') {
          errors.push(rowError(r.row, 'dni_estudiante', 'NOT_STUDENT'));
          continue;
        }
        if (student.status === 'WITHDRAWN') {
          errors.push(rowError(r.row, 'dni_estudiante', 'STUDENT_WITHDRAWN'));
          continue;
        }
        const guardian = db.usersByDni.get(db.hashDni(r.guardian.dni));
        const current = db.activeGuardians?.get(student.id) ?? new Set<string>();
        if (guardian && current.has(guardian.id)) {
          errors.push(rowError(r.row, 'dni_estudiante', 'DUPLICATE_LINK'));
          continue;
        }
        const extra = (added.get(student.id) ?? 0) + 1;
        added.set(student.id, extra);
        if (current.size + extra > 2)
          errors.push(rowError(r.row, 'dni_estudiante', 'MAX_GUARDIANS'));
      }
      break;
    }
  }
  return errors;
}

/** Lo que se crearía con las filas válidas que no tienen errores. */
export function summarize(
  valid: ValidRows,
  errors: ImportRowError[],
  db: DbLookups,
): ImportSummary {
  const bad = new Set(errors.map((e) => e.row));
  const isNew = (dni: string) => !db.usersByDni.has(db.hashDni(dni));
  switch (valid.type) {
    case 'teachers': {
      const users = valid.rows.filter((r) => !bad.has(r.row)).length;
      return { users, enrollments: 0, links: 0 };
    }
    case 'students': {
      const ok = valid.rows.filter((r) => !bad.has(r.row));
      const newGuardians = new Set(
        ok.flatMap((r) => r.guardians.filter((g) => isNew(g.dni)).map((g) => g.dni)),
      );
      return {
        users: ok.length + newGuardians.size,
        enrollments: ok.length,
        links: ok.reduce((sum, r) => sum + r.guardians.length, 0),
      };
    }
    case 'guardians': {
      const ok = valid.rows.filter((r) => !bad.has(r.row));
      const users = new Set(ok.filter((r) => isNew(r.guardian.dni)).map((r) => r.guardian.dni))
        .size;
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

/** Persona nueva. El DNI viaja en claro solo hasta que el servicio lo cifra (nunca se registra). */
export type NewUser = {
  id: string;
  dni: string;
  fullName: string;
  role: UserRole;
  /** Grado y sección (solo estudiantes), para la hoja de credenciales. */
  sectionText: string | null;
};
export type NewEnrollment = {
  id: string;
  studentId: string;
  sectionId: string;
  academicYearId: string;
};
export type NewLink = {
  id: string;
  guardianId: string;
  studentId: string;
  /** Verdadero para el apoderado principal; nulo para los demás (marcador TRUE/NULL). */
  isPrimary: true | null;
};
export type ImportPlan = { users: NewUser[]; enrollments: NewEnrollment[]; links: NewLink[] };

/**
 * Filas a crear. Solo se llama sin errores en las dos fases. `newId` genera los ids (uuidv7 en el
 * servicio). `sectionId` y `academicYearId` salen juntos de la misma Section.
 */
export function buildPlan(valid: ValidRows, db: DbLookups, newId: () => string): ImportPlan {
  const plan: ImportPlan = { users: [], enrollments: [], links: [] };
  // Apoderados ya creados en este plan, por DNI (un apoderado con varios hijos se crea una vez).
  const createdGuardians = new Map<string, string>();
  const guardianId = (ref: GuardianRef): string => {
    const existing = db.usersByDni.get(db.hashDni(ref.dni));
    if (existing) return existing.id;
    let id = createdGuardians.get(ref.dni);
    if (id === undefined) {
      if (ref.name === null) throw new Error('Plan de importación con un apoderado sin nombre');
      id = newId();
      createdGuardians.set(ref.dni, id);
      plan.users.push({
        id,
        dni: ref.dni,
        fullName: ref.name,
        role: 'GUARDIAN',
        sectionText: null,
      });
    }
    return id;
  };

  switch (valid.type) {
    case 'teachers':
      for (const r of valid.rows) {
        plan.users.push({
          id: newId(),
          dni: r.dni,
          fullName: r.fullName,
          role: 'TEACHER',
          sectionText: null,
        });
      }
      break;
    case 'students':
      for (const r of valid.rows) {
        const section = db.sections?.get(sectionKey(r.gradeLevel, r.sectionCode));
        if (!section) throw new Error('Plan de importación sin sección validada');
        const id = newId();
        plan.users.push({
          id,
          dni: r.dni,
          fullName: r.fullName,
          role: 'STUDENT',
          sectionText: `${r.gradeLevel}.º ${r.sectionCode}`,
        });
        plan.enrollments.push({
          id: newId(),
          studentId: id,
          sectionId: section.id,
          academicYearId: section.academicYearId,
        });
        r.guardians.forEach((g, index) => {
          plan.links.push({
            id: newId(),
            guardianId: guardianId(g),
            studentId: id,
            isPrimary: index === 0 ? true : null,
          });
        });
      }
      break;
    case 'guardians': {
      // El primer apoderado de un estudiante sin apoderados vigentes pasa a ser el principal.
      const seen = new Set<string>();
      for (const r of valid.rows) {
        const student = db.usersByDni.get(db.hashDni(r.studentDni));
        if (!student) throw new Error('Plan de importación sin estudiante validado');
        const hasGuardians = (db.activeGuardians?.get(student.id)?.size ?? 0) > 0;
        const primary = !hasGuardians && !seen.has(student.id);
        seen.add(student.id);
        plan.links.push({
          id: newId(),
          guardianId: guardianId(r.guardian),
          studentId: student.id,
          isPrimary: primary ? true : null,
        });
      }
      break;
    }
  }
  return plan;
}
