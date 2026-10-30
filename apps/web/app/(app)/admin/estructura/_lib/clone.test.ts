import { describe, expect, it } from 'vitest';
import {
  MAX_SOURCE_CANDIDATES,
  canOfferClone,
  cloneBlockReason,
  cloneResultLines,
  cloneSuccessMessage,
  parseCloneForm,
  previousYears,
  sourceOptions,
} from './clone';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const open = { closedAt: null, readOnly: false };

describe('cloneBlockReason / canOfferClone (RF-15, D-030)', () => {
  it('se puede clonar en un año editable sin secciones', () => {
    expect(cloneBlockReason(open, 0)).toBeNull();
    expect(canOfferClone(open, 0)).toBe(true);
  });

  it('no se ofrece en un año cerrado, de solo lectura o con secciones', () => {
    expect(cloneBlockReason({ closedAt: '2026-01-01T00:00:00Z', readOnly: true }, 0)).toMatch(
      /cerrado/,
    );
    expect(cloneBlockReason({ closedAt: null, readOnly: true }, 0)).toMatch(/solo lectura/);
    expect(cloneBlockReason(open, 1)).toMatch(/ya tiene 1 sección:/);
    expect(cloneBlockReason(open, 3)).toMatch(/ya tiene 3 secciones/);
    expect(canOfferClone(open, 2)).toBe(false);
  });
});

describe('previousYears (RF-15)', () => {
  const years = [2024, 2027, 2025, 2026].map((year, i) => ({ id: id(i), year }));

  it('solo años anteriores al destino, del más reciente al más antiguo', () => {
    expect(previousYears(years, { id: id(1), year: 2027 }).map((y) => y.year)).toEqual([
      2026, 2025, 2024,
    ]);
    expect(previousYears(years, { id: id(0), year: 2024 })).toEqual([]);
  });

  it(`como mucho ${MAX_SOURCE_CANDIDATES} años`, () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: id(i), year: 2000 + i }));
    const result = previousYears(many, { id: id(99), year: 2050 });
    expect(result).toHaveLength(MAX_SOURCE_CANDIDATES);
    expect(result[0].year).toBe(2014);
  });
});

describe('sourceOptions (RF-15)', () => {
  it('ofrece solo años con secciones activas y elige el más reciente', () => {
    const result = sourceOptions([
      { id: id(1), year: 2024, activeSections: 1 },
      { id: id(2), year: 2026, activeSections: 0 },
      { id: id(3), year: 2025, activeSections: 6 },
    ]);
    expect(result.options).toEqual([
      { value: id(3), label: '2025 (6 secciones activas)' },
      { value: id(1), label: '2024 (1 sección activa)' },
    ]);
    expect(result.empty).toEqual([2026]);
    expect(result.defaultId).toBe(id(3));
  });

  it('sin orígenes válidos no hay opción por defecto', () => {
    expect(sourceOptions([{ id: id(1), year: 2024, activeSections: 0 }]).defaultId).toBeNull();
    expect(sourceOptions([])).toEqual({ options: [], empty: [], defaultId: null });
  });
});

describe('parseCloneForm (RF-15)', () => {
  it('acepta un origen ofrecido con la casilla marcada o sin marcar', () => {
    expect(parseCloneForm(id(1), 'on', [id(1)])).toEqual({
      ok: true,
      sourceYearId: id(1),
      copyTeachers: true,
    });
    expect(parseCloneForm(id(1), null)).toEqual({
      ok: true,
      sourceYearId: id(1),
      copyTeachers: false,
    });
  });

  it('rechaza un origen vacío, no UUID o no ofrecido, y una casilla manipulada', () => {
    expect(parseCloneForm('', null).ok).toBe(false);
    expect(parseCloneForm('2025', null).ok).toBe(false);
    expect(parseCloneForm(id(2), null, [id(1)]).ok).toBe(false);
    expect(parseCloneForm(id(1), 'true')).toEqual({
      ok: false,
      error: 'La opción de copiar docentes no es válida.',
    });
  });
});

describe('casos límite de la pantalla de clonar (RF-15)', () => {
  it('RF-15: un año de solo lectura con secciones muestra primero el motivo de solo lectura', () => {
    expect(cloneBlockReason({ closedAt: null, readOnly: true }, 4)).toMatch(/solo lectura/);
  });

  it('RF-15: parseCloneForm rechaza casilla "off", "1", "" y un id con espacios', () => {
    for (const raw of ['off', '1', '', 'ON']) {
      expect(parseCloneForm(id(1), raw).ok, raw).toBe(false);
    }
    expect(parseCloneForm(` ${id(1)}`, null).ok).toBe(false);
  });

  it('RF-15: sourceOptions con varios años sin secciones los lista todos, del más reciente', () => {
    const r = sourceOptions([
      { id: id(1), year: 2023, activeSections: 0 },
      { id: id(2), year: 2025, activeSections: 0 },
    ]);
    expect(r.empty).toEqual([2025, 2023]);
    expect(r.options).toEqual([]);
  });

  it('RF-15: previousYears no modifica la lista recibida y excluye el mismo año con otro id', () => {
    const years = [
      { id: id(1), year: 2026 },
      { id: id(2), year: 2025 },
    ];
    const copy = structuredClone(years);
    expect(previousYears(years, { id: id(3), year: 2026 }).map((y) => y.year)).toEqual([2025]);
    expect(years).toEqual(copy);
  });

  it('RF-15: cloneResultLines con todo en cero solo informa lo creado', () => {
    const lines = cloneResultLines({
      created: { sections: 0, courseSections: 0, teachersAssigned: 0 },
      skipped: {
        inactiveSections: 0,
        inactiveCourseSections: 0,
        inactiveCourses: 0,
        teachersNotActive: 0,
      },
    });
    expect(lines.created[0]).toBe('0 secciones creadas');
    expect(lines.skipped).toEqual([]);
  });
});

describe('cloneResultLines / cloneSuccessMessage (RF-15)', () => {
  const none = {
    inactiveSections: 0,
    inactiveCourseSections: 0,
    inactiveCourses: 0,
    teachersNotActive: 0,
  };

  it('sin docentes copiados lo dice y no lista omisiones vacías', () => {
    const lines = cloneResultLines({
      created: { sections: 6, courseSections: 30, teachersAssigned: 0 },
      skipped: none,
    });
    expect(lines.created).toEqual([
      '6 secciones creadas',
      '30 cursos asignados a secciones',
      'Los cursos quedaron sin docente: asígnalos en cada sección.',
    ]);
    expect(lines.skipped).toEqual([]);
  });

  it('lista cada omisión con singular y plural', () => {
    const lines = cloneResultLines({
      created: { sections: 1, courseSections: 1, teachersAssigned: 1 },
      skipped: {
        inactiveSections: 1,
        inactiveCourseSections: 2,
        inactiveCourses: 1,
        teachersNotActive: 2,
      },
    });
    expect(lines.created).toEqual([
      '1 sección creada',
      '1 curso asignado a secciones',
      '1 curso con docente copiado',
    ]);
    expect(lines.skipped).toEqual([
      '1 sección inactiva',
      '2 cursos inactivos en su sección',
      '1 curso desactivado del catálogo',
      '2 docentes que ya no están activos (los cursos quedaron sin docente)',
    ]);
  });

  it('mensaje corto para la región de estado', () => {
    expect(
      cloneSuccessMessage({ created: { sections: 1, courseSections: 5, teachersAssigned: 0 } }),
    ).toBe('Estructura copiada: 1 sección y 5 cursos.');
  });
});
