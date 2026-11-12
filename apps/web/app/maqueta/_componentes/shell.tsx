'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  BookOpen,
  CalendarDays,
  FileText,
  FlaskConical,
  House,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { BottomNav, type DestinoNav } from './bottom-nav';
import { cursoStyle, type CursoColor } from './colores';

type Rol = 'estudiante' | 'docente' | 'apoderado';

const RUTA_LOGIN = '/maqueta/login';
const INICIO = '/maqueta/inicio';
const CURSOS = '/maqueta/curso';
const PENDIENTE = '/maqueta'; // Destinos aun sin maquetar: vuelven al indice.

const DESTINOS: Record<Rol, DestinoNav[]> = {
  estudiante: [
    { clave: 'inicio', etiqueta: 'Inicio', href: `${INICIO}/estudiante`, icono: House },
    { clave: 'cursos', etiqueta: 'Cursos', href: CURSOS, icono: BookOpen },
    { clave: 'notas', etiqueta: 'Notas', href: PENDIENTE, icono: FileText },
    { clave: 'avisos', etiqueta: 'Avisos', href: PENDIENTE, icono: Bell, contador: 3 },
  ],
  docente: [
    { clave: 'inicio', etiqueta: 'Inicio', href: `${INICIO}/docente`, icono: House },
    { clave: 'cursos', etiqueta: 'Cursos', href: CURSOS, icono: BookOpen },
    { clave: 'calendario', etiqueta: 'Calendario', href: PENDIENTE, icono: CalendarDays },
    { clave: 'avisos', etiqueta: 'Avisos', href: PENDIENTE, icono: Bell, contador: 2 },
  ],
  apoderado: [
    { clave: 'inicio', etiqueta: 'Inicio', href: `${INICIO}/apoderado`, icono: House },
    { clave: 'notas', etiqueta: 'Notas', href: PENDIENTE, icono: FileText },
    { clave: 'calendario', etiqueta: 'Calendario', href: PENDIENTE, icono: CalendarDays },
    { clave: 'avisos', etiqueta: 'Avisos', href: PENDIENTE, icono: Bell, contador: 3 },
  ],
};

const MIS_CURSOS: { nombre: string; color: CursoColor }[] = [
  { nombre: 'Matemática', color: 'terracota' },
  { nombre: 'Comunicación', color: 'azul' },
  { nombre: 'Ciencia y Tecnología', color: 'bosque' },
  { nombre: 'Personal Social', color: 'ciruela' },
];

function rolDe(ruta: string): Rol {
  if (ruta.includes('/docente')) return 'docente';
  if (ruta.includes('/apoderado')) return 'apoderado';
  return 'estudiante';
}

function activoDe(ruta: string): string {
  if (ruta.startsWith(CURSOS)) return 'cursos';
  if (ruta.startsWith(INICIO)) return 'inicio';
  return '';
}

const NOMBRES: Record<Rol, string> = {
  estudiante: 'Valeria Rojas (estudiante)',
  docente: 'Rosa Quispe (docente)',
  apoderado: 'Carmen Salas (apoderada)',
};

export function MaquetaShell({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  // El login de la maqueta va fuera del shell: sin sidebar, barra superior ni barra inferior.
  if (ruta === RUTA_LOGIN) return <>{children}</>;
  const rol = rolDe(ruta);
  const activo = activoDe(ruta);
  const destinos = DESTINOS[rol];

  return (
    <div className="flex min-h-dvh">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-gold px-4 py-2 font-semibold text-brand-dark focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>

      {/* Sidebar marron: solo desde 768 px. */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 overflow-y-auto bg-sidebar p-3 text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-2 py-2">
          <Image
            unoptimized
            src="/brand/escudo.webp"
            alt="Colegio Mater Christi"
            width={40}
            height={40}
            className="size-10 object-contain"
          />
          <span className="font-heading text-base leading-tight font-semibold">Aula Virtual</span>
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          <ul className="flex flex-col gap-1">
            {destinos.map(({ clave, etiqueta, href, icono: Icono }) => {
              const esActivo = clave === activo;
              return (
                <li key={clave}>
                  <Link
                    href={href}
                    aria-current={esActivo ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors',
                      esActivo
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'hover:bg-white/10',
                    )}
                  >
                    <Icono className="size-5" aria-hidden="true" />
                    {etiqueta}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {rol !== 'apoderado' ? (
          <nav aria-labelledby="mis-cursos" className="flex flex-col gap-1">
            <h2
              id="mis-cursos"
              className="px-3 text-xs font-semibold tracking-normal text-white/80"
            >
              Mis cursos
            </h2>
            <ul className="flex flex-col gap-1">
              {MIS_CURSOS.map((c) => (
                <li key={c.nombre} style={cursoStyle(c.color)}>
                  <Link
                    href={CURSOS}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-base hover:bg-white/10"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full bg-(--course)"
                    />
                    {c.nombre}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <div className="mt-auto flex items-center gap-3 border-t border-sidebar-border px-2 pt-3 text-sm">
          <UserRound className="size-5" aria-hidden="true" />
          {NOMBRES[rol]}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior: 56 px en movil, 48 px en escritorio. */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 md:h-12 md:justify-end md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Image
              unoptimized
              src="/brand/escudo.webp"
              alt="Colegio Mater Christi"
              width={32}
              height={32}
              className="size-8 shrink-0 object-contain"
            />
            <span className="font-heading text-base font-semibold text-brand">Aula Virtual</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Notificaciones: 3 nuevas"
              className="relative flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface-2"
            >
              <Bell className="size-5" aria-hidden="true" />
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-danger text-[0.6875rem] leading-none font-semibold text-white"
              >
                3
              </span>
            </button>
            <button
              type="button"
              aria-label={`Menú de cuenta de ${NOMBRES[rol]}`}
              className="flex size-11 items-center justify-center rounded-full md:hidden"
            >
              <span className="font-heading flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                {NOMBRES[rol].charAt(0)}
              </span>
            </button>
          </div>
        </header>

        <div
          role="note"
          className="flex items-center gap-2 bg-gold px-4 py-2 text-sm font-semibold text-brand-dark md:px-6"
        >
          <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
          Maqueta: datos de ejemplo
          <Link href="/maqueta" className="ml-auto underline underline-offset-4">
            Índice
          </Link>
        </div>

        <main
          id="contenido"
          className="mx-auto w-full max-w-288 flex-1 px-4 pt-4 pb-[calc(64px+env(safe-area-inset-bottom)+16px)] md:px-6 md:pt-6 md:pb-8 lg:px-8"
        >
          {children}
        </main>
      </div>

      <BottomNav destinos={destinos} activo={activo} />
    </div>
  );
}
