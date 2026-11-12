import { createAssignmentSchema, updateAssignmentSchema } from './assignments.dto.js';
import {
  auditSnapshot,
  checkNoSubmissionLiteral,
  NO_SUBMISSION_LITERAL_NUMERIC,
  DEFAULT_MAX_SIZE_BYTES,
  diffAssignment,
  isDueAtAcceptable,
  isValidMaxSize,
  MAX_SIZE_CAP_BYTES,
  normalizeGrade,
  type AssignmentFields,
} from './assignments.policy.js';

const PERIOD = '0198a3c4-0000-7000-8000-000000000001';
const FILE = '0198a3c4-0000-7000-8000-000000000002';

const base = {
  periodId: PERIOD,
  title: 'Práctica 1',
  instructions: 'Resolver y subir en PDF',
  dueAt: '2099-10-20T23:59:00-05:00',
};

describe('constantes RN-08 (MiB)', () => {
  it('20 MiB por defecto y tope 50 MiB', () => {
    expect(DEFAULT_MAX_SIZE_BYTES).toBe(20971520);
    expect(MAX_SIZE_CAP_BYTES).toBe(52428800);
  });

  it('isValidMaxSize acepta 1..52428800 enteros', () => {
    expect(isValidMaxSize(1)).toBe(true);
    expect(isValidMaxSize(MAX_SIZE_CAP_BYTES)).toBe(true);
    expect(isValidMaxSize(0)).toBe(false);
    expect(isValidMaxSize(MAX_SIZE_CAP_BYTES + 1)).toBe(false);
    expect(isValidMaxSize(1.5)).toBe(false);
  });
});

describe('normalizeGrade (RN-05)', () => {
  it.each([
    [0, '0.00'],
    [20, '20.00'],
    [12.5, '12.50'],
    [10.25, '10.25'],
    ['0', '0.00'],
    ['7.5', '7.50'],
    ['19.99', '19.99'],
    ['20.00', '20.00'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeGrade(input)).toBe(expected);
  });

  it.each([
    -1,
    20.01,
    21,
    1.234,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '',
    '-1',
    '20.01',
    '1.234',
    'abc',
    '1e1',
    ' 5',
  ])('rechaza %s', (input) => {
    expect(normalizeGrade(input)).toBeNull();
  });
});

describe('isDueAtAcceptable', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  it('solo plazos futuros', () => {
    expect(isDueAtAcceptable(new Date('2026-10-29T12:00:01Z'), now)).toBe(true);
    expect(isDueAtAcceptable(now, now)).toBe(false);
    expect(isDueAtAcceptable(new Date('2026-10-01T00:00:00Z'), now)).toBe(false);
  });
});

describe('createAssignmentSchema', () => {
  it('QA-003: sin nota NE ni tamaño usa 0.00 y 20 MiB; allowLate false; sin adjunto', () => {
    const dto = createAssignmentSchema.parse(base);
    expect(dto.noSubmissionGrade).toBe('0.00');
    expect(dto.maxSizeBytes).toBe(20971520);
    expect(dto.allowLate).toBe(false);
    expect(dto.attachmentFileId).toBeNull();
    expect(dto.dueAt.toISOString()).toBe('2099-10-21T04:59:00.000Z');
  });

  it('QA-004: rechaza un límite mayor a 50 MiB', () => {
    expect(createAssignmentSchema.safeParse({ ...base, maxSizeBytes: 52428801 }).success).toBe(
      false,
    );
    expect(createAssignmentSchema.safeParse({ ...base, maxSizeBytes: 52428800 }).success).toBe(
      true,
    );
  });

  it('rechaza tamaño 0 o decimal, nota fuera de rango y campos de más (estricto)', () => {
    for (const extra of [
      { maxSizeBytes: 0 },
      { maxSizeBytes: 1000.5 },
      { noSubmissionGrade: 21 },
      { noSubmissionGrade: '5.555' },
      { deletedAt: null },
      { courseSectionId: PERIOD },
    ]) {
      expect(
        createAssignmentSchema.safeParse({ ...base, ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
    }
  });

  it('exige zona horaria en dueAt y título no vacío', () => {
    expect(
      createAssignmentSchema.safeParse({ ...base, dueAt: '2099-10-20T23:59:00' }).success,
    ).toBe(false);
    expect(createAssignmentSchema.safeParse({ ...base, title: '   ' }).success).toBe(false);
  });

  it('acepta nota NE como texto y adjunto UUID', () => {
    const dto = createAssignmentSchema.parse({
      ...base,
      noSubmissionGrade: '11.5',
      attachmentFileId: FILE,
    });
    expect(dto.noSubmissionGrade).toBe('11.50');
    expect(dto.attachmentFileId).toBe(FILE);
  });
});

describe('updateAssignmentSchema', () => {
  it('exige al menos un campo y no permite cambiar el período', () => {
    expect(updateAssignmentSchema.safeParse({}).success).toBe(false);
    expect(updateAssignmentSchema.safeParse({ periodId: PERIOD }).success).toBe(false);
    expect(updateAssignmentSchema.safeParse({ allowLate: true }).success).toBe(true);
    expect(updateAssignmentSchema.parse({ attachmentFileId: null }).attachmentFileId).toBeNull();
  });
});

describe('diffAssignment y auditSnapshot (sin textos libres)', () => {
  const current: AssignmentFields = {
    title: 'Título con nombre de alumno',
    instructions: 'Instrucciones privadas',
    dueAt: new Date('2099-01-01T00:00:00Z'),
    maxSizeBytes: 20971520,
    noSubmissionGrade: '0.00',
    noSubmissionLiteral: null,
    allowLate: false,
    attachmentFileId: null,
  };

  it('lista los campos cambiados pero nunca el valor de title/instructions', () => {
    const change = diffAssignment(current, {
      title: 'Otro',
      instructions: 'Otras',
      dueAt: new Date('2099-01-02T00:00:00Z'),
      allowLate: false, // igual: no cuenta
    });
    expect(change.changedFields).toEqual(['title', 'instructions', 'dueAt']);
    expect(change.before).toEqual({ dueAt: '2099-01-01T00:00:00.000Z' });
    expect(change.after).toEqual({ dueAt: '2099-01-02T00:00:00.000Z' });
    expect(JSON.stringify(change)).not.toContain('Otro"');
  });

  it('sin cambios reales devuelve una lista vacía', () => {
    const change = diffAssignment(current, {
      dueAt: new Date('2099-01-01T00:00:00Z'),
      noSubmissionGrade: '0.00',
    });
    expect(change.changedFields).toEqual([]);
  });

  it('auditSnapshot no incluye título ni instrucciones', () => {
    const snap = auditSnapshot({ ...current, courseSectionId: 'cs', periodId: 'p' });
    expect(snap).not.toHaveProperty('title');
    expect(snap).not.toHaveProperty('instructions');
    expect(snap).toMatchObject({ dueAt: '2099-01-01T00:00:00.000Z', noSubmissionGrade: '0.00' });
  });
});

describe('checkNoSubmissionLiteral (tres niveles)', () => {
  it('RN-05: el literal de NE vale en INICIAL y PRIMARIA y se rechaza en SECUNDARIA', () => {
    expect(checkNoSubmissionLiteral('INICIAL', 'C')).toBeNull();
    expect(checkNoSubmissionLiteral('PRIMARIA', 'B')).toBeNull();
    expect(checkNoSubmissionLiteral('PRIMARIA', null)).toBeNull();
    expect(checkNoSubmissionLiteral('SECUNDARIA', null)).toBeNull();
    expect(checkNoSubmissionLiteral('SECUNDARIA', 'A')).toBe(NO_SUBMISSION_LITERAL_NUMERIC);
  });

  it('RN-05: el DTO solo acepta AD, A, B o C y por defecto null', () => {
    const base = {
      periodId: '00000000-0000-7000-8000-000000000001',
      title: 'T',
      instructions: 'I',
      dueAt: '2099-01-01T00:00:00Z',
    };
    expect(createAssignmentSchema.parse(base).noSubmissionLiteral).toBeNull();
    expect(
      createAssignmentSchema.parse({ ...base, noSubmissionLiteral: 'AD' }).noSubmissionLiteral,
    ).toBe('AD');
    expect(createAssignmentSchema.safeParse({ ...base, noSubmissionLiteral: 'D' }).success).toBe(
      false,
    );
  });
});
