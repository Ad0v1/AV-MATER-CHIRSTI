'use client';

// Logo institucional (RF-61, U5): PNG o JPEG de hasta 512 KB, sin SVG. La API revisa los bytes
// y lo pasa por el antivirus; aquí solo se avisa antes de enviar.
import { useActionState, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FormMessage,
  SubmitButton,
  useFormRefs,
} from '@/app/(app)/admin/_shared/components/form-bits';
import { IDLE } from '@/app/(app)/admin/_shared/lib/action-state';
import { uploadLogoAction } from '../_lib/actions';
import { checkLogoFile, LOGO_TYPES, type LogoView } from '../_lib/settings-form';

export function LogoForm({ logo, name }: { logo: LogoView | null; name: string }) {
  const [state, formAction] = useActionState(uploadLogoAction, IDLE);
  const { formRef, alertRef } = useFormRefs(state);
  const [localError, setLocalError] = useState<string | null>(null);
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const error = localError ?? state.fieldErrors?.logo;

  return (
    <div className="flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-start">
      <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-lg bg-muted sm:w-40">
        {logo ? (
          // URL firmada de S3 con vigencia corta: next/image no aplica (no hay dominio fijo).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo.url}
            alt={`Logo actual de ${name}`}
            className="max-h-20 max-w-full object-contain"
          />
        ) : (
          <p className="px-2 text-center text-sm text-muted-foreground">Sin logo</p>
        )}
      </div>
      <form
        ref={formRef}
        action={formAction}
        noValidate
        aria-label="Logo de la institución"
        className="flex flex-1 flex-col gap-3"
        onSubmit={(e) => {
          const input = e.currentTarget.elements.namedItem('logo') as HTMLInputElement | null;
          const file = input?.files?.[0] ?? null;
          const check = checkLogoFile(file ? { size: file.size, type: file.type } : null);
          if (!check.ok) {
            e.preventDefault();
            setLocalError(check.message);
            input?.focus();
          } else {
            setLocalError(null);
          }
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>Imagen del logo</Label>
          <Input
            id={id}
            name="logo"
            type="file"
            accept={LOGO_TYPES.join(',')}
            required
            onChange={() => setLocalError(null)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            className="h-auto min-h-11 py-2"
          />
          <p id={hintId} className="text-sm text-muted-foreground">
            PNG o JPEG de hasta 512 KB y 4096 píxeles de lado. Reemplaza al logo actual.
          </p>
          {error ? (
            <p id={errorId} className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        {/* El detalle del error va junto al campo; el aviso general solo sin error de campo. */}
        {state.fieldErrors?.logo ? null : <FormMessage state={state} alertRef={alertRef} />}
        <div>
          <SubmitButton pendingText="Subiendo…">Subir logo</SubmitButton>
        </div>
      </form>
    </div>
  );
}
