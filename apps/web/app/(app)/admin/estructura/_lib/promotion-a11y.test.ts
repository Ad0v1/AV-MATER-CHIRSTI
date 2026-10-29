import { describe, expect, it } from 'vitest';
import {
  bulkAnnouncement,
  confirmBlockReason,
  firstErrorFieldId,
  initPromotionState,
  invalidRowsMessage,
  onlyExcludeNote,
  promotionReducer,
  rowError,
  rowFieldIds,
  rowsWithError,
  type PromotionItem,
  type PromotionProposal,
} from './promotion-machine';

// Ayudas de accesibilidad de la pantalla de promoción (INFORME 8 de UX, vuelta 1/2 de la F6).

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SEC_1A = id(311);
const SEC_2A = id(321);

const item = (
  n: number,
  grade: number,
  sectionId: string,
  name: string,
  proposed: PromotionItem['proposed'],
  flags: PromotionItem['flags'] = [],
): PromotionItem => ({
  enrollmentId: id(100 + n),
  studentId: id(200 + n),
  fullName: name,
  status: flags.includes('WITHDRAWN') ? 'WITHDRAWN' : 'ACTIVE',
  from: { sectionId, gradeLevel: grade, code: 'A' },
  proposed,
  flags,
});

const items = [
  item(1, 1, SEC_1A, 'Ana', { action: 'PROMOTE', sectionId: id(21) }),
  item(2, 1, SEC_1A, 'Beto', { action: 'EXCLUDE', sectionId: null }, ['WITHDRAWN']),
  item(3, 1, SEC_1A, 'Carla', { action: 'EXCLUDE', sectionId: null }, ['ALREADY_ENROLLED']),
  item(4, 2, SEC_2A, 'Dora', { action: 'PROMOTE', sectionId: null }, ['NO_TARGET_SECTION']),
];

const proposal: PromotionProposal = {
  sourceYear: { id: id(1), year: 2026 },
  targetYear: { id: id(2), year: 2027 },
  fingerprint: 'a'.repeat(64),
  targetSections: [
    { id: id(11), gradeLevel: 1, code: 'A' },
    { id: id(21), gradeLevel: 2, code: 'A' },
    { id: id(31), gradeLevel: 3, code: 'A' },
    { id: id(32), gradeLevel: 3, code: 'B' },
  ],
  items,
  summary: { promote: 2, repeat: 0, graduate: 0, exclude: 2, withoutSection: 1 },
  canConfirm: false,
};

const start = initPromotionState(proposal);
const ready = promotionReducer(start, {
  type: 'SET_SECTION',
  enrollmentId: items[3].enrollmentId,
  sectionId: id(31),
});

describe('anuncio de acciones en bloque', () => {
  it('cuenta las filas aplicadas y las que siguen excluidas', () => {
    expect(bulkAnnouncement({ proposal }, SEC_1A, 'REPEAT')).toBe(
      'Se aplicó «Repite» a 1 estudiante de 1.º A; se mantuvieron 2 excluidos.',
    );
    expect(bulkAnnouncement({ proposal }, SEC_2A, 'PROMOTE')).toBe(
      'Se aplicó «Promueve» a 1 estudiante de 2.º A.',
    );
    expect(bulkAnnouncement({ proposal }, SEC_1A, 'EXCLUDE')).toBe(
      'Se aplicó «Se excluye (sigue en el año de origen)» a 3 estudiantes de 1.º A.',
    );
  });
});

describe('errores por fila y foco tras un 422', () => {
  it('la fila sin sección tiene error local; el foco va a su selector de sección', () => {
    expect(rowError(start, items[3])).toBe('Elige la sección de destino.');
    expect(rowError(start, items[0])).toBeNull();
    expect(rowsWithError(start).map((i) => i.fullName)).toEqual(['Dora']);
    expect(firstErrorFieldId(start)).toBe(rowFieldIds(items[3].enrollmentId).section);
    expect(firstErrorFieldId(ready)).toBeNull();
  });

  it('un error de la API en una fila sin selector de sección lleva el foco a su acción', () => {
    const failed = promotionReducer(promotionReducer(ready, { type: 'CONFIRM' }), {
      type: 'COMMIT_FAILED',
      status: 422,
      message: 'x',
      details: [{ path: 'decisions.1', message: 'La acción no está permitida' }],
    });
    expect(rowsWithError(failed).map((i) => i.fullName)).toEqual(['Beto']);
    expect(firstErrorFieldId(failed)).toBe(rowFieldIds(items[1].enrollmentId).action);
  });

  it('mensaje con el número de filas', () => {
    expect(invalidRowsMessage(1)).toBe(
      '1 fila no se puede aplicar: revisa las marcadas. No se guardó nada.',
    );
    expect(invalidRowsMessage(3)).toMatch(/^3 filas no se pueden aplicar/);
    expect(invalidRowsMessage(0)).toMatch(/Revisa los avisos del resumen/);
  });
});

describe('motivo de Confirmar desactivado y nota de excluidos', () => {
  it('dice cuántas filas faltan, o nada si se puede confirmar', () => {
    expect(confirmBlockReason(start)).toBe(
      'Para confirmar, elige la sección de destino en 1 fila marcada.',
    );
    expect(confirmBlockReason(ready)).toBeNull();
    expect(confirmBlockReason(promotionReducer(ready, { type: 'CONFIRM' }))).toMatch(/Enviando/);
    expect(confirmBlockReason(initPromotionState({ ...proposal, items: [] }))).toMatch(
      /No hay matrículas/,
    );
  });

  it('explica por qué una fila solo puede quedar excluida', () => {
    expect(onlyExcludeNote(items[1])).toBe('Solo puede quedar excluido: está retirado.');
    expect(onlyExcludeNote(items[2])).toMatch(/ya tiene matrícula en el año de destino/);
    expect(onlyExcludeNote(items[0])).toBeNull();
  });
});
