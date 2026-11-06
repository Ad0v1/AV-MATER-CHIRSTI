'use client';

// Editar y retirar un anuncio (RF-32). Solo se muestra si la API dice canEdit; la API vuelve a
// validar autor o ADMIN. El retiro pide confirmación en un diálogo (foco atrapado, Escape cierra).
import { useState, useTransition } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { deleteAnnouncement } from '../_lib/actions';
import { AnnouncementForm } from './announcement-form';
import { announceListStatus } from './list-status';

export function AnnouncementActions({
  id,
  title,
  body,
}: {
  id: string;
  title: string;
  body: string;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <div className="mt-3 rounded-md border p-3">
        <AnnouncementForm
          mode={{ kind: 'edit', id, title, body }}
          onDone={() => {
            setEditing(false);
            announceListStatus('Anuncio actualizado.', false);
            // El foco va al título del anuncio editado (tabIndex -1).
            requestAnimationFrame(() => document.getElementById(`an-${id}`)?.focus());
          }}
          onCancel={() => {
            setEditing(false);
            requestAnimationFrame(() => document.getElementById(`an-${id}`)?.focus());
          }}
        />
      </div>
    );
  }

  function confirmDelete() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await deleteAnnouncement(id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setOpen(false);
      announceListStatus('Anuncio retirado.', true);
    });
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 px-4"
        onClick={() => setEditing(true)}
        aria-label={`Editar el anuncio «${title}»`}
      >
        Editar
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // No se cierra mientras se está retirando (Escape o clic fuera).
          if (!next && pending) return;
          setError(null);
          setOpen(next);
        }}
      >
        <AlertDialogTrigger
          render={<Button variant="destructive" className="min-h-11 px-4" />}
          aria-label={`Retirar el anuncio «${title}»`}
        >
          Retirar
        </AlertDialogTrigger>
        <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar este anuncio?</AlertDialogTitle>
            <AlertDialogDescription>
              «{title}» dejará de verse en las listas. Los avisos ya enviados quedarán sin enlace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div role="status" aria-live="polite" className="text-sm">
            {pending ? 'Retirando el anuncio…' : ''}
          </div>
          <div role="alert" className={error ? 'text-sm text-destructive' : undefined}>
            {error ? <p>{error}</p> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 px-4" disabled={pending}>
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 px-4"
              onClick={confirmDelete}
              aria-disabled={pending || undefined}
            >
              {pending ? 'Retirando…' : 'Retirar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
