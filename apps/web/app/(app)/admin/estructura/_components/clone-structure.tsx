'use client';

// Clonar la estructura de un año anterior en este año (RF-15, D-029). El formulario elige el
// origen y si se copian los docentes; la confirmación usa ConfirmAction (foco y anuncio comunes).
// El resultado queda en pantalla tras refrescar: este componente sigue montado y guarda la
// respuesta en su estado, y el foco va a su encabezado. ConfirmAction no se desmonta al terminar
// (solo se oculta su contenedor): así su diálogo se cierra, anuncia el mensaje y mueve el foco.
import Link from 'next/link';
import { useId, useState } from 'react';
import { cloneStructureAction, type CloneActionState } from '../_lib/actions';
import { cloneResultLines, type CloneStructureResult } from '../_lib/clone';
import { FOCUS_HEADING, focusIds } from '../_lib/focus';
import type { ActionState } from '../_lib/types';
import { ConfirmAction } from '@/app/(app)/admin/_shared/components/confirm-action';
import { SelectField } from '@/app/(app)/admin/_shared/components/form-bits';
import { ReadOnlyNotice } from '@/app/(app)/admin/_shared/components/page-bits';
import { cn } from '@/lib/utils';

type Option = { value: string; label: string };

export function CloneStructure({
  targetId,
  targetYear,
  options,
  emptyYears,
  defaultSourceId,
  blockReason,
}: {
  targetId: string;
  targetYear: number;
  options: Option[];
  emptyYears: number[];
  defaultSourceId: string | null;
  blockReason: string | null;
}) {
  const [sourceId, setSourceId] = useState(defaultSourceId ?? '');
  const [copyTeachers, setCopyTeachers] = useState(false);
  const [result, setResult] = useState<CloneStructureResult | null>(null);
  const copyId = useId();
  const copyHintId = `${copyId}-hint`;
  const yearHref = `/admin/estructura/anios/${encodeURIComponent(targetId)}`;

  if (!result && blockReason) {
    return (
      <ReadOnlyNotice title="No se puede copiar la estructura">
        <p>{blockReason}</p>
        <p className="mt-2">
          <Link href={yearHref} className="underline underline-offset-4">
            Volver al año {targetYear}
          </Link>
        </p>
      </ReadOnlyNotice>
    );
  }

  if (!result && options.length === 0) {
    return (
      <ReadOnlyNotice title="No hay un año del que copiar">
        <p>
          Ningún año anterior a {targetYear} tiene secciones activas. Crea las secciones de este año
          desde su ficha.
        </p>
        <p className="mt-2">
          <Link href={yearHref} className="underline underline-offset-4">
            Volver al año {targetYear}
          </Link>
        </p>
      </ReadOnlyNotice>
    );
  }

  const sourceLabel = options.find((o) => o.value === sourceId)?.label ?? '';
  const action = async (prev: ActionState, fd: FormData): Promise<ActionState> => {
    const state: CloneActionState = await cloneStructureAction(targetId, prev, fd);
    if (state.status === 'ok' && state.result) setResult(state.result);
    return state;
  };

  return (
    <>
      {result ? <CloneResult result={result} yearHref={yearHref} /> : null}
      <div hidden={result !== null} className="flex flex-col gap-4">
        <SelectField
          name="sourceYearIdSelect"
          label="Año de origen"
          options={options}
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          hint={
            emptyYears.length > 0
              ? `No aparecen los años sin secciones activas: ${emptyYears.join(', ')}.`
              : 'Solo aparecen años anteriores con secciones activas.'
          }
        />
        <div className="flex flex-col gap-1.5">
          {/* Toda la fila es clicable: la etiqueta envuelve la casilla (44 px de alto). */}
          <label
            htmlFor={copyId}
            className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium"
          >
            <input
              id={copyId}
              type="checkbox"
              checked={copyTeachers}
              onChange={(e) => setCopyTeachers(e.target.checked)}
              aria-describedby={copyHintId}
              className="size-5 cursor-pointer accent-primary"
            />
            Copiar también los docentes
          </label>
          <p id={copyHintId} className="text-sm text-muted-foreground">
            Solo se copian los docentes que siguen activos. Si no marcas la casilla, los cursos
            quedan sin docente y los asignas después.
          </p>
        </div>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>Se copian las secciones activas y sus cursos activos.</li>
          <li>No se copian los períodos, las matrículas, los apoderados ni los contenidos.</li>
        </ul>
        <div>
          <ConfirmAction
            action={action}
            triggerLabel="Copiar estructura"
            title={`¿Copiar la estructura a ${targetYear}?`}
            description={`Origen: ${sourceLabel}. ${
              copyTeachers
                ? 'Se copiarán los docentes activos.'
                : 'Los cursos quedarán sin docente.'
            } No se copian períodos, matrículas ni contenidos. Después ya no se podrá volver a copiar en ${targetYear}.`}
            confirmLabel="Copiar"
            focusId={focusIds.cloneResult}
            disabled={!sourceId}
          >
            {() => (
              <>
                <input type="hidden" name="sourceYearId" value={sourceId} />
                {copyTeachers ? <input type="hidden" name="copyTeachers" value="on" /> : null}
              </>
            )}
          </ConfirmAction>
        </div>
      </div>
    </>
  );
}

function CloneResult({ result, yearHref }: { result: CloneStructureResult; yearHref: string }) {
  const lines = cloneResultLines(result);
  return (
    <section aria-labelledby={focusIds.cloneResult} className="flex flex-col gap-3">
      <h2
        id={focusIds.cloneResult}
        tabIndex={-1}
        className={cn('text-lg font-semibold', FOCUS_HEADING)}
      >
        Estructura copiada en {result.targetYear.year}
      </h2>
      <ul className="list-disc pl-5 text-sm">
        {lines.created.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {lines.skipped.length > 0 ? (
        <>
          <h3 className="text-sm font-semibold">No se copiaron</h3>
          <ul className="list-disc pl-5 text-sm">
            {lines.skipped.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
      <p>
        <Link href={yearHref} className="underline underline-offset-4">
          Ver las secciones del año {result.targetYear.year}
        </Link>
      </p>
    </section>
  );
}
