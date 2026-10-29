import {
  createMaterialSchema,
  listMaterialsQuerySchema,
  updateMaterialSchema,
} from './materials.dto.js';
import {
  canRestore,
  copyrightNoticeFor,
  diffMaterial,
  READING_COPYRIGHT_NOTICE,
  TRASH_DAYS,
  trashExpiresAt,
} from './materials.policy.js';

const FILE = '0198a3c4-0000-7000-8000-000000000002';
const PERIOD = '0198a3c4-0000-7000-8000-000000000001';
const DAY = 86_400_000;

describe('aviso de copyright (RF-27)', () => {
  it('READING lleva el aviso fijo; CLASS no', () => {
    expect(copyrightNoticeFor('READING')).toBe(READING_COPYRIGHT_NOTICE);
    expect(READING_COPYRIGHT_NOTICE.length).toBeGreaterThan(20);
    expect(copyrightNoticeFor('CLASS')).toBeNull();
  });
});

describe('papelera de 30 días (RF-30)', () => {
  const deletedAt = new Date('2026-10-01T10:00:00Z');

  it('vence a los 30 días exactos', () => {
    expect(TRASH_DAYS).toBe(30);
    expect(trashExpiresAt(deletedAt).toISOString()).toBe('2026-10-31T10:00:00.000Z');
  });

  it('QA-015: se restaura dentro de los 30 días (incluido el límite) y no después', () => {
    expect(canRestore(deletedAt, new Date(deletedAt.getTime() + DAY))).toBe(true);
    expect(canRestore(deletedAt, new Date(deletedAt.getTime() + 30 * DAY))).toBe(true);
    expect(canRestore(deletedAt, new Date(deletedAt.getTime() + 30 * DAY + 1))).toBe(false);
    expect(canRestore(deletedAt, new Date(deletedAt.getTime() + 31 * DAY))).toBe(false);
  });
});

describe('createMaterialSchema', () => {
  const base = { kind: 'CLASS', title: 'Clase 1', fileId: FILE };

  it('valores por defecto: sin período (D-010), sin descripción, no reutilizable', () => {
    expect(createMaterialSchema.parse(base)).toEqual({
      kind: 'CLASS',
      title: 'Clase 1',
      description: null,
      fileId: FILE,
      periodId: null,
      isReusable: false,
    });
  });

  it('QA-002: una lectura puede marcarse reutilizable; una clase no', () => {
    expect(
      createMaterialSchema.parse({ ...base, kind: 'READING', isReusable: true }).isReusable,
    ).toBe(true);
    expect(createMaterialSchema.safeParse({ ...base, isReusable: true }).success).toBe(false);
  });

  it('rechaza tipo desconocido, campos de más, título vacío y fileId no UUID', () => {
    for (const bad of [
      { ...base, kind: 'VIDEO' },
      { ...base, deletedAt: null },
      { ...base, title: '  ' },
      { ...base, fileId: 'x' },
    ]) {
      expect(createMaterialSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('descripción vacía se guarda como null; periodId explícito se respeta', () => {
    const dto = createMaterialSchema.parse({ ...base, description: '   ', periodId: PERIOD });
    expect(dto.description).toBeNull();
    expect(dto.periodId).toBe(PERIOD);
  });
});

describe('updateMaterialSchema y listMaterialsQuerySchema', () => {
  it('al menos un campo; no cambia kind, fileId ni periodId', () => {
    expect(updateMaterialSchema.safeParse({}).success).toBe(false);
    expect(updateMaterialSchema.safeParse({ kind: 'READING' }).success).toBe(false);
    expect(updateMaterialSchema.safeParse({ fileId: FILE }).success).toBe(false);
    expect(updateMaterialSchema.safeParse({ periodId: PERIOD }).success).toBe(false);
    expect(updateMaterialSchema.parse({ description: null }).description).toBeNull();
  });

  it('includeDeleted solo acepta true/false', () => {
    expect(listMaterialsQuerySchema.parse({}).includeDeleted).toBe(false);
    expect(listMaterialsQuerySchema.parse({ includeDeleted: 'true' }).includeDeleted).toBe(true);
    expect(listMaterialsQuerySchema.safeParse({ includeDeleted: '1' }).success).toBe(false);
  });
});

describe('diffMaterial (sin textos libres)', () => {
  const current = { title: 'Lectura con nombre', description: 'Privada', isReusable: false };

  it('lista los cambios en orden fijo y solo guarda el valor de isReusable', () => {
    const change = diffMaterial(current, {
      isReusable: true,
      description: null,
      title: 'Otra',
    });
    expect(change.changedFields).toEqual(['title', 'description', 'isReusable']);
    expect(change.before).toEqual({ isReusable: false });
    expect(change.after).toEqual({ isReusable: true });
  });

  it('sin cambios reales devuelve una lista vacía', () => {
    expect(diffMaterial(current, { title: 'Lectura con nombre' }).changedFields).toEqual([]);
  });
});
