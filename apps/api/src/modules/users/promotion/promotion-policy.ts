// RF-16 / RN-15: propuesta de promoción en bloque, validación de las decisiones del admin y huella
// de la propuesta (INFORME 1 de F6, regla B). Lógica pura (sin Prisma), probada en
// promotion-policy.spec.ts.
import { createHash } from 'node:crypto';
import { gradeLabel, nextGrade, type EducationLevel } from '@aula/shared';
import type { UserStatus } from '../../../generated/prisma/enums.js';

export const PROMOTION_ACTIONS = ['PROMOTE', 'REPEAT', 'GRADUATE', 'EXCLUDE'] as const;
export type PromotionAction = (typeof PROMOTION_ACTIONS)[number];

export type PromotionFlag = 'INACTIVE' | 'WITHDRAWN' | 'NO_TARGET_SECTION' | 'ALREADY_ENROLLED';

/**
 * Tres niveles (09/11/2026): el tope sale del catálogo de @aula/shared. INICIAL 5 años → PRIMARIA 1.°,
 * PRIMARIA 6.° → SECUNDARIA 1.° (PROMOTE cambia de nivel) y SECUNDARIA 5.° egresa (GRADUATE).
 * Si una sección no trae `level` se asume SECUNDARIA (valor por defecto del esquema).
 */
export type LevelGrade = { level: EducationLevel; gradeLevel: number };

const levelOf = (s: { level?: EducationLevel }): EducationLevel => s.level ?? 'SECUNDARIA';
const sameLevelGrade = (s: { level?: EducationLevel; gradeLevel: number }, t: LevelGrade) =>
  levelOf(s) === t.level && s.gradeLevel === t.gradeLevel;

/** Verdadero si desde este grado se egresa (último grado de secundaria). */
export function isFinalGrade(from: { level?: EducationLevel; gradeLevel: number }): boolean {
  return nextGrade(levelOf(from), from.gradeLevel) === null;
}

/** Matrícula vigente del año origen, con su estudiante y su sección. */
export type SourceEnrollment = {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  status: UserStatus;
  section: { id: string; level?: EducationLevel; gradeLevel: number; code: string };
};

/** Sección activa del año destino. */
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
  status: UserStatus;
  from: { sectionId: string; level: EducationLevel; gradeLevel: number; code: string };
  proposed: { action: PromotionAction; sectionId: string | null };
  flags: PromotionFlag[];
};

export type PromotionSummary = {
  promote: number;
  repeat: number;
  graduate: number;
  exclude: number;
  /** Filas PROMOTE/REPEAT sin sección elegida (impiden confirmar). */
  withoutSection: number;
};

export type Proposal = { items: PromotionItem[]; summary: PromotionSummary; canConfirm: boolean };

const LEVEL_ORDER: Record<EducationLevel, number> = { INICIAL: 0, PRIMARIA: 1, SECUNDARIA: 2 };

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Sección propuesta en `grade` (número de SECUNDARIA o nivel+grado): la del mismo código si
 * existe; si no, la única de ese nivel y grado; si hay varias (o ninguna), null.
 */
export function pickSection(
  sections: readonly TargetSection[],
  grade: number | LevelGrade,
  code: string,
): string | null {
  const target: LevelGrade =
    typeof grade === 'number' ? { level: 'SECUNDARIA', gradeLevel: grade } : grade;
  const ofGrade = sections.filter((s) => sameLevelGrade(s, target));
  const same = ofGrade.find((s) => s.code === code);
  if (same) return same.id;
  return ofGrade.length === 1 ? ofGrade[0].id : null;
}

/** Acciones permitidas para una fila (regla B6). */
export function allowedActions(
  item: Pick<PromotionItem, 'flags'> & { from: { level?: EducationLevel; gradeLevel: number } },
): PromotionAction[] {
  if (item.flags.includes('WITHDRAWN') || item.flags.includes('ALREADY_ENROLLED')) {
    return ['EXCLUDE'];
  }
  return isFinalGrade(item.from)
    ? ['GRADUATE', 'REPEAT', 'EXCLUDE']
    : ['PROMOTE', 'REPEAT', 'EXCLUDE'];
}

/** Nivel y grado de la sección destino que exige la acción, o null si no lleva sección. */
export function targetGradeFor(
  action: PromotionAction,
  from: { level?: EducationLevel; gradeLevel: number },
): LevelGrade | null {
  const level = levelOf(from);
  if (action === 'PROMOTE') return nextGrade(level, from.gradeLevel);
  if (action === 'REPEAT') return { level, gradeLevel: from.gradeLevel };
  return null;
}

export function summarize(
  rows: readonly { action: PromotionAction; sectionId: string | null }[],
): PromotionSummary {
  const summary: PromotionSummary = {
    promote: 0,
    repeat: 0,
    graduate: 0,
    exclude: 0,
    withoutSection: 0,
  };
  for (const r of rows) {
    if (r.action === 'PROMOTE') summary.promote += 1;
    else if (r.action === 'REPEAT') summary.repeat += 1;
    else if (r.action === 'GRADUATE') summary.graduate += 1;
    else summary.exclude += 1;
    if ((r.action === 'PROMOTE' || r.action === 'REPEAT') && r.sectionId === null) {
      summary.withoutSection += 1;
    }
  }
  return summary;
}

/**
 * Propuesta (regla B5): PROMOTE al grado siguiente según el nivel (sección por pickSection o null
 * con NO_TARGET_SECTION); SECUNDARIA 5.° → GRADUATE; WITHDRAWN o ALREADY_ENROLLED → EXCLUDE; INACTIVE →
 * igual que un activo, con la marca. Orden: grado, código de sección y nombre.
 */
export function proposePromotion(
  enrollments: readonly SourceEnrollment[],
  targetSections: readonly TargetSection[],
  alreadyEnrolledStudentIds: ReadonlySet<string>,
): Proposal {
  const items = enrollments.map((e): PromotionItem => {
    const flags: PromotionFlag[] = [];
    if (e.status === 'INACTIVE') flags.push('INACTIVE');
    if (e.status === 'WITHDRAWN') flags.push('WITHDRAWN');
    if (alreadyEnrolledStudentIds.has(e.studentId)) flags.push('ALREADY_ENROLLED');
    const from = {
      sectionId: e.section.id,
      level: levelOf(e.section),
      gradeLevel: e.section.gradeLevel,
      code: e.section.code,
    };
    let proposed: PromotionItem['proposed'];
    if (flags.includes('WITHDRAWN') || flags.includes('ALREADY_ENROLLED')) {
      proposed = { action: 'EXCLUDE', sectionId: null };
    } else {
      const next = nextGrade(from.level, from.gradeLevel);
      if (next === null) {
        proposed = { action: 'GRADUATE', sectionId: null };
      } else {
        const sectionId = pickSection(targetSections, next, from.code);
        if (sectionId === null) flags.push('NO_TARGET_SECTION');
        proposed = { action: 'PROMOTE', sectionId };
      }
    }
    return {
      enrollmentId: e.enrollmentId,
      studentId: e.studentId,
      fullName: e.fullName,
      status: e.status,
      from,
      proposed,
      flags,
    };
  });
  items.sort(
    (a, b) =>
      LEVEL_ORDER[a.from.level] - LEVEL_ORDER[b.from.level] ||
      a.from.gradeLevel - b.from.gradeLevel ||
      compareText(a.from.code, b.from.code) ||
      a.fullName.localeCompare(b.fullName, 'es') ||
      compareText(a.enrollmentId, b.enrollmentId),
  );
  const summary = summarize(items.map((i) => i.proposed));
  return { items, summary, canConfirm: summary.withoutSection === 0 };
}

export type PromotionDecision = {
  enrollmentId: string;
  action: PromotionAction;
  sectionId?: string;
};

export type ValidatedDecision = {
  enrollmentId: string;
  studentId: string;
  action: PromotionAction;
  sectionId: string | null;
};

export type DecisionIssue = { path: string; message: string };

/**
 * Valida las decisiones del admin contra la propuesta recalculada (regla B6): cubren exactamente
 * todas las filas, sin repetir; la acción está permitida; PROMOTE y REPEAT llevan una sección
 * activa del grado que toca; GRADUATE y EXCLUDE no llevan sección. Devuelve los problemas
 * (path `decisions.i` o `decisions`) o las decisiones listas para escribir.
 */
export function validateDecisions(
  items: readonly PromotionItem[],
  targetSections: readonly TargetSection[],
  decisions: readonly PromotionDecision[],
): { issues: DecisionIssue[]; decisions: ValidatedDecision[] } {
  const issues: DecisionIssue[] = [];
  const byEnrollment = new Map(items.map((i) => [i.enrollmentId, i]));
  const sections = new Map(targetSections.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const valid: ValidatedDecision[] = [];

  decisions.forEach((d, i) => {
    const path = `decisions.${i}`;
    const item = byEnrollment.get(d.enrollmentId);
    if (!item) {
      issues.push({ path, message: 'La matrícula no está en la propuesta' });
      return;
    }
    if (seen.has(d.enrollmentId)) {
      issues.push({ path, message: 'La matrícula está repetida' });
      return;
    }
    seen.add(d.enrollmentId);
    if (!allowedActions(item).includes(d.action)) {
      issues.push({ path, message: 'La acción no está permitida para esta matrícula' });
      return;
    }
    const grade = targetGradeFor(d.action, item.from);
    if (grade === null) {
      if (d.sectionId !== undefined) {
        issues.push({ path, message: 'Esta acción no lleva sección de destino' });
        return;
      }
      valid.push({
        enrollmentId: d.enrollmentId,
        studentId: item.studentId,
        action: d.action,
        sectionId: null,
      });
      return;
    }
    if (d.sectionId === undefined) {
      issues.push({ path, message: 'Elige la sección de destino' });
      return;
    }
    const section = sections.get(d.sectionId);
    if (!section) {
      issues.push({ path, message: 'La sección de destino no es una sección activa del año' });
      return;
    }
    if (!sameLevelGrade(section, grade)) {
      issues.push({
        path,
        message: `La sección de destino debe ser de ${gradeLabel(grade.level, grade.gradeLevel)}`,
      });
      return;
    }
    valid.push({
      enrollmentId: d.enrollmentId,
      studentId: item.studentId,
      action: d.action,
      sectionId: section.id,
    });
  });

  const missing = items.filter((i) => !seen.has(i.enrollmentId)).length;
  if (missing > 0) {
    issues.push({
      path: 'decisions',
      message: `Faltan decisiones para ${missing} ${missing === 1 ? 'matrícula' : 'matrículas'}`,
    });
  }
  return { issues, decisions: issues.length === 0 ? valid : [] };
}

/**
 * Huella de la propuesta (SHA-256 en hex): matrículas vigentes del origen (enrollmentId,
 * studentId, sectionId, status), secciones activas del destino (id, level, gradeLevel) y estudiantes
 * que ya tienen matrícula vigente en el destino. Independiente del orden de entrada.
 */
export function promotionFingerprint(
  enrollments: readonly Pick<
    SourceEnrollment,
    'enrollmentId' | 'studentId' | 'status' | 'section'
  >[],
  targetSections: readonly Pick<TargetSection, 'id' | 'level' | 'gradeLevel'>[],
  alreadyEnrolledStudentIds: ReadonlySet<string> = new Set(),
): string {
  const lines = [
    ...enrollments
      .map((e) => `E|${e.enrollmentId}|${e.studentId}|${e.section.id}|${e.status}`)
      .sort(),
    ...targetSections.map((s) => `S|${s.id}|${levelOf(s)}|${s.gradeLevel}`).sort(),
    ...[...alreadyEnrolledStudentIds].map((id) => `A|${id}`).sort(),
  ];
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

export type PromotionCounts = {
  promoted: number;
  repeated: number;
  graduated: number;
  excluded: number;
};

export function countDecisions(decisions: readonly ValidatedDecision[]): PromotionCounts {
  const counts: PromotionCounts = { promoted: 0, repeated: 0, graduated: 0, excluded: 0 };
  for (const d of decisions) {
    if (d.action === 'PROMOTE') counts.promoted += 1;
    else if (d.action === 'REPEAT') counts.repeated += 1;
    else if (d.action === 'GRADUATE') counts.graduated += 1;
    else counts.excluded += 1;
  }
  return counts;
}
