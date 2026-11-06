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
  /**
   * Credenciales recién emitidas (RF-70, RF-74): se muestran una sola vez, en pantalla. Solo viven
   * en la memoria del cliente: nunca van en la URL, en el historial ni en el servidor.
   */
  issued?: IssuedAccount[];
  /** Enlace para continuar tras un alta (por ejemplo, la ficha del usuario creado). */
  nextHref?: string;
};

/** Código de usuario y contraseña inicial de una cuenta recién creada o restablecida. */
export type IssuedAccount = { label: string; code: string; password: string };

export const IDLE: ActionState = { status: 'idle' };
