import { z } from 'zod';

// GET /me/calendar?from&to[&studentId] (RF-54). `from` incluido y `to` excluido. Cada uno es un
// instante ISO con zona (2026-03-01T00:00:00-05:00, ...Z) o una fecha YYYY-MM-DD, que se toma como
// las 00:00 de Lima (UTC-5, sin horario de verano). Rango máximo: 62 días.

export const CALENDAR_MAX_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Lima no tiene horario de verano: el desfase es fijo (INSTITUTION_TIMEZONE de @aula/shared). */
const LIMA_OFFSET = '-05:00';

const instant = z.union([z.iso.datetime({ offset: true }), z.iso.date()]).transform((value) => {
  const iso = value.length === 10 ? `${value}T00:00:00${LIMA_OFFSET}` : value;
  return new Date(iso);
});

export const calendarQuerySchema = z
  .object({
    from: instant,
    to: instant,
    studentId: z.uuid().optional(),
  })
  .strict()
  // z.iso.datetime y z.iso.date ya rechazan fechas inválidas: from y to siempre son Date válidas.
  .superRefine((q, ctx) => {
    if (q.to.getTime() <= q.from.getTime()) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: '`to` debe ser posterior a `from`' });
      return;
    }
    if (q.to.getTime() - q.from.getTime() > CALENDAR_MAX_DAYS * DAY_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `El rango no puede superar ${CALENDAR_MAX_DAYS} días`,
      });
    }
  });

export type CalendarQuery = z.output<typeof calendarQuerySchema>;
