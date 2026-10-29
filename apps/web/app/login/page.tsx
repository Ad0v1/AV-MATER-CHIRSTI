import { LoginForm } from '@/components/auth/login-form';

export const metadata = { title: 'Iniciar sesión · Aula Virtual' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Aula Virtual</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Ingresa con tu cuenta para continuar.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
