import { z } from 'zod';

// GET /me/notifications?unread&page (RF-53). unread=true: solo las no leídas.
export const NOTIFICATIONS_PAGE_SIZE = 20;
const MAX_PAGE = 500;

export const notificationsQuerySchema = z
  .object({
    unread: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  })
  .strict();

export type NotificationsQuery = z.output<typeof notificationsQuerySchema>;
