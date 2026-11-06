'use client';

import { useState } from 'react';
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

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setNote('Códigos copiados.');
    } catch {
      setNote('No se pudo copiar. Descárgalos o anótalos a mano.');
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
    <div className="grid gap-4">
      <p className="rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink-2">
        Si pierdes tu teléfono, cada uno de estos códigos te deja entrar{' '}
        <strong>una sola vez</strong>. No se vuelven a mostrar: guárdalos ahora.
      </p>
      <ul
        aria-label="Códigos de recuperación"
        className="grid grid-cols-2 gap-2 font-mono text-sm tabular-nums"
      >
        {codes.map((code) => (
          <li key={code} className="rounded-md border border-line bg-surface px-2 py-1.5">
            {code}
          </li>
        ))}
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
      <label className="flex min-h-11 items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-1 size-4"
        />
        <span>Ya guardé mis códigos de recuperación en un lugar seguro.</span>
      </label>
      <Button type="button" variant="gold" className="h-11" disabled={!saved} onClick={onDone}>
        {actionLabel}
      </Button>
    </div>
  );
}
