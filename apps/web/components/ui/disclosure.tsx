import type { ComponentProps, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';

type DisclosureProps = Omit<ComponentProps<'details'>, 'children'> & {
  /** Contenido del `<summary>` (texto de la fila que se pulsa). */
  summary: ReactNode;
  /** Clases del `<summary>` (p. ej. `w-fit border px-4` o `py-2`). */
  summaryClassName?: string;
  /** Nombre accesible del `<summary>` cuando el texto visible no basta. */
  summaryAriaLabel?: string;
  children?: ReactNode;
};

/**
 * Bloque desplegable nativo (`<details>`/`<summary>`) con marcador propio: sin el triángulo del
 * navegador, con un chevron que gira al abrir, foco visible y objetivo táctil de 44 px. Sin estado
 * ni hooks: sirve en Server y Client Components. El contenido se pasa como `children`.
 */
function Disclosure({
  summary,
  summaryClassName,
  summaryAriaLabel,
  className,
  children,
  ...props
}: DisclosureProps) {
  return (
    <details data-slot="disclosure" className={cn('group/disclosure', className)} {...props}>
      <summary
        aria-label={summaryAriaLabel}
        className={cn(
          'flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden [&::marker]:hidden',
          summaryClassName,
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-ink-2 transition-transform group-open/disclosure:rotate-90 motion-reduce:transition-none"
        />
        {summary}
      </summary>
      {children}
    </details>
  );
}

export { Disclosure };
