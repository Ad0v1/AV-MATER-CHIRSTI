// Promoción en bloque (RF-16, RN-15; F6 entrega 6b). Máquina de estados de la pantalla y
// reglas de edición. Lógica pura, probada en promotion-machine.test.ts. La API decide (docs/03):
// aquí se repiten las reglas solo para guiar al admin antes de confirmar.
//
//   editando ──CONFIRM──▶ confirmando ──COMMIT_OK──▶ hecho
//   confirmando ──COMMIT_FAILED 409──▶ desactualizada (hay que volver a cargar la propuesta)
//   confirmando ──COMMIT_FAILED otro──▶ editando (con el mensaje y los errores por fila)
//   editando | desactualizada ──LOAD (propuesta nueva)──▶ editando
import { gradeLabel, nextGrade, sectionLabel, type EducationLevel } from './levels';
import { isUuid } from './validation';

export const PROMOTION_ACTIONS = ['PROMOTE', 'REPEAT', 'GRADUATE', 'EXCLUDE'] as const;
export type PromotionAction = (typeof PROMOTION_ACTIONS)[number];
export type PromotionFlag = 'INACTIVE' | 'WITHDRAWN' | 'NO_TARGET_SECTION' | 'ALREADY_ENROLLED';

/** Tres niveles (09/11/2026): INICIAL 5 años → PRIMARIA 1.°, PRIMARIA 6.° → SECUNDARIA 1.°, SECUNDARIA 5.° egresa. */
export type LevelGrade = { level: EducationLevel; gradeLevel: number };
type FromGrade = { level?: EducationLevel; gradeLevel: number };
const levelOf = (s: { level?: EducationLevel }): EducationLevel => s.level ?? 'SECUNDARIA';
const isFinalGrade = (from: FromGrade): boolean =>
  nextGrade(levelOf(from), from.gradeLevel) === null;
const LEVEL_ORDER: Record<EducationLevel, number> = { INICIAL: 0, PRIMARIA: 1, SECUNDARIA: 2 };

/** Etiqueta de la sección de origen o destino: "3.° Primaria A" (sin nivel, SECUNDARIA). */
export const promotionSectionLabel = (s: FromGrade & { code: string }): string =>
  sectionLabel(levelOf(s), s.gradeLevel, s.code);
export const MAX_DECISIONS = 2000;

export type TargetSection = {
  id: string;
  level?: EducationLevel;
  gradeLevel: number;
  code: string;
};

export type PromotionItem = {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN';
  from: { sectionId: string; level?: EducationLevel; gradeLevel: number; code: string };
  proposed: { action: PromotionAction; sectionId: string | null };
  flags: PromotionFlag[];
};

export type PromotionSummary = {
  promote: number;
  repeat: number;
  graduate: number;
  exclude: number;
  withoutSection: number;
};

/** Respuesta de GET /academic-years/:id/promotion-proposal. */
export type PromotionProposal = {
  sourceYear: { id: string; year: number };
  targetYear: { id: string; year: number };
  fingerprint: string;
  targetSections: TargetSection[];
  items: PromotionItem[];
  summary: PromotionSummary;
  canConfirm: boolean;
};

/** Respuesta 201 de POST /academic-years/:id/promotion. */
export type PromotionResult = {
  promoted: number;
  repeated: number;
  graduated: number;
  excluded: number;
  closedEnrollments: number;
  createdEnrollments: number;
};

export type PromotionDecision = {
  enrollmentId: string;
  action: PromotionAction;
  sectionId?: string;
};

export type RowDecision = { action: PromotionAction; sectionId: string | null };

export type PromotionPhase = 'editando' | 'confirmando' | 'hecho' | 'desactualizada';

export type PromotionState = {
  phase: PromotionPhase;
  proposal: PromotionProposal;
  decisions: Record<string, RowDecision>;
  message: string | null;
  /** Errores de la API por matrícula (details `decisions.i`). */
  rowErrors: Record<string, string>;
  /** Errores de la API que no son de una fila. */
  generalErrors: string[];
  result: PromotionResult | null;
};

export type PromotionEvent =
  | { type: 'SET_ACTION'; enrollmentId: string; action: PromotionAction }
  | { type: 'SET_SECTION'; enrollmentId: string; sectionId: string | null }
  | { type: 'BULK'; fromSectionId: string; action: PromotionAction; sectionId: string | null }
  | { type: 'RESET_ROWS' }
  | { type: 'LOAD'; proposal: PromotionProposal }
  | { type: 'CONFIRM' }
  | { type: 'COMMIT_OK'; result: PromotionResult }
  | {
      type: 'COMMIT_FAILED';
      status: number;
      message: string;
      details?: { path: string; message: string }[];
    };

export const STALE_MESSAGE = 'La propuesta cambió; vuelve a cargarla.';

export const ACTION_LABELS: Record<PromotionAction, string> = {
  PROMOTE: 'Promueve',
  REPEAT: 'Repite',
  GRADUATE: 'Egresa',
  EXCLUDE: 'Se excluye (sigue en el año de origen)',
};

export const FLAG_LABELS: Record<PromotionFlag, string> = {
  INACTIVE: 'Estudiante inactivo',
  WITHDRAWN: 'Estudiante retirado',
  NO_TARGET_SECTION: 'Sin sección propuesta',
  ALREADY_ENROLLED: 'Ya matriculado en el año de destino',
};

// --- Reglas de fila (las mismas de la API, regla B6) -------------------------------------------

export function allowedActions(item: Pick<PromotionItem, 'flags' | 'from'>): PromotionAction[] {
  if (item.flags.includes('WITHDRAWN') || item.flags.includes('ALREADY_ENROLLED')) {
    return ['EXCLUDE'];
  }
  return isFinalGrade(item.from)
    ? ['GRADUATE', 'REPEAT', 'EXCLUDE']
    : ['PROMOTE', 'REPEAT', 'EXCLUDE'];
}

/** Nivel y grado de la sección destino que exige la acción; null si no lleva sección. */
export function targetGradeFor(action: PromotionAction, from: FromGrade): LevelGrade | null {
  const level = levelOf(from);
  if (action === 'PROMOTE') return nextGrade(level, from.gradeLevel);
  if (action === 'REPEAT') return { level, gradeLevel: from.gradeLevel };
  return null;
}

/** "1.° Secundaria" o "5 años": texto del grado destino. */
export const targetGradeLabel = (t: LevelGrade): string => gradeLabel(t.level, t.gradeLevel);

/** Secciones que se pueden elegir para la acción de la fila. */
export function sectionChoices(
  item: Pick<PromotionItem, 'from'>,
  action: PromotionAction,
  sections: readonly TargetSection[],
): TargetSection[] {
  const grade = targetGradeFor(action, item.from);
  return grade === null
    ? []
    : sections.filter((s) => levelOf(s) === grade.level && s.gradeLevel === grade.gradeLevel);
}

/** Sección por defecto: la del mismo código; si no, la única del grado; si no, ninguna. */
export function defaultSection(
  item: Pick<PromotionItem, 'from'>,
  action: PromotionAction,
  sections: readonly TargetSection[],
): string | null {
  const choices = sectionChoices(item, action, sections);
  const same = choices.find((s) => s.code === item.from.code);
  if (same) return same.id;
  return choices.length === 1 ? choices[0].id : null;
}

const isValidSection = (
  item: Pick<PromotionItem, 'from'>,
  action: PromotionAction,
  sectionId: string | null,
  sections: readonly TargetSection[],
): boolean =>
  sectionId === null
    ? targetGradeFor(action, item.from) === null
    : sectionChoices(item, action, sections).some((s) => s.id === sectionId);

// --- Estado ------------------------------------------------------------------------------------

export function initPromotionState(proposal: PromotionProposal): PromotionState {
  const decisions: Record<string, RowDecision> = {};
  for (const item of proposal.items) decisions[item.enrollmentId] = { ...item.proposed };
  return {
    phase: 'editando',
    proposal,
    decisions,
    message: null,
    rowErrors: {},
    generalErrors: [],
    result: null,
  };
}

const findItem = (s: PromotionState, id: string): PromotionItem | undefined =>
  s.proposal.items.find((i) => i.enrollmentId === id);

/** Aplica una acción (y su sección) a una fila si está permitida; si no, la deja igual. */
function applyRow(
  s: PromotionState,
  item: PromotionItem,
  action: PromotionAction,
  sectionId: string | null | undefined,
): RowDecision | null {
  if (!allowedActions(item).includes(action)) return null;
  const sections = s.proposal.targetSections;
  if (sectionId !== undefined && isValidSection(item, action, sectionId, sections)) {
    return { action, sectionId };
  }
  if (targetGradeFor(action, item.from) === null) return { action, sectionId: null };
  if (action === item.proposed.action && item.proposed.sectionId !== null) {
    return { action, sectionId: item.proposed.sectionId };
  }
  return { action, sectionId: defaultSection(item, action, sections) };
}

const withoutRowError = (errors: Record<string, string>, ids: string[]) => {
  const next = { ...errors };
  for (const id of ids) delete next[id];
  return next;
};

export function promotionReducer(state: PromotionState, event: PromotionEvent): PromotionState {
  const editable = state.phase === 'editando';
  switch (event.type) {
    case 'SET_ACTION': {
      if (!editable) return state;
      const item = findItem(state, event.enrollmentId);
      if (!item) return state;
      const current = state.decisions[item.enrollmentId];
      const row = applyRow(
        state,
        item,
        event.action,
        current.action === event.action ? current.sectionId : undefined,
      );
      if (!row) return state;
      return {
        ...state,
        decisions: { ...state.decisions, [item.enrollmentId]: row },
        rowErrors: withoutRowError(state.rowErrors, [item.enrollmentId]),
      };
    }
    case 'SET_SECTION': {
      if (!editable) return state;
      const item = findItem(state, event.enrollmentId);
      if (!item) return state;
      const { action } = state.decisions[item.enrollmentId];
      if (
        event.sectionId !== null &&
        !isValidSection(item, action, event.sectionId, state.proposal.targetSections)
      ) {
        return state;
      }
      if (event.sectionId === null && targetGradeFor(action, item.from) === null) {
        return state;
      }
      return {
        ...state,
        decisions: {
          ...state.decisions,
          [item.enrollmentId]: { action, sectionId: event.sectionId },
        },
        rowErrors: withoutRowError(state.rowErrors, [item.enrollmentId]),
      };
    }
    case 'BULK': {
      if (!editable) return state;
      const decisions = { ...state.decisions };
      const changed: string[] = [];
      for (const item of state.proposal.items) {
        if (item.from.sectionId !== event.fromSectionId) continue;
        const row = applyRow(state, item, event.action, event.sectionId ?? undefined);
        if (!row) continue;
        decisions[item.enrollmentId] = row;
        changed.push(item.enrollmentId);
      }
      if (changed.length === 0) return state;
      return { ...state, decisions, rowErrors: withoutRowError(state.rowErrors, changed) };
    }
    case 'RESET_ROWS':
      if (!editable) return state;
      return initPromotionState(state.proposal);
    case 'LOAD':
      // Propuesta nueva tras volver a cargar. No pisa un envío en curso ni el resultado.
      if (state.phase === 'confirmando' || state.phase === 'hecho') return state;
      if (event.proposal.fingerprint === state.proposal.fingerprint && editable) return state;
      return initPromotionState(event.proposal);
    case 'CONFIRM':
      if (!canConfirm(state)) return state;
      return { ...state, phase: 'confirmando', message: null, generalErrors: [] };
    case 'COMMIT_OK':
      if (state.phase !== 'confirmando') return state;
      return { ...state, phase: 'hecho', result: event.result, message: null };
    case 'COMMIT_FAILED': {
      if (state.phase !== 'confirmando') return state;
      if (event.status === 409) {
        return { ...state, phase: 'desactualizada', message: STALE_MESSAGE };
      }
      const { rowErrors, generalErrors } = mapDetails(state, event.details ?? []);
      return { ...state, phase: 'editando', message: event.message, rowErrors, generalErrors };
    }
    default:
      return state;
  }
}

// --- Derivados ---------------------------------------------------------------------------------

export function summarize(state: Pick<PromotionState, 'decisions'>): PromotionSummary {
  const summary: PromotionSummary = {
    promote: 0,
    repeat: 0,
    graduate: 0,
    exclude: 0,
    withoutSection: 0,
  };
  for (const d of Object.values(state.decisions)) {
    if (d.action === 'PROMOTE') summary.promote += 1;
    else if (d.action === 'REPEAT') summary.repeat += 1;
    else if (d.action === 'GRADUATE') summary.graduate += 1;
    else summary.exclude += 1;
    if ((d.action === 'PROMOTE' || d.action === 'REPEAT') && d.sectionId === null) {
      summary.withoutSection += 1;
    }
  }
  return summary;
}

/** Hay filas, todas tienen sección cuando la necesitan y no se está enviando. */
export function canConfirm(state: PromotionState): boolean {
  return (
    state.phase === 'editando' &&
    state.proposal.items.length > 0 &&
    summarize(state).withoutSection === 0
  );
}

/** Decisiones para la API, en el orden de la propuesta (el índice da el path `decisions.i`). */
export function toPayload(
  state: Pick<PromotionState, 'proposal' | 'decisions'>,
): PromotionDecision[] {
  return state.proposal.items.map((item) => {
    const d = state.decisions[item.enrollmentId];
    return {
      enrollmentId: item.enrollmentId,
      action: d.action,
      ...(d.sectionId !== null ? { sectionId: d.sectionId } : {}),
    };
  });
}

/** Reparte los details de un 422 entre filas (`decisions.i`) y errores generales. */
export function mapDetails(
  state: Pick<PromotionState, 'proposal'>,
  details: readonly { path: string; message: string }[],
): { rowErrors: Record<string, string>; generalErrors: string[] } {
  const rowErrors: Record<string, string> = {};
  const generalErrors: string[] = [];
  for (const d of details) {
    const match = /^decisions\.(\d+)$/.exec(d.path);
    const item = match ? state.proposal.items[Number(match[1])] : undefined;
    if (item) rowErrors[item.enrollmentId] = d.message;
    else if (!generalErrors.includes(d.message)) generalErrors.push(d.message);
  }
  return { rowErrors, generalErrors };
}

export type SectionGroup = {
  sectionId: string;
  level: EducationLevel;
  gradeLevel: number;
  code: string;
  items: PromotionItem[];
};

/** Filas agrupadas por sección de origen, en el orden de la propuesta (grado y código). */
export function groupBySection(items: readonly PromotionItem[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  const byId = new Map<string, SectionGroup>();
  for (const item of items) {
    let group = byId.get(item.from.sectionId);
    if (!group) {
      group = {
        sectionId: item.from.sectionId,
        level: levelOf(item.from),
        gradeLevel: item.from.gradeLevel,
        code: item.from.code,
        items: [],
      };
      byId.set(item.from.sectionId, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups.sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      a.gradeLevel - b.gradeLevel ||
      (a.code < b.code ? -1 : 1),
  );
}

/** Acciones que se pueden aplicar en bloque a una sección (las de sus filas no retiradas). */
export function bulkActions(
  group: Pick<SectionGroup, 'gradeLevel'> & { level?: EducationLevel },
): PromotionAction[] {
  return isFinalGrade(group) ? ['GRADUATE', 'REPEAT', 'EXCLUDE'] : ['PROMOTE', 'REPEAT', 'EXCLUDE'];
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Resumen en texto (pantalla y diálogo de confirmación). */
export function summaryLines(summary: PromotionSummary): string[] {
  const lines = [
    plural(summary.promote, 'promueve', 'promueven'),
    plural(summary.repeat, 'repite', 'repiten'),
    plural(summary.graduate, 'egresa', 'egresan'),
    plural(summary.exclude, 'se excluye', 'se excluyen'),
  ];
  if (summary.withoutSection > 0) {
    lines.push(
      plural(summary.withoutSection, 'fila sin sección elegida', 'filas sin sección elegida'),
    );
  }
  return lines;
}

export function resultMessage(result: PromotionResult): string {
  return `Promoción confirmada: ${plural(result.closedEnrollments, 'matrícula cerrada', 'matrículas cerradas')} y ${plural(result.createdEnrollments, 'matrícula nueva', 'matrículas nuevas')}.`;
}

// --- Entrada de la Server Action (llega del navegador: se valida) ------------------------------

export type CommitInput =
  | { ok: true; sourceYearId: string; fingerprint: string; decisions: PromotionDecision[] }
  | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function parseCommitInput(
  sourceYearId: unknown,
  fingerprint: unknown,
  decisions: unknown,
): CommitInput {
  const bad = {
    ok: false as const,
    error: 'Los datos de la promoción no son válidos. Vuelve a cargar la página.',
  };
  if (!isUuid(sourceYearId)) return bad;
  if (typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint)) return bad;
  if (!Array.isArray(decisions) || decisions.length === 0 || decisions.length > MAX_DECISIONS) {
    return bad;
  }
  const seen = new Set<string>();
  const clean: PromotionDecision[] = [];
  for (const d of decisions) {
    if (!isRecord(d) || !isUuid(d.enrollmentId) || seen.has(d.enrollmentId)) return bad;
    if (
      typeof d.action !== 'string' ||
      !(PROMOTION_ACTIONS as readonly string[]).includes(d.action)
    ) {
      return bad;
    }
    if (d.sectionId !== undefined && !isUuid(d.sectionId)) return bad;
    const extra = Object.keys(d).filter(
      (k) => !['enrollmentId', 'action', 'sectionId'].includes(k),
    );
    if (extra.length > 0) return bad;
    seen.add(d.enrollmentId);
    clean.push({
      enrollmentId: d.enrollmentId,
      action: d.action as PromotionAction,
      ...(d.sectionId !== undefined ? { sectionId: d.sectionId } : {}),
    });
  }
  return { ok: true, sourceYearId, fingerprint, decisions: clean };
}

/** Año de origen por defecto: el inmediatamente anterior al destino (regla B2). */
export function previousYearOf<T extends { id: string; year: number }>(
  years: readonly T[],
  target: { year: number },
): T | null {
  return years.find((y) => y.year === target.year - 1) ?? null;
}

/** El enlace "Promoción" se ofrece en un año editable con alguna sección activa. */
export function canOfferPromotion(
  year: { closedAt: string | null; readOnly: boolean },
  sections: readonly { isActive: boolean }[],
): boolean {
  return !year.closedAt && !year.readOnly && sections.some((s) => s.isActive);
}

// --- Accesibilidad (INFORME 8 de UX, vuelta 1/2 de la F6) --------------------------------------

/** Ids estables de los selectores de una fila (destino de foco tras un 422). */
export const rowFieldIds = (enrollmentId: string) => ({
  action: `promocion-accion-${enrollmentId}`,
  section: `promocion-seccion-${enrollmentId}`,
  error: `promocion-error-${enrollmentId}`,
  note: `promocion-nota-${enrollmentId}`,
});

/** Error visible de una fila: el de la API o, si falta la sección, el aviso local. */
export function rowError(
  state: Pick<PromotionState, 'decisions' | 'rowErrors'>,
  item: PromotionItem,
): string | null {
  const apiError = state.rowErrors[item.enrollmentId];
  if (apiError) return apiError;
  const d = state.decisions[item.enrollmentId];
  const needs = targetGradeFor(d.action, item.from) !== null;
  return needs && d.sectionId === null ? 'Elige la sección de destino.' : null;
}

/** Filas con error, en el orden de la pantalla (grado, código, nombre). */
export function rowsWithError(
  state: Pick<PromotionState, 'proposal' | 'decisions' | 'rowErrors'>,
): PromotionItem[] {
  return groupBySection(state.proposal.items)
    .flatMap((g) => g.items)
    .filter((item) => rowError(state, item) !== null);
}

/**
 * Id del selector que recibe el foco tras un 422: el de sección si la fila lo muestra; si no,
 * el de acción. null si no hay filas con error.
 */
export function firstErrorFieldId(
  state: Pick<PromotionState, 'proposal' | 'decisions' | 'rowErrors'>,
): string | null {
  const item = rowsWithError(state)[0];
  if (!item) return null;
  const d = state.decisions[item.enrollmentId];
  const ids = rowFieldIds(item.enrollmentId);
  return targetGradeFor(d.action, item.from) !== null ? ids.section : ids.action;
}

/** Mensaje tras un 422, con el número de filas. */
export function invalidRowsMessage(count: number): string {
  if (count === 0) {
    return 'La promoción no se pudo aplicar. Revisa los avisos del resumen. No se guardó nada.';
  }
  return `${plural(count, 'fila no se puede aplicar', 'filas no se pueden aplicar')}: revisa las marcadas. No se guardó nada.`;
}

/** Motivo visible de que "Confirmar promoción" esté desactivado, o null si se puede confirmar. */
export function confirmBlockReason(state: PromotionState): string | null {
  if (canConfirm(state) || state.phase === 'hecho') return null;
  if (state.phase === 'confirmando') return 'Enviando la promoción…';
  if (state.phase === 'desactualizada') return 'La propuesta cambió: vuelve a cargarla.';
  if (state.proposal.items.length === 0) return 'No hay matrículas que promover.';
  const missing = summarize(state).withoutSection;
  return `Para confirmar, elige la sección de destino en ${plural(missing, 'fila marcada', 'filas marcadas')}.`;
}

/** Por qué una fila solo admite "Se excluye". */
export function onlyExcludeNote(item: Pick<PromotionItem, 'flags'>): string | null {
  if (item.flags.includes('WITHDRAWN')) return 'Solo puede quedar excluido: está retirado.';
  if (item.flags.includes('ALREADY_ENROLLED')) {
    return 'Solo puede quedar excluido: ya tiene matrícula en el año de destino.';
  }
  return null;
}

/**
 * Anuncio de una acción en bloque: cuántas filas de la sección quedaron con la acción y cuántas
 * se mantuvieron excluidas porque no la admiten.
 */
export function bulkAnnouncement(
  state: Pick<PromotionState, 'proposal'>,
  fromSectionId: string,
  action: PromotionAction,
): string {
  const items = state.proposal.items.filter((i) => i.from.sectionId === fromSectionId);
  const applied = items.filter((i) => allowedActions(i).includes(action)).length;
  const kept = items.length - applied;
  const label = items[0] ? promotionSectionLabel(items[0].from) : '';
  const base = `Se aplicó «${ACTION_LABELS[action]}» a ${plural(applied, 'estudiante', 'estudiantes')} de ${label}`;
  if (kept === 0) return `${base}.`;
  return `${base}; ${kept === 1 ? 'se mantuvo 1 excluido' : `se mantuvieron ${kept} excluidos`}.`;
}
