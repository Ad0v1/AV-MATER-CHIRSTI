import { escapeCsvCell, toCsvLine } from './csv-escape.js';

describe('escapeCsvCell (inyección de fórmulas, Decisión 5)', () => {
  it('antepone un apóstrofo a lo que empieza por = + - @ TAB o CR', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+51 999')).toBe("'+51 999");
    expect(escapeCsvCell('-2')).toBe("'-2");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvCell('\tx')).toBe("'\tx");
    expect(escapeCsvCell('\rx')).toBe(`"'\rx"`);
  });

  it('encierra entre comillas y duplica las internas (RFC 4180)', () => {
    expect(escapeCsvCell('Pérez, Ana')).toBe('"Pérez, Ana"');
    expect(escapeCsvCell('a;b')).toBe('"a;b"');
    expect(escapeCsvCell('di "hola"')).toBe('"di ""hola"""');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });

  it('deja igual el texto normal', () => {
    expect(escapeCsvCell('Ana Pérez')).toBe('Ana Pérez');
    expect(escapeCsvCell('')).toBe('');
    expect(toCsvLine(['correo', 'nombre_completo'])).toBe('correo,nombre_completo');
  });
});
