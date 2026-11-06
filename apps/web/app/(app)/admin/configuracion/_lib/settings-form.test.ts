import { describe, expect, it } from 'vitest';
import {
  bandField,
  checkLogoFile,
  coverageProblems,
  LOGO_MAX_BYTES,
  parseSettingsForm,
  settingsPathLabel,
} from './settings-form';

const form = (over: Record<string, string> = {}) => {
  const base: Record<string, string> = {
    name: ' I.E. Mater Christi ',
    purgeAfterDays: '60',
    bands: '4',
    band0_literal: 'ad',
    band0_min: '18',
    band0_max: '20',
    band1_literal: 'A',
    band1_min: '14',
    band1_max: '17',
    band2_literal: 'B',
    band2_min: '11',
    band2_max: '13',
    band3_literal: 'C',
    band3_min: '0',
    band3_max: '10',
    ...over,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
};

describe('parseSettingsForm (RF-61)', () => {
  it('arma el cuerpo de PUT /admin/settings', () => {
    const r = parseSettingsForm(form());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      name: 'I.E. Mater Christi',
      purgeAfterDays: 60,
      literalScale: [
        { literal: 'AD', min: 18, max: 20 },
        { literal: 'A', min: 14, max: 17 },
        { literal: 'B', min: 11, max: 13 },
        { literal: 'C', min: 0, max: 10 },
      ],
    });
  });

  it('marca nombre, plazo y tramos inválidos junto a su campo y conserva lo escrito', () => {
    const r = parseSettingsForm(
      form({
        name: 'ab',
        purgeAfterDays: '0',
        band0_literal: '<b>',
        band1_literal: 'B',
        band2_min: '21',
        band3_min: '9',
        band3_max: '5',
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors).sort()).toEqual(
      ['band0_literal', 'band2_literal', 'band2_min', 'band3_max', 'name', 'purgeAfterDays'].sort(),
    );
    expect(r.values.band0_literal).toBe('<b>');
  });

  it('plazo: 30 y 3650 valen; menos de 30, decimales, negativos y texto no', () => {
    expect(parseSettingsForm(form({ purgeAfterDays: '30' })).ok).toBe(true);
    expect(parseSettingsForm(form({ purgeAfterDays: '3650' })).ok).toBe(true);
    for (const v of ['1', '29', '3651', '1.5', '-1', 'diez', '']) {
      expect(parseSettingsForm(form({ purgeAfterDays: v })).ok).toBe(false);
    }
  });

  it('la cantidad de filas va de 1 a 10', () => {
    expect(parseSettingsForm(form({ bands: '0' })).ok).toBe(false);
    expect(parseSettingsForm(form({ bands: '11' })).ok).toBe(false);
    expect(parseSettingsForm(form({ bands: 'x' })).ok).toBe(false);
    expect(bandField(3, 'max')).toBe('band3_max');
  });
});

describe('coverageProblems', () => {
  it('sin problemas con la tabla por defecto', () => {
    const r = parseSettingsForm(form());
    expect(r.ok && coverageProblems(r.input.literalScale)).toEqual([]);
  });

  it('detecta inicio, fin, huecos y cruces', () => {
    expect(coverageProblems([{ literal: 'A', min: 1, max: 19 }])).toEqual([
      'La tabla debe empezar en 0.',
      'La tabla debe terminar en 20.',
    ]);
    expect(
      coverageProblems([
        { literal: 'A', min: 12, max: 20 },
        { literal: 'C', min: 0, max: 10 },
      ]),
    ).toEqual(['Hay un hueco entre 10 y 12.']);
    expect(
      coverageProblems([
        { literal: 'A', min: 10, max: 20 },
        { literal: 'C', min: 0, max: 10 },
      ]),
    ).toEqual(['El tramo A se cruza con otro tramo.']);
  });
});

describe('settingsPathLabel y checkLogoFile', () => {
  it('nombra los campos de la API', () => {
    expect(settingsPathLabel('literalScale.2')).toBe('Tramo 3');
    expect(settingsPathLabel('purgeAfterDays')).toBe('Plazo de purga');
    expect(settingsPathLabel('otra')).toBeUndefined();
  });

  it('logo: solo PNG o JPEG de hasta 512 KB', () => {
    expect(checkLogoFile({ size: 10, type: 'image/png' })).toEqual({ ok: true });
    expect(checkLogoFile({ size: LOGO_MAX_BYTES, type: 'image/jpeg' })).toEqual({ ok: true });
    expect(checkLogoFile({ size: 10, type: 'image/svg+xml' }).ok).toBe(false);
    expect(checkLogoFile({ size: LOGO_MAX_BYTES + 1, type: 'image/png' }).ok).toBe(false);
    expect(checkLogoFile({ size: 0, type: 'image/png' }).ok).toBe(false);
    expect(checkLogoFile(null).ok).toBe(false);
  });
});

// --- QA de 5c: casos límite del formulario (RF-61, U5) ---------------------------------------

describe('parseSettingsForm: límites (QA 5c)', () => {
  const errors = (over: Record<string, string>) => {
    const r = parseSettingsForm(form(over));
    return r.ok ? {} : r.fieldErrors;
  };

  it('nombre: 3 y 150 caracteres valen; 2, 151, solo espacios o con control no', () => {
    expect(parseSettingsForm(form({ name: 'abc' })).ok).toBe(true);
    expect(parseSettingsForm(form({ name: 'a'.repeat(150) })).ok).toBe(true);
    expect(parseSettingsForm(form({ name: `  ${'a'.repeat(150)}  ` })).ok).toBe(true);
    expect(errors({ name: 'ab' })).toHaveProperty('name');
    expect(errors({ name: 'a'.repeat(151) })).toHaveProperty('name');
    expect(errors({ name: '      ' })).toHaveProperty('name');
    expect(errors({ name: 'Colegio\u0000X' })).toHaveProperty('name');
    expect(errors({ name: 'Colegio\nX' })).toHaveProperty('name');
  });

  it('literal: de 1 a 4 caracteres, mayúsculas, +/- y letras con tilde o ñ', () => {
    const r = parseSettingsForm(
      form({ band0_literal: 'a+', band1_literal: 'ñ', band2_literal: 'b-' }),
    );
    expect(r.ok && r.input.literalScale.map((b) => b.literal).slice(0, 3)).toEqual([
      'A+',
      'Ñ',
      'B-',
    ]);
    expect(parseSettingsForm(form({ band0_literal: 'ABCD' })).ok).toBe(true);
    expect(errors({ band0_literal: 'ABCDE' })).toHaveProperty('band0_literal');
    expect(errors({ band0_literal: '' })).toHaveProperty('band0_literal');
    expect(errors({ band0_literal: 'A B' })).toHaveProperty('band0_literal');
    expect(errors({ band0_literal: '<i>' })).toHaveProperty('band0_literal');
  });

  it('literal repetido sin importar mayúsculas o espacios marca la segunda fila', () => {
    expect(errors({ band0_literal: 'b', band2_literal: ' B ' })).toEqual({
      band2_literal: 'Este literal ya está en la tabla.',
    });
  });

  it('notas: 0 y 20 valen; 21, -1, decimales, vacío y texto no; mínimo = máximo vale', () => {
    expect(parseSettingsForm(form({ band3_min: '0', band0_max: '20' })).ok).toBe(true);
    expect(parseSettingsForm(form({ band3_min: '5', band3_max: '5' })).ok).toBe(true);
    expect(parseSettingsForm(form({ band3_min: ' 0 ', band3_max: ' 10 ' })).ok).toBe(true);
    for (const v of ['21', '-1', '1.5', '', 'diez', '100', '1e1']) {
      expect(errors({ band3_max: v })).toHaveProperty('band3_max');
      expect(errors({ band3_min: v })).toHaveProperty('band3_min');
    }
    expect(errors({ band3_min: '11', band3_max: '10' }).band3_max).toBe(
      'Debe ser mayor o igual que el mínimo.',
    );
  });

  it('plazo: espacios alrededor y ceros a la izquierda valen; 5 dígitos o signos no', () => {
    const r = parseSettingsForm(form({ purgeAfterDays: ' 0060 ' }));
    expect(r.ok && r.input.purgeAfterDays).toBe(60);
    for (const v of ['03650', '+5', '1,5', '0x10']) {
      expect(parseSettingsForm(form({ purgeAfterDays: v })).ok).toBe(false);
    }
  });

  it('exactamente 10 filas valen; si falta una fila completa se marcan sus tres campos', () => {
    const fd = form({ bands: '10' });
    for (let i = 4; i < 10; i++) {
      fd.set(`band${i}_literal`, `L${i}`);
      fd.set(`band${i}_min`, '0');
      fd.set(`band${i}_max`, '0');
    }
    expect(parseSettingsForm(fd).ok).toBe(true);
    const missing = parseSettingsForm(form({ bands: '5' }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(Object.keys(missing.fieldErrors).sort()).toEqual(
        ['band4_literal', 'band4_max', 'band4_min'].sort(),
      );
    }
  });

  it('un formulario vacío da error en nombre, plazo y cantidad de filas', () => {
    const r = parseSettingsForm(new FormData());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.fieldErrors).sort()).toEqual(['bands', 'name', 'purgeAfterDays']);
    }
  });

  it('un archivo en un campo de texto cuenta como vacío', () => {
    const fd = form();
    fd.set('name', new File(['x'], 'x.txt'));
    expect(parseSettingsForm(fd).ok).toBe(false);
  });
});

describe('coverageProblems: límites (QA 5c)', () => {
  const band = (literal: string, min: number, max: number) => ({ literal, min, max });

  it('una sola fila 0..20 no tiene problemas; la lista vacía sí', () => {
    expect(coverageProblems([band('A', 0, 20)])).toEqual([]);
    expect(coverageProblems([])).toEqual(['La tabla está vacía.']);
  });

  it('no depende del orden de las filas', () => {
    expect(coverageProblems([band('C', 0, 10), band('A', 11, 20)])).toEqual([]);
    expect(coverageProblems([band('A', 11, 20), band('C', 0, 10)])).toEqual([]);
  });

  it('un hueco de un solo punto y un cruce de un solo punto se detectan', () => {
    expect(coverageProblems([band('C', 0, 9), band('A', 11, 20)])).toEqual([
      'Hay un hueco entre 9 y 11.',
    ]);
    expect(coverageProblems([band('C', 0, 11), band('A', 11, 20)])).toEqual([
      'El tramo A se cruza con otro tramo.',
    ]);
  });

  it('un tramo contenido dentro de otro se marca como cruce', () => {
    expect(coverageProblems([band('A', 0, 20), band('B', 5, 8)])).toEqual([
      'El tramo B se cruza con otro tramo.',
    ]);
  });

  it('una tabla que empieza en 1 y termina en 19 acumula ambos avisos', () => {
    expect(coverageProblems([band('A', 1, 19)])).toEqual([
      'La tabla debe empezar en 0.',
      'La tabla debe terminar en 20.',
    ]);
  });
});

describe('settingsPathLabel y checkLogoFile: límites (QA 5c)', () => {
  it('rutas anidadas, la tabla entera y rutas desconocidas', () => {
    expect(settingsPathLabel('literalScale')).toBe('Tabla de literales');
    expect(settingsPathLabel('literalScale.0.min')).toBe('Tramo 1');
    expect(settingsPathLabel('name')).toBe('Nombre');
    expect(settingsPathLabel('literalScale.x')).toBeUndefined();
    expect(settingsPathLabel('')).toBeUndefined();
  });

  it('logo: 512 KB justos valen y 512 KB + 1 no; 1 byte vale', () => {
    expect(checkLogoFile({ size: 1, type: 'image/png' })).toEqual({ ok: true });
    expect(checkLogoFile({ size: LOGO_MAX_BYTES, type: 'image/png' })).toEqual({ ok: true });
    const over = checkLogoFile({ size: LOGO_MAX_BYTES + 1, type: 'image/jpeg' });
    expect(over).toEqual({ ok: false, message: 'El logo supera 512 KB.' });
  });

  it('logo: GIF, WebP, SVG, PDF y tipo vacío se rechazan; el tipo va en minúsculas', () => {
    for (const type of [
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'application/pdf',
      '',
      'IMAGE/PNG',
    ]) {
      expect(checkLogoFile({ size: 10, type }).ok).toBe(false);
    }
    expect(checkLogoFile({ size: 0, type: 'image/svg+xml' }).ok).toBe(false);
  });
});
