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
  type ExistingUser,
} from './import-validator.js';
import {
  EXTRA_CELLS_MARKER,
  MAX_ERRORS,
  ROW_ERROR_CODES,
  type CellValue,
  type ImportRowError,
  type SheetRow,
} from './import.constants.js';

/** Hoja con encabezado en la fila 1 y datos desde la fila 2. */
const sheet = (header: CellValue[], ...data: CellValue[][]): SheetRow[] => [
  { row: 1, cells: header },
  ...data.map((cells, i) => ({ row: i + 2, cells })),
];
const STUDENT_HEADER = [
  'dni',
  'nombre_completo',
  'grado',
  'seccion',
  'dni_apoderado',
  'nombre_apoderado',
  'dni_apoderado_2',
  'nombre_apoderado_2',
];
const TEACHER_HEADER = ['dni', 'nombre_completo'];
const GUARDIAN_HEADER = ['dni_apoderado', 'nombre_apoderado', 'dni_estudiante'];

const D = (n: number) => String(10_000_000 + n); // DNI ficticios de 8 dígitos
const codes = (errors: ImportRowError[]) => errors.map((e) => `${e.row}:${e.column}:${e.code}`);

/** Fila de estudiante con un apoderado; `over` reemplaza columnas por posición. */
const student = (n: number, over: Partial<Record<number, string>> = {}): string[] => {
  const base = [D(n), `Estudiante ${n}`, '3', 'A', D(100 + n), `Apoderado ${n}`, '', ''];
  return base.map((v, i) => over[i] ?? v);
};

const hashDni = (dni: string) => `h:${dni}`;
const lookups = (
  users: Array<[string, ExistingUser]> = [],
  over: Partial<DbLookups> = {},
): DbLookups => ({
  hashDni,
  usersByDni: new Map(users.map(([dni, u]) => [hashDni(dni), u])),
  ...over,
});
const SECTION_A = { id: 's3a', academicYearId: 'y1', isActive: true };

describe('encabezados (Decisión 2)', () => {
  it('normaliza: espacios, mayúsculas, tildes y espacios internos', () => {
    expect(normalizeHeader('  Nombre Completo ')).toBe('nombre_completo');
    expect(normalizeHeader('SECCIÓN')).toBe('seccion');
    expect(normalizeHeader('DNI   Apoderado')).toBe('dni_apoderado');
  });

  it('acepta cualquier orden y columnas vacías', () => {
    expect(mapHeaders('teachers', ['Nombre completo', '', 'DNI'])).toEqual({
      nombre_completo: 0,
      dni: 2,
    });
  });

  it('falta, desconocida, repetida o no texto → 400; el correo ya no es una columna', () => {
    expect(() => mapHeaders('teachers', ['dni'])).toThrow(BadRequestException);
    expect(() => mapHeaders('teachers', [...TEACHER_HEADER, 'correo'])).toThrow(
      BadRequestException,
    );
    expect(() => mapHeaders('teachers', [...TEACHER_HEADER, 'DNI'])).toThrow(BadRequestException);
    expect(() => mapHeaders('teachers', ['dni', { problem: 'FORMULA_NOT_ALLOWED' }])).toThrow(
      BadRequestException,
    );
  });

  it('sin encabezado en la fila 1 o sin filas de datos → 400', () => {
    expect(() => validateFileRows('teachers', [])).toThrow(BadRequestException);
    expect(() => validateFileRows('teachers', [{ row: 2, cells: TEACHER_HEADER }])).toThrow(
      BadRequestException,
    );
    expect(() => validateFileRows('teachers', sheet(TEACHER_HEADER))).toThrow(BadRequestException);
    expect(() => validateFileRows('teachers', sheet(TEACHER_HEADER, ['', '']))).toThrow(
      BadRequestException,
    );
  });
});

describe('validateFileRows (fase 1)', () => {
  it('students válidos: normaliza, deja el nombre del apoderado en null si falta e ignora filas vacías', () => {
    const check = validateFileRows(
      'students',
      sheet(
        STUDENT_HEADER,
        student(1, { 1: '  Ana   Pérez ', 3: 'a' }),
        ['', '', '', '', '', '', '', ''],
        student(2, { 5: '' }),
      ),
    );
    expect(check.errors).toEqual([]);
    expect(check.totalRows).toBe(2);
    expect(check.valid).toEqual({
      type: 'students',
      rows: [
        {
          row: 2,
          dni: D(1),
          fullName: 'Ana Pérez',
          gradeLevel: 3,
          sectionCode: 'A',
          guardians: [{ dni: D(101), name: 'Apoderado 1' }],
        },
        {
          row: 4,
          dni: D(2),
          fullName: 'Estudiante 2',
          gradeLevel: 3,
          sectionCode: 'A',
          guardians: [{ dni: D(102), name: null }],
        },
      ],
    });
  });

  it('students: el segundo apoderado es opcional y el primero es el principal', () => {
    const check = validateFileRows(
      'students',
      sheet(STUDENT_HEADER, student(1, { 6: D(201), 7: 'Madre Dos' })),
    );
    expect(check.errors).toEqual([]);
    expect(check.valid.type === 'students' && check.valid.rows[0]!.guardians).toEqual([
      { dni: D(101), name: 'Apoderado 1' },
      { dni: D(201), name: 'Madre Dos' },
    ]);
  });

  it('REQUIRED, INVALID_DNI, INVALID_NAME, INVALID_GRADE e INVALID_SECTION, con su columna', () => {
    const check = validateFileRows(
      'students',
      sheet(
        STUDENT_HEADER,
        student(1, { 0: '' }),
        student(2, { 0: '1234567' }),
        student(3, { 0: '1234567a' }),
        student(4, { 1: '=1+1' }),
        student(5, { 2: '6' }),
        student(6, { 2: '3.5' }),
        student(7, { 3: 'A-1' }),
        student(8, { 4: '' }),
        student(9, { 4: '123' }),
      ),
    );
    expect(codes(check.errors)).toEqual([
      '2:dni:REQUIRED',
      '3:dni:INVALID_DNI',
      '4:dni:INVALID_DNI',
      '5:nombre_completo:INVALID_NAME',
      '6:grado:INVALID_GRADE',
      '7:grado:INVALID_GRADE',
      '8:seccion:INVALID_SECTION',
      '9:dni_apoderado:REQUIRED',
      '10:dni_apoderado:INVALID_DNI',
    ]);
    expect(check.valid).toEqual({ type: 'students', rows: [] });
  });

  it('el nombre del segundo apoderado sin su DNI es REQUIRED', () => {
    const check = validateFileRows(
      'students',
      sheet(STUDENT_HEADER, student(1, { 7: 'Madre Dos' })),
    );
    expect(codes(check.errors)).toEqual(['2:dni_apoderado_2:REQUIRED']);
  });

  it('DUPLICATE_IN_FILE con la fila de la primera aparición (sin repetir el valor)', () => {
    const check = validateFileRows(
      'students',
      sheet(STUDENT_HEADER, student(1), student(2, { 0: D(1) })),
    );
    expect(check.errors).toEqual([
      {
        row: 3,
        column: 'dni',
        code: 'DUPLICATE_IN_FILE',
        message: 'El DNI está repetido en el archivo (primera aparición en la fila 2)',
      },
    ]);
    expect(check.valid.type === 'students' && check.valid.rows.map((r) => r.row)).toEqual([2]);
  });

  it('SAME_PERSON: el apoderado no es el alumno ni otro alumno del archivo', () => {
    const check = validateFileRows(
      'students',
      sheet(STUDENT_HEADER, student(1, { 4: D(1) }), student(2, { 4: D(1) }), student(3)),
    );
    expect(codes(check.errors)).toEqual([
      '2:dni_apoderado:SAME_PERSON',
      '3:dni_apoderado:SAME_PERSON',
    ]);
  });

  it('DUPLICATE_GUARDIAN: el segundo apoderado no es el primero', () => {
    const check = validateFileRows(
      'students',
      sheet(STUDENT_HEADER, student(1, { 6: D(101), 7: 'Apoderado 1' })),
    );
    expect(codes(check.errors)).toEqual(['2:dni_apoderado_2:DUPLICATE_GUARDIAN']);
  });

  it('un apoderado con varios hijos: mismo nombre en todas sus filas; el nombre puede ir en una sola', () => {
    const shared = D(500);
    const ok = validateFileRows(
      'students',
      sheet(
        STUDENT_HEADER,
        student(1, { 4: shared, 5: '' }),
        student(2, { 4: shared, 5: 'Padre Común' }),
        student(3, { 4: shared, 5: 'Padre Común' }),
      ),
    );
    expect(ok.errors).toEqual([]);
    expect(ok.valid.type === 'students' && ok.valid.rows.map((r) => r.guardians[0]!.name)).toEqual([
      'Padre Común',
      'Padre Común',
      'Padre Común',
    ]);

    const bad = validateFileRows(
      'students',
      sheet(
        STUDENT_HEADER,
        student(1, { 4: shared, 5: 'Padre Común' }),
        student(2, { 4: shared, 5: 'Otro Nombre' }),
      ),
    );
    expect(bad.errors).toEqual([
      {
        row: 3,
        column: 'nombre_apoderado',
        code: 'NAME_MISMATCH',
        message:
          'El nombre del apoderado no coincide con el de su primera fila (primera aparición en la fila 2)',
      },
    ]);
  });

  it('TOO_MANY_STUDENTS: un apoderado tiene hasta 10 estudiantes en el archivo', () => {
    const rows = Array.from({ length: 11 }, (_, i) => student(i + 1, { 4: D(900), 5: 'Padre' }));
    const check = validateFileRows('students', sheet(STUDENT_HEADER, ...rows));
    expect(codes(check.errors)).toEqual(['12:dni_apoderado:TOO_MANY_STUDENTS']);
  });

  it('teachers: DUPLICATE_IN_FILE', () => {
    const check = validateFileRows(
      'teachers',
      sheet(TEACHER_HEADER, [D(1), 'Doc Uno'], [D(2), 'Doc Dos'], [D(1), 'Doc Tres']),
    );
    expect(codes(check.errors)).toEqual(['4:dni:DUPLICATE_IN_FILE']);
    expect(check.valid).toEqual({
      type: 'teachers',
      rows: [
        { row: 2, dni: D(1), fullName: 'Doc Uno' },
        { row: 3, dni: D(2), fullName: 'Doc Dos' },
      ],
    });
  });

  it('guardians: SAME_PERSON, NAME_MISMATCH, DUPLICATE_LINK y TOO_MANY_STUDENTS', () => {
    const rows: string[][] = [
      [D(1), 'Papá Uno', D(11)],
      [D(1), 'Papá Uno', D(12)],
      [D(1), 'Otro Nombre', D(13)], // 4: NAME_MISMATCH
      [D(1), 'Papá Uno', D(11)], // 5: DUPLICATE_LINK
      [D(2), 'Mamá', D(2)], // 6: SAME_PERSON
      ...Array.from({ length: 10 }, (_, i): string[] => [D(3), 'Tío', D(30 + i)]), // 7..16
    ];
    const check = validateFileRows('guardians', sheet(GUARDIAN_HEADER, ...rows));
    expect(codes(check.errors)).toEqual([
      '4:nombre_apoderado:NAME_MISMATCH',
      '5:dni_estudiante:DUPLICATE_LINK',
      '6:dni_estudiante:SAME_PERSON',
    ]);
    // El apoderado D(3) tiene 10 estudiantes: caben.
    expect(check.valid.type === 'guardians' && check.valid.rows).toHaveLength(2 + 10);
  });

  it('guardians: el nombre puede faltar en una fila si otra lo trae', () => {
    const check = validateFileRows(
      'guardians',
      sheet(GUARDIAN_HEADER, [D(1), '', D(11)], [D(1), 'Papá Uno', D(12)]),
    );
    expect(check.errors).toEqual([]);
    expect(
      check.valid.type === 'guardians' && check.valid.rows.map((r) => r.guardian.name),
    ).toEqual(['Papá Uno', 'Papá Uno']);
  });

  it('FORMULA_NOT_ALLOWED, INVALID_CELL, TOO_LONG y EXTRA_CELLS', () => {
    const check = validateFileRows(
      'teachers',
      sheet(
        TEACHER_HEADER,
        [{ problem: 'FORMULA_NOT_ALLOWED' }, 'Doc'],
        [D(2), { problem: 'INVALID_CELL' }],
        [D(3), 'x'.repeat(501)],
        [D(4), 'Doc Cuatro', 'sobrante'],
      ),
    );
    expect(codes(check.errors)).toEqual([
      '2:dni:FORMULA_NOT_ALLOWED',
      '3:nombre_completo:INVALID_CELL',
      '4:nombre_completo:TOO_LONG',
      '5:null:EXTRA_CELLS',
    ]);
  });

  it('el marcador de datos más allá de la columna 30 da EXTRA_CELLS; en el encabezado, 400', () => {
    const check = validateFileRows(
      'teachers',
      sheet(TEACHER_HEADER, [D(1), 'Doc Uno', EXTRA_CELLS_MARKER]),
    );
    expect(codes(check.errors)).toEqual(['2:null:EXTRA_CELLS']);
    expect(() =>
      validateFileRows('teachers', sheet([...TEACHER_HEADER, EXTRA_CELLS_MARKER], [D(1), 'Doc'])),
    ).toThrow(BadRequestException);
  });

  it('ningún mensaje repite el valor de la celda', () => {
    const secret = '99999999a';
    const check = validateFileRows('teachers', sheet(TEACHER_HEADER, [secret, '=Peligro']));
    expect(check.errors.length).toBeGreaterThan(0);
    for (const e of check.errors) {
      expect(e.message).not.toContain(secret);
      expect(e.message).not.toContain('Peligro');
    }
  });
});

describe('checkAgainstDb (fase 2)', () => {
  const studentsOf = (...rows: string[][]) =>
    validateFileRows('students', sheet(STUDENT_HEADER, ...rows)).valid;
  const withSections = (users: Array<[string, ExistingUser]> = []) =>
    lookups(users, { sections: new Map([[sectionKey(3, 'A'), SECTION_A]]) });

  it('students: DNI_TAKEN, SECTION_NOT_FOUND y SECTION_INACTIVE', () => {
    const valid = studentsOf(student(1), student(2, { 3: 'Z' }), student(3));
    const db = lookups([[D(1), { id: 'u1', role: 'STUDENT', status: 'ACTIVE' }]], {
      sections: new Map([[sectionKey(3, 'A'), { ...SECTION_A, isActive: false }]]),
    });
    expect(codes(checkAgainstDb(valid, db))).toEqual([
      '2:dni:DNI_TAKEN',
      '2:seccion:SECTION_INACTIVE',
      '3:seccion:SECTION_NOT_FOUND',
      '4:seccion:SECTION_INACTIVE',
    ]);
  });

  it('students: un apoderado existente se reutiliza; uno nuevo sin nombre es GUARDIAN_NAME_REQUIRED', () => {
    const valid = studentsOf(student(1, { 5: '' }), student(2, { 5: '' }));
    const db = withSections([[D(101), { id: 'g1', role: 'GUARDIAN', status: 'ACTIVE' }]]);
    expect(codes(checkAgainstDb(valid, db))).toEqual(['3:dni_apoderado:GUARDIAN_NAME_REQUIRED']);
  });

  it('students: el DNI de un apoderado que es de otro rol o está retirado se rechaza', () => {
    const valid = studentsOf(student(1), student(2));
    const db = withSections([
      [D(101), { id: 't1', role: 'TEACHER', status: 'ACTIVE' }],
      [D(102), { id: 'g2', role: 'GUARDIAN', status: 'WITHDRAWN' }],
    ]);
    expect(codes(checkAgainstDb(valid, db))).toEqual([
      '2:dni_apoderado:NOT_GUARDIAN',
      '3:dni_apoderado:GUARDIAN_WITHDRAWN',
    ]);
  });

  it('teachers: DNI_TAKEN', () => {
    const valid = validateFileRows(
      'teachers',
      sheet(TEACHER_HEADER, [D(1), 'Doc Uno'], [D(2), 'Doc Dos']),
    ).valid;
    const db = lookups([[D(2), { id: 'u2', role: 'TEACHER', status: 'ACTIVE' }]]);
    expect(codes(checkAgainstDb(valid, db))).toEqual(['3:dni:DNI_TAKEN']);
  });

  it('guardians: STUDENT_NOT_FOUND, NOT_STUDENT, STUDENT_WITHDRAWN, DUPLICATE_LINK y MAX_GUARDIANS', () => {
    const valid = validateFileRows(
      'guardians',
      sheet(
        GUARDIAN_HEADER,
        [D(1), 'Papá Uno', D(11)], // 2: no existe
        [D(1), 'Papá Uno', D(12)], // 3: no es estudiante
        [D(1), 'Papá Uno', D(13)], // 4: retirado
        [D(2), 'Mamá Dos', D(14)], // 5: ya vinculada
        [D(3), 'Tío Tres', D(15)], // 6: ya tiene 2 apoderados
        [D(4), 'Tía Cuatro', D(16)], // 7: sin apoderados: ok
        [D(5), 'Abuela', D(16)], // 8: ok (llega a 2)
        [D(6), 'Vecina', D(16)], // 9: MAX_GUARDIANS (3.º)
      ),
    ).valid;
    const users: Array<[string, ExistingUser]> = [
      [D(12), { id: 't1', role: 'TEACHER', status: 'ACTIVE' }],
      [D(13), { id: 'e13', role: 'STUDENT', status: 'WITHDRAWN' }],
      [D(14), { id: 'e14', role: 'STUDENT', status: 'ACTIVE' }],
      [D(15), { id: 'e15', role: 'STUDENT', status: 'ACTIVE' }],
      [D(16), { id: 'e16', role: 'STUDENT', status: 'ACTIVE' }],
      [D(2), { id: 'g2', role: 'GUARDIAN', status: 'ACTIVE' }],
    ];
    const db = lookups(users, {
      activeGuardians: new Map([
        ['e14', new Set(['g2'])],
        ['e15', new Set(['x', 'y'])],
      ]),
    });
    expect(codes(checkAgainstDb(valid, db))).toEqual([
      '2:dni_estudiante:STUDENT_NOT_FOUND',
      '3:dni_estudiante:NOT_STUDENT',
      '4:dni_estudiante:STUDENT_WITHDRAWN',
      '5:dni_estudiante:DUPLICATE_LINK',
      '6:dni_estudiante:MAX_GUARDIANS',
      '9:dni_estudiante:MAX_GUARDIANS',
    ]);
  });

  it('todos los códigos del contrato están cubiertos por estas pruebas', () => {
    const covered = new Set([
      'REQUIRED',
      'INVALID_DNI',
      'INVALID_NAME',
      'INVALID_GRADE',
      'INVALID_SECTION',
      'SECTION_NOT_FOUND',
      'SECTION_INACTIVE',
      'DUPLICATE_IN_FILE',
      'DNI_TAKEN',
      'STUDENT_NOT_FOUND',
      'NOT_STUDENT',
      'STUDENT_WITHDRAWN',
      'NOT_GUARDIAN',
      'GUARDIAN_WITHDRAWN',
      'GUARDIAN_NAME_REQUIRED',
      'DUPLICATE_GUARDIAN',
      'MAX_GUARDIANS',
      'SAME_PERSON',
      'NAME_MISMATCH',
      'TOO_MANY_STUDENTS',
      'DUPLICATE_LINK',
      'FORMULA_NOT_ALLOWED',
      'INVALID_CELL',
      'TOO_LONG',
      'EXTRA_CELLS',
    ]);
    expect(new Set(ROW_ERROR_CODES)).toEqual(covered);
  });
});

describe('summarize', () => {
  it('students: cuenta alumnos, matrículas, vínculos y solo los apoderados nuevos (una vez)', () => {
    const valid = validateFileRows(
      'students',
      sheet(
        STUDENT_HEADER,
        student(1, { 4: D(500), 5: 'Padre Común' }),
        student(2, { 4: D(500), 5: 'Padre Común', 6: D(600), 7: 'Madre Nueva' }),
        student(3, { 4: D(700) }),
      ),
    ).valid;
    const db = lookups([[D(700), { id: 'g7', role: 'GUARDIAN', status: 'ACTIVE' }]]);
    expect(summarize(valid, [], db)).toEqual({ users: 3 + 2, enrollments: 3, links: 4 });
    // Una fila con error no cuenta.
    expect(
      summarize(valid, [{ row: 3, column: 'dni', code: 'DNI_TAKEN', message: 'x' }], db),
    ).toEqual({ users: 2 + 1, enrollments: 2, links: 2 });
  });

  it('teachers y guardians', () => {
    const teachers = validateFileRows('teachers', sheet(TEACHER_HEADER, [D(1), 'A B'])).valid;
    expect(summarize(teachers, [], lookups())).toEqual({ users: 1, enrollments: 0, links: 0 });
    const guardians = validateFileRows(
      'guardians',
      sheet(GUARDIAN_HEADER, [D(1), 'Papá', D(11)], [D(1), 'Papá', D(12)], [D(2), 'Mamá', D(13)]),
    ).valid;
    const db = lookups([[D(2), { id: 'g2', role: 'GUARDIAN', status: 'ACTIVE' }]]);
    expect(summarize(guardians, [], db)).toEqual({ users: 1, enrollments: 0, links: 3 });
  });
});

describe('buildPlan', () => {
  let n = 0;
  const newId = () => `id-${++n}`;
  beforeEach(() => {
    n = 0;
  });

  it('students: alumno, matrícula con la sección, y un apoderado creado una sola vez; el primero es principal', () => {
    const valid = validateFileRows(
      'students',
      sheet(
        STUDENT_HEADER,
        student(1, { 4: D(500), 5: 'Padre Común', 6: D(600), 7: 'Madre Nueva' }),
        student(2, { 4: D(500), 5: 'Padre Común' }),
      ),
    ).valid;
    const db = lookups([], { sections: new Map([[sectionKey(3, 'A'), SECTION_A]]) });
    const plan = buildPlan(valid, db, newId);

    expect(plan.users.map((u) => [u.role, u.dni])).toEqual([
      ['STUDENT', D(1)],
      ['GUARDIAN', D(500)],
      ['GUARDIAN', D(600)],
      ['STUDENT', D(2)],
    ]);
    expect(plan.users[0]!.sectionText).toBe('3.º A');
    expect(plan.enrollments).toHaveLength(2);
    expect(plan.enrollments[0]).toMatchObject({ sectionId: 's3a', academicYearId: 'y1' });
    // El padre común se creó una vez y se vinculó a los dos hijos.
    const fatherId = plan.users.find((u) => u.dni === D(500))!.id;
    expect(plan.links.filter((l) => l.guardianId === fatherId)).toHaveLength(2);
    expect(plan.links.map((l) => l.isPrimary)).toEqual([true, null, true]);
  });

  it('students: un apoderado existente se vincula con su id, sin crearlo', () => {
    const valid = validateFileRows('students', sheet(STUDENT_HEADER, student(1, { 5: '' }))).valid;
    const db = lookups([[D(101), { id: 'g-existente', role: 'GUARDIAN', status: 'ACTIVE' }]], {
      sections: new Map([[sectionKey(3, 'A'), SECTION_A]]),
    });
    const plan = buildPlan(valid, db, newId);
    expect(plan.users.map((u) => u.role)).toEqual(['STUDENT']);
    expect(plan.links[0]).toMatchObject({ guardianId: 'g-existente', isPrimary: true });
  });

  it('teachers: solo usuarios', () => {
    const valid = validateFileRows('teachers', sheet(TEACHER_HEADER, [D(1), 'Doc Uno'])).valid;
    const plan = buildPlan(valid, lookups(), newId);
    expect(plan).toEqual({
      users: [{ id: 'id-1', dni: D(1), fullName: 'Doc Uno', role: 'TEACHER', sectionText: null }],
      enrollments: [],
      links: [],
    });
  });

  it('guardians: el primer apoderado de un estudiante sin apoderados es el principal', () => {
    const valid = validateFileRows(
      'guardians',
      sheet(GUARDIAN_HEADER, [D(1), 'Papá', D(11)], [D(2), 'Mamá', D(11)], [D(3), 'Tío', D(12)]),
    ).valid;
    const db = lookups(
      [
        [D(11), { id: 'e11', role: 'STUDENT', status: 'ACTIVE' }],
        [D(12), { id: 'e12', role: 'STUDENT', status: 'ACTIVE' }],
      ],
      { activeGuardians: new Map([['e12', new Set(['otro'])]]) },
    );
    const plan = buildPlan(valid, db, newId);
    expect(plan.users.map((u) => u.dni)).toEqual([D(1), D(2), D(3)]);
    expect(plan.links.map((l) => [l.studentId, l.isPrimary])).toEqual([
      ['e11', true],
      ['e11', null],
      ['e12', null],
    ]);
  });
});

describe('buildReport', () => {
  const err = (row: number): ImportRowError => ({
    row,
    column: 'dni',
    code: 'REQUIRED',
    message: 'x',
  });

  it('sin errores se puede confirmar', () => {
    const report = buildReport({
      type: 'teachers',
      format: 'csv',
      sha256: 'a'.repeat(64),
      totalRows: 3,
      errors: [],
      summary: { users: 3, enrollments: 0, links: 0 },
    });
    expect(report).toMatchObject({ validRows: 3, errorRows: 0, canConfirm: true });
  });

  it('cuenta filas con error y corta en MAX_ERRORS', () => {
    const errors = Array.from({ length: MAX_ERRORS + 10 }, (_, i) => err(i + 2));
    const report = buildReport({
      type: 'teachers',
      format: 'xlsx',
      sha256: 'a'.repeat(64),
      totalRows: 1000,
      errors,
      summary: { users: 0, enrollments: 0, links: 0 },
    });
    expect(report.errors).toHaveLength(MAX_ERRORS);
    expect(report).toMatchObject({
      errorsTruncated: true,
      canConfirm: false,
      errorRows: MAX_ERRORS + 10,
    });
  });
});
