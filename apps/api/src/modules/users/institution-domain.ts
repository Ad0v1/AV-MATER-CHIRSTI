import { Logger, type FactoryProvider } from '@nestjs/common';

/**
 * Dominio institucional de los correos (sin '@'), o null si no está configurado.
 * Token local mientras Dev 1 no agregue la variable a config/env.ts (Decisión 4.3).
 */
export const INSTITUTION_EMAIL_DOMAIN = Symbol('INSTITUTION_EMAIL_DOMAIN');

/** Normaliza el valor de la variable: sin espacios, sin '@' inicial y en minúsculas. */
export function parseInstitutionDomain(raw: string | undefined): string | null {
  const value = raw?.trim().replace(/^@/, '').toLowerCase();
  return value ? value : null;
}

export const institutionDomainProvider: FactoryProvider<string | null> = {
  provide: INSTITUTION_EMAIL_DOMAIN,
  useFactory: () => {
    const domain = parseInstitutionDomain(process.env.INSTITUTION_EMAIL_DOMAIN);
    if (domain === null) {
      new Logger('UsersModule').warn(
        'INSTITUTION_EMAIL_DOMAIN no está definido: no se valida el dominio de los correos',
      );
    }
    return domain;
  },
};
