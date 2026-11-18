'use client';

// "Nuevo usuario": un solo botón con las tres altas, en vez de tres botones sueltos.
import Link from 'next/link';
import { ChevronDown, GraduationCap, Presentation, UsersRound } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { TOUCH } from '../../_shared/components/styles';
import { USERS_PATH } from '../_lib/users';

export function NewUserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className={`${TOUCH} gap-2`} />}>
        Nuevo usuario
        <ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLinkItem render={<Link href={`${USERS_PATH}/nuevo/estudiante`} />}>
          <GraduationCap aria-hidden="true" />
          Estudiante
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href={`${USERS_PATH}/nuevo/docente`} />}>
          <Presentation aria-hidden="true" />
          Docente
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href={`${USERS_PATH}/nuevo/apoderado`} />}>
          <UsersRound aria-hidden="true" />
          Apoderado
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
