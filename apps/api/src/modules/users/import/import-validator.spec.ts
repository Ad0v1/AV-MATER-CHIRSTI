import { BadRequestException } from '@nestjs/common';
import { mapHeaders, normalizeHeader } from './import-columns.js';
import {
  buildPlan,
  buildReport,
  checkAgainstDb,
  sectionKey,
  summarize,
  validateFileRows,
  type DbLookups,
} from './import-validator.js';
import {
  EXTRA_CELLS_MARKER,
  MAX_ERRORS,
  ROW_ERROR_CODES,
  type CellValue,
  type ImportRowError,
  type SheetRow,
} from './import.constants.js';

const DOMAIN = 'colegio.example';
const mail = (u: string) => `${u}@${DOMAIN}`;

/** Hoja con encabezado en la fila 1 y datos desde la fila 2. */
const sheet = (header: CellValue[], ...data: CellValue[][]): SheetRow[] => [
  { row: 1, cells: header },
  ...data.map((cells, i) => ({ row: i + 2, cells })),
];
const STUDENT_HEADER = ['correo', 'nombre_completo', 'grado', 'seccion'];
const TEACHER_HEADER = ['correo', 'nombre_completo'];
const GUARDIAN_HEADER = ['correo_apoderado', 'nombre_apoderado', 'correo_estudiante'];

const codes = (errors: ImportRowError[]) => errors.map((e) => `${e.row}:${e.column}:${e.code}`);

describe('encabezados (Decisión 2)', () => {
  it('normaliza: espacios, mayúsculas, tildes y espacios internos', () => {
    expect(normalizeHeader('  Nombre Completo ')).toBe('nombre_completo');
    expect(normalizeHeader('SECCIÓN')).toBe('seccion');
    expect(normalizeHeader('Correo   Apoderado')).toBe('correo_apoderado');
  });

  it('acepta cualquier orden y columnas vacías', () => {
    expect(mapHeaders('teachers', ['Nombre completo', '', 'CORREO'])).toEqual({
      nombre_completo: 0,
      correo: 2,
    });
  });

  it('falta, desconocida, repetida o no texto → 400', () => {
    expect(() => mapHeaders('teachers', ['correo'])).toThrow(BadRequestException);
    expect(() => mapHeaders('teachers', [...TEACHER_HEADER, 'dni'])).toThrow(BadRequestException);
    expect(() => mapHeaders('teachers', [...TEACHER_HEADER, 'Correo'])).toThrow(
      BadRequestException,
    );
    expect(() => mapHeaders('teachers', ['correo', { problem: 'FORMULA_NOT_ALLOWED' }])).toThrow(
      BadRequestException,
    );
  });

  it('sin encabezado en la fila 1 o sin filas de datos → 400', () => {
    expect(() => validateFileRows('teachers', [], DOMAIN)).toThrow(BadRequestException);
    expect(() => validateFileRows('teachers', [{ row: 2, cells: TEACHER_HEADER }], DOMAIN)).toThrow(
      BadRequestException,
    );
    expect(() => validateFileRows('teachers', sheet(TEACHER_HEADER, ['', ' ']), DOMAIN)).toThrow(
      'El archivo no tiene filas de datos',
    );
  });
});

describe('validateFileRows (fase 1)', () => {
  it('students válidos: normaliza correo, nombre y sección; ignora filas vacías', () => {
    const check = validateFileRows(
      'students',
      sheet(
        STUDENT_HEADER,
        [' QA.Uno@Colegio.Example ', '  Ana   Pérez ', '3', ' a '],
        ['', '', '', ''],
        [mail('dos'), 'Luis Rojas', ' 5 ', 'B2'],
      ),
      DOMAIN,
    );
    expect(check.errors).toEqual([]);
    expect(check.totalRows).toBe(2);
    expect(check.valid).toEqual({
      type: 'students',
      rows: [
        { row: 2, email: mail('qa.uno'), fullName: 'Ana Pérez', gradeLevel: 3, sectionCode: 'A' },
        { row: 4, email: mail('dos'), fullName: 'Luis Rojas', gradeLevel: 5, sectionCode: 'B2' },
      ],
    });
  });

  it('REQUIRED, INVALID_EMAIL, EMAIL_DOMAIN, INVALID_NAME, INVALID_GRADE, INVALID_SECTION', () => {
    const check = validateFileRows(
      'students',
      sheet(
        STUDENT_HEADER,
        ['', 'Ana Pérez', '3', 'A'],
        ['no-es-correo', 'Ana Pérez', '3', 'A'],
        ['ana@otro.example', 'Ana Pérez', '3', 'A'],
        [mail('a'), 'An', '3', 'A'],
        [mail('b'), '=HYPERLINK("x")', '6', 'A-1'],
        [mail('c'), 'Ana Pérez', '3.0', 'ABCDEFGHI'],
      ),
      DOMAIN,
    );
    expect(codes(check.errors)).toEqual([
      '2:correo:REQUIRED',
      '3:correo:INVALID_EMAIL',
      '4:correo:EMAIL_DOMAIN',
      '5:nombre_completo:INVALID_NAME',
      '6:nombre_completo:INVALID_NAME',
      '6:grado:INVALID_GRADE',
      '6:seccion:INVALID_SECTION',
      '7:grado:INVALID_GRADE',
      '7:seccion:INVALID_SECTION',
    ]);
    expect(check.valid.rows).toEqual([]);
  });

  it('sin dominio configurado no valida el dominio', () => {
    const check = validateFileRows(
      'teachers',
      sheet(TEACHER_HEADER, ['a@otro.example', 'Ana Pérez']),
      null,
    );
    expect(check.errors).toEqual([]);
  });

  it('FORMULA_NOT_ALLOWED, INVALID_CELL, TOO_LONG y EXTRA_CELLS', () => {
    const check = validateFileRows(
      'teachers',
      sheet(
        [...TEACHER_HEADER, ''],
        [{ problem: 'FORMULA_NOT_ALLOWED' }, { problem: 'INVALID_CELL' }],
        [mail('a'), 'A'.repeat(501)],
        [mail('b'), 'Ana Pérez', 'sobra'],
        [mail('c'), 'Ana Pérez', '', { problem: 'INVALID_CELL' }],
        [mail('d'), 'Ana Pérez', '   '],
      ),
      DOMAIN,
    );
    expect(codes(check.errors)).toEqual([
      '2:correo:FORMULA_NOT_ALLOWED',
      '2:nombre_completo:INVALID_CELL',
      '3:nombre_completo:TOO_LONG',
      '4:null:EXTRA_CELLS',
      '5:null:EXTRA_CELLS',
    ]);
    expect(check.valid.rows.map((r) => r.row)).toEqual([6]);
  });

  it('DUPLICATE_IN_FILE con la fila de la primera aparición (sin repetir el valor)', () => {
    const check = validateFileRows(
      'teachers',
      sheet(
        TEACHER_HEADER,
        [mail('a'), 'Ana Pérez'],
        [mail('b'), 'Bea Díaz'],
        [' A@Colegio.Example', 'Otra Ana'],
      ),
      DOMAIN,
    );
    expect(check.errors).toEqual([
      {
        row: 4,
        column: 'correo',
        code: 'DUPLICATE_IN_FILE',
        message: 'El correo está repetido en el archivo (primera aparición en la fila 2)',
      },
    ]);
    expect(check.valid.rows.map((r) => r.row)).toEqual([2, 3]);
  });

  it('guardians: apoderado exento del dominio; SAME_PERSON, NAME_MISMATCH, DUPLICATE_LINK y TOO_MANY_STUDENTS', () => {
    const students = Array.from({ length: 11 }, (_, i) => [
      'papa@gmail.com',
      'Pedro Pérez',
      mail(`hijo${i}`),
    ]);
    const check = validateFileRows(
      'guardians',
      sheet(
        GUARDIAN_HEADER,
        ...students, // filas 2..12: la 12 es el hijo 11
        ['papa@gmail.com', 'Pedro Perez', mail('hijo0')], // 13: nombre distinto
        ['papa@gmail.com', 'Pedro Pérez', mail('hijo1')], // 14: par repetido
        [mail('x'), 'Xavier Ruiz', mail('x')], // 15: misma persona
      ),
      DOMAIN,
    );
    expect(codes(check.errors)).toEqual([
      '12:correo_estudiante:TOO_MANY_STUDENTS',
      '13:nombre_apoderado:NAME_MISMATCH',
      '14:correo_estudiante:DUPLICATE_LINK',
      '15:correo_estudiante:SAME_PERSON',
    ]);
    expect(check.errors[1].message).toContain('fila 2');
    expect(check.errors[2].message).toContain('fila 3');
    expect(check.valid.rows).toHaveLength(10);
  });

  it('ningún mensaje repite el valor de la celda', () => {
    const secret = 'secreto.unico';
    const check = validateFileRows(
      'students',
      sheet(STUDENT_HEADER, [`${secret}@otro`, `=${secret}`, secret, `${secret}!`]),
      DOMAIN,
    );
    expect(check.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(check.errors)).not.toContain(secret);
  });

  it('el marcador de datos más allá de la columna 30 da EXTRA_CELLS; en el encabezado, 400', () => {
    const padded = (cells: CellValue[]) => [
      ...cells,
      ...Array.from({ length: 30 - cells.length }, () => ''),
      EXTRA_CELLS_MARKER,
    ];
    const check = validateFileRows(
      'teachers',
      sheet(TEACHER_HEADER, padded([mail('a'), 'Ana Pérez'])),
      DOMAIN,
    );
    expect(codes(check.errors)).toEqual(['2:null:EXTRA_CELLS']);
    expect(() =>
      validateFileRows('teachers', sheet(padded(TEACHER_HEADER), [mail('a'), 'Ana']), DOMAIN),
    ).toThrow('Hay una columna que no pertenece a la plantilla');
  });
});

describe('checkAgainstDb (fase 2)', () => {
  const db: DbLookups = {
    takenEmails: new Set([mail('usado'), 'usado@gmail.com']),
    sections: new Map([
      [sectionKey(3, 'A'), { id: 's3a', academicYearId: 'y26', isActive: true }],
      [sectionKey(3, 'Z'), { id: 's3z', academicYearId: 'y26', isActive: false }],
    ]),
    students: new Map([
      [mail('est'), { id: 'e1', role: 'STUDENT', status: 'ACTIVE' }],
      [mail('ret'), { id: 'e2', role: 'STUDENT', status: 'WITHDRAWN' }],
      [mail('doc'), { id: 'd1', role: 'TEACHER', status: 'ACTIVE' }],
    ]),
  };

  it('students: EMAIL_TAKEN, SECTION_NOT_FOUND y SECTION_INACTIVE', () => {
    const { valid } = validateFileRows(
      'students',
      sheet(
        STUDENT_HEADER,
        [mail('usado'), 'Ana Pérez', '3', 'A'],
        [mail('n1'), 'Ana Pérez', '4', 'A'],
        [mail('n2'), 'Ana Pérez', '3', 'z'],
        [mail('n3'), 'Ana Pérez', '3', 'a'],
      ),
      DOMAIN,
    );
    const errors = checkAgainstDb(valid, db);
    expect(codes(errors)).toEqual([
      '2:correo:EMAIL_TAKEN',
      '3:seccion:SECTION_NOT_FOUND',
      '4:seccion:SECTION_INACTIVE',
    ]);
    expect(summarize(valid, errors)).toEqual({ users: 1, enrollments: 1, links: 0 });
  });

  it('teachers: EMAIL_TAKEN', () => {
    const { valid } = validateFileRows(
      'teachers',
      sheet(TEACHER_HEADER, [mail('usado'), 'Ana Pérez'], [mail('nuevo'), 'Ana Pérez']),
      DOMAIN,
    );
    const errors = checkAgainstDb(valid, db);
    expect(codes(errors)).toEqual(['2:correo:EMAIL_TAKEN']);
    expect(summarize(valid, errors)).toEqual({ users: 1, enrollments: 0, links: 0 });
  });

  it('guardians: EMAIL_TAKEN, STUDENT_NOT_FOUND, NOT_STUDENT y STUDENT_WITHDRAWN', () => {
    const { valid } = validateFileRows(
      'guardians',
      sheet(
        GUARDIAN_HEADER,
        ['usado@gmail.com', 'Pedro Pérez', mail('est')],
        ['mama@gmail.com', 'Rosa Díaz', mail('nadie')],
        ['mama@gmail.com', 'Rosa Díaz', mail('doc')],
        ['mama@gmail.com', 'Rosa Díaz', mail('ret')],
        ['mama@gmail.com', 'Rosa Díaz', mail('est')],
      ),
      DOMAIN,
    );
    const errors = checkAgainstDb(valid, db);
    expect(codes(errors)).toEqual([
      '2:correo_apoderado:EMAIL_TAKEN',
      '3:correo_estudiante:STUDENT_NOT_FOUND',
      '4:correo_estudiante:NOT_STUDENT',
      '5:correo_estudiante:STUDENT_WITHDRAWN',
    ]);
    expect(summarize(valid, errors)).toEqual({ users: 1, enrollments: 0, links: 1 });
  });

  it('todos los códigos del contrato están cubiertos por estas pruebas', () => {
    expect(ROW_ERROR_CODES).toHaveLength(21);
  });
});

describe('buildReport', () => {
  it('ordena por fila y columna, cuenta filas y trunca en MAX_ERRORS', () => {
    const errors: ImportRowError[] = Array.from({ length: MAX_ERRORS + 2 }, (_, i) => ({
      row: MAX_ERRORS + 3 - i,
      column: 'correo',
      code: 'REQUIRED',
      message: 'x',
    }));
    const report = buildReport({
      type: 'teachers',
      format: 'csv',
      sha256: 'a'.repeat(64),
      totalRows: 600,
      errors,
      summary: { users: 98, enrollments: 0, links: 0 },
    });
    expect(report.errors).toHaveLength(MAX_ERRORS);
    expect(report.errors[0].row).toBe(2);
    expect(report.errorsTruncated).toBe(true);
    expect(report.errorRows).toBe(MAX_ERRORS + 2);
    expect(report.validRows).toBe(600 - MAX_ERRORS - 2);
    expect(report.canConfirm).toBe(false);
  });

  it('sin errores se puede confirmar', () => {
    const report = buildReport({
      type: 'teachers',
      format: 'xlsx',
      sha256: 'a'.repeat(64),
      totalRows: 1,
      errors: [],
      summary: { users: 1, enrollments: 0, links: 0 },
    });
    expect(report).toMatchObject({ canConfirm: true, errorsTruncated: false, validRows: 1 });
  });
});

describe('buildPlan', () => {
  let n = 0;
  const newId = () => `id${++n}`;
  beforeEach(() => {
    n = 0;
  });

  it('students: usuario y matrícula con sectionId y academicYearId de la misma sección', () => {
    const { valid } = validateFileRows(
      'students',
      sheet(STUDENT_HEADER, [mail('a'), 'Ana Pérez', '3', 'A']),
      DOMAIN,
    );
    const db: DbLookups = {
      takenEmails: new Set(),
      sections: new Map([
        [sectionKey(3, 'A'), { id: 's3a', academicYearId: 'y26', isActive: true }],
      ]),
    };
    expect(buildPlan(valid, db, newId)).toEqual({
      users: [{ id: 'id1', institutionalEmail: mail('a'), fullName: 'Ana Pérez', role: 'STUDENT' }],
      enrollments: [{ id: 'id2', studentId: 'id1', sectionId: 's3a', academicYearId: 'y26' }],
      links: [],
    });
  });

  it('guardians: un usuario por apoderado y un vínculo por fila', () => {
    const { valid } = validateFileRows(
      'guardians',
      sheet(
        GUARDIAN_HEADER,
        ['papa@gmail.com', 'Pedro Pérez', mail('e1')],
        ['papa@gmail.com', 'Pedro Pérez', mail('e2')],
      ),
      DOMAIN,
    );
    const db: DbLookups = {
      takenEmails: new Set(),
      students: new Map([
        [mail('e1'), { id: 'E1', role: 'STUDENT', status: 'ACTIVE' }],
        [mail('e2'), { id: 'E2', role: 'STUDENT', status: 'INACTIVE' }],
      ]),
    };
    const plan = buildPlan(valid, db, newId);
    expect(plan.users).toEqual([
      {
        id: 'id1',
        institutionalEmail: 'papa@gmail.com',
        fullName: 'Pedro Pérez',
        role: 'GUARDIAN',
      },
    ]);
    expect(plan.links).toEqual([
      { id: 'id2', guardianId: 'id1', studentId: 'E1' },
      { id: 'id3', guardianId: 'id1', studentId: 'E2' },
    ]);
  });

  it('teachers: solo usuarios', () => {
    const { valid } = validateFileRows(
      'teachers',
      sheet(TEACHER_HEADER, [mail('d'), 'Ana Pérez']),
      DOMAIN,
    );
    expect(buildPlan(valid, { takenEmails: new Set() }, newId)).toEqual({
      users: [{ id: 'id1', institutionalEmail: mail('d'), fullName: 'Ana Pérez', role: 'TEACHER' }],
      enrollments: [],
      links: [],
    });
  });
});
