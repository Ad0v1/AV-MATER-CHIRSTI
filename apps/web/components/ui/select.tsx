'use client';

// Select propio sobre @base-ui/react/select: lista con el estilo del aula (no la del sistema
// operativo), teclado completo y valor enviado en formularios. Base UI renderiza un <input>
// oculto con `name`, así que funciona dentro de <form>, <Form> de Next (GET y POST) y FormData.
import * as React from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from 'cn';

export type SelectOption = { value: string; label: string; disabled?: boolean };

type SelectProps = {
  options: readonly SelectOption[];
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Texto cuando no hay valor elegido (o el valor no está entre las opciones). */
  placeholder?: string;
  className?: string;
  popupClassName?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
};

function Select({
  options,
  name,
  id,
  value,
  defaultValue,
  onValueChange,
  required,
  disabled,
  placeholder = 'Elegir…',
  className,
  popupClassName,
  ...aria
}: SelectProps) {
  // Como un <select> nativo, sin valor ni defaultValue arranca en la primera opción.
  // Se fija al montar (igual que un <select> nativo): cambiarlo después dispara un aviso de Base UI.
  // Para reiniciarlo desde fuera, cambia la `key` del componente.
  const [initial] = React.useState(() =>
    value === undefined ? (defaultValue ?? options[0]?.value ?? '') : undefined,
  );
  const controlled = value === undefined ? {} : { value };
  return (
    <SelectPrimitive.Root
      name={name}
      id={id}
      items={options as SelectOption[]}
      required={required}
      disabled={disabled}
      defaultValue={initial}
      onValueChange={(next) => onValueChange?.(next ?? '')}
      {...controlled}
    >
      <SelectPrimitive.Trigger
        data-slot="select-trigger"
        className={cn(
          'group/select flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-base transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[popup-open]:border-ring md:h-9 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
          className,
        )}
        {...aria}
      >
        <SelectPrimitive.Value
          className="min-w-0 flex-1 truncate data-[placeholder]:text-muted-foreground"
          placeholder={placeholder}
        >
          {(current: string | null) => {
            const match = options.find((o) => o.value === current);
            return match ? match.label : placeholder;
          }}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
          <ChevronDownIcon className="size-4" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-50 outline-none"
        >
          <SelectPrimitive.Popup
            data-slot="select-popup"
            className={cn(
              'max-h-[min(var(--available-height),20rem)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-none',
              popupClassName,
            )}
          >
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                label={option.label}
                disabled={option.disabled}
                data-slot="select-item"
                className="relative flex min-h-11 cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2.5 text-base outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground md:min-h-8 md:text-sm"
              >
                <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex items-center">
                  <CheckIcon className="size-4" aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export { Select };
