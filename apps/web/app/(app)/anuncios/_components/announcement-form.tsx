'use client';

// Formulario de anuncio (RF-32): crear en un curso (docente o ADMIN), crear para la institución o
// un grado (ADMIN) o editar uno existente. Accesibilidad: errores por campo con aria-invalid y
// aria-describedby, foco al primer campo inválido, error general en role="alert" y éxito en
// role="status". El cuerpo es texto plano.
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  createAdminAnnouncement,
  createCourseAnnouncement,
  updateAnnouncement,
  type ActionResult,
} from '../_lib/actions';
import { BODY_MAX, TITLE_MAX, type AnnouncementField } from '../_lib/announcements';

const FIELD =
  'mt-1 block w-full rounded-md border bg-transparent px-3 text-sm aria-[invalid=true]:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

type Mode =
  | { kind: 'course'; courseSectionId: string }
  | { kind: 'admin' }
  | { kind: 'edit'; id: string; title: string; body: string };

export function AnnouncementForm({
  mode,
  onDone,
  onCancel,
}: {
  mode: Mode;
  /** Tras guardar (solo edición): por ejemplo, cerrar el formulario. */
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const editing = mode.kind === 'edit';
  const [title, setTitle] = useState(editing ? mode.title : '');
  const [body, setBody] = useState(editing ? mode.body : '');
  const [scope, setScope] = useState<'INSTITUTION' | 'GRADE'>('INSTITUTION');
  const [gradeLevel, setGradeLevel] = useState('');
  const [errors, setErrors] = useState<Partial<Record<AnnouncementField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (tries > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [tries]);
  useEffect(() => {
    if (success) statusRef.current?.focus();
  }, [success]);

  const a11y = (f: AnnouncementField, hint?: string) => ({
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby':
      [errors[f] ? id(`${f}-error`) : '', hint ?? ''].filter(Boolean).join(' ') || undefined,
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setMessage(null);
    setSuccess(null);
    start(async () => {
      let res: ActionResult;
      if (mode.kind === 'course')
        res = await createCourseAnnouncement(mode.courseSectionId, title, body);
      else if (mode.kind === 'admin')
        res = await createAdminAnnouncement(scope, gradeLevel, title, body);
      else res = await updateAnnouncement(mode.id, title, body);
      if (!res.ok) {
        setErrors(res.errors ?? {});
        setMessage(res.message);
        setTries((n) => n + 1);
        return;
      }
      setErrors({});
      if (editing) {
        onDone?.();
        return;
      }
      setTitle('');
      setBody('');
      setSuccess('Anuncio publicado. Se avisará a los destinatarios.');
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {mode.kind === 'admin' ? (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <label className="text-sm font-medium" htmlFor={id('scope')}>
              Destinatarios
            </label>
            <select
              id={id('scope')}
              className={`${FIELD} h-11 md:h-9`}
              value={scope}
              onChange={(e) => setScope(e.target.value === 'GRADE' ? 'GRADE' : 'INSTITUTION')}
            >
              <option value="INSTITUTION">Toda la institución</option>
              <option value="GRADE">Un grado</option>
            </select>
          </div>
          {scope === 'GRADE' ? (
            <div className="flex-1">
              <label className="text-sm font-medium" htmlFor={id('gradeLevel')}>
                Grado
              </label>
              <select
                id={id('gradeLevel')}
                className={`${FIELD} h-11 md:h-9`}
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                {...a11y('gradeLevel')}
              >
                <option value="">Elige un grado</option>
                {[1, 2, 3, 4, 5].map((g) => (
                  <option key={g} value={g}>
                    {g}.° de secundaria
                  </option>
                ))}
              </select>
              <FieldError id={id('gradeLevel-error')} message={errors.gradeLevel} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="text-sm font-medium" htmlFor={id('title')}>
          Título
        </label>
        <input
          id={id('title')}
          className={`${FIELD} h-11 md:h-9`}
          value={title}
          maxLength={TITLE_MAX}
          autoComplete="off"
          onChange={(e) => setTitle(e.target.value)}
          {...a11y('title', id('title-hint'))}
        />
        <p id={id('title-hint')} className="mt-1 text-xs text-muted-foreground">
          Una línea, hasta {TITLE_MAX} caracteres.
        </p>
        <FieldError id={id('title-error')} message={errors.title} />
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor={id('body')}>
          Mensaje
        </label>
        <textarea
          id={id('body')}
          className={`${FIELD} min-h-32 py-2`}
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          {...a11y('body', id('body-hint'))}
        />
        <p id={id('body-hint')} className="mt-1 text-xs text-muted-foreground">
          Texto simple, hasta {BODY_MAX} caracteres ({body.length} usados).
        </p>
        <FieldError id={id('body-error')} message={errors.body} />
      </div>

      <div role="alert" className={message ? 'text-sm text-destructive' : undefined}>
        {message ? <p className="break-words">{message}</p> : null}
      </div>
      <div
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className="rounded-md text-sm outline-none focus:ring-2 focus:ring-ring/60"
      >
        {pending ? 'Guardando…' : success}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11 px-4" aria-disabled={pending || undefined}>
          {editing ? 'Guardar cambios' : 'Publicar anuncio'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-destructive">
      {message}
    </p>
  );
}
