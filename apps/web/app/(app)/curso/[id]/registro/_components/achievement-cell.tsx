'use client';

// Logro del bimestre (escala literal, INICIAL y PRIMARIA; decisión 2 del usuario, 09/11/2026).
// El docente lo elige viendo los literales de las tareas como apoyo. Errores en role="alert" y
// éxito en role="status"; objetivos táctiles de 44 px (usable desde 360 px).
import { useId, useState, useTransition } from 'react';
import { saveAchievement } from '../_lib/actions';
import { COMMENT_MAX, GRADE_LITERALS, literalLabel } from '../_lib/grading-format';
import type { GradeLiteral, PeriodAchievement } from '../_lib/types';

export type AchievementCellProps = {
  courseSectionId: string;
  periodId: string;
  enrollmentId: string;
  studentName: string;
  achievement: PeriodAchievement | null;
  editable: boolean;
};

export function AchievementCell(props: AchievementCellProps) {
  const id = useId();
  const [literal, setLiteral] = useState<GradeLiteral | ''>(props.achievement?.literal ?? '');
  const [comment, setComment] = useState(props.achievement?.comment ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = props.achievement ? literalLabel(props.achievement.literal) : 'Sin logro';

  if (!props.editable) return <span className="font-medium">{current}</span>;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setSaved(false);
    if (literal === '') {
      setMessage('Elige AD, A, B o C.');
      document.getElementById(`${id}-r0`)?.focus();
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const r = await saveAchievement(props.courseSectionId, props.periodId, props.enrollmentId, {
        literal,
        comment,
      });
      if (r.ok) setSaved(true);
      else setMessage(r.message);
    });
  };

  return (
    <details>
      <summary className="min-h-11 cursor-pointer rounded-md py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {current}
      </summary>
      <form onSubmit={submit} noValidate aria-label={`Logro del bimestre de ${props.studentName}`}>
        <fieldset
          aria-invalid={message !== null && literal === '' ? true : undefined}
          aria-describedby={message ? `${id}-err` : undefined}
        >
          <legend className="text-xs font-medium">Logro del bimestre de {props.studentName}</legend>
          <div className="mt-1 grid gap-1">
            {GRADE_LITERALS.map((l, i) => (
              <label key={l} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  id={`${id}-r${i}`}
                  type="radio"
                  name={`${id}-lit`}
                  value={l}
                  checked={literal === l}
                  onChange={() => setLiteral(l)}
                  className="size-4"
                />
                {literalLabel(l)}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor={`${id}-c`} className="mt-2 block text-xs font-medium">
          Comentario (opcional)
        </label>
        <textarea
          id={`${id}-c`}
          rows={2}
          maxLength={COMMENT_MAX}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="mt-1 block w-full min-w-40 rounded-md border bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          aria-disabled={pending}
          className="mt-2 inline-flex min-h-11 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          {pending ? 'Guardando…' : 'Guardar logro'}
        </button>
        {message && (
          <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-destructive">
            {message}
          </p>
        )}
        <p role="status" className="mt-1 text-xs">
          {saved && !pending ? 'Logro guardado.' : ''}
        </p>
      </form>
    </details>
  );
}
