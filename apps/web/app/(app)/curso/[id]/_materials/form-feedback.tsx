'use client';

// Piezas de accesibilidad compartidas por los formularios de Dev 3 (materiales y tareas;
// INFORME 15 de UX): errores por campo con aria-invalid + aria-describedby, foco al primer campo
// inválido, errores generales en role="alert" y éxito en role="status" enfocable.
import { useEffect, type ReactNode, type RefObject } from 'react';

/** Une ids para aria-describedby (pista y error), sin vacíos. */
export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const list = ids.filter(Boolean).join(' ');
  return list || undefined;
}

/** Tras cada intento fallido (trigger > 0), lleva el foco al primer campo con aria-invalid. */
export function useFocusFirstInvalid(
  formRef: RefObject<HTMLFormElement | null>,
  trigger: number,
): void {
  useEffect(() => {
    if (trigger === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [formRef, trigger]);
}

/** Tras cada éxito (trigger > 0), lleva el foco al mensaje de resultado. */
export function useFocusOn(ref: RefObject<HTMLElement | null>, trigger: number): void {
  useEffect(() => {
    if (trigger > 0) ref.current?.focus();
  }, [ref, trigger]);
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-destructive">
      {message}
    </p>
  );
}

/** Error general (de la API o de la subida). Siempre montado para que el lector lo anuncie. */
export function FormAlert({ message }: { message: string | null }) {
  return (
    <div role="alert" className={message ? 'mt-3 text-sm text-destructive' : undefined}>
      {message ? <p className="break-words">{message}</p> : null}
    </div>
  );
}

/** Progreso y éxito. Enfocable (tabIndex -1) para llevar el foco al resultado tras guardar. */
export function SuccessRegion({
  regionRef,
  children,
}: {
  regionRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div
      ref={regionRef}
      role="status"
      aria-live="polite"
      tabIndex={-1}
      className="mt-3 rounded-md text-sm outline-none focus:ring-2 focus:ring-ring/60"
    >
      {children}
    </div>
  );
}

export const SUBMIT_BUTTON =
  'mt-4 min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-60';

export const INVALID_FIELD = 'aria-[invalid=true]:border-destructive';
