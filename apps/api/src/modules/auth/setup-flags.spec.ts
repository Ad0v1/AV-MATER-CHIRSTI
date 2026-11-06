import { pendingFlags } from './setup-flags.js';

const verified = new Date('2026-11-05T10:00:00Z');

describe('pendingFlags (RF-71, RF-83)', () => {
  it('un alumno con el correo verificado no tiene pasos pendientes', () => {
    expect(pendingFlags({ role: 'STUDENT', emailVerifiedAt: verified, phone: null })).toEqual({});
  });

  it('sin correo verificado falta verificarlo', () => {
    expect(pendingFlags({ role: 'TEACHER', emailVerifiedAt: null, phone: null })).toEqual({
      mustVerifyEmail: true,
    });
  });

  it('el apoderado tambien debe registrar su telefono; los demas roles no', () => {
    expect(pendingFlags({ role: 'GUARDIAN', emailVerifiedAt: verified, phone: null })).toEqual({
      mustCompleteContact: true,
    });
    expect(
      pendingFlags({ role: 'GUARDIAN', emailVerifiedAt: verified, phone: '987654321' }),
    ).toEqual({});
    expect(pendingFlags({ role: 'STUDENT', emailVerifiedAt: verified, phone: null })).toEqual({});
  });

  it('RF-85: un administrador sin 2FA debe activarlo; con 2FA o de otro rol, no', () => {
    const base = { emailVerifiedAt: verified, phone: null };
    expect(pendingFlags({ ...base, role: 'ADMIN' })).toEqual({ mustEnableTwoFactor: true });
    expect(
      pendingFlags({ ...base, role: 'ADMIN', localCredential: { totpSecretEncrypted: null } }),
    ).toEqual({ mustEnableTwoFactor: true });
    expect(
      pendingFlags({ ...base, role: 'ADMIN', localCredential: { totpSecretEncrypted: 'v1.x' } }),
    ).toEqual({});
    expect(pendingFlags({ ...base, role: 'TEACHER' })).toEqual({});
  });

  it('un apoderado nuevo tiene los dos pasos pendientes', () => {
    expect(pendingFlags({ role: 'GUARDIAN', emailVerifiedAt: null, phone: null })).toEqual({
      mustVerifyEmail: true,
      mustCompleteContact: true,
    });
  });
});
