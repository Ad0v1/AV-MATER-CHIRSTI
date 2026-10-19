import Link from 'next/link';
import { COURSE_ROUTES, ROUTES } from '@/lib/routes';

export default function Home() {
  const links = [...Object.values(ROUTES), ...Object.values(COURSE_ROUTES).map((r) => r('demo'))];

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Aula Virtual Institucional</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Mapa de rutas del Sprint 0 (provisional; se reemplaza por el layout base).
      </p>
      <ul className="mt-6 space-y-2">
        {links.map((href) => (
          <li key={href}>
            <Link className="underline" href={href}>
              {href}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
