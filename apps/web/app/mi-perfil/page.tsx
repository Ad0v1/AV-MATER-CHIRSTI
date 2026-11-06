import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ProfileForm } from '@/components/auth/profile-form';
import { TwoFactorPanel } from '@/components/auth/two-factor-panel';
import { apiServer } from '@/lib/api/server';
import { HOME_BY_ROLE, ROLE_LABELS } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Mi perfil' };

type Profile = {
  code: string | null;
  fullName: string;
  contactEmail: string | null;
  emailVerified: boolean;
  phone: string | null;
  address: string | null;
};

export default function ProfilePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 sm:px-8">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <Suspense fallback={<p className="text-sm text-ink-3">Cargando…</p>}>
          <ProfileContent />
        </Suspense>
      </div>
    </main>
  );
}

// Lee la sesión (dato de la petición), por eso va dentro de Suspense.
async function ProfileContent() {
  const user = await requireUser();
  // Los pasos anteriores del primer ingreso van antes: contraseña, política y correo.
  if (user.mustChangePassword) redirect('/cambiar-clave');
  if (user.mustAcceptPolicy) redirect('/politica');
  if (user.mustVerifyEmail) redirect('/verificar-correo');
  if (user.mustEnableTwoFactor) redirect('/verificacion-dos-pasos');

  let profile: Profile;
  try {
    profile = await apiServer.get<Profile>('/auth/profile');
  } catch {
    redirect('/login');
  }
  const home = HOME_BY_ROLE[user.role];
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">
        {user.mustCompleteContact ? 'Completa tus datos' : 'Mi perfil'}
      </h1>
      <dl className="mt-3 mb-6 grid gap-1 text-sm text-ink-2">
        <div className="flex flex-wrap gap-1">
          <dt className="font-medium">Nombre:</dt>
          <dd>{profile.fullName}</dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="font-medium">Perfil:</dt>
          <dd>{ROLE_LABELS[user.role]}</dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="font-medium">Código de usuario:</dt>
          <dd className="tabular-nums">{profile.code ?? '—'}</dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="font-medium">Correo:</dt>
          <dd className="break-all">
            {profile.contactEmail ?? '—'}
            {profile.contactEmail
              ? profile.emailVerified
                ? ' (verificado)'
                : ' (sin verificar)'
              : ''}
          </dd>
        </div>
      </dl>
      <ProfileForm
        phone={profile.phone}
        address={profile.address}
        phoneRequired={user.role === 'GUARDIAN'}
        pending={user.mustCompleteContact}
        homePath={home}
      />
      {user.role === 'ADMIN' && !user.mustCompleteContact ? <TwoFactorSection /> : null}
      {!user.mustCompleteContact && (
        <p className="mt-6 border-t border-line pt-4 text-sm">
          <Link href={home} className="text-brand underline-offset-2 hover:underline">
            Volver al inicio
          </Link>{' '}
          ·{' '}
          <Link href="/cambiar-clave" className="text-brand underline-offset-2 hover:underline">
            Cambiar mi contraseña
          </Link>
        </p>
      )}
    </>
  );
}

// Solo el administrador: estado de su 2FA y códigos de recuperación (RF-85).
async function TwoFactorSection() {
  let left = 0;
  try {
    left = (await apiServer.get<{ recoveryCodesLeft: number }>('/auth/2fa/status'))
      .recoveryCodesLeft;
  } catch {
    return null;
  }
  return <TwoFactorPanel recoveryCodesLeft={left} />;
}
