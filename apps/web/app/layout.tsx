import type { Metadata } from 'next';
import { Geist_Mono, Lexend, Source_Sans_3 } from 'next/font/google';
import { Suspense } from 'react';
import { RootRouteTransition } from '@/components/layout/route-transition';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const lexend = Lexend({
  variable: '--font-lexend',
  subsets: ['latin'],
});

const sourceSans = Source_Sans_3({
  variable: '--font-source-sans-3',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Aula Virtual - Mater Christi',
    template: '%s | Aula Virtual - Mater Christi',
  },
  description: 'Aula Virtual Institucional',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="es"
      className={`${lexend.variable} ${sourceSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          {/* usePathname() es un dato de la peticion: Next exige Suspense para poder prerenderizar. */}
          <Suspense fallback={null}>
            <RootRouteTransition>{children}</RootRouteTransition>
          </Suspense>
        </TooltipProvider>
      </body>
    </html>
  );
}
