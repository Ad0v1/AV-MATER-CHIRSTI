import { randomInt } from 'node:crypto';

// Politica de contrasenas (RF-73) y generador de contrasenas iniciales (RF-70).
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '0123456789',
  '87654321',
  '987654321',
  '11111111',
  '00000000',
  '12341234',
  '123123123',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwertyui',
  'qwerty123',
  'qwertyuiop',
  'abcd1234',
  'abc12345',
  'abcdefgh',
  'iloveyou',
  'admin123',
  'administrador',
  'contrasena',
  'contrasena1',
  'contrasena123',
  'colegio123',
  'colegio2026',
  'matercristi',
  'matercristi123',
  'matercristi2026',
  'mater christi',
  'aulavirtual',
  'estudiante',
  'estudiante123',
  'docente123',
  'apoderado',
  'peru2026',
  'peru1234',
  'lima1234',
  'canete123',
  'bienvenido',
  'bienvenido1',
  'universidad',
  'cambiame',
  'cambiame123',
  'cambiar123',
]);

// Sin tildes ni mayusculas, para que "Contraseña" y "contrasena" cuenten como la misma clave.
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export type PasswordPolicyContext = {
  // Valores que la contrasena no puede ser ni contener: el codigo de usuario y el DNI.
  identity?: string[];
};

// Devuelve los problemas encontrados, en espanol; una lista vacia significa que cumple.
export function checkPasswordPolicy(
  password: string,
  context: PasswordPolicyContext = {},
): string[] {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push(`No puede superar los ${PASSWORD_MAX_LENGTH} caracteres`);
  }
  const folded = fold(password);
  if (COMMON_PASSWORDS.has(folded)) issues.push('Es una contraseña demasiado común');
  if (password.length > 0 && new Set(password).size === 1) {
    issues.push('No puede repetir un solo carácter');
  }
  const identity = (context.identity ?? []).filter((v) => v.length > 0);
  if (identity.some((value) => folded.includes(fold(value)))) {
    issues.push('No puede contener tu código de usuario ni tu DNI');
  }
  return issues;
}

// Sin caracteres ambiguos (0/O, 1/l/I) porque la contrasena inicial se entrega impresa.
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALPHABET = LOWER + UPPER + DIGITS;

export function generateInitialPassword(length = 12, random: (max: number) => number = randomInt) {
  for (;;) {
    let password = '';
    for (let i = 0; i < length; i++) password += ALPHABET[random(ALPHABET.length)];
    // Garantiza al menos una minuscula, una mayuscula y un digito.
    if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /[2-9]/.test(password)) {
      return password;
    }
  }
}
