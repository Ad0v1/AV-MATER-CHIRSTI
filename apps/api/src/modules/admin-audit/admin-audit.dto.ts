import { z } from 'zod';

/** Filas por página de la bitácora (fija: la web no la elige). */
export const AUDIT_PAGE_SIZE = 50;
/** Tope de página: con 50 por página son 10 000 filas; para más, se acota el rango de fechas. */
export const AUDIT_MAX_PAGE = 200;
/** Rango máximo entre from y to (un año escolar y algo más). */
export const AUDIT_MAX_RANGE_DAYS = 400;

/**
 * Módulos que hacen modo soporte cuando actúa un ADMIN (U9, RF-56): contenidos, entregas y notas
 * de una sección ajena. Los nombres son los `module` que escriben esos servicios en la bitácora.
 */
export const SUPPORT_MODULES = ['contents', 'submissions', 'grading'] as const;

const isoDate = z.iso.datetime({ offset: true });

// Acciones `<modulo>.<verbo>[.<detalle>]` y módulos en minúsculas: sin comodines ni espacios
// (la búsqueda es exacta y usa los índices de AuditLog).
const action = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_.-]*$/, 'Acción no válida');
const moduleName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_-]*$/, 'Módulo no válido');

export const auditQuerySchema = z
  .object({
    actorId: z.uuid().optional(),
    action: action.optional(),
    module: moduleName.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).max(AUDIT_MAX_PAGE).default(1),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (!q.from || !q.to) return;
    const from = Date.parse(q.from);
    const to = Date.parse(q.to);
    if (from > to) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Debe ser posterior a la fecha inicial',
      });
    } else if (to - from > AUDIT_MAX_RANGE_DAYS * 86_400_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `El rango no puede pasar de ${AUDIT_MAX_RANGE_DAYS} días`,
      });
    }
  });

export type AuditQuery = z.output<typeof auditQuerySchema>;
