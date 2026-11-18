'use client';

// Pestañas por nivel de las secciones de un año. Todas las listas llegan ya pintadas desde el
// servidor; cambiar de pestaña es solo estado del cliente (sin red, al instante). La URL
// (?nivel=) se actualiza con el historial para poder compartir o recargar la pestaña.
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EDUCATION_LEVELS, LEVEL_LABELS, type EducationLevel } from '../_lib/levels';
import { CreateSectionForm } from './section-panels';

export function LevelTabs({
  yearId,
  initial,
  counts,
  lists,
  canCreate,
  emptyText,
}: {
  yearId: string;
  initial: EducationLevel;
  counts: Record<EducationLevel, number>;
  /** Lista de secciones ya pintada, por nivel. */
  lists: Record<EducationLevel, ReactNode>;
  canCreate: boolean;
  /** Texto cuando un nivel no tiene secciones. */
  emptyText: Record<EducationLevel, string>;
}) {
  const [active, setActive] = useState<EducationLevel>(initial);

  const select = (level: EducationLevel) => {
    setActive(level);
    const url = new URL(window.location.href);
    url.searchParams.set('nivel', level);
    window.history.replaceState(null, '', url);
  };

  return (
    <>
      {canCreate ? (
        // key: al cambiar de pestaña el formulario parte con ese nivel.
        <CreateSectionForm key={active} yearId={yearId} defaultLevel={active} />
      ) : null}
      <div
        role="tablist"
        aria-label="Nivel educativo"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {EDUCATION_LEVELS.map((l, i) => {
          const current = l === active;
          return (
            <button
              key={l}
              type="button"
              role="tab"
              id={`tab-${l}`}
              aria-selected={current}
              aria-controls="panel-secciones"
              tabIndex={current ? 0 : -1}
              onClick={() => select(l)}
              onKeyDown={(e) => {
                const n = EDUCATION_LEVELS.length;
                const next =
                  e.key === 'ArrowRight'
                    ? EDUCATION_LEVELS[(i + 1) % n]
                    : e.key === 'ArrowLeft'
                      ? EDUCATION_LEVELS[(i + n - 1) % n]
                      : null;
                if (!next) return;
                e.preventDefault();
                select(next);
                document.getElementById(`tab-${next}`)?.focus();
              }}
              className={cn(
                'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-active',
                current
                  ? 'border-brand text-brand'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {LEVEL_LABELS[l]}
              <span className="text-xs tabular-nums opacity-70">{counts[l]}</span>
            </button>
          );
        })}
      </div>
      <div id="panel-secciones" role="tabpanel" aria-labelledby={`tab-${active}`}>
        {counts[active] === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText[active]}</p>
        ) : (
          lists[active]
        )}
      </div>
    </>
  );
}
