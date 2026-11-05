import { generateUserCode, isValidUserCode, luhnCheckDigit, yearPrefix } from './user-code.js';

describe('luhnCheckDigit', () => {
  it('calcula el digito de control del ejemplo clasico de Luhn', () => {
    expect(luhnCheckDigit('7992739871')).toBe(3);
  });

  it('devuelve 0 para una cadena de ceros', () => {
    expect(luhnCheckDigit('000000000')).toBe(0);
  });
});

describe('isValidUserCode', () => {
  const valid = '2600000000';

  it('acepta un codigo con el digito de control correcto', () => {
    expect(isValidUserCode(valid)).toBe(true);
    expect(isValidUserCode(generateUserCode())).toBe(true);
  });

  it('rechaza un digito cambiado', () => {
    expect(isValidUserCode('2600000001')).toBe(false);
  });

  it('rechaza dos digitos contiguos intercambiados', () => {
    const code = generateUserCode(new Date('2026-05-01T12:00:00Z'), () => 1234567);
    const swapped = `${code.slice(0, 4)}${code[5]}${code[4]}${code.slice(6)}`;
    expect(swapped).not.toBe(code);
    expect(isValidUserCode(swapped)).toBe(false);
  });

  it('rechaza longitudes y caracteres invalidos', () => {
    expect(isValidUserCode('260000000')).toBe(false);
    expect(isValidUserCode('26000000000')).toBe(false);
    expect(isValidUserCode('26000000a0')).toBe(false);
    expect(isValidUserCode('')).toBe(false);
  });
});

describe('generateUserCode', () => {
  it('empieza con el anio de alta en hora de Lima', () => {
    expect(generateUserCode(new Date('2027-03-10T15:00:00Z'), () => 0).startsWith('27')).toBe(true);
  });

  it('el 1 de enero en UTC de madrugada aun es el anio anterior en Lima', () => {
    expect(yearPrefix(new Date('2027-01-01T02:00:00Z'))).toBe('26');
    expect(yearPrefix(new Date('2027-01-01T06:00:00Z'))).toBe('27');
  });

  it('rellena con ceros a la izquierda los 7 digitos aleatorios', () => {
    const code = generateUserCode(new Date('2026-05-01T12:00:00Z'), () => 42);
    expect(code.slice(0, 9)).toBe('260000042');
    expect(code).toHaveLength(10);
  });

  it('genera codigos distintos con el generador real', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateUserCode()));
    expect(codes.size).toBeGreaterThan(190);
  });
});
