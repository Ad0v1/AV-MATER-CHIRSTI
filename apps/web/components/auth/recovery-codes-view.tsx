'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

// RF-85: los códigos de recuperación se muestran una sola vez. Quien los recibe debe poder
// guardarlos (copiar o descargar) y confirmar que lo hizo antes de seguir.
export function RecoveryCodesView({
  codes,
  actionLabel,
  onDone,
}: {
  codes: string[];
  actionLabel: string;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // El formulario anterior desaparece: el foco pasa a este bloque para que el lector de pantalla
  // lo anuncie y el teclado no se pierda.
  useEffect(() => {
    root.current?.focus();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopiedCode(null);
      setNote('Códigos copiados.');
    } catch {
      setNote('No se pudo copiar. Descárgalos o anótalos a mano.');
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setNote('Código copiado.');
    } catch {
      setCopiedCode(null);
      setNote('No se pudo copiar. Selecciona el código y cópialo manualmente.');
    }
  }

  function download() {
    const body = [
      'Códigos de recuperación (cada uno sirve una sola vez)',
      'Guárdalos en un lugar seguro, fuera de este equipo.',
      '',
      ...codes,
      '',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codigos-de-recuperacion.txt';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNote('Archivo descargado.');
  }

  return (
    <div
      ref={root}
      tabIndex={-1}
      role="group"
      aria-label="Códigos de recuperación"
      className="grid gap-4 outline-none"
    >
      <div className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <p>
          Si pierdes tu teléfono, cada uno de estos códigos te deja entrar{' '}
          <strong>una sola vez</strong>. No se vuelven a mostrar: guárdalos ahora.
        </p>
      </div>
      <ul
        aria-label="Lista de códigos"
        className="grid grid-cols-1 gap-2 font-mono text-sm tabular-nums sm:grid-cols-2"
      >
        {codes.map((code) => {
          const isCopied = copiedCode === code;
          return (
            <li
              key={code}
              className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-1"
            >
              <span className="min-w-0 break-all">{code}</span>
              <button
                type="button"
                onClick={() => void copyCode(code)}
                aria-label={isCopied ? `Código ${code} copiado` : `Copiar código ${code}`}
                className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {isCopied ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void copy()}>
          Copiar
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={download}>
          Descargar (.txt)
        </Button>
      </div>
      <p role="status" className="min-h-5 text-xs text-ink-3">
        {note}
      </p>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm leading-relaxed text-ink">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-5 shrink-0 cursor-pointer accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <span>Ya guardé mis códigos de recuperación en un lugar seguro.</span>
      </label>
      <Button type="button" variant="gold" className="h-11" disabled={!saved} onClick={onDone}>
        {actionLabel}
      </Button>
    </div>
  );
}
