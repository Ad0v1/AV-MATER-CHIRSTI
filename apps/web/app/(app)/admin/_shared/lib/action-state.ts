// Resultado de una Server Action para `useActionState` (común a /admin/estructura y /admin/usuarios).

export type ActionState = {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  /** Errores por campo (nombre del input → mensaje). */
  fieldErrors?: Record<string, string>;
  /** Problemas de la API (details), ya en texto legible. */
  details?: string[];
  /** Valores enviados, para no perderlos cuando React reinicia el formulario. */
  values?: Record<string, string>;
};

export const IDLE: ActionState = { status: 'idle' };
