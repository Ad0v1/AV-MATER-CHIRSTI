// Filtros para campos numéricos: descartan al escribir o pegar todo lo que no corresponde.
// Es una ayuda de usabilidad (el usuario no puede ni escribir letras ni símbolos). La defensa real
// contra inyección está en el servidor: la API valida cada campo con esquemas estrictos y consulta
// la base solo con parámetros (Prisma), así que nunca se confía en lo que envía el navegador.
import type { FormEvent } from 'react';

/** Deja solo dígitos 0-9 y, si se indica, recorta a `max` caracteres. */
export function onlyDigits(value: string, max?: number): string {
  const digits = value.replace(/\D/g, '');
  return max === undefined ? digits : digits.slice(0, max);
}

/**
 * Número decimal sin signo: dígitos y un solo separador (punto o coma), con un máximo de
 * decimales. Ejemplos: "15" -> "15", "13,5" -> "13,5", "1a2.3.4" -> "12.3".
 */
export function onlyDecimal(value: string, maxDecimals = 2): string {
  let out = '';
  let separator = false;
  let decimals = 0;
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') {
      if (separator) {
        if (decimals >= maxDecimals) continue;
        decimals += 1;
      }
      out += ch;
    } else if ((ch === '.' || ch === ',') && !separator) {
      separator = true;
      out += ch;
    }
  }
  return out;
}

/**
 * Para campos no controlados (los que se leen con FormData): corrige el valor en `onInput`.
 * Respeta el `maxLength` del propio campo.
 */
export function restrictDigits(event: FormEvent<HTMLInputElement>): void {
  const el = event.currentTarget;
  const clean = onlyDigits(el.value, el.maxLength > 0 ? el.maxLength : undefined);
  if (clean !== el.value) el.value = clean;
}
