import { describe, expect, it } from 'vitest';
import {
  acceptsSubmissions,
  buildAssignmentBody,
  checkPdf,
  formatDelay,
  formatSize,
  localToIso,
  statusLabel,
  validateAssignment,
  type NewAssignmentInput,
} from './assignment-format';

const NOW = new Date('2026-10-29T12:00:00-05:00');
const base: NewAssignmentInput = {
  periodId: '01a17953-1c63-7091-a5c5-ef1ae3d44596',
  title: '  Práctica 1 ',
  instructions: 'Resolver los ejercicios',
  dueLocal: '2026-11-05T23:59',
  noSubmissionGrade: '0',
  maxSizeMiB: '20',
  allowLate: false,
};

describe('localToIso', () => {
  it('agrega la zona de Lima', () => {
    expect(localToIso('2026-11-05T23:59')).toBe('2026-11-05T23:59:00-05:00');
  });
  it('rechaza valores vacíos o mal formados', () => {
    expect(localToIso('')).toBeNull();
    expect(localToIso('2026-11-05')).toBeNull();
    expect(localToIso('2026-13-45T99:99')).toBeNull();
  });
});

describe('buildAssignmentBody (RF-28, RN-05, RN-08)', () => {
  it('arma el cuerpo con valores por defecto', () => {
    const r = buildAssignmentBody(base, NOW);
    expect(r).toEqual({
      ok: true,
      body: {
        periodId: base.periodId,
        title: 'Práctica 1',
        instructions: 'Resolver los ejercicios',
        dueAt: '2026-11-05T23:59:00-05:00',
        noSubmissionGrade: '0',
        maxSizeBytes: 20971520,
        allowLate: false,
      },
    });
  });

  it('acepta coma decimal, 20 y 50 MiB', () => {
    const r = buildAssignmentBody({ ...base, noSubmissionGrade: '10,5', maxSizeMiB: '50' }, NOW);
    expect(r.ok && r.body).toMatchObject({ noSubmissionGrade: '10.5', maxSizeBytes: 52428800 });
    expect(buildAssignmentBody({ ...base, noSubmissionGrade: '20.00' }, NOW).ok).toBe(true);
  });

  it.each([
    [{ periodId: '' }],
    [{ title: '   ' }],
    [{ instructions: '' }],
    [{ dueLocal: '' }],
    [{ dueLocal: '2026-10-29T11:00' }],
    [{ noSubmissionGrade: '20.01' }],
    [{ noSubmissionGrade: '-1' }],
    [{ noSubmissionGrade: '1.234' }],
    [{ maxSizeMiB: '51' }],
    [{ maxSizeMiB: '0' }],
    [{ maxSizeMiB: '2.5' }],
  ])('rechaza %j con un mensaje', (patch) => {
    const r = buildAssignmentBody({ ...base, ...patch }, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message.length).toBeGreaterThan(5);
  });
});

describe('formatos', () => {
  it('rótulos de RF-38', () => {
    expect(statusLabel('SUBMITTED_LATE')).toBe('Entregada con retraso');
    expect(statusLabel('NOT_SUBMITTED')).toBe('No entregada (NE)');
    expect(statusLabel('OTRO')).toBe('OTRO');
  });
  it('atraso y tamaño', () => {
    expect(formatDelay(40)).toBe('40 s');
    expect(formatDelay(125 * 60)).toBe('2 h 5 min');
    expect(formatDelay(3 * 86_400 + 3_600)).toBe('3 d 1 h');
    expect(formatSize(512)).toBe('1 KiB');
    expect(formatSize(20971520)).toBe('20 MiB');
  });
  it('checkPdf', () => {
    expect(checkPdf({ name: 'a.PDF', size: 10 }, 100)).toBeNull();
    expect(checkPdf({ name: 'a.docx', size: 10 }, 100)).toMatch(/PDF/);
    expect(checkPdf({ name: 'a.pdf', size: 0 }, 100)).toMatch(/vacío/);
    expect(checkPdf({ name: 'a.pdf', size: 101 }, 100)).toMatch(/supera/);
  });
});

describe('acceptsSubmissions (RF-37, RN-10)', () => {
  const a = { periodIsOpen: true, allowLate: false, dueAt: '2026-10-29T12:00:00-05:00' };
  it('antes del plazo sí; después solo con tardías; período cerrado nunca', () => {
    expect(acceptsSubmissions(a, new Date('2026-10-29T11:59:00-05:00'))).toBe(true);
    expect(acceptsSubmissions(a, new Date('2026-10-29T12:01:00-05:00'))).toBe(false);
    expect(acceptsSubmissions({ ...a, allowLate: true }, new Date('2026-12-01'))).toBe(true);
    expect(acceptsSubmissions({ ...a, periodIsOpen: false }, new Date('2026-01-01'))).toBe(false);
  });
});

describe('validateAssignment (validación por campo)', () => {
  it('devuelve un mensaje por campo y el primero en el orden del formulario', () => {
    const r = validateAssignment(
      { ...base, title: ' ', dueLocal: '2026-10-29T11:00', maxSizeMiB: '60' },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['dueLocal', 'maxSizeMiB', 'title']);
    expect(r.first).toBe('title');
    expect(r.errors.dueLocal).toMatch(/futura/);
  });

  it('sin errores devuelve el cuerpo', () => {
    expect(validateAssignment(base, NOW).ok).toBe(true);
  });
});

describe('checkPdf: mensajes distintos para tipo y tamaño', () => {
  it('tipo y tamaño no comparten mensaje', () => {
    const tipo = checkPdf({ name: 'a.png', size: 10 }, 100);
    const peso = checkPdf({ name: 'a.pdf', size: 2 * 1024 * 1024 }, 1024 * 1024);
    expect(tipo).toMatch(/no es un PDF/);
    expect(peso).toMatch(/2 MiB.*1 MiB/);
  });
});
