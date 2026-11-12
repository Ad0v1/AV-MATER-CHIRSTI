// Datos ficticios del seed de desarrollo (D-028). Ninguno corresponde a personas reales.
// Todos los correos usan el dominio reservado colegio.example; sin DNI, fechas de nacimiento,
// telefonos, contrasenas ni secretos (RNF-09). Constantes reutilizables por los tests e2e.

export const SEED_EMAIL_DOMAIN = 'colegio.example';

export const email = (localPart: string): string => `${localPart}@${SEED_EMAIL_DOMAIN}`;

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Fechas solo-dia (@db.Date) en UTC para que no dependan de la zona horaria de la maquina.
export const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

// ---------------------------------------------------------------------------
// Años y periodos
// ---------------------------------------------------------------------------

export type PeriodKind =
  'FIRST_BIMESTER' | 'SECOND_BIMESTER' | 'THIRD_TRIMESTER' | 'FOURTH_TRIMESTER';

export interface PeriodFixture {
  sequence: 1 | 2 | 3 | 4;
  kind: PeriodKind;
  label: string;
  startDate: string;
  endDate: string;
  closedAt: string | null;
}

export interface YearFixture {
  year: number;
  isActive: boolean;
  closedAt: string | null;
  periods: PeriodFixture[];
}

const periodsOf = (
  year: number,
  closedAt: (sequence: number) => string | null,
): PeriodFixture[] => [
  {
    sequence: 1,
    kind: 'FIRST_BIMESTER',
    label: 'I Bimestre',
    startDate: `${year}-03-01`,
    endDate: `${year}-04-30`,
    closedAt: closedAt(1),
  },
  {
    sequence: 2,
    kind: 'SECOND_BIMESTER',
    label: 'II Bimestre',
    startDate: `${year}-05-01`,
    endDate: `${year}-06-30`,
    closedAt: closedAt(2),
  },
  {
    sequence: 3,
    kind: 'THIRD_TRIMESTER',
    label: 'III Trimestre',
    startDate: `${year}-07-01`,
    endDate: `${year}-09-30`,
    closedAt: closedAt(3),
  },
  {
    sequence: 4,
    kind: 'FOURTH_TRIMESTER',
    label: 'IV Trimestre',
    startDate: `${year}-10-01`,
    endDate: `${year}-12-31`,
    closedAt: closedAt(4),
  },
];

export const PAST_YEAR = 2025;
export const CURRENT_YEAR = 2026;

export const YEARS: YearFixture[] = [
  {
    // Año anterior: inactivo (isActive NULL en la BD, nunca FALSE) y cerrado, con sus 4 periodos cerrados.
    year: PAST_YEAR,
    isActive: false,
    closedAt: '2026-01-05',
    periods: periodsOf(
      PAST_YEAR,
      (sequence) => ['2025-05-05', '2025-07-05', '2025-10-05', '2026-01-05'][sequence - 1],
    ),
  },
  {
    // Año activo: solo el I Bimestre esta cerrado (para probar RN-10).
    year: CURRENT_YEAR,
    isActive: true,
    closedAt: null,
    periods: periodsOf(CURRENT_YEAR, (sequence) => (sequence === 1 ? '2026-05-05' : null)),
  },
];

// ---------------------------------------------------------------------------
// Secciones y cursos
// ---------------------------------------------------------------------------

export type SeedLevel = 'INICIAL' | 'PRIMARIA' | 'SECUNDARIA';

export interface SectionFixture {
  year: number;
  /** Nivel educativo (tres niveles, 09/11/2026). Si falta, SECUNDARIA. */
  level?: SeedLevel;
  gradeLevel: number;
  code: string;
}

const LEVEL_PREFIX: Record<SeedLevel, string> = { INICIAL: 'I', PRIMARIA: 'P', SECUNDARIA: '' };

/**
 * Clave legible de una seccion: "3A-2026" en secundaria (igual que antes), "P6A-2026" en
 * primaria e "I5C-2026" en inicial.
 */
export const sectionKey = (
  s: Pick<SectionFixture, 'year' | 'level' | 'gradeLevel' | 'code'>,
): string => `${LEVEL_PREFIX[s.level ?? 'SECUNDARIA']}${s.gradeLevel}${s.code}-${s.year}`;

export const SECTIONS: SectionFixture[] = [
  { year: PAST_YEAR, gradeLevel: 2, code: 'A' },
  { year: CURRENT_YEAR, gradeLevel: 1, code: 'A' },
  { year: CURRENT_YEAR, gradeLevel: 2, code: 'A' },
  { year: CURRENT_YEAR, gradeLevel: 3, code: 'A' },
  { year: CURRENT_YEAR, gradeLevel: 3, code: 'B' },
  { year: CURRENT_YEAR, gradeLevel: 4, code: 'A' },
  { year: CURRENT_YEAR, gradeLevel: 5, code: 'A' },
  // Tres niveles (09/11/2026). Codigos elegidos para no chocar con las busquedas por
  // gradeLevel+code de secundaria que usan los e2e (3A, 4A, 5A...).
  { year: CURRENT_YEAR, level: 'INICIAL', gradeLevel: 5, code: 'C' },
  { year: CURRENT_YEAR, level: 'PRIMARIA', gradeLevel: 4, code: 'C' },
  { year: CURRENT_YEAR, level: 'PRIMARIA', gradeLevel: 6, code: 'A' },
];

export const COURSES = [
  'Matemática',
  'Comunicación',
  'Ciencia y Tecnología',
  'Inglés',
  'Ciencias Sociales',
] as const;

/** Cursos de cada nivel (subconjunto de COURSES; asi el total de cursos no cambia). */
export const COURSES_BY_LEVEL: Record<SeedLevel, readonly (typeof COURSES)[number][]> = {
  INICIAL: ['Matemática', 'Comunicación'],
  PRIMARIA: ['Matemática', 'Comunicación', 'Ciencia y Tecnología', 'Inglés'],
  SECUNDARIA: COURSES,
};

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

export type SeedRole = 'STUDENT' | 'TEACHER' | 'ADMIN' | 'GUARDIAN';
export type SeedStatus = 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN';

export interface UserFixture {
  key: string; // parte local del correo: "estudiante01"
  email: string;
  fullName: string;
  role: SeedRole;
  status: SeedStatus;
}

const user = (
  key: string,
  fullName: string,
  role: SeedRole,
  status: SeedStatus = 'ACTIVE',
): UserFixture => ({ key, email: email(key), fullName, role, status });

export const ADMIN = user('admin', 'Administrador Ficticio', 'ADMIN');

/** docente01..05 dictan secundaria; docente06 es tutor de inicial y primaria. */
export const TEACHERS: UserFixture[] = Array.from({ length: 6 }, (_, i) =>
  user(`docente${pad2(i + 1)}`, `Docente Ficticio ${pad2(i + 1)}`, 'TEACHER'),
);

// 1..60 secundaria, 61..80 primaria (con cuenta). Inicial no tiene cuenta: ver INITIAL_CHILDREN.
export const STUDENT_COUNT = 80;
export const INACTIVE_STUDENT = 'estudiante59';
export const WITHDRAWN_STUDENT = 'estudiante60';
export const TRANSFERRED_STUDENT = 'estudiante03';

export const STUDENTS: UserFixture[] = Array.from({ length: STUDENT_COUNT }, (_, i) => {
  const key = `estudiante${pad2(i + 1)}`;
  const status: SeedStatus =
    key === INACTIVE_STUDENT ? 'INACTIVE' : key === WITHDRAWN_STUDENT ? 'WITHDRAWN' : 'ACTIVE';
  return user(key, `Estudiante Ficticio ${pad2(i + 1)}`, 'STUDENT', status);
});

export const GUARDIANS: UserFixture[] = [
  user('apoderado01', 'Apoderado Ficticio 01', 'GUARDIAN'),
  user('apoderado02', 'Apoderado Ficticio 02', 'GUARDIAN'),
  user('apoderado03', 'Apoderado Ficticio 03', 'GUARDIAN'),
];

/**
 * Niños de inicial (decision 3 del usuario, 09/11/2026): no tienen cuenta propia. Se crean como
 * User STUDENT sin correo, sin codigo de usuario y sin credencial (no pueden iniciar sesion),
 * solo para poder matricularlos y vincularlos a su apoderado. El seed los busca por nombre.
 */
export interface ChildFixture {
  key: string;
  fullName: string;
}

export const INITIAL_CHILDREN: ChildFixture[] = Array.from({ length: 4 }, (_, i) => ({
  key: `inicial${pad2(i + 1)}`,
  fullName: `Niño Ficticio de Inicial ${pad2(i + 1)}`,
}));

export const ALL_USERS: UserFixture[] = [ADMIN, ...TEACHERS, ...STUDENTS, ...GUARDIANS];

// ---------------------------------------------------------------------------
// Asignacion de docentes (CourseSection), solo en el año activo
// ---------------------------------------------------------------------------

/** Docente de cada curso por defecto: Matemática → docente01, Comunicación → docente02, ... */
export const teacherFor = (course: string, section: SectionFixture): string => {
  if ((section.level ?? 'SECUNDARIA') !== 'SECUNDARIA') return 'docente06';
  if (course === 'Matemática' && section.gradeLevel === 3 && section.code === 'B') {
    return 'docente02';
  }
  return `docente${pad2(COURSES.indexOf(course as (typeof COURSES)[number]) + 1)}`;
};

// ---------------------------------------------------------------------------
// Matriculas
// ---------------------------------------------------------------------------

/** 10 estudiantes por seccion del año activo, en este orden de bloques. */
export const STUDENT_BLOCKS: { section: string; from: number; to: number }[] = [
  { section: '3A-2026', from: 1, to: 10 },
  { section: '3B-2026', from: 11, to: 20 },
  { section: '1A-2026', from: 21, to: 30 },
  { section: '2A-2026', from: 31, to: 40 },
  { section: '4A-2026', from: 41, to: 50 },
  { section: '5A-2026', from: 51, to: 60 },
  { section: 'P4C-2026', from: 61, to: 70 },
  { section: 'P6A-2026', from: 71, to: 80 },
];

export type EndReason = 'TRANSFER' | 'WITHDRAWAL' | 'YEAR_END' | 'CORRECTION';

export interface EnrollmentStep {
  section: string; // sectionKey
  effectiveFrom: string;
  effectiveTo?: string;
  endReason?: EndReason;
}

/** Historial de matricula de un estudiante en un año (los pasos cerrados primero). */
export interface EnrollmentFixture {
  student: string;
  year: number;
  steps: EnrollmentStep[];
}

const YEAR_START = '2026-03-01';
export const TRANSFER_DATE = '2026-06-15';
export const WITHDRAWAL_DATE = '2026-08-20';

export const ENROLLMENTS: EnrollmentFixture[] = [
  // Año anterior: estudiante01 cursó 2A-2025 y su matricula se cerró por fin de año.
  {
    student: 'estudiante01',
    year: PAST_YEAR,
    steps: [
      {
        section: '2A-2025',
        effectiveFrom: '2025-03-01',
        effectiveTo: '2025-12-31',
        endReason: 'YEAR_END',
      },
    ],
  },
  ...STUDENT_BLOCKS.flatMap(({ section, from, to }) =>
    Array.from({ length: to - from + 1 }, (_, i): EnrollmentFixture => {
      const student = `estudiante${pad2(from + i)}`;
      if (student === TRANSFERRED_STUDENT) {
        // Traslado 3A → 3B (RF-24): la matricula de 3A queda cerrada y nace una vigente en 3B.
        return {
          student,
          year: CURRENT_YEAR,
          steps: [
            {
              section,
              effectiveFrom: YEAR_START,
              effectiveTo: TRANSFER_DATE,
              endReason: 'TRANSFER',
            },
            { section: '3B-2026', effectiveFrom: TRANSFER_DATE },
          ],
        };
      }
      if (student === WITHDRAWN_STUDENT) {
        // Retiro (RF-23): sin matricula vigente.
        return {
          student,
          year: CURRENT_YEAR,
          steps: [
            {
              section,
              effectiveFrom: YEAR_START,
              effectiveTo: WITHDRAWAL_DATE,
              endReason: 'WITHDRAWAL',
            },
          ],
        };
      }
      return { student, year: CURRENT_YEAR, steps: [{ section, effectiveFrom: YEAR_START }] };
    }),
  ),
  // Inicial: los niños sin cuenta van matriculados en I5C-2026.
  ...INITIAL_CHILDREN.map((c): EnrollmentFixture => ({
    student: c.key,
    year: CURRENT_YEAR,
    steps: [{ section: 'I5C-2026', effectiveFrom: YEAR_START }],
  })),
];

// ---------------------------------------------------------------------------
// Vinculos apoderado–estudiante
// ---------------------------------------------------------------------------

export const GUARDIAN_LINKS: { guardian: string; student: string }[] = [
  { guardian: 'apoderado01', student: 'estudiante01' }, // 3A
  { guardian: 'apoderado01', student: 'estudiante11' }, // 3B
  { guardian: 'apoderado02', student: 'estudiante02' }, // 3A
  { guardian: 'apoderado02', student: 'estudiante61' }, // P4C
  { guardian: 'apoderado03', student: 'inicial01' }, // I5C (sin cuenta)
  { guardian: 'apoderado03', student: 'inicial02' }, // I5C (sin cuenta)
  { guardian: 'apoderado01', student: 'inicial03' }, // I5C (sin cuenta)
  { guardian: 'apoderado02', student: 'inicial04' }, // I5C (sin cuenta)
];
