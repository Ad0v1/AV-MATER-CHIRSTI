import {
  allowedActions,
  countDecisions,
  pickSection,
  promotionFingerprint,
  proposePromotion,
  validateDecisions,
  type SourceEnrollment,
  type TargetSection,
} from './promotion-policy.js';

const enr = (
  n: number,
  grade: number,
  code: string,
  name: string,
  status: SourceEnrollment['status'] = 'ACTIVE',
): SourceEnrollment => ({
  enrollmentId: `e${n}`,
  studentId: `s${n}`,
  fullName: name,
  status,
  section: { id: `src-${grade}${code}`, gradeLevel: grade, code },
});

const target: TargetSection[] = [
  { id: 't2A', gradeLevel: 2, code: 'A' },
  { id: 't3A', gradeLevel: 3, code: 'A' },
  { id: 't3B', gradeLevel: 3, code: 'B' },
  { id: 't4X', gradeLevel: 4, code: 'X' },
  { id: 't5A', gradeLevel: 5, code: 'A' },
];

const source: SourceEnrollment[] = [
  enr(1, 2, 'B', 'Zoe'), // 3B existe
  enr(2, 2, 'A', 'Ana'), // 3A existe
  enr(3, 1, 'A', 'Luis'), // 2A existe
  enr(4, 3, 'A', 'Eva'), // 4A no existe; única de 4.º es 4X
  enr(5, 5, 'A', 'Raúl'), // egresa
  enr(6, 1, 'B', 'Inés', 'INACTIVE'), // 2B no existe; única de 2.º es 2A
  enr(7, 2, 'C', 'Óscar'), // 3C no existe y hay dos de 3.º → sin sección
  enr(8, 2, 'A', 'Beto', 'WITHDRAWN'),
  enr(9, 2, 'A', 'Carla'), // ya matriculada en el destino
];

describe('pickSection (RF-16)', () => {
  it('mismo código; si no, la única del grado; si hay varias o ninguna, null', () => {
    expect(pickSection(target, 3, 'B')).toBe('t3B');
    expect(pickSection(target, 4, 'A')).toBe('t4X');
    expect(pickSection(target, 3, 'C')).toBeNull();
    expect(pickSection(target, 1, 'A')).toBeNull();
  });
});

describe('proposePromotion (RF-16, RN-15)', () => {
  const proposal = proposePromotion(source, target, new Set(['s9']));
  const byId = new Map(proposal.items.map((i) => [i.enrollmentId, i]));

  it('ordena por grado, código y nombre', () => {
    expect(proposal.items.map((i) => i.enrollmentId)).toEqual([
      'e3',
      'e6',
      'e2',
      'e8',
      'e9',
      'e1',
      'e7',
      'e4',
      'e5',
    ]);
  });

  it('grados 1..4 promueven a grado+1 (mismo código o la única); 5.º egresa', () => {
    expect(byId.get('e1')!.proposed).toEqual({ action: 'PROMOTE', sectionId: 't3B' });
    expect(byId.get('e2')!.proposed).toEqual({ action: 'PROMOTE', sectionId: 't3A' });
    expect(byId.get('e4')!.proposed).toEqual({ action: 'PROMOTE', sectionId: 't4X' });
    expect(byId.get('e5')!.proposed).toEqual({ action: 'GRADUATE', sectionId: null });
    expect(byId.get('e5')!.flags).toEqual([]);
  });

  it('marca INACTIVE (sin cambiar la acción), NO_TARGET_SECTION, WITHDRAWN y ALREADY_ENROLLED', () => {
    expect(byId.get('e6')!).toMatchObject({
      proposed: { action: 'PROMOTE', sectionId: 't2A' },
      flags: ['INACTIVE'],
    });
    expect(byId.get('e7')!).toMatchObject({
      proposed: { action: 'PROMOTE', sectionId: null },
      flags: ['NO_TARGET_SECTION'],
    });
    expect(byId.get('e8')!).toMatchObject({
      proposed: { action: 'EXCLUDE', sectionId: null },
      flags: ['WITHDRAWN'],
    });
    expect(byId.get('e9')!).toMatchObject({
      proposed: { action: 'EXCLUDE', sectionId: null },
      flags: ['ALREADY_ENROLLED'],
    });
  });

  it('resumen por acción y canConfirm falso si falta una sección', () => {
    expect(proposal.summary).toEqual({
      promote: 6,
      repeat: 0,
      graduate: 1,
      exclude: 2,
      withoutSection: 1,
    });
    expect(proposal.canConfirm).toBe(false);
    expect(proposePromotion([source[0]], target, new Set()).canConfirm).toBe(true);
  });

  it('sin matrículas: propuesta vacía y confirmable', () => {
    expect(proposePromotion([], target, new Set())).toEqual({
      items: [],
      summary: { promote: 0, repeat: 0, graduate: 0, exclude: 0, withoutSection: 0 },
      canConfirm: true,
    });
  });
});

describe('casos límite de la propuesta (RF-16)', () => {
  it('grado 4 sin 5.º del mismo código: usa la única activa de 5.º', () => {
    const sections: TargetSection[] = [{ id: 'u5', gradeLevel: 5, code: 'Z' }];
    expect(
      proposePromotion([enr(1, 4, 'A', 'Ana')], sections, new Set()).items[0].proposed,
    ).toEqual({ action: 'PROMOTE', sectionId: 'u5' });
  });

  it('varias secciones destino sin coincidencia de código → null y NO_TARGET_SECTION', () => {
    const sections: TargetSection[] = [
      { id: 'a', gradeLevel: 5, code: 'X' },
      { id: 'b', gradeLevel: 5, code: 'Y' },
    ];
    expect(pickSection(sections, 5, 'A')).toBeNull();
    const p = proposePromotion([enr(1, 4, 'A', 'Ana')], sections, new Set());
    expect(p.items[0].proposed).toEqual({ action: 'PROMOTE', sectionId: null });
    expect(p.items[0].flags).toEqual(['NO_TARGET_SECTION']);
    expect(p.canConfirm).toBe(false);
  });

  it('INACTIVE y sin sección destino acumula ambas marcas; el 5.º no marca NO_TARGET_SECTION', () => {
    const p = proposePromotion(
      [enr(1, 1, 'A', 'Ana', 'INACTIVE'), enr(2, 5, 'A', 'Raúl')],
      [],
      new Set(),
    );
    expect(p.items[0].flags).toEqual(['INACTIVE', 'NO_TARGET_SECTION']);
    expect(p.items[1].flags).toEqual([]);
  });

  it('retirado que además ya está matriculado: EXCLUDE con ambas marcas', () => {
    const p = proposePromotion([enr(1, 2, 'A', 'Ana', 'WITHDRAWN')], target, new Set(['s1']));
    expect(p.items[0].flags).toEqual(['WITHDRAWN', 'ALREADY_ENROLLED']);
    expect(p.items[0].proposed.action).toBe('EXCLUDE');
  });
});

describe('allowedActions (RF-16)', () => {
  it('fila retirada o ya matriculada en 5.º solo admite EXCLUDE', () => {
    expect(allowedActions({ flags: ['WITHDRAWN'], from: { gradeLevel: 5 } })).toEqual(['EXCLUDE']);
    expect(
      allowedActions({ flags: ['INACTIVE', 'ALREADY_ENROLLED'], from: { gradeLevel: 1 } }),
    ).toEqual(['EXCLUDE']);
  });

  it('retirados y ya matriculados solo EXCLUDE; 5.º sin PROMOTE; 1..4 sin GRADUATE', () => {
    expect(allowedActions({ flags: ['WITHDRAWN'], from: { gradeLevel: 2 } })).toEqual(['EXCLUDE']);
    expect(allowedActions({ flags: ['ALREADY_ENROLLED'], from: { gradeLevel: 5 } })).toEqual([
      'EXCLUDE',
    ]);
    expect(allowedActions({ flags: [], from: { gradeLevel: 5 } })).toEqual([
      'GRADUATE',
      'REPEAT',
      'EXCLUDE',
    ]);
    expect(allowedActions({ flags: ['INACTIVE'], from: { gradeLevel: 1 } })).toEqual([
      'PROMOTE',
      'REPEAT',
      'EXCLUDE',
    ]);
  });
});

describe('validateDecisions (RF-16)', () => {
  const { items } = proposePromotion(source, target, new Set(['s9']));
  const accepted = items.map((i) => ({
    enrollmentId: i.enrollmentId,
    action: i.proposed.action,
    ...(i.proposed.sectionId ? { sectionId: i.proposed.sectionId } : {}),
  }));
  // e7 no tiene sección propuesta: se le elige 3A.
  const full = accepted.map((d) => (d.enrollmentId === 'e7' ? { ...d, sectionId: 't3A' } : d));

  it('acepta decisiones completas y válidas', () => {
    const result = validateDecisions(items, target, full);
    expect(result.issues).toEqual([]);
    expect(result.decisions).toHaveLength(items.length);
    expect(result.decisions.find((d) => d.enrollmentId === 'e7')).toEqual({
      enrollmentId: 'e7',
      studentId: 's7',
      action: 'PROMOTE',
      sectionId: 't3A',
    });
    expect(countDecisions(result.decisions)).toEqual({
      promoted: 6,
      repeated: 0,
      graduated: 1,
      excluded: 2,
    });
  });

  it('PROMOTE sin sección y faltantes: 422 con path', () => {
    const result = validateDecisions(items, target, accepted.slice(0, -1));
    expect(result.decisions).toEqual([]);
    expect(result.issues).toContainEqual({
      path: `decisions.${accepted.findIndex((d) => d.enrollmentId === 'e7')}`,
      message: 'Elige la sección de destino',
    });
    expect(result.issues).toContainEqual({
      path: 'decisions',
      message: 'Faltan decisiones para 1 matrícula',
    });
  });

  it('rechaza acciones no permitidas, grados equivocados, secciones ajenas y sobras', () => {
    const swap = (id: string, d: object) =>
      full.map((x) => (x.enrollmentId === id ? { enrollmentId: id, ...d } : x));
    const idx = (id: string) => full.findIndex((d) => d.enrollmentId === id);
    const cases: [object[], string, string][] = [
      [swap('e8', { action: 'PROMOTE', sectionId: 't3A' }), 'e8', 'La acción no está permitida'],
      [swap('e5', { action: 'PROMOTE', sectionId: 't5A' }), 'e5', 'La acción no está permitida'],
      [swap('e2', { action: 'GRADUATE' }), 'e2', 'La acción no está permitida'],
      [swap('e2', { action: 'PROMOTE', sectionId: 't2A' }), 'e2', 'debe ser de 3.º grado'],
      [swap('e2', { action: 'REPEAT', sectionId: 't3A' }), 'e2', 'debe ser de 2.º grado'],
      [swap('e2', { action: 'PROMOTE', sectionId: 'otra' }), 'e2', 'no es una sección activa'],
      [swap('e5', { action: 'GRADUATE', sectionId: 't5A' }), 'e5', 'no lleva sección'],
      [swap('e8', { action: 'EXCLUDE', sectionId: 't3A' }), 'e8', 'no lleva sección'],
    ];
    for (const [decisions, id, message] of cases) {
      const result = validateDecisions(items, target, decisions as never);
      expect(result.issues, `${id} ${message}`).toHaveLength(1);
      expect(result.issues[0].path).toBe(`decisions.${idx(id)}`);
      expect(result.issues[0].message).toContain(message);
    }
    const extra = validateDecisions(items, target, [
      ...full,
      { enrollmentId: 'otra', action: 'EXCLUDE' },
      { enrollmentId: 'e1', action: 'EXCLUDE' },
    ]);
    expect(extra.issues.map((i) => i.message)).toEqual([
      'La matrícula no está en la propuesta',
      'La matrícula está repetida',
    ]);
  });

  it('REPEAT sin sección, GRADUATE con sección y PROMOTE en 5.º son inválidos', () => {
    const idx = (id: string) => full.findIndex((d) => d.enrollmentId === id);
    const swap = (id: string, d: object) =>
      full.map((x) => (x.enrollmentId === id ? { enrollmentId: id, ...d } : x));
    const repeat = validateDecisions(items, target, swap('e2', { action: 'REPEAT' }) as never);
    expect(repeat.issues).toEqual([
      { path: `decisions.${idx('e2')}`, message: 'Elige la sección de destino' },
    ]);
    expect(repeat.decisions).toEqual([]);
    const grad = validateDecisions(
      items,
      target,
      swap('e2', { action: 'GRADUATE', sectionId: 't3A' }) as never,
    );
    expect(grad.issues).toEqual([
      {
        path: `decisions.${idx('e2')}`,
        message: 'La acción no está permitida para esta matrícula',
      },
    ]);
    const p5 = validateDecisions(
      items,
      target,
      swap('e5', { action: 'PROMOTE', sectionId: 't5A' }) as never,
    );
    expect(p5.issues[0].message).toBe('La acción no está permitida para esta matrícula');
  });

  it('retirado y ya matriculado solo admiten EXCLUDE sin sección', () => {
    for (const id of ['e8', 'e9']) {
      for (const action of ['REPEAT', 'GRADUATE', 'PROMOTE'] as const) {
        const ds = full.map((d) =>
          d.enrollmentId === id ? { enrollmentId: id, action, sectionId: 't2A' } : d,
        );
        expect(validateDecisions(items, target, ds).issues, `${id} ${action}`).toHaveLength(1);
      }
    }
  });

  it('lista vacía: faltan todas las decisiones', () => {
    const r = validateDecisions(items, target, []);
    expect(r.decisions).toEqual([]);
    expect(r.issues).toEqual([
      { path: 'decisions', message: 'Faltan decisiones para 9 matrículas' },
    ]);
  });

  it('REPEAT a una sección del mismo grado y GRADUATE en 5.º son válidos', () => {
    const decisions = full.map((d) =>
      d.enrollmentId === 'e2'
        ? { enrollmentId: 'e2', action: 'REPEAT' as const, sectionId: 't2A' }
        : d,
    );
    expect(validateDecisions(items, target, decisions).issues).toEqual([]);
  });
});

describe('promotionFingerprint (RF-16)', () => {
  const base = promotionFingerprint(source, target, new Set(['s9']));

  it('es SHA-256 en hex y no depende del orden', () => {
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(
      promotionFingerprint([...source].reverse(), [...target].reverse(), new Set(['s9'])),
    ).toBe(base);
  });

  it('es estable ante reordenamiento y repetible; cambia con el estado de una matrícula', () => {
    const shuffled = [
      source[4],
      source[0],
      source[8],
      source[2],
      ...source.filter((_, i) => ![4, 0, 8, 2].includes(i)),
    ];
    expect(promotionFingerprint(shuffled, target, new Set(['s9']))).toBe(base);
    expect(promotionFingerprint(source, target, new Set(['s9']))).toBe(base);
    const withdrawn = source.map((e) =>
      e.enrollmentId === 'e2' ? { ...e, status: 'WITHDRAWN' as const } : e,
    );
    expect(promotionFingerprint(withdrawn, target, new Set(['s9']))).not.toBe(base);
  });

  it('cambia si cambia una matrícula, un estado, una sección o los ya matriculados', () => {
    const changed = [
      promotionFingerprint(source.slice(1), target, new Set(['s9'])),
      promotionFingerprint(
        source.map((e, i) => (i === 0 ? { ...e, status: 'INACTIVE' as const } : e)),
        target,
        new Set(['s9']),
      ),
      promotionFingerprint(
        source.map((e, i) => (i === 0 ? { ...e, section: { ...e.section, id: 'otra' } } : e)),
        target,
        new Set(['s9']),
      ),
      promotionFingerprint(source, target.slice(1), new Set(['s9'])),
      promotionFingerprint(source, target, new Set()),
    ];
    for (const fp of changed) expect(fp).not.toBe(base);
  });
});
