import { z } from 'zod';

// Anuncios (RF-32). El cuerpo es texto plano: la web lo muestra como texto (nunca como HTML).
// Se normalizan los saltos de línea y se rechazan los caracteres de control (salvo \n y \t).

export const ANNOUNCEMENT_TITLE_MAX = 150;
export const ANNOUNCEMENT_BODY_MAX = 5000;
export const ANNOUNCEMENTS_PAGE_SIZE = 20;
const MAX_PAGE = 500;

// C0 (salvo \t y \n), DEL y C1. \r ya se normalizó a \n.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/;

const plainText = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/\r\n?/g, '\n').trim())
    .pipe(
      z
        .string()
        .min(1, 'No puede estar vacío')
        .max(max, `Máximo ${max} caracteres`)
        .refine((v) => !CONTROL.test(v), 'Contiene caracteres no permitidos'),
    );

const title = plainText(ANNOUNCEMENT_TITLE_MAX).refine(
  (v) => !v.includes('\n'),
  'El título debe ser de una sola línea',
);
const body = plainText(ANNOUNCEMENT_BODY_MAX);

/** POST /course-sections/:id/announcements */
export const courseAnnouncementSchema = z.object({ title, body }).strict();
export type CourseAnnouncementDto = z.output<typeof courseAnnouncementSchema>;

/** POST /announcements (ADMIN): INSTITUTION o GRADE. */
export const adminAnnouncementSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('INSTITUTION'), title, body }).strict(),
  z
    .object({
      scope: z.literal('GRADE'),
      gradeLevel: z.number().int().min(1).max(5),
      title,
      body,
    })
    .strict(),
]);
export type AdminAnnouncementDto = z.output<typeof adminAnnouncementSchema>;

/** PATCH /announcements/:id: al menos un campo. */
export const updateAnnouncementSchema = z
  .object({ title: title.optional(), body: body.optional() })
  .strict()
  .refine((v) => v.title !== undefined || v.body !== undefined, {
    message: 'Indica al menos un campo',
    path: ['title'],
  });
export type UpdateAnnouncementDto = z.output<typeof updateAnnouncementSchema>;

const page = z.coerce.number().int().min(1).max(MAX_PAGE).default(1);

/** GET /course-sections/:id/announcements y GET /announcements */
export const pageQuerySchema = z.object({ page }).strict();
export type PageQuery = z.output<typeof pageQuerySchema>;

/** GET /me/announcements?page[&studentId] (studentId solo GUARDIAN). */
export const meAnnouncementsQuerySchema = z
  .object({ page, studentId: z.uuid().optional() })
  .strict();
export type MeAnnouncementsQuery = z.output<typeof meAnnouncementsQuerySchema>;
