'use client';

import * as React from 'react';
import { Menu } from '@base-ui/react/menu';
import { cn } from 'cn';

function DropdownMenu({ ...props }: Menu.Root.Props) {
  return <Menu.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({ ...props }: Menu.Trigger.Props) {
  return <Menu.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  align = 'start',
  sideOffset = 6,
  children,
  ...props
}: Menu.Popup.Props & Pick<Menu.Positioner.Props, 'align' | 'sideOffset'>) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} sideOffset={sideOffset} className="isolate z-50">
        <Menu.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'min-w-52 origin-(--transform-origin) rounded-xl bg-surface p-1.5 shadow-lg shadow-brand/10 ring-1 ring-foreground/5 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

/** Elemento del menú que es un enlace (usa `render={<Link href=... />}` para navegar en el cliente). */
function DropdownMenuLinkItem({ className, ...props }: Menu.LinkItem.Props) {
  return (
    <Menu.LinkItem
      data-slot="dropdown-menu-item"
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm outline-none data-highlighted:bg-brand-soft data-highlighted:text-brand md:min-h-9 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-highlighted:[&_svg]:text-brand',
        className,
      )}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLinkItem };
