'use client';

import * as React from 'react';
import { cn } from 'cn';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

type FileFieldProps = Omit<React.ComponentProps<'input'>, 'type' | 'children'> & {
  /** Texto del botón visual (por defecto «Elegir archivo»). */
  buttonLabel?: string;
  /** Texto cuando no hay archivo (por defecto «Ningún archivo seleccionado»). */
  emptyLabel?: string;
};

/**
 * Selector de archivo con el estilo de Input/Button. El `<input type="file">` real cubre todo el
 * campo con opacidad 0 (sigue siendo el control accesible: teclado, lector de pantalla, `name`,
 * `accept`, `required`, `onChange`); lo que se ve es el botón, el nombre y el tamaño elegido.
 * El `<label htmlFor={id}>` lo pone quien lo usa.
 */
function FileField({
  className,
  buttonLabel = 'Elegir archivo',
  emptyLabel = 'Ningún archivo seleccionado',
  onChange,
  ref,
  ...props
}: FileFieldProps) {
  const innerRef = React.useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = React.useState<{ name: string; size: number } | null>(null);

  const setRefs = (node: HTMLInputElement | null) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  // Mantiene el texto al día si el código vacía el input (`input.value = ''`) o se reinicia el form.
  // Sin lista de dependencias a propósito: el setState devuelve el mismo valor si nada cambió, así
  // que no encadena renders.
  /* eslint-disable react-hooks/exhaustive-deps */
  React.useEffect(() => {
    const file = innerRef.current?.files?.[0] ?? null;
    setPicked((prev) => {
      if (!file) return prev === null ? prev : null;
      return prev && prev.name === file.name && prev.size === file.size
        ? prev
        : { name: file.name, size: file.size };
    });
  });
  /* eslint-enable react-hooks/exhaustive-deps */

  return (
    <div
      data-slot="file-field"
      className={cn(
        'relative mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg border border-input bg-transparent px-1.5 py-1 text-sm transition-colors has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50 has-[input[aria-invalid=true]]:border-destructive md:min-h-9',
        className,
      )}
    >
      <input
        ref={setRefs}
        type="file"
        data-slot="file-field-input"
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setPicked(file ? { name: file.name, size: file.size } : null);
          onChange?.(e);
        }}
        {...props}
      />
      <span
        aria-hidden="true"
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-line-field bg-surface px-3 font-medium text-brand peer-hover:bg-brand-soft"
      >
        {buttonLabel}
      </span>
      <span aria-hidden="true" className="min-w-0 flex-1 truncate text-muted-foreground">
        {picked ? (
          <>
            <span className="text-foreground">{picked.name}</span> · {formatBytes(picked.size)}
          </>
        ) : (
          emptyLabel
        )}
      </span>
    </div>
  );
}

export { FileField };
