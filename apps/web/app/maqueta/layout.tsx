import type { Metadata } from 'next';
import { Lexend, Source_Sans_3 } from 'next/font/google';
import type { ReactNode } from 'react';
import { MaquetaShell } from './_componentes/shell';
import './maqueta.css';

const lexend = Lexend({ variable: '--font-lexend', subsets: ['latin'] });
const sourceSans = Source_Sans_3({ variable: '--font-source-sans-3', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Maqueta de diseño',
  robots: { index: false, follow: false },
};

export default function MaquetaLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`maqueta ${lexend.variable} ${sourceSans.variable}`}>
      <MaquetaShell>{children}</MaquetaShell>
    </div>
  );
}
