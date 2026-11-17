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
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CircleHelp, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { focusAfterSuccess, pickFocusTarget } from '../lib/focus';
import { IDLE, type ActionState } from '../lib/action-state';
import { useAnnounce } from './action-feedback';
import { FormMessage, SubmitButton, useFormRefs } from './form-bits';
import { TOUCH } from './styles';

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

type Appearance = 'outline' | 'destructive' | 'primary' | 'quiet' | 'quiet-destructive';

const TRIGGER_VARIANT = {
  outline: 'outline',
  destructive: 'destructive',
  primary: 'default',
  quiet: 'ghost',
  'quiet-destructive': 'ghost',
} as const;

const TRIGGER_CLASS: Record<Appearance | 'default', string> = {
  default: '',
  outline: '',
  destructive: '',
  primary: '',
  quiet: 'px-3 md:min-h-9 text-ink-2 hover:bg-foreground/5 hover:text-foreground',
  'quiet-destructive':
    'px-3 md:min-h-9 text-destructive hover:bg-destructive/10 hover:text-destructive',
};

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
  appearance,
  children,
}: {
  action: Action;
  triggerLabel: ReactNode;
  /**
   * Aspecto del botón que abre el diálogo. Por defecto: contorno (o rojo sólido si es destructiva).
   * 'primary' = sólido de marca; 'quiet' = solo texto; 'quiet-destructive' = solo texto en rojo.
   */
  appearance?: Appearance;
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
        render={
          <Button
            variant={TRIGGER_VARIANT[appearance ?? (destructive ? 'destructive' : 'outline')]}
            className={cn(TOUCH, TRIGGER_CLASS[appearance ?? 'default'])}
          />
        }
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
        <AlertDialogMedia
          aria-hidden="true"
          className={destructive ? 'bg-destructive/10 text-destructive' : undefined}
        >
          {destructive ? <TriangleAlert /> : <CircleHelp />}
        </AlertDialogMedia>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      {children?.(state)}
      <FormMessage state={state} alertRef={alertRef} />
      <AlertDialogFooter>
        <AlertDialogCancel
          variant="ghost"
          className={cn(TOUCH, 'px-4 text-ink-2 hover:bg-foreground/5 hover:text-foreground')}
        >
          Cancelar
        </AlertDialogCancel>
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
  appearance = 'outline',
}: {
  action: Action;
  label: ReactNode;
  pendingText?: string;
  focusId?: string;
  disabled?: boolean;
  /** 'quiet' = solo texto, para filas con varias acciones. */
  appearance?: 'outline' | 'quiet';
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
        <SubmitButton
          variant={appearance === 'quiet' ? 'ghost' : 'outline'}
          className={appearance === 'quiet' ? TRIGGER_CLASS.quiet : undefined}
          pendingText={pendingText}
        >
          {label}
        </SubmitButton>
      )}
      <FormMessage state={state} alertRef={alertRef} />
    </form>
  );
}
