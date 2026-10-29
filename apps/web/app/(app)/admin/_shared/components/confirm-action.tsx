'use client';

// Acción con confirmación en un diálogo (foco atrapado, Escape cierra).
// - Si la API responde con error, el diálogo sigue abierto y muestra el mensaje.
// - Si sale bien, se cierra, el resultado se anuncia en la región de estado siempre montada y el
//   foco va al encabezado del elemento afectado (`focusId`) o, si ya no existe, al título de la
//   página. Al cancelar, el foco vuelve al botón (ux-accesibilidad, Decisiones 1–4).
// - Cada apertura monta un formulario nuevo (`key`): no quedan el error ni el motivo anteriores.
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { focusAfterSuccess, pickFocusTarget } from '../lib/focus';
import { IDLE, type ActionState } from '../lib/action-state';
import { useAnnounce } from './action-feedback';
import { FormMessage, SubmitButton, useFormRefs } from './form-bits';
import { TOUCH } from './styles';

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Tras refrescar, si el foco quedó en <body> (el botón desapareció), lo lleva al destino. */
function refocusIfLost(focusId?: string) {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (!active || active === document.body) focusAfterSuccess(focusId);
  });
}

export function ConfirmAction({
  action,
  triggerLabel,
  title,
  description,
  confirmLabel,
  focusId,
  triggerDescribedBy,
  destructive = false,
  disabled = false,
  children,
}: {
  action: Action;
  triggerLabel: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Id del encabezado que recibe el foco tras el éxito (ver _lib/focus.ts). */
  focusId?: string;
  /** Id de un texto visible que explica el botón (p. ej. una condición previa). */
  triggerDescribedBy?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Campos extra del formulario (por ejemplo, el motivo). Reciben el estado para sus errores. */
  children?: (state: ActionState) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  const succeeded = useRef(false);
  const announce = useAnnounce();

  const onSuccess = (message: string | undefined) => {
    succeeded.current = true;
    if (message) announce(message);
    setOpen(false);
    refocusIfLost(focusId);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          succeeded.current = false;
          setOpening((n) => n + 1);
        }
        setOpen(next);
      }}
    >
      <AlertDialogTrigger
        disabled={disabled}
        aria-describedby={triggerDescribedBy}
        render={<Button variant={destructive ? 'destructive' : 'outline'} className={TOUCH} />}
      >
        {triggerLabel}
      </AlertDialogTrigger>
      <AlertDialogContent
        finalFocus={() => {
          if (!succeeded.current) return true; // cancelar o Escape: vuelve al botón
          const id = pickFocusTarget([focusId], (x) => document.getElementById(x) !== null);
          return id ? document.getElementById(id) : true;
        }}
        className="max-h-[90dvh] overflow-y-auto data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md"
      >
        <ConfirmForm
          key={opening}
          action={action}
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          destructive={destructive}
          onSuccess={onSuccess}
        >
          {children}
        </ConfirmForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmForm({
  action,
  title,
  description,
  confirmLabel,
  destructive,
  onSuccess,
  children,
}: {
  action: Action;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive: boolean;
  onSuccess: (message: string | undefined) => void;
  children?: (state: ActionState) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const { formRef, alertRef } = useFormRefs(state, { announceOk: false });
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  useEffect(() => {
    if (state.status === 'ok') onSuccessRef.current(state.message);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4" noValidate>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      {children?.(state)}
      <FormMessage state={state} alertRef={alertRef} />
      <AlertDialogFooter>
        <AlertDialogCancel className={TOUCH}>Cancelar</AlertDialogCancel>
        <SubmitButton variant={destructive ? 'destructive' : 'default'}>
          {confirmLabel}
        </SubmitButton>
      </AlertDialogFooter>
    </form>
  );
}

/**
 * Acción directa de un botón (sin confirmación). Si sale bien, anuncia el resultado y lleva el
 * foco al encabezado `focusId` (el botón suele cambiar tras refrescar).
 */
export function InlineAction({
  action,
  label,
  pendingText,
  focusId,
  disabled = false,
}: {
  action: Action;
  label: string;
  pendingText?: string;
  focusId?: string;
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const { formRef, alertRef } = useFormRefs(state, { announceOk: false });
  const announce = useAnnounce();
  useEffect(() => {
    if (state.status !== 'ok') return;
    if (state.message) announce(state.message);
    requestAnimationFrame(() => focusAfterSuccess(focusId));
  }, [state, announce, focusId]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1">
      {disabled ? (
        <Button type="button" variant="outline" disabled className={TOUCH}>
          {label}
        </Button>
      ) : (
        <SubmitButton variant="outline" pendingText={pendingText}>
          {label}
        </SubmitButton>
      )}
      <FormMessage state={state} alertRef={alertRef} />
    </form>
  );
}
