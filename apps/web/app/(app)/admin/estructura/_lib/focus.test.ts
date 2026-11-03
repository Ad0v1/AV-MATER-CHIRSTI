import { describe, expect, it } from 'vitest';
import { PAGE_TITLE_ID, focusIds, pickFocusTarget } from './focus';
import { isStrictBoolean } from './validation';

const ID = '01a17953-0e40-7335-a902-9f10dc54e1c0';

describe('focusIds (ids estables de los encabezados)', () => {
  it('usa los prefijos acordados con ux-accesibilidad', () => {
    expect(focusIds.period(ID)).toBe(`periodo-${ID}`);
    expect(focusIds.section(ID)).toBe(`seccion-${ID}`);
    expect(focusIds.course(ID)).toBe(`curso-${ID}`);
    expect(focusIds.courseSection(ID)).toBe(`curso-seccion-${ID}`);
    expect(PAGE_TITLE_ID).toBe('titulo-pagina');
  });
});

describe('pickFocusTarget', () => {
  const page = (...ids: string[]) => {
    const set = new Set(ids);
    return (id: string) => set.has(id);
  };

  it('elige el encabezado del elemento afectado si existe', () => {
    const target = focusIds.period(ID);
    expect(pickFocusTarget([target], page(target, PAGE_TITLE_ID))).toBe(target);
  });

  it('usa el primer candidato que exista', () => {
    expect(pickFocusTarget(['no-esta', 'b'], page('b', PAGE_TITLE_ID))).toBe('b');
  });

  it('cae al título de la página si el elemento ya no existe o no hay candidato', () => {
    expect(pickFocusTarget([focusIds.section(ID)], page(PAGE_TITLE_ID))).toBe(PAGE_TITLE_ID);
    expect(pickFocusTarget([undefined, null, ''], page(PAGE_TITLE_ID))).toBe(PAGE_TITLE_ID);
  });

  it('cancelar sin destino de éxito deja el foco al trigger (el componente lo gestiona; aquí solo el respaldo)', () => {
    // Sin candidato y sin título no hay destino: el llamador conserva el trigger.
    expect(pickFocusTarget([], page())).toBeNull();
    expect(pickFocusTarget([], page(PAGE_TITLE_ID))).toBe(PAGE_TITLE_ID);
  });

  it('el orden de candidatos manda sobre el título', () => {
    expect(pickFocusTarget(['a', 'b'], page('a', 'b', PAGE_TITLE_ID))).toBe('a');
  });

  it('devuelve null si tampoco está el título', () => {
    expect(pickFocusTarget(['x'], page())).toBeNull();
  });
});

describe('isStrictBoolean (argumentos ligados de las Server Actions)', () => {
  it('solo acepta true y false', () => {
    expect(isStrictBoolean(true)).toBe(true);
    expect(isStrictBoolean(false)).toBe(true);
  });

  it('rechaza valores manipulados', () => {
    for (const bad of ['true', 'false', 1, 0, null, undefined, {}, [], 'si']) {
      expect(isStrictBoolean(bad)).toBe(false);
    }
  });
});
