'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <Button
      variant="outline"
      onClick={logout}
      disabled={pending}
      aria-label={pending ? 'Cerrando sesión' : 'Cerrar sesión'}
      className="h-10 w-full justify-start rounded-xl border-white/15 bg-white/5 px-3 text-sm font-medium text-white/80 shadow-none hover:border-white/25 hover:bg-white/10 hover:text-white disabled:text-white/50 [&_svg]:text-white/65 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      <LogOut />
      <span className="group-data-[collapsible=icon]:hidden">
        {pending ? 'Cerrando…' : 'Cerrar sesión'}
      </span>
    </Button>
  );
}
