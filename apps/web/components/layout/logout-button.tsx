'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  // Salida (motion-design): el contenido se desvanece con ease-in mientras se cierra la sesión,
  // y luego se vuelve al login. Con movimiento reducido dura la mitad y es solo opacidad.
  async function logout() {
    setPending(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.setAttribute('data-leaving', '');
    const exit = new Promise((r) => window.setTimeout(r, reduce ? 100 : 200));
    try {
      await Promise.all([fetch('/api/v1/auth/logout', { method: 'POST' }), exit]);
    } finally {
      router.replace('/login');
      router.refresh();
      // El login no tiene [data-app-shell]; se limpia la marca cuando ya se navegó.
      window.setTimeout(() => document.documentElement.removeAttribute('data-leaving'), 600);
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
