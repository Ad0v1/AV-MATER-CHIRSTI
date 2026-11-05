// Configuración institucional (RF-61): tipos y validación del formulario (lógica pura, probada con
// Vitest). La API es la autoridad (valida la tabla con el motor de notas, RN-04); aquí solo se dan
// mensajes junto al campo y se evita un viaje inútil.

export type LiteralBand = { literal: string; min: number; max: number };

export type LogoView = { mime: string; url: string; expiresAt: string };

export type SettingsView = {
  name: string;
  literalScale: LiteralBand[];
  purgeAfterDays: number;
  logo: LogoView | null;
  updatedAt: string;
};

export type SettingsInput = {
  name: string;
  literalScale: LiteralBand[];
  purgeAfterDays: number;
};

export const NAME_MIN = 3;
export const NAME_MAX = 150;
export const PURGE_MIN = 1;
export const PURGE_MAX = 3650;
export const MAX_BANDS = 10;
export const LITERAL_MAX = 4;
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg'] as const;

const LITERAL = /^[\p{L}\p{N}+-]{1,4}$/u;
const INTEGER = /^\d{1,4}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** Nombres de los campos de la fila i de la tabla. */
export const bandField = (i: number, key: keyof LiteralBand) => `band${i}_${key}`;

export type ParseResult =
  | { ok: true; input: SettingsInput; values: Record<string, string> }
  | { ok: false; fieldErrors: Record<string, string>; values: Record<string, string> };

const text = (fd: FormData, name: string): string => {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
};

/**
 * Lee el formulario: name, purgeAfterDays, bands (cantidad de filas) y band{i}_{literal|min|max}.
 * Devuelve errores por campo o los datos listos para PUT /admin/settings.
 */
export function parseSettingsForm(fd: FormData): ParseResult {
  const values: Record<string, string> = {
    name: text(fd, 'name'),
    purgeAfterDays: text(fd, 'purgeAfterDays'),
    bands: text(fd, 'bands'),
  };
  const fieldErrors: Record<string, string> = {};

  const name = values.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    fieldErrors.name = `Escribe entre ${NAME_MIN} y ${NAME_MAX} caracteres.`;
  } else if (CONTROL.test(name)) {
    fieldErrors.name = 'El nombre tiene caracteres no permitidos.';
  }

  const purge = values.purgeAfterDays.trim();
  const purgeDays = INTEGER.test(purge) ? Number(purge) : NaN;
  if (!Number.isInteger(purgeDays) || purgeDays < PURGE_MIN || purgeDays > PURGE_MAX) {
    fieldErrors.purgeAfterDays = `Ingresa un número entero de días entre ${PURGE_MIN} y ${PURGE_MAX}.`;
  }

  const count = INTEGER.test(values.bands) ? Number(values.bands) : 0;
  const literalScale: LiteralBand[] = [];
  if (count < 1 || count > MAX_BANDS) {
    fieldErrors.bands = `La tabla debe tener entre 1 y ${MAX_BANDS} tramos.`;
  } else {
    const seen = new Set<string>();
    for (let i = 0; i < count; i++) {
      const literalName = bandField(i, 'literal');
      const minName = bandField(i, 'min');
      const maxName = bandField(i, 'max');
      values[literalName] = text(fd, literalName);
      values[minName] = text(fd, minName);
      values[maxName] = text(fd, maxName);
      const literal = values[literalName].trim().toUpperCase();
      if (!LITERAL.test(literal)) {
        fieldErrors[literalName] = `De 1 a ${LITERAL_MAX} letras o dígitos.`;
      } else if (seen.has(literal)) {
        fieldErrors[literalName] = 'Este literal ya está en la tabla.';
      }
      seen.add(literal);
      const min = parseGrade(values[minName]);
      const max = parseGrade(values[maxName]);
      if (min === null) fieldErrors[minName] = 'Entero de 0 a 20.';
      if (max === null) fieldErrors[maxName] = 'Entero de 0 a 20.';
      if (min !== null && max !== null && min > max) {
        fieldErrors[maxName] = 'Debe ser mayor o igual que el mínimo.';
      }
      literalScale.push({ literal, min: min ?? 0, max: max ?? 0 });
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };
  return { ok: true, input: { name, literalScale, purgeAfterDays: purgeDays }, values };
}

function parseGrade(value: string): number | null {
  const v = value.trim();
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n >= 0 && n <= 20 ? n : null;
}

/**
 * Problemas de cobertura de la tabla (0..20 sin huecos ni cruces), como aviso previo. La API los
 * vuelve a revisar con el motor de notas.
 */
export function coverageProblems(scale: LiteralBand[]): string[] {
  if (scale.length === 0) return ['La tabla está vacía.'];
  const sorted = [...scale].sort((a, b) => a.min - b.min || a.max - b.max);
  const problems: string[] = [];
  if (sorted[0].min !== 0) problems.push('La tabla debe empezar en 0.');
  let reach = sorted[0].max;
  for (const band of sorted.slice(1)) {
    if (band.min <= reach) problems.push(`El tramo ${band.literal} se cruza con otro tramo.`);
    else if (band.min > reach + 1) problems.push(`Hay un hueco entre ${reach} y ${band.min}.`);
    reach = Math.max(reach, band.max);
  }
  if (reach !== 20) problems.push('La tabla debe terminar en 20.');
  return problems;
}

/** Nombre legible de un `path` de la API (details) para el mensaje de error. */
export function settingsPathLabel(path: string): string | undefined {
  if (path === 'name') return 'Nombre';
  if (path === 'purgeAfterDays') return 'Plazo de purga';
  if (path === 'literalScale') return 'Tabla de literales';
  const m = /^literalScale\.(\d+)/.exec(path);
  return m ? `Tramo ${Number(m[1]) + 1}` : undefined;
}

export type LogoCheck = { ok: true } | { ok: false; message: string };

/** Comprobación previa del archivo del logo (la API mira los bytes y pasa el antivirus). */
export function checkLogoFile(file: { size: number; type: string } | null): LogoCheck {
  if (!file || file.size === 0) return { ok: false, message: 'Elige una imagen PNG o JPEG.' };
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: 'El logo debe ser una imagen PNG o JPEG (no SVG).' };
  }
  if (file.size > LOGO_MAX_BYTES) return { ok: false, message: 'El logo supera 512 KB.' };
  return { ok: true };
}
