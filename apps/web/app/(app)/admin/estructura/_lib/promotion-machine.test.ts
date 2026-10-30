import { describe, expect, it } from 'vitest';
import {
  allowedActions,
  canConfirm,
  canOfferPromotion,
  defaultSection,
  groupBySection,
  initPromotionState,
  mapDetails,
  parseCommitInput,
  previousYearOf,
  promotionReducer,
  resultMessage,
  sectionChoices,
  STALE_MESSAGE,
  summarize,
  summaryLines,
  toPayload,
  type PromotionItem,
  type PromotionProposal,
  type PromotionState,
} from './promotion-machine';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Secciones destino: 2A (id 21), 2B (22), 3A (31), 1A (11), 5A (51).
const targetSections = [
  { id: id(11), gradeLevel: 1, code: 'A' },
  { id: id(21), gradeLevel: 2, code: 'A' },
  { id: id(22), gradeLevel: 2, code: 'B' },
  { id: id(31), gradeLevel: 3, code: 'A' },
  { id: id(51), gradeLevel: 5, code: 'A' },
];

const item = (
  n: number,
  grade: number,
  code: string,
  proposed: PromotionItem['proposed'],
  flags: PromotionItem['flags'] = [],
): PromotionItem => ({
  enrollmentId: id(100 + n),
  studentId: id(200 + n),
  fullName: `Estudiante ${n}`,
  status: flags.includes('WITHDRAWN')
    ? 'WITHDRAWN'
    : flags.includes('INACTIVE')
      ? 'INACTIVE'
      : 'ACTIVE',
  from: { sectionId: id(300 + grade * 10 + code.charCodeAt(0) - 64), gradeLevel: grade, code },
  proposed,
  flags,
});

const items: PromotionItem[] = [
  item(1, 1, 'A', { action: 'PROMOTE', sectionId: id(21) }),
  item(2, 1, 'A', { action: 'PROMOTE', sectionId: id(21) }, ['INACTIVE']),
  item(3, 1, 'C', { action: 'PROMOTE', sectionId: null }, ['NO_TARGET_SECTION']),
  item(4, 1, 'A', { action: 'EXCLUDE', sectionId: null }, ['WITHDRAWN']),
  item(5, 5, 'A', { action: 'GRADUATE', sectionId: null }),
];

const proposal: PromotionProposal = {
  sourceYear: { id: id(1), year: 2026 },
  targetYear: { id: id(2), year: 2027 },
  fingerprint: 'a'.repeat(64),
  targetSections,
  items,
  summary: { promote: 3, repeat: 0, graduate: 1, exclude: 1, withoutSection: 1 },
  canConfirm: false,
};

const eid = (n: number) => id(100 + n);
const run = (state: PromotionState, ...events: Parameters<typeof promotionReducer>[1][]) =>
  events.reduce(promotionReducer, state);

describe('reglas de fila (RF-16, regla B6)', () => {
  it('acciones permitidas según grado y marcas', () => {
    expect(allowedActions(items[0])).toEqual(['PROMOTE', 'REPEAT', 'EXCLUDE']);
    expect(allowedActions(items[3])).toEqual(['EXCLUDE']);
    expect(allowedActions(items[4])).toEqual(['GRADUATE', 'REPEAT', 'EXCLUDE']);
    expect(allowedActions({ ...items[0], flags: ['ALREADY_ENROLLED'] })).toEqual(['EXCLUDE']);
  });

  it('secciones elegibles y sección por defecto (mismo código, o la única)', () => {
    expect(sectionChoices(items[0], 'PROMOTE', targetSections).map((s) => s.code)).toEqual([
      'A',
      'B',
    ]);
    expect(sectionChoices(items[0], 'EXCLUDE', targetSections)).toEqual([]);
    expect(defaultSection(items[0], 'REPEAT', targetSections)).toBe(id(11));
    expect(defaultSection(items[2], 'PROMOTE', targetSections)).toBeNull(); // 2C no existe, hay dos
    expect(defaultSection(items[2], 'REPEAT', targetSections)).toBe(id(11)); // única de 1.º
  });
});

describe('promotionReducer (RF-16)', () => {
  const start = initPromotionState(proposal);

  it('arranca con la propuesta; no se confirma mientras falte una sección', () => {
    expect(start.decisions[eid(1)]).toEqual({ action: 'PROMOTE', sectionId: id(21) });
    expect(summarize(start)).toEqual(proposal.summary);
    expect(canConfirm(start)).toBe(false);
  });

  it('elegir la sección que faltaba habilita confirmar', () => {
    const s = run(start, { type: 'SET_SECTION', enrollmentId: eid(3), sectionId: id(22) });
    expect(s.decisions[eid(3)]).toEqual({ action: 'PROMOTE', sectionId: id(22) });
    expect(canConfirm(s)).toBe(true);
  });

  it('ignora secciones de otro grado, acciones no permitidas y quitar sección en EXCLUDE', () => {
    expect(run(start, { type: 'SET_SECTION', enrollmentId: eid(1), sectionId: id(31) })).toBe(
      start,
    );
    expect(run(start, { type: 'SET_ACTION', enrollmentId: eid(4), action: 'PROMOTE' })).toBe(start);
    expect(run(start, { type: 'SET_ACTION', enrollmentId: eid(1), action: 'GRADUATE' })).toBe(
      start,
    );
    expect(run(start, { type: 'SET_SECTION', enrollmentId: eid(4), sectionId: null })).toBe(start);
  });

  it('cambiar la acción elige la sección por defecto; EXCLUDE y GRADUATE no llevan sección', () => {
    let s = run(start, { type: 'SET_ACTION', enrollmentId: eid(1), action: 'REPEAT' });
    expect(s.decisions[eid(1)]).toEqual({ action: 'REPEAT', sectionId: id(11) });
    s = run(s, { type: 'SET_ACTION', enrollmentId: eid(1), action: 'PROMOTE' });
    expect(s.decisions[eid(1)]).toEqual({ action: 'PROMOTE', sectionId: id(21) });
    s = run(s, { type: 'SET_ACTION', enrollmentId: eid(5), action: 'EXCLUDE' });
    expect(s.decisions[eid(5)]).toEqual({ action: 'EXCLUDE', sectionId: null });
  });

  it('acción en bloque por sección: respeta las filas que solo admiten EXCLUDE', () => {
    const group = items[0].from.sectionId; // 1A: filas 1, 2 y 4
    const s = run(start, {
      type: 'BULK',
      fromSectionId: group,
      action: 'PROMOTE',
      sectionId: id(22),
    });
    expect(s.decisions[eid(1)]).toEqual({ action: 'PROMOTE', sectionId: id(22) });
    expect(s.decisions[eid(2)]).toEqual({ action: 'PROMOTE', sectionId: id(22) });
    expect(s.decisions[eid(4)]).toEqual({ action: 'EXCLUDE', sectionId: null });
    expect(s.decisions[eid(3)]).toEqual(start.decisions[eid(3)]); // otra sección

    const repeat = run(start, {
      type: 'BULK',
      fromSectionId: group,
      action: 'REPEAT',
      sectionId: null,
    });
    expect(repeat.decisions[eid(1)]).toEqual({ action: 'REPEAT', sectionId: id(11) });
  });

  it('RESET_ROWS vuelve a la propuesta', () => {
    const s = run(
      start,
      { type: 'SET_ACTION', enrollmentId: eid(1), action: 'EXCLUDE' },
      { type: 'RESET_ROWS' },
    );
    expect(s.decisions).toEqual(start.decisions);
  });

  const ready = run(start, { type: 'SET_SECTION', enrollmentId: eid(3), sectionId: id(22) });

  it('CONFIRM → confirmando (y nada se edita); COMMIT_OK → hecho', () => {
    const s = run(ready, { type: 'CONFIRM' });
    expect(s.phase).toBe('confirmando');
    expect(run(s, { type: 'SET_ACTION', enrollmentId: eid(1), action: 'EXCLUDE' })).toBe(s);
    const result = {
      promoted: 3,
      repeated: 0,
      graduated: 1,
      excluded: 1,
      closedEnrollments: 4,
      createdEnrollments: 3,
    };
    const done = run(s, { type: 'COMMIT_OK', result });
    expect(done).toMatchObject({ phase: 'hecho', result });
    expect(run(start, { type: 'CONFIRM' })).toBe(start); // sin sección: no confirma
  });

  it('409 (huella u otra carrera) → desactualizada con el aviso de volver a cargar', () => {
    const s = run(
      ready,
      { type: 'CONFIRM' },
      { type: 'COMMIT_FAILED', status: 409, message: 'La propuesta cambió; vuelve a cargarla' },
    );
    expect(s).toMatchObject({ phase: 'desactualizada', message: STALE_MESSAGE });
    expect(canConfirm(s)).toBe(false);
  });

  it('LOAD con una propuesta nueva reinicia desde desactualizada; no pisa el resultado', () => {
    const stale = run(
      ready,
      { type: 'CONFIRM' },
      { type: 'COMMIT_FAILED', status: 409, message: '' },
    );
    const fresh = { ...proposal, fingerprint: 'c'.repeat(64), items: items.slice(0, 2) };
    const loaded = run(stale, { type: 'LOAD', proposal: fresh });
    expect(loaded).toMatchObject({ phase: 'editando', message: null });
    expect(Object.keys(loaded.decisions)).toEqual([eid(1), eid(2)]);
    expect(run(ready, { type: 'LOAD', proposal })).toBe(ready); // misma huella: sin cambios
    const done = run(
      ready,
      { type: 'CONFIRM' },
      {
        type: 'COMMIT_OK',
        result: {
          promoted: 0,
          repeated: 0,
          graduated: 0,
          excluded: 0,
          closedEnrollments: 0,
          createdEnrollments: 0,
        },
      },
    );
    expect(run(done, { type: 'LOAD', proposal: fresh })).toBe(done);
  });

  it('422 → editando con errores por fila; corregir la fila borra su error', () => {
    const s = run(
      ready,
      { type: 'CONFIRM' },
      {
        type: 'COMMIT_FAILED',
        status: 422,
        message: 'La operación no cumple las reglas del sistema.',
        details: [
          { path: 'decisions.0', message: 'Elige la sección de destino' },
          { path: 'decisions', message: 'Faltan decisiones para 1 matrícula' },
        ],
      },
    );
    expect(s.phase).toBe('editando');
    expect(s.rowErrors).toEqual({ [eid(1)]: 'Elige la sección de destino' });
    expect(s.generalErrors).toEqual(['Faltan decisiones para 1 matrícula']);
    const fixed = run(s, { type: 'SET_SECTION', enrollmentId: eid(1), sectionId: id(22) });
    expect(fixed.rowErrors).toEqual({});
  });

  it('otros errores (403, 5xx) → editando con el mensaje, se puede reintentar', () => {
    const s = run(
      ready,
      { type: 'CONFIRM' },
      { type: 'COMMIT_FAILED', status: 503, message: 'El servidor tuvo un problema.' },
    );
    expect(s).toMatchObject({ phase: 'editando', message: 'El servidor tuvo un problema.' });
    expect(canConfirm(s)).toBe(true);
  });
});

describe('derivados (RF-16)', () => {
  const ready = promotionReducer(initPromotionState(proposal), {
    type: 'SET_SECTION',
    enrollmentId: eid(3),
    sectionId: id(22),
  });

  it('toPayload sigue el orden de la propuesta y omite sectionId nulo', () => {
    expect(toPayload(ready)).toEqual([
      { enrollmentId: eid(1), action: 'PROMOTE', sectionId: id(21) },
      { enrollmentId: eid(2), action: 'PROMOTE', sectionId: id(21) },
      { enrollmentId: eid(3), action: 'PROMOTE', sectionId: id(22) },
      { enrollmentId: eid(4), action: 'EXCLUDE' },
      { enrollmentId: eid(5), action: 'GRADUATE' },
    ]);
  });

  it('mapDetails ignora índices fuera de rango y repite una sola vez los generales', () => {
    expect(
      mapDetails(ready, [
        { path: 'decisions.99', message: 'x' },
        { path: 'decisions.99', message: 'x' },
      ]),
    ).toEqual({ rowErrors: {}, generalErrors: ['x'] });
  });

  it('agrupa por sección de origen en orden de grado y código', () => {
    const groups = groupBySection([items[4], ...items.slice(0, 4)]);
    expect(groups.map((g) => `${g.gradeLevel}${g.code}:${g.items.length}`)).toEqual([
      '1A:3',
      '1C:1',
      '5A:1',
    ]);
  });

  it('textos del resumen y del resultado', () => {
    expect(summaryLines(summarize(initPromotionState(proposal)))).toEqual([
      '3 promueven',
      '0 repiten',
      '1 egresa',
      '1 se excluye',
      '1 fila sin sección elegida',
    ]);
    expect(
      resultMessage({
        promoted: 1,
        repeated: 0,
        graduated: 0,
        excluded: 0,
        closedEnrollments: 1,
        createdEnrollments: 1,
      }),
    ).toBe('Promoción confirmada: 1 matrícula cerrada y 1 matrícula nueva.');
  });

  it('año anterior y cuándo ofrecer el enlace', () => {
    const years = [
      { id: id(1), year: 2026 },
      { id: id(2), year: 2027 },
    ];
    expect(previousYearOf(years, { year: 2027 })).toEqual(years[0]);
    expect(previousYearOf(years, { year: 2026 })).toBeNull();
    const open = { closedAt: null, readOnly: false };
    expect(canOfferPromotion(open, [{ isActive: true }])).toBe(true);
    expect(canOfferPromotion(open, [{ isActive: false }])).toBe(false);
    expect(canOfferPromotion({ closedAt: null, readOnly: true }, [{ isActive: true }])).toBe(false);
    expect(canOfferPromotion({ closedAt: 'x', readOnly: true }, [{ isActive: true }])).toBe(false);
  });
});

describe('casos límite de la máquina (RF-16)', () => {
  const start = initPromotionState(proposal);
  const ready = run(start, { type: 'SET_SECTION', enrollmentId: eid(3), sectionId: id(22) });

  it('GRADUATE en 5.º no admite sección; REPEAT en 5.º elige la única de 5.º', () => {
    expect(run(start, { type: 'SET_SECTION', enrollmentId: eid(5), sectionId: id(51) })).toBe(
      start,
    );
    const s = run(start, { type: 'SET_ACTION', enrollmentId: eid(5), action: 'REPEAT' });
    expect(s.decisions[eid(5)]).toEqual({ action: 'REPEAT', sectionId: id(51) });
  });

  it('quitar la sección a una fila PROMOTE la deja sin sección y bloquea confirmar', () => {
    const s = run(ready, { type: 'SET_SECTION', enrollmentId: eid(1), sectionId: null });
    expect(s.decisions[eid(1)]).toEqual({ action: 'PROMOTE', sectionId: null });
    expect(canConfirm(s)).toBe(false);
    expect(summarize(s).withoutSection).toBe(1);
  });

  it('no edita en desactualizada ni en hecho; COMMIT_* fuera de confirmando se ignora', () => {
    const stale = run(
      ready,
      { type: 'CONFIRM' },
      { type: 'COMMIT_FAILED', status: 409, message: '' },
    );
    expect(run(stale, { type: 'SET_ACTION', enrollmentId: eid(1), action: 'EXCLUDE' })).toBe(stale);
    expect(
      run(stale, {
        type: 'BULK',
        fromSectionId: items[0].from.sectionId,
        action: 'EXCLUDE',
        sectionId: null,
      }),
    ).toBe(stale);
    expect(run(stale, { type: 'RESET_ROWS' })).toBe(stale);
    expect(run(stale, { type: 'CONFIRM' })).toBe(stale);
    expect(run(ready, { type: 'COMMIT_FAILED', status: 409, message: '' })).toBe(ready);
    const result = {
      promoted: 0,
      repeated: 0,
      graduated: 0,
      excluded: 0,
      closedEnrollments: 0,
      createdEnrollments: 0,
    };
    expect(run(ready, { type: 'COMMIT_OK', result })).toBe(ready);
  });

  it('BULK sobre una sección inexistente no cambia nada; BULK de 5.º respeta GRADUATE', () => {
    expect(
      run(start, { type: 'BULK', fromSectionId: id(999), action: 'EXCLUDE', sectionId: null }),
    ).toBe(start);
    const s = run(start, {
      type: 'BULK',
      fromSectionId: items[4].from.sectionId,
      action: 'GRADUATE',
      sectionId: null,
    });
    expect(s.decisions[eid(5)]).toEqual({ action: 'GRADUATE', sectionId: null });
  });

  it('sin filas no se confirma; 422 repetido no duplica el mensaje general', () => {
    const empty = initPromotionState({ ...proposal, items: [] });
    expect(canConfirm(empty)).toBe(false);
    expect(run(empty, { type: 'CONFIRM' })).toBe(empty);
    const s = run(
      ready,
      { type: 'CONFIRM' },
      {
        type: 'COMMIT_FAILED',
        status: 422,
        message: 'm',
        details: [
          { path: 'decisions', message: 'Faltan decisiones para 2 matrículas' },
          { path: 'decisions', message: 'Faltan decisiones para 2 matrículas' },
        ],
      },
    );
    expect(s.generalErrors).toEqual(['Faltan decisiones para 2 matrículas']);
  });
});

describe('parseCommitInput (entrada de la Server Action)', () => {
  const fp = 'b'.repeat(64);
  const d = { enrollmentId: eid(1), action: 'PROMOTE', sectionId: id(21) };

  it('acepta exactamente 2000 decisiones', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ ...d, enrollmentId: id(i + 1) }));
    expect(parseCommitInput(id(1), fp, many).ok).toBe(true);
  });

  it('acepta datos bien formados y descarta nada más', () => {
    expect(parseCommitInput(id(1), fp, [d, { enrollmentId: eid(2), action: 'EXCLUDE' }])).toEqual({
      ok: true,
      sourceYearId: id(1),
      fingerprint: fp,
      decisions: [d, { enrollmentId: eid(2), action: 'EXCLUDE' }],
    });
  });

  it('rechaza ids, huella, acciones, campos extra, repetidos y listas vacías o enormes', () => {
    const bad = [
      parseCommitInput('2026', fp, [d]),
      parseCommitInput(id(1), 'B'.repeat(64), [d]),
      parseCommitInput(id(1), fp, []),
      parseCommitInput(id(1), fp, 'x'),
      parseCommitInput(id(1), fp, [{ ...d, action: 'MOVE' }]),
      parseCommitInput(id(1), fp, [{ ...d, sectionId: 'x' }]),
      parseCommitInput(id(1), fp, [{ ...d, extra: 1 }]),
      parseCommitInput(id(1), fp, [d, d]),
      parseCommitInput(
        id(1),
        fp,
        Array.from({ length: 2001 }, (_, i) => ({ ...d, enrollmentId: id(i) })),
      ),
    ];
    for (const r of bad) expect(r.ok).toBe(false);
  });
});
