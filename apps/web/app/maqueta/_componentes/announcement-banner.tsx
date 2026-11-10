import Image from 'next/image';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';

/**
 * Aviso institucional (guia 4.8): banda dorado suave, borde izquierdo de marca y miniatura
 * aviso.webp de 64 px (movil) / 96 px (escritorio), decorativa y sin texto encima.
 */
export function AnnouncementBanner({
  titulo,
  texto,
  href,
  enlace = 'Leer aviso',
}: {
  titulo: string;
  texto: string;
  href: string;
  enlace?: string;
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border-l-4 border-l-brand bg-gold-soft px-4 py-3 text-brand-dark shadow-(--shadow-card) md:gap-4"
    >
      <Image
        unoptimized
        src="/maqueta/img/aviso.webp"
        alt=""
        width={96}
        height={96}
        className="size-16 shrink-0 rounded-lg object-cover md:size-24"
      />
      <div className="min-w-0 flex-1">
        <p className="font-heading flex items-center gap-2 text-base font-semibold text-brand-dark">
          <Megaphone aria-hidden="true" className="size-5 shrink-0 text-brand" />
          {titulo}
        </p>
        <p className="text-base text-ink">
          {texto}{' '}
          <Link
            href={href}
            className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
          >
            {enlace}
          </Link>
        </p>
      </div>
    </div>
  );
}
