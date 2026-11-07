'use client';

// Eliminar una tarea (Dev 3, RF-30; RN-10). Confirmación con <dialog> nativo y showModal():
// el fondo queda inerte y el foco atrapado por el navegador; Esc cancela (salvo mientras se borra)
// y el foco vuelve al botón que lo abrió. Si el API responde 409 (ya hay entregas o notas), el
// aviso se muestra dentro del diálogo y sugiere editar. Tras borrar, el foco va a la lista.
import { useId, useRef, useState, useTransition } from 'react';
import { deleteAssignment } from './actions';

const BTN =
  'min-h-11 rounded-md px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:opacity-60';

/** id del h2 de la lista y de la región que anuncia el borrado (en page.tsx). */
export const LIST_HEADING_ID = 't-list';
export const LIST_STATUS_ID = 't-list-status';

export function DeleteAssignmentButton({ id, title }: { id: string; title: string }) {
  const uid = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deletedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function openDialog() {
    setError(null);
    document.body.style.overflow = 'hidden';
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
  }

  function close() {
    if (pending) return;
    dialogRef.current?.close();
  }

  // Se llama al cerrar por cualquier vía (Cancelar, Esc permitido o éxito).
  function onClose() {
    document.body.style.overflow = '';
    if (!deletedRef.current) triggerRef.current?.focus();
  }

  function onConfirm() {
    if (pending) return;
    start(async () => {
      const result = await deleteAssignment(id);
      if (!result.ok) {
        setError(
          `No se pudo eliminar «${title}». ${result.message}` +
            (result.conflict ? ' Si necesitas corregirla, usa «Editar la tarea».' : ''),
        );
        return;
      }
      deletedRef.current = true;
      dialogRef.current?.close();
      const status = document.getElementById(LIST_STATUS_ID);
      if (status) status.textContent = `Tarea eliminada: ${title}.`;
      document.getElementById(LIST_HEADING_ID)?.focus();
    });
  }

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        aria-label={`Eliminar la tarea ${title}`}
        className={`${BTN} border border-destructive text-destructive`}
      >
        Eliminar
      </button>
      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby={`${uid}-t`}
        aria-describedby={`${uid}-d`}
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        onClose={onClose}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border bg-background p-4 text-foreground shadow-lg backdrop:bg-black/50"
      >
        <h2 id={`${uid}-t`} className="text-base font-semibold">
          ¿Eliminar la tarea?
        </h2>
        <p id={`${uid}-d`} className="mt-2 text-sm break-words">
          Se eliminará la tarea «{title}». Solo es posible si aún no tiene entregas ni notas.
        </p>
        <div role="alert" className={error ? 'mt-3 text-sm text-destructive' : undefined}>
          {error ? <p className="break-words">{error}</p> : null}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            aria-disabled={pending || undefined}
            className={`${BTN} border`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            className={`${BTN} bg-danger text-white`}
          >
            {pending ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
