import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Estado vacío de una lista: icono suave, título y una frase que dice qué hacer. Sin caja. */
export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <p className="mt-4 text-base font-semibold">{title}</p>
      {children ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}
