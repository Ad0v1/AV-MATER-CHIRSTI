import Link from 'next/link';
import { RecoverForm } from '@/components/auth/recover-form';

export const metadata = { title: 'Recuperar contraseña' };

export default function RecoverPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 sm:px-8">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-ink">Recuperar contraseña</h1>
        <p className="mt-1 mb-6 text-sm text-ink-2">
          Te enviaremos un código al correo que verificaste en tu primer ingreso.
        </p>
        <RecoverForm />
        <p className="mt-6 border-t border-line pt-4 text-xs text-ink-3">
          ¿No tienes correo verificado? Comunícate con el administrador del colegio.{' '}
          <Link href="/login" className="text-brand underline-offset-2 hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
