'use client';

// Piezas comunes de los formularios de /admin/estructura (WCAG 2.1 AA, desde 360 px):
// etiqueta visible, aria-invalid + aria-describedby, foco en el primer error y botones de 44 px.
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ActionState } from '../_lib/types';
import { useAnnounce } from './action-feedback';
import { CONTROL, TOUCH } from './styles';
import { REASON_NOTICE, reasonCounter, type ReasonLimits } from '../_lib/validation';

/**
 * Tras un error, lleva el foco al primer campo inválido del formulario o, si no hay, al aviso.
 */
export function useFocusOnError(
  formRef: RefObject<HTMLFormElement | null>,
  state: ActionState,
  alertRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (state.status !== 'error') return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? alertRef?.current)?.focus();
  }, [state, formRef, alertRef]);
}

export function SubmitButton({
  children,
  pendingText = 'Guardando…',
  variant,
  className,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(TOUCH, className)}
    >
      {pending ? pendingText : children}
    </Button>
  );
}

/**
 * Error del formulario como `alert` (con detalles). El éxito no se pinta aquí: se anuncia en la
 * región de estado siempre montada (ActionFeedbackProvider, vía useFormRefs).
 */
export function FormMessage({
  state,
  alertRef,
}: {
  state: ActionState;
  alertRef?: RefObject<HTMLDivElement | null>;
}) {
  if (state.status !== 'error' || !state.message) return null;
  return (
    <Alert
      variant="destructive"
      ref={alertRef}
      tabIndex={-1}
      // Recibe el foco por código: indicador visible siempre (no solo con teclado).
      className="outline-none focus:ring-3 focus:ring-ring/60"
    >
      <AlertTitle>No se pudo guardar</AlertTitle>
      <AlertDescription>
        <p className="break-words">{state.message}</p>
        {state.details && state.details.length > 0 ? (
          <ul className="mt-1 list-disc pl-5">
            {state.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

type FieldProps = {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
};

function describedBy(...ids: (string | false | undefined)[]): string | undefined {
  const list = ids.filter(Boolean).join(' ');
  return list || undefined;
}

export function TextField({
  name,
  label,
  error,
  hint,
  className,
  ...input
}: FieldProps & Omit<React.ComponentProps<'input'>, 'name'>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId)}
        className={CONTROL}
        {...input}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  name,
  label,
  error,
  hint,
  className,
  options,
  ...select
}: FieldProps & {
  options: { value: string; label: string }[];
} & Omit<React.ComponentProps<'select'>, 'name' | 'size'>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId)}
        className="w-full [&_select]:h-11 md:[&_select]:h-9"
        {...select}
      >
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Campo de motivo con aviso fijo (no se oculta) y contador. El aviso recuerda que el texto va a
 * la bitácora y no debe llevar datos de menores (docs/03).
 */
export function ReasonField({
  label,
  limits,
  error,
  defaultValue = '',
}: {
  label: string;
  limits: ReasonLimits;
  error?: string;
  defaultValue?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const noticeId = `${id}-notice`;
  const counterId = `${id}-counter`;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {limits.required ? null : (
          <>
            {' '}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </>
        )}
      </Label>
      <p
        id={noticeId}
        className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      >
        {REASON_NOTICE}
      </p>
      <Textarea
        id={id}
        name="reason"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={limits.max}
        required={limits.required}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(noticeId, counterId, errorId)}
      />
      <p id={counterId} className="text-sm text-muted-foreground">
        {reasonCounter(value, limits)}
      </p>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Ref + foco en el primer error para un formulario con `useActionState`. Si sale bien, anuncia
 * el mensaje en la región de estado siempre montada; los formularios de la página no mueven el
 * foco (ux-accesibilidad, Decisión 6). `announceOk: false` cuando el componente anuncia por su
 * cuenta (ConfirmAction, InlineAction).
 */
export function useFormRefs(state: ActionState, options: { announceOk?: boolean } = {}) {
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const announce = useAnnounce();
  const announceOk = options.announceOk ?? true;
  useFocusOnError(formRef, state, alertRef);
  useEffect(() => {
    if (announceOk && state.status === 'ok' && state.message) announce(state.message);
  }, [state, announce, announceOk]);
  return { formRef, alertRef };
}
