import { randomInt } from 'node:crypto';

// Codigo de usuario (RF-68, D-060): 2 digitos del anio de alta + 7 aleatorios + 1 de control (Luhn).
const RANDOM_DIGITS = 7;
const RANDOM_SPACE = 10 ** RANDOM_DIGITS;
const CODE_PATTERN = /^\d{10}$/;

// Digito de control de Luhn: el que se anade al final de `payload`. Detecta errores de
// digitacion; no aporta seguridad.
export function luhnCheckDigit(payload: string): number {
  let sum = 0;
  // De derecha a izquierda; el digito mas cercano al de control se duplica.
  for (let i = payload.length - 1, double = true; i >= 0; i--, double = !double) {
    let digit = payload.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidUserCode(code: string): boolean {
  return CODE_PATTERN.test(code) && luhnCheckDigit(code.slice(0, 9)) === Number(code[9]);
}

// Los dos ultimos digitos del anio en hora de Lima (la institucion usa America/Lima, D-018).
export function yearPrefix(date: Date): string {
  const year = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
  }).format(date);
  return year.slice(-2);
}

// `random` se inyecta solo para las pruebas; por defecto usa el generador criptografico.
export function generateUserCode(
  date: Date = new Date(),
  random: (max: number) => number = randomInt,
): string {
  const body = yearPrefix(date) + String(random(RANDOM_SPACE)).padStart(RANDOM_DIGITS, '0');
  return body + luhnCheckDigit(body);
}
