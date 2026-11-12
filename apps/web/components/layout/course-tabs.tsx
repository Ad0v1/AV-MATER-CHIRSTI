'use client';

// B1 (Dev 1, RF-08): barra de secciones del curso. Es navegacion (enlaces), no un tablist ARIA.
// La activa lleva aria-current="page" y se marca con borde inferior y peso, no solo con color.
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/roles';
import { courseTabsFor, isTabActive } from './course-nav-model';

export function CourseTabs({ role, courseSectionId }: { role: Role; courseSectionId: string }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  // En pantallas estrechas, deja visible la pestaña activa sin mover la pagina en vertical.
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [pathname]);
  return (
    <CourseTabsView
      role={role}
      courseSectionId={courseSectionId}
      pathname={pathname}
      navRef={ref}
    />
  );
}

export function CourseTabsView({
  role,
  courseSectionId,
  pathname,
  navRef,
}: {
  role: Role;
  courseSectionId: string;
  pathname: string | null;
  navRef?: React.Ref<HTMLElement>;
}) {
  const tabs = courseTabsFor(role, courseSectionId);
  if (tabs.length === 0) return null;
  return (
    <nav
      ref={navRef}
      aria-label="Secciones del curso"
      className="max-w-full scroll-px-4 overflow-x-auto border-b"
    >
      <ul className="flex w-max gap-1 px-4 md:px-8">
        {tabs.map((t) => {
          const active = isTabActive(pathname, t.href);
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-t-md border-b-2 px-2 text-sm md:px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  active
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
