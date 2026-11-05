// Comprobacion local del codigo de usuario (RF-68, D-060): 10 digitos, el ultimo de control (Luhn).
// Solo avisa de errores de digitacion antes de enviar el formulario; quien decide si el codigo
// existe es siempre la API. Misma formula que apps/api/src/modules/auth/user-code.ts.
export const USER_CODE_LENGTH = 10;

export function luhnCheckDigit(payload: string): number {
  let sum = 0;
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
  return /^\d{10}$/.test(code) && luhnCheckDigit(code.slice(0, 9)) === Number(code[9]);
}
