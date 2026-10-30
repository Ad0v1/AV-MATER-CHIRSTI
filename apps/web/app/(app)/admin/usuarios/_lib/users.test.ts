import { describe, expect, it } from 'vitest';
import { validateReason } from '../../_shared/lib/validation';
import type { EnrollmentView, SectionOption, StudentChoice, UserListItem } from './types';
import {
  CLEAR_SEARCH_INTENT,
  CREATED_NOTICE_ID,
  createdDetail,
  createdNoticeText,
  searchRequest,
  searchResetKey,
  withoutCreatedFlag,
  MAX_GUARDIAN_STUDENTS,
  USER_REASON_LIMITS,
  addToSelection,
  buildUserListQuery,
  enrollTargets,
  listHref,
  normalizeEmail,
  normalizeFullName,
  normalizeSearch,
  pageCount,
  parsePage,
  parseStudentIds,
  parseUserFilters,
  rangeText,
  removeFromSelection,
  statusChoices,
  studentPlan,
  toStudentChoice,
  transferTargets,
  userPathLabel,
} from './users';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const YEAR = uuid(900);
const OTHER_YEAR = uuid(901);

const section = (n: number, gradeLevel: number, code: string, extra: Partial<SectionOption> = {}) =>
  ({
    id: uuid(n),
    academicYearId: YEAR,
    gradeLevel,
    code,
    isActive: true,
    ...extra,
  }) satisfies SectionOption;

const enrollment = (s: SectionOption): EnrollmentView => ({
  id: uuid(500),
  academicYear: { id: s.academicYearId, year: 2026 },
  section: { id: s.id, gradeLevel: s.gradeLevel, code: s.code },
  isCurrent: true,
  effectiveFrom: '2026-03-01T05:00:00.000Z',
  effectiveTo: null,
  endReason: null,
});

const choice = (n: number, status: StudentChoice['status'] = 'ACTIVE'): StudentChoice => ({
  id: uuid(n),
  fullName: `Estudiante ${n}`,
  institutionalEmail: `e${n}@colegio.example`,
  status,
  sectionLabel: null,
});

describe('parseUserFilters (filtros de la URL)', () => {
  it('acepta solo valores del contrato', () => {
    expect(parseUserFilters({ role: 'TEACHER', status: 'INACTIVE', page: '3' })).toEqual({
      role: 'TEACHER',
      status: 'INACTIVE',
      page: 3,
    });
    expect(parseUserFilters({ role: 'teacher', status: 'BORRADO', page: 'x' })).toEqual({
      page: 1,
    });
    expect(parseUserFilters({})).toEqual({ page: 1 });
  });

  it('grado y sección solo con rol Estudiante', () => {
    const params = { gradeLevel: '3', sectionId: uuid(1) };
    expect(parseUserFilters({ ...params, role: 'STUDENT' })).toEqual({
      role: 'STUDENT',
      gradeLevel: 3,
      sectionId: uuid(1),
      page: 1,
    });
    expect(parseUserFilters({ ...params, role: 'GUARDIAN' })).toEqual({
      role: 'GUARDIAN',
      page: 1,
    });
    expect(parseUserFilters(params)).toEqual({ page: 1 });
  });

  it('descarta grados y secciones manipulados', () => {
    expect(parseUserFilters({ role: 'STUDENT', gradeLevel: '6', sectionId: 'abc' })).toEqual({
      role: 'STUDENT',
      page: 1,
    });
    expect(parseUserFilters({ role: 'STUDENT', gradeLevel: '0' }).gradeLevel).toBeUndefined();
    expect(parseUserFilters({ role: 'STUDENT', gradeLevel: '3.0' }).gradeLevel).toBeUndefined();
    expect(parseUserFilters({ role: 'STUDENT', gradeLevel: ' 3' }).gradeLevel).toBeUndefined();
  });

  it('con parámetros repetidos toma el primero', () => {
    expect(parseUserFilters({ role: ['ADMIN', 'STUDENT'], page: ['2', '9'] })).toEqual({
      role: 'ADMIN',
      page: 2,
    });
  });

  it('no lee `q` de la URL (la búsqueda va por Server Action)', () => {
    expect(parseUserFilters({ q: 'Ana' })).toEqual({ page: 1 });
  });
});

describe('parsePage', () => {
  it('1..1000; fuera de rango o con otro formato → 1', () => {
    expect(parsePage('1')).toBe(1);
    expect(parsePage('1000')).toBe(1000);
    expect(parsePage('1001')).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-2')).toBe(1);
    expect(parsePage('2e3')).toBe(1);
    expect(parsePage('12345')).toBe(1);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage(5)).toBe(1);
  });
});

describe('normalizeSearch (2..100 tras trim, como la API)', () => {
  it('vacío no es error: no hay búsqueda', () => {
    expect(normalizeSearch('')).toEqual({ ok: false, error: null });
    expect(normalizeSearch('   ')).toEqual({ ok: false, error: null });
    expect(normalizeSearch(undefined)).toEqual({ ok: false, error: null });
    expect(normalizeSearch(42)).toEqual({ ok: false, error: null });
  });

  it('bordes 1/2 y 100/101', () => {
    expect(normalizeSearch(' a ').ok).toBe(false);
    expect(normalizeSearch(' ab ')).toEqual({ ok: true, q: 'ab' });
    expect(normalizeSearch('x'.repeat(100))).toEqual({ ok: true, q: 'x'.repeat(100) });
    const long = normalizeSearch('x'.repeat(101));
    expect(long.ok).toBe(false);
    expect(long.ok ? '' : long.error).toMatch(/100/);
  });
});

describe('buildUserListQuery', () => {
  it('arma la query con página y tamaño por defecto', () => {
    expect(buildUserListQuery({ page: 1 })).toBe('page=1&pageSize=20');
    expect(buildUserListQuery({ role: 'TEACHER', status: 'ACTIVE', page: 2 })).toBe(
      'role=TEACHER&status=ACTIVE&page=2&pageSize=20',
    );
  });

  it('quita grado y sección si el rol no es Estudiante', () => {
    expect(
      buildUserListQuery({ role: 'TEACHER', gradeLevel: 3, sectionId: uuid(1), page: 1 }),
    ).toBe('role=TEACHER&page=1&pageSize=20');
    expect(buildUserListQuery({ gradeLevel: 3, page: 1 })).toBe('page=1&pageSize=20');
    expect(
      buildUserListQuery({ role: 'STUDENT', gradeLevel: 3, sectionId: uuid(1), page: 1 }),
    ).toBe(`role=STUDENT&gradeLevel=3&sectionId=${uuid(1)}&page=1&pageSize=20`);
  });

  it('incluye q solo si es válido y lo codifica', () => {
    expect(buildUserListQuery({ page: 1 }, { q: ' a ' })).toBe('page=1&pageSize=20');
    expect(buildUserListQuery({ page: 1 }, { q: ' Ana&role=ADMIN ' })).toBe(
      'q=Ana%26role%3DADMIN&page=1&pageSize=20',
    );
    expect(buildUserListQuery({ page: 1 }, { q: '50%_x' })).toBe('q=50%25_x&page=1&pageSize=20');
  });

  it('valores manipulados se descartan', () => {
    expect(
      buildUserListQuery({
        role: 'ROOT' as never,
        status: 'x' as never,
        page: 99999,
      }),
    ).toBe('page=1&pageSize=20');
    expect(buildUserListQuery({ role: 'STUDENT', gradeLevel: 9, sectionId: 'x', page: 1 })).toBe(
      'role=STUDENT&page=1&pageSize=20',
    );
  });

  it('pageSize entre 1 y 100', () => {
    expect(buildUserListQuery({ page: 1 }, { pageSize: 100 })).toContain('pageSize=100');
    expect(buildUserListQuery({ page: 1 }, { pageSize: 101 })).toContain('pageSize=20');
    expect(buildUserListQuery({ page: 1 }, { pageSize: 0 })).toContain('pageSize=20');
  });
});

describe('listHref (enlaces de la lista)', () => {
  it('sin filtros ni página 1, la ruta sola', () => {
    expect(listHref({ page: 1 })).toBe('/admin/usuarios');
    expect(listHref({}, 1)).toBe('/admin/usuarios');
  });

  it('con filtros y página, sin pageSize', () => {
    expect(listHref({ role: 'STUDENT', gradeLevel: 2 }, 3)).toBe(
      '/admin/usuarios?role=STUDENT&gradeLevel=2&page=3',
    );
  });

  it('nunca lleva texto de búsqueda', () => {
    expect(listHref({ role: 'ADMIN', ...({ q: 'Ana' } as object) }, 2)).toBe(
      '/admin/usuarios?role=ADMIN&page=2',
    );
  });
});

describe('pageCount y rangeText', () => {
  it('pageCount', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(5000, 1)).toBe(1000);
    expect(pageCount(Number.NaN, 20)).toBe(1);
    expect(pageCount(10, 0)).toBe(1);
  });

  it('rangeText', () => {
    expect(rangeText(1, 20, 0, 0)).toBe('Sin resultados');
    expect(rangeText(1, 20, 57, 20)).toBe('Mostrando 1–20 de 57');
    expect(rangeText(3, 20, 57, 17)).toBe('Mostrando 41–57 de 57');
    expect(rangeText(9, 20, 57, 0)).toBe('Sin resultados');
  });
});

describe('normalizeFullName (mismas reglas que fullNameSchema)', () => {
  it('colapsa espacios y recorta', () => {
    expect(normalizeFullName('  Ana   María  Pérez ')).toEqual({
      ok: true,
      value: 'Ana María Pérez',
    });
  });

  it('bordes 2/3 y 120/121', () => {
    expect(normalizeFullName('Al').ok).toBe(false);
    expect(normalizeFullName('Ale').ok).toBe(true);
    expect(normalizeFullName('a'.repeat(120)).ok).toBe(true);
    expect(normalizeFullName('a'.repeat(121)).ok).toBe(false);
  });

  it('rechaza caracteres de control y fórmulas al inicio', () => {
    expect(normalizeFullName('Ana\tPérez').ok).toBe(false);
    expect(normalizeFullName('Ana\u0000').ok).toBe(false);
    for (const start of ['=', '+', '-', '@']) {
      expect(normalizeFullName(`${start}SUMA(1)`).ok).toBe(false);
      expect(normalizeFullName(`  ${start}Ana`).ok).toBe(false);
    }
    expect(normalizeFullName('Ana-María').ok).toBe(true);
    expect(normalizeFullName(undefined).ok).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('minúsculas y sin espacios en los extremos', () => {
    expect(normalizeEmail('  Ana.Perez@Colegio.Example ')).toEqual({
      ok: true,
      value: 'ana.perez@colegio.example',
    });
  });

  it('formato y largo', () => {
    expect(normalizeEmail('').ok).toBe(false);
    expect(normalizeEmail('ana').ok).toBe(false);
    expect(normalizeEmail('ana@colegio').ok).toBe(false);
    expect(normalizeEmail('ana perez@colegio.example').ok).toBe(false);
    const local = 'a'.repeat(191 - '@c.pe'.length);
    expect(normalizeEmail(`${local}@c.pe`).ok).toBe(true);
    expect(normalizeEmail(`${local}a@c.pe`).ok).toBe(false);
    expect(normalizeEmail(null).ok).toBe(false);
  });
});

describe('userPathLabel', () => {
  it('traduce los campos de la API', () => {
    expect(userPathLabel('fullName')).toBe('Nombre');
    expect(userPathLabel('institutionalEmail')).toBe('Correo');
    expect(userPathLabel('studentIds.3')).toBe('Estudiantes');
    expect(userPathLabel('otro')).toBeUndefined();
    expect(userPathLabel('')).toBeUndefined();
  });
});

describe('estado (RF-23)', () => {
  it('statusChoices quita el actual', () => {
    expect(statusChoices('ACTIVE')).toEqual(['INACTIVE', 'WITHDRAWN']);
    expect(statusChoices('WITHDRAWN')).toEqual(['ACTIVE', 'INACTIVE']);
  });
});

describe('límites de motivos (mismos que la API)', () => {
  it('estado y traslado: opcionales, 1..500', () => {
    for (const limits of [USER_REASON_LIMITS.status, USER_REASON_LIMITS.transfer]) {
      expect(validateReason('', limits)).toBeNull();
      expect(validateReason('   ', limits)).toBeNull();
      expect(validateReason('x', limits)).toBeNull();
      expect(validateReason('x'.repeat(500), limits)).toBeNull();
      expect(validateReason('x'.repeat(501), limits)).not.toBeNull();
    }
  });

  it('revocación (RN-13): obligatorio, 10..500 tras trim', () => {
    const limits = USER_REASON_LIMITS.revoke;
    expect(validateReason('', limits)).not.toBeNull();
    expect(validateReason('  123456789  ', limits)).not.toBeNull();
    expect(validateReason('1234567890', limits)).toBeNull();
    expect(validateReason(`  ${'x'.repeat(500)}  `, limits)).toBeNull();
    expect(validateReason('x'.repeat(501), limits)).not.toBeNull();
  });
});

describe('secciones para matricular y trasladar (RF-18, RF-24)', () => {
  const a3 = section(1, 3, 'A');
  const b3 = section(2, 3, 'B');
  const c3off = section(3, 3, 'C', { isActive: false });
  const a4 = section(4, 4, 'A');
  const d3other = section(5, 3, 'D', { academicYearId: OTHER_YEAR });
  const all = [a4, c3off, b3, d3other, a3];

  it('enrollTargets: solo activas, por grado y código', () => {
    expect(enrollTargets(all).map((s) => s.code + s.gradeLevel)).toEqual(['A3', 'B3', 'D3', 'A4']);
  });

  it('transferTargets: activas, mismo año, mismo grado y distinta de la actual', () => {
    expect(transferTargets(all, enrollment(a3))).toEqual([b3]);
    expect(transferTargets(all, enrollment(b3))).toEqual([a3]);
    expect(transferTargets(all, enrollment(a4))).toEqual([]);
  });

  it('transferTargets: sin matrícula vigente, ninguna', () => {
    expect(transferTargets(all, null)).toEqual([]);
    expect(transferTargets(all, undefined)).toEqual([]);
  });

  it('studentPlan', () => {
    const active = { sections: all };
    expect(studentPlan('WITHDRAWN', enrollment(a3), active)).toMatchObject({
      canEnroll: false,
      canTransfer: false,
    });
    expect(studentPlan('ACTIVE', null, null)).toMatchObject({
      canEnroll: false,
      notice: 'No hay un año académico activo.',
    });
    expect(studentPlan('ACTIVE', null, active)).toEqual({
      canEnroll: true,
      canTransfer: false,
      notice: null,
    });
    expect(studentPlan('INACTIVE', null, { sections: [c3off] })).toMatchObject({
      canEnroll: false,
      notice: 'El año activo no tiene secciones activas.',
    });
    expect(studentPlan('ACTIVE', enrollment(a3), active)).toEqual({
      canEnroll: false,
      canTransfer: true,
      notice: null,
    });
    expect(studentPlan('ACTIVE', enrollment(a4), active)).toMatchObject({
      canEnroll: false,
      canTransfer: false,
    });
  });
});

describe('selección de estudiantes del apoderado (1..10, RF-25)', () => {
  it('agrega sin repetir y respeta el máximo', () => {
    let sel: StudentChoice[] = [];
    for (let i = 1; i <= MAX_GUARDIAN_STUDENTS; i++) {
      const r = addToSelection(sel, choice(i));
      expect(r.error).toBeNull();
      sel = r.selected;
    }
    expect(sel).toHaveLength(10);
    const over = addToSelection(sel, choice(11));
    expect(over.selected).toHaveLength(10);
    expect(over.error).toMatch(/10/);
    const dup = addToSelection(sel.slice(0, 2), choice(1));
    expect(dup.selected).toHaveLength(2);
    expect(dup.error).toMatch(/ya está/);
  });

  it('no agrega retirados; sí inactivos', () => {
    expect(addToSelection([], choice(1, 'WITHDRAWN'))).toEqual({
      selected: [],
      error: 'No se puede vincular a un estudiante retirado.',
    });
    expect(addToSelection([], choice(1, 'INACTIVE')).error).toBeNull();
  });

  it('con máximo 1 (vincular a un apoderado existente)', () => {
    const one = addToSelection([], choice(1), 1).selected;
    expect(addToSelection(one, choice(2), 1).error).toMatch(/quítalo/);
  });

  it('no muta la lista original y quita por id', () => {
    const original = [choice(1), choice(2)];
    addToSelection(original, choice(3));
    expect(original).toHaveLength(2);
    expect(removeFromSelection(original, uuid(1)).map((s) => s.id)).toEqual([uuid(2)]);
    expect(removeFromSelection(original, uuid(9))).toHaveLength(2);
  });
});

describe('parseStudentIds (lo que llega del formulario)', () => {
  it('1..10 uuid sin repetir', () => {
    expect(parseStudentIds([uuid(1)])).toEqual({ ok: true, ids: [uuid(1)] });
    const ten = Array.from({ length: 10 }, (_, i) => uuid(i + 1));
    expect(parseStudentIds(ten)).toEqual({ ok: true, ids: ten });
  });

  it('0, 11, repetidos o no uuid → error', () => {
    expect(parseStudentIds([])).toMatchObject({ ok: false });
    expect(parseStudentIds(Array.from({ length: 11 }, (_, i) => uuid(i + 1)))).toMatchObject({
      ok: false,
    });
    expect(parseStudentIds([uuid(1), uuid(1)])).toEqual({
      ok: false,
      error: 'Los estudiantes no se pueden repetir.',
    });
    expect(parseStudentIds([uuid(1), uuid(1).toUpperCase()])).toMatchObject({ ok: false });
    expect(parseStudentIds(['x'])).toMatchObject({ ok: false });
    expect(parseStudentIds([new File([], 'a')])).toMatchObject({ ok: false });
  });

  it('con min y max propios (vincular uno solo)', () => {
    expect(parseStudentIds([uuid(1)], { min: 1, max: 1 })).toEqual({ ok: true, ids: [uuid(1)] });
    expect(parseStudentIds([uuid(1), uuid(2)], { min: 1, max: 1 })).toMatchObject({ ok: false });
    expect(parseStudentIds([], { min: 1, max: 1 })).toMatchObject({ ok: false });
  });
});

describe('toStudentChoice', () => {
  it('solo lo que muestra el buscador', () => {
    const item: UserListItem = {
      id: uuid(1),
      institutionalEmail: 'e1@colegio.example',
      fullName: 'Estudiante 1',
      role: 'STUDENT',
      status: 'ACTIVE',
      currentSection: { id: uuid(2), gradeLevel: 3, code: 'A' },
    };
    expect(toStudentChoice(item)).toEqual({
      id: uuid(1),
      fullName: 'Estudiante 1',
      institutionalEmail: 'e1@colegio.example',
      status: 'ACTIVE',
      sectionLabel: '3.º A',
    });
    expect(toStudentChoice({ ...item, currentSection: null }).sectionLabel).toBeNull();
  });
});

// --- QA 5b: casos límite adicionales (RF-18..20, 22..25; RN-13; RNF-24..27) ---------------

describe('QA 5b: parseUserFilters, casos límite', () => {
  it('RF-22: q en la URL se ignora aunque venga con otros filtros válidos', () => {
    expect(parseUserFilters({ q: 'Ana', role: 'TEACHER', page: '2' })).toEqual({
      role: 'TEACHER',
      page: 2,
    });
    expect(parseUserFilters({ q: ['Ana'] })).not.toHaveProperty('q');
  });

  it('RF-22: grado y sección sin rol Estudiante no llegan al resultado', () => {
    for (const role of ['TEACHER', 'ADMIN', 'GUARDIAN', undefined]) {
      const r = parseUserFilters({ role, gradeLevel: '2', sectionId: uuid(7) });
      expect(r).not.toHaveProperty('gradeLevel');
      expect(r).not.toHaveProperty('sectionId');
    }
  });

  it('página no numérica, negativa, decimal o vacía → 1', () => {
    for (const page of ['abc', '-1', '1.5', '', ' 2', '0x10', 'NaN', 'Infinity']) {
      expect(parseUserFilters({ page }).page).toBe(1);
    }
    expect(parseUserFilters({ page: [] as string[] }).page).toBe(1);
  });

  it('sectionId en mayúsculas vale; con espacio o llaves no', () => {
    expect(parseUserFilters({ role: 'STUDENT', sectionId: uuid(1).toUpperCase() }).sectionId).toBe(
      uuid(1).toUpperCase(),
    );
    expect(
      parseUserFilters({ role: 'STUDENT', sectionId: ` ${uuid(1)}` }).sectionId,
    ).toBeUndefined();
    expect(
      parseUserFilters({ role: 'STUDENT', sectionId: `{${uuid(1)}}` }).sectionId,
    ).toBeUndefined();
  });
});

describe('QA 5b: buildUserListQuery y listHref, casos límite', () => {
  it('página negativa, decimal o NaN → 1', () => {
    expect(buildUserListQuery({ page: -3 })).toBe('page=1&pageSize=20');
    expect(buildUserListQuery({ page: 2.5 })).toBe('page=1&pageSize=20');
    expect(buildUserListQuery({ page: Number.NaN })).toBe('page=1&pageSize=20');
    expect(buildUserListQuery({})).toBe('page=1&pageSize=20');
  });

  it('q con comodines viaja codificado y literal', () => {
    expect(buildUserListQuery({ page: 1 }, { q: '%_' })).toBe('q=%25_&page=1&pageSize=20');
    expect(buildUserListQuery({ page: 1 }, { q: 'a\\b' })).toBe('q=a%5Cb&page=1&pageSize=20');
  });

  it('q de 1 o 101 caracteres no se incluye; de 100 sí', () => {
    expect(buildUserListQuery({ page: 1 }, { q: 'x'.repeat(101) })).not.toContain('q=');
    expect(buildUserListQuery({ page: 1 }, { q: 'x' })).not.toContain('q=');
    expect(buildUserListQuery({ page: 1 }, { q: 'x'.repeat(100) })).toContain(
      `q=${'x'.repeat(100)}`,
    );
  });

  it('pageSize decimal o NaN → 20', () => {
    expect(buildUserListQuery({ page: 1 }, { pageSize: 10.5 })).toContain('pageSize=20');
    expect(buildUserListQuery({ page: 1 }, { pageSize: Number.NaN })).toContain('pageSize=20');
    expect(buildUserListQuery({ page: 1 }, { pageSize: 1 })).toContain('pageSize=1');
  });

  it('grado 0 o 6 con rol Estudiante se descarta; la sección uuid se conserva', () => {
    expect(
      buildUserListQuery({ role: 'STUDENT', gradeLevel: 0, sectionId: uuid(1), page: 1 }),
    ).toBe(`role=STUDENT&sectionId=${uuid(1)}&page=1&pageSize=20`);
    expect(buildUserListQuery({ role: 'STUDENT', gradeLevel: 6, page: 1 })).toBe(
      'role=STUDENT&page=1&pageSize=20',
    );
  });

  it('listHref: página 0 o negativa no deja page; página alta sí', () => {
    expect(listHref({ role: 'TEACHER' }, 0)).toBe('/admin/usuarios?role=TEACHER');
    expect(listHref({ role: 'TEACHER' }, -4)).toBe('/admin/usuarios?role=TEACHER');
    expect(listHref({ status: 'WITHDRAWN' }, 1000)).toBe(
      '/admin/usuarios?status=WITHDRAWN&page=1000',
    );
    expect(listHref({ role: 'STUDENT', gradeLevel: 4, sectionId: 'x' }, 2)).toBe(
      '/admin/usuarios?role=STUDENT&gradeLevel=4&page=2',
    );
  });

  it('listHref con filtros inválidos no los reenvía', () => {
    expect(listHref({ role: 'ROOT' as never, status: 'x' as never })).toBe('/admin/usuarios');
  });
});

describe('QA 5b: normalizeSearch, bordes y comodines', () => {
  it('RF-22: 1 → error; 2 y 100 → ok; 101 → error; todo tras trim', () => {
    const one = normalizeSearch('a');
    expect(one.ok).toBe(false);
    expect(one.ok ? '' : one.error).toMatch(/al menos 2/);
    expect(normalizeSearch('ab').ok).toBe(true);
    expect(normalizeSearch(`  ${'x'.repeat(100)}  `)).toEqual({ ok: true, q: 'x'.repeat(100) });
    expect(normalizeSearch(` ${'x'.repeat(101)} `).ok).toBe(false);
  });

  it('los comodines % _ se aceptan como texto literal (la API los escapa)', () => {
    expect(normalizeSearch('%_')).toEqual({ ok: true, q: '%_' });
    expect(normalizeSearch(' 50% ')).toEqual({ ok: true, q: '50%' });
    expect(normalizeSearch('__')).toEqual({ ok: true, q: '__' });
  });

  it('no colapsa espacios internos', () => {
    expect(normalizeSearch('  Ana   Pérez ')).toEqual({ ok: true, q: 'Ana   Pérez' });
  });
});

describe('QA 5b: normalizeFullName y normalizeEmail, casos límite', () => {
  it('RF-18: el largo se mide tras colapsar espacios', () => {
    expect(normalizeFullName('A    b').ok).toBe(true);
    expect(normalizeFullName(`${'a'.repeat(60)}   ${'b'.repeat(59)}`).ok).toBe(true);
    expect(normalizeFullName(`${'a'.repeat(60)} ${'b'.repeat(60)}`).ok).toBe(false);
    expect(normalizeFullName('   ').ok).toBe(false);
    expect(normalizeFullName(123).ok).toBe(false);
  });

  it('caracteres de control en medio se rechazan; NBSP no es control', () => {
    expect(normalizeFullName('Ana\nPérez').ok).toBe(false);
    expect(normalizeFullName('Ana\u007fPérez').ok).toBe(false);
    expect(normalizeFullName('Ana\u0085Pérez').ok).toBe(false);
    expect(normalizeFullName('Ana Pérez').ok).toBe(true);
  });

  it('fórmulas solo bloquean al inicio', () => {
    expect(normalizeFullName('Ana =Pérez').ok).toBe(true);
    expect(normalizeFullName('Ana @ Pérez').ok).toBe(true);
  });

  it('conserva tildes y eñes', () => {
    expect(normalizeFullName('Ñandú Peña')).toEqual({ ok: true, value: 'Ñandú Peña' });
  });

  it('RF-19: correos mal formados y bordes', () => {
    for (const bad of ['a@@b.pe', 'a@b@c.pe', '@b.pe', 'a@.pe', 'a@b.', 'a@b .pe', '   ']) {
      expect(normalizeEmail(bad).ok).toBe(false);
    }
    expect(normalizeEmail('a+tag@colegio.edu.pe')).toEqual({
      ok: true,
      value: 'a+tag@colegio.edu.pe',
    });
    expect(normalizeEmail(`${'a'.repeat(191 - '@c.pe'.length)}@c.pe`).ok).toBe(true);
    expect(normalizeEmail(42).ok).toBe(false);
    expect(normalizeEmail(undefined).ok).toBe(false);
  });
});

describe('QA 5b: transferTargets y studentPlan (RF-24, RN-13)', () => {
  const a3 = section(1, 3, 'A');
  const b3 = section(2, 3, 'B');
  const c3off = section(3, 3, 'C', { isActive: false });
  const a4 = section(4, 4, 'A');
  const d3other = section(5, 3, 'D', { academicYearId: OTHER_YEAR });
  const e3 = section(6, 3, 'E');

  it('excluye otro año, otro grado, inactiva y la actual', () => {
    const r = transferTargets([a3, b3, c3off, a4, d3other, e3], enrollment(a3));
    expect(r.map((s) => s.id)).toEqual([b3.id, e3.id]);
  });

  it('si la matrícula es de otro año, solo cuentan las secciones de ese año', () => {
    expect(transferTargets([a3, b3, d3other], enrollment(d3other))).toEqual([]);
  });

  it('ordena por código y no muta la entrada', () => {
    const input = [e3, b3, a3];
    const copy = [...input];
    expect(transferTargets(input, enrollment(a3)).map((s) => s.code)).toEqual(['B', 'E']);
    expect(input).toEqual(copy);
  });

  it('retirado nunca matricula ni traslada', () => {
    for (const cur of [null, enrollment(a3)]) {
      const p = studentPlan('WITHDRAWN', cur, { sections: [a3, b3] });
      expect(p.canEnroll).toBe(false);
      expect(p.canTransfer).toBe(false);
      expect(p.notice).toMatch(/retirado/);
    }
    expect(studentPlan('WITHDRAWN', null, null).notice).toMatch(/retirado/);
  });

  it('con matrícula vigente no puede matricular; traslada solo si hay otra del grado', () => {
    expect(studentPlan('ACTIVE', enrollment(a3), { sections: [a3, b3] })).toEqual({
      canEnroll: false,
      canTransfer: true,
      notice: null,
    });
    const only = studentPlan('INACTIVE', enrollment(a3), { sections: [a3, a4, c3off] });
    expect(only.canEnroll).toBe(false);
    expect(only.canTransfer).toBe(false);
    expect(only.notice).toMatch(/mismo grado/);
  });

  it('año activo sin secciones', () => {
    expect(studentPlan('ACTIVE', null, { sections: [] })).toMatchObject({
      canEnroll: false,
      notice: 'El año activo no tiene secciones activas.',
    });
  });
});

describe('QA 5b: addToSelection y parseStudentIds (RF-19, RF-25, RN-13)', () => {
  const ten = Array.from({ length: 10 }, (_, i) => choice(i + 1));

  it('tope 10: la 11.ª no entra y la lista queda igual', () => {
    const r = addToSelection(ten, choice(11));
    expect(r.selected.map((s) => s.id)).toEqual(ten.map((s) => s.id));
    expect(r.error).toBe('Puedes elegir hasta 10 estudiantes.');
  });

  it('tope 1 al vincular: otro distinto → quítalo; el mismo → ya está', () => {
    expect(addToSelection([choice(1)], choice(2), 1).error).toMatch(/quítalo/);
    expect(addToSelection([choice(1)], choice(1), 1).error).toMatch(/ya está/);
  });

  it('repetido tiene prioridad sobre retirado y sobre el tope', () => {
    expect(addToSelection(ten, choice(1, 'WITHDRAWN')).error).toMatch(/ya está/);
  });

  it('retirado se rechaza antes que el tope', () => {
    expect(addToSelection(ten, choice(11, 'WITHDRAWN')).error).toMatch(/retirado/);
  });

  it('el mismo uuid en otra capitalización lo atrapa parseStudentIds', () => {
    const lower = 'abcdef00-0000-4000-8000-00000000000a';
    const upper = { ...choice(1), id: lower.toUpperCase() };
    expect(addToSelection([{ ...choice(1), id: lower }], upper).error).toBeNull();
    expect(parseStudentIds([lower, upper.id])).toMatchObject({ ok: false });
  });

  it('parseStudentIds: valores manipulados', () => {
    for (const bad of [null, undefined, 1, {}, [], ` ${uuid(1)}`, `${uuid(1)}\n`, '']) {
      expect(parseStudentIds([bad])).toEqual({
        ok: false,
        error: 'La lista de estudiantes no es válida. Vuelve a elegirlos.',
      });
    }
  });

  it('parseStudentIds: un manipulado entre válidos invalida todo', () => {
    expect(parseStudentIds([uuid(1), 'x', uuid(2)])).toMatchObject({ ok: false });
  });

  it('parseStudentIds: más de 10 → tope; 10 con duplicado → repetidos', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => uuid(i + 1));
    expect(parseStudentIds(eleven)).toEqual({
      ok: false,
      error: 'Puedes elegir hasta 10 estudiantes.',
    });
    expect(parseStudentIds([...eleven.slice(0, 9), uuid(1)])).toEqual({
      ok: false,
      error: 'Los estudiantes no se pueden repetir.',
    });
  });

  it('parseStudentIds: mensajes de mínimo', () => {
    expect(parseStudentIds([], { min: 2 })).toEqual({
      ok: false,
      error: 'Elige al menos 2 estudiantes.',
    });
    expect(parseStudentIds([])).toEqual({ ok: false, error: 'Elige al menos un estudiante.' });
  });
});

describe('vuelta 1/2 de 5b: búsqueda, reinicio y nota de alta', () => {
  it('searchRequest: limpiar solo con el intent; vacío es error junto al campo', () => {
    expect(searchRequest('', CLEAR_SEARCH_INTENT)).toEqual({ kind: 'clear' });
    expect(searchRequest('Ana', CLEAR_SEARCH_INTENT)).toEqual({ kind: 'clear' });
    expect(searchRequest('', '')).toEqual({
      kind: 'error',
      error: 'Escribe al menos 2 caracteres.',
    });
    expect(searchRequest('   ', undefined)).toMatchObject({ kind: 'error' });
    expect(searchRequest('a', '')).toEqual({
      kind: 'error',
      error: 'Escribe al menos 2 caracteres.',
    });
    expect(searchRequest('x'.repeat(101), '')).toMatchObject({ kind: 'error' });
    expect(searchRequest(' Ana ', 'otro')).toEqual({ kind: 'search', q: 'Ana' });
  });

  it('searchResetKey cambia con los filtros (y solo con ellos)', () => {
    const base = searchResetKey({ page: 1 });
    expect(searchResetKey({ page: 1 })).toBe(base);
    expect(searchResetKey({ role: 'STUDENT', page: 1 })).not.toBe(base);
    expect(searchResetKey({ role: 'STUDENT', gradeLevel: 3, page: 1 })).not.toBe(
      searchResetKey({ role: 'STUDENT', page: 1 }),
    );
    expect(searchResetKey({ status: 'ACTIVE', page: 1 })).not.toBe(base);
    // grado sin rol Estudiante no cuenta (no llega a la API)
    expect(searchResetKey({ gradeLevel: 3, page: 1 })).toBe(base);
  });

  it('createdDetail y createdNoticeText', () => {
    expect(createdDetail('TEACHER', null)).toBe('La cuenta de docente quedó registrada.');
    expect(createdDetail('STUDENT', '3.º A')).toBe(
      'La cuenta de estudiante quedó registrada. Matriculado en 3.º A.',
    );
    expect(createdNoticeText('X.')).toBe('Cuenta creada. X.');
  });

  it('withoutCreatedFlag quita solo `alta`', () => {
    expect(CREATED_NOTICE_ID).toBe('cuenta-creada');
    expect(withoutCreatedFlag('/admin/usuarios/x', '?alta=1')).toBe('/admin/usuarios/x');
    expect(withoutCreatedFlag('/admin/usuarios/x', '?alta=1&b=2')).toBe('/admin/usuarios/x?b=2');
    expect(withoutCreatedFlag('/admin/usuarios/x', '?b=2')).toBeNull();
    expect(withoutCreatedFlag('/admin/usuarios/x', '')).toBeNull();
  });

  it('RF-18 QA: searchRequest en los límites 1/2/100/101 y con espacios', () => {
    expect(searchRequest('a'.repeat(1), '')).toMatchObject({ kind: 'error' });
    expect(searchRequest('ab', '')).toEqual({ kind: 'search', q: 'ab' });
    expect(searchRequest('a'.repeat(100), '')).toEqual({ kind: 'search', q: 'a'.repeat(100) });
    expect(searchRequest('a'.repeat(101), '')).toEqual({
      kind: 'error',
      error: 'La búsqueda no puede pasar de 100 caracteres.',
    });
    // los espacios de los extremos no cuentan
    expect(searchRequest(` ${'a'.repeat(100)} `, '')).toMatchObject({ kind: 'search' });
    expect(searchRequest(' a ', '')).toMatchObject({ kind: 'error' });
    // vacío y solo espacios: error con el mismo texto de campo, nunca null
    for (const empty of ['', '   ', '\t\n', undefined, null, 5]) {
      expect(searchRequest(empty, '')).toEqual({
        kind: 'error',
        error: 'Escribe al menos 2 caracteres.',
      });
    }
    // intent distinto de "limpiar" (otro valor, mayúsculas, no texto) no limpia
    for (const intent of [undefined, null, 'Limpiar', 'buscar', 1]) {
      expect(searchRequest('', intent)).toMatchObject({ kind: 'error' });
    }
    expect(searchRequest('', 'limpiar')).toEqual({ kind: 'clear' });
  });

  it('RF-18 QA: searchResetKey cambia con rol, grado, sección y estado', () => {
    const sec = uuid(7);
    const base = searchResetKey({ role: 'STUDENT', page: 1 });
    expect(searchResetKey({ role: 'STUDENT', page: 1 })).toBe(base);
    expect(searchResetKey({ role: 'TEACHER', page: 1 })).not.toBe(base);
    expect(searchResetKey({ role: 'STUDENT', gradeLevel: 3, page: 1 })).not.toBe(base);
    expect(searchResetKey({ role: 'STUDENT', sectionId: sec, page: 1 })).not.toBe(base);
    expect(searchResetKey({ role: 'STUDENT', status: 'INACTIVE', page: 1 })).not.toBe(base);
    // grado y sección sin rol Estudiante no llegan a la API: la clave no cambia
    expect(searchResetKey({ role: 'TEACHER', gradeLevel: 3, page: 1 })).toBe(
      searchResetKey({ role: 'TEACHER', page: 1 }),
    );
    expect(searchResetKey({ sectionId: sec, page: 1 })).toBe(searchResetKey({ page: 1 }));
    // una sección que no es uuid se descarta
    expect(searchResetKey({ role: 'STUDENT', sectionId: 'x', page: 1 })).toBe(base);
    expect(searchResetKey({ page: 1 }).startsWith('busqueda-')).toBe(true);
  });

  it('RF-18 QA: searchResetKey también cambia con la página (diseño actual: paginar reinicia la búsqueda)', () => {
    // Documenta lo que hay: la clave sale de buildUserListQuery, que incluye `page`.
    expect(searchResetKey({ role: 'STUDENT', page: 2 })).not.toBe(
      searchResetKey({ role: 'STUDENT', page: 1 }),
    );
  });

  it('RF-18 QA: createdDetail y createdNoticeText para todos los roles', () => {
    expect(createdDetail('ADMIN', null)).toBe('La cuenta de administrador quedó registrada.');
    expect(createdDetail('GUARDIAN', null)).toBe('La cuenta de apoderado quedó registrada.');
    // sectionText vacío se trata como sin sección
    expect(createdDetail('STUDENT', '')).toBe('La cuenta de estudiante quedó registrada.');
    // la nota no incluye correo
    expect(createdDetail('STUDENT', '3.º A')).not.toContain('@');
    expect(createdNoticeText(createdDetail('TEACHER', null))).toBe(
      'Cuenta creada. La cuenta de docente quedó registrada.',
    );
    expect(createdNoticeText('')).toBe('Cuenta creada. ');
  });

  it('RF-18 QA: withoutCreatedFlag con otros parámetros, alta repetido, sin alta y hash', () => {
    const p = '/admin/usuarios/abc';
    expect(withoutCreatedFlag(p, 'alta=1')).toBe(p); // sin "?" inicial
    expect(withoutCreatedFlag(p, '?x=1&alta=1&y=2')).toBe(`${p}?x=1&y=2`);
    expect(withoutCreatedFlag(p, '?alta=1&alta=1')).toBe(p); // repetido: quita todos
    expect(withoutCreatedFlag(p, '?alta=1&x=1&alta=1')).toBe(`${p}?x=1`);
    expect(withoutCreatedFlag(p, '?alta=')).toBe(p); // valor vacío también cuenta
    expect(withoutCreatedFlag(p, '?x=1')).toBeNull();
    expect(withoutCreatedFlag(p, '?altas=1')).toBeNull(); // otro nombre
    // el hash no forma parte de location.search: el pathname lo conserva tal cual
    expect(withoutCreatedFlag(`${p}#datos-usuario`, '?alta=1')).toBe(`${p}#datos-usuario`);
    expect(withoutCreatedFlag(p, '?x=a%20b&alta=1')).toBe(`${p}?x=a+b`);
  });
});
