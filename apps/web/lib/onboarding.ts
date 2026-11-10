import { HOME_BY_ROLE, isRole } from '@/lib/roles';

// Pasos del primer ingreso, en orden (RF-71, RF-85): contraseña, política, correo, 2FA (solo el
// administrador) y datos de contacto. La API bloquea todo lo demás hasta cumplirlos.
export const ONBOARDING_ROUTES = {
  cambiarClave: '/cambiar-clave',
  politica: '/politica-de-privacidad',
  verificarCorreo: '/verificar-correo',
  dosPasos: '/verificacion-dos-pasos',
  miPerfil: '/mi-perfil',
} as const;

export type PendingSteps = {
  role?: unknown;
  mustAcceptPolicy?: boolean;
  mustChangePassword?: boolean;
  mustVerifyEmail?: boolean;
  mustEnableTwoFactor?: boolean;
  mustCompleteContact?: boolean;
};

// Primer paso que falta o, si no queda ninguno, la página de inicio del rol.
export function nextStepPath(steps: PendingSteps): string {
  if (steps.mustChangePassword) return ONBOARDING_ROUTES.cambiarClave;
  if (steps.mustAcceptPolicy) return ONBOARDING_ROUTES.politica;
  if (steps.mustVerifyEmail) return ONBOARDING_ROUTES.verificarCorreo;
  if (steps.mustEnableTwoFactor) return ONBOARDING_ROUTES.dosPasos;
  if (steps.mustCompleteContact) return ONBOARDING_ROUTES.miPerfil;
  return isRole(steps.role) ? HOME_BY_ROLE[steps.role] : '/';
}

// Tras completar un paso, pregunta a la API cuál sigue y va directo ahí. Así no se pasa por la
// página de inicio (que redirige) y no hay parpadeo entre pantallas.
export async function fetchNextPath(fallback: string): Promise<string> {
  try {
    const res = await fetch('/api/v1/auth/me', { cache: 'no-store' });
    if (res.ok) return nextStepPath((await res.json()) as PendingSteps);
  } catch {
    // Sin conexión: se usa el destino por defecto y el layout redirige si hace falta.
  }
  return fallback;
}
