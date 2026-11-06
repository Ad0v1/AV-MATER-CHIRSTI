import { checkPasswordPolicy, generateInitialPassword } from './password-policy.js';

describe('checkPasswordPolicy', () => {
  it('acepta una clave razonable', () => {
    expect(checkPasswordPolicy('Mi-clave-segura-77')).toEqual([]);
  });

  it('exige al menos 8 caracteres', () => {
    expect(checkPasswordPolicy('Ab1-xy')).toHaveLength(1);
  });

  it('rechaza claves comunes sin importar mayusculas ni tildes', () => {
    expect(checkPasswordPolicy('12345678')).not.toEqual([]);
    expect(checkPasswordPolicy('PASSWORD')).not.toEqual([]);
    expect(checkPasswordPolicy('Contraseña1')).not.toEqual([]);
  });

  it('rechaza repetir un solo caracter', () => {
    expect(checkPasswordPolicy('aaaaaaaaaa')).not.toEqual([]);
  });

  it('rechaza una clave que es o contiene el codigo o el DNI', () => {
    const identity = ['2612345678', '45678901'];
    expect(checkPasswordPolicy('2612345678', { identity })).not.toEqual([]);
    expect(checkPasswordPolicy('xx45678901yy', { identity })).not.toEqual([]);
    expect(checkPasswordPolicy('otra-clave-9', { identity })).toEqual([]);
  });

  it('rechaza claves de mas de 128 caracteres', () => {
    expect(checkPasswordPolicy('a1'.repeat(65))).not.toEqual([]);
  });
});

describe('generateInitialPassword', () => {
  it('genera 12 caracteres sin ambiguos y con minuscula, mayuscula y digito', () => {
    for (let i = 0; i < 50; i++) {
      const password = generateInitialPassword();
      expect(password).toHaveLength(12);
      expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[2-9]/);
    }
  });

  it('cada llamada da una clave distinta', () => {
    const passwords = new Set(Array.from({ length: 100 }, () => generateInitialPassword()));
    expect(passwords.size).toBe(100);
  });

  it('la clave generada cumple la politica', () => {
    expect(checkPasswordPolicy(generateInitialPassword())).toEqual([]);
  });
});
