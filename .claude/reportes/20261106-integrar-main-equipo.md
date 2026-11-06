# Integrar `main` del equipo en `features/adolfo`

## Pedido

- **Texto del usuario:** "APLICA LO QUE ME INDICABAS: traer main a tu features/adolfo privada y resolver los conflictos conservando lo de los dos lados (en prisma/seed/credentials.ts la versión de David); aplicar las 4 migraciones de David y volver a correr el seed; comprobar lint, pruebas y build; subirlo a mio".
- **Fecha:** 06/11/2026.
- **Flujo:** lo hizo el orquestador, sin agentes.
- **Rama:** `features/adolfo`.
- **Commits:** `2f296a2` (merge) y `0052802` (ajuste del correo).

## Resultado

- **Merge de `origin/main`** (PR #13, #14, #15 y #16). Git marcó 78 conflictos, casi todos `add/add`. Eran falsos: `main` ya tenía este mismo trabajo, pero llegó con otra historia (los envíos limpios).
  - **Resolución:** en todos se tomó la versión de `main`, que incluye `credentials.ts` de David. Encima se reaplicó el WIP privado de 5d/5g (commit `b8b7f2c`, 10 archivos), sin conflictos.
  - `apps/api/test/helpers.ts` traía `createDbTestApp` duplicado por el auto-merge; quedó la versión de `main`.
- **Correo (5d/5g):** como `institutionalEmail` ya es opcional, los avisos por correo y la exportación de datos personales usan `contactEmail`, y solo si está verificado. La función nueva es `deliverableEmail` en `jobs/mailer.service.ts`. Si el usuario no tiene correo verificado, el aviso queda `SKIPPED`.
- **Tipos:** se corrigieron los 3 errores que quedaban en los specs del WIP.
- **Base local:** se aplicaron las 4 migraciones de David con `migrate deploy`, y se corrió `pnpm db:seed`: los 68 usuarios tienen código. La contraseña del admin no cambió, porque ya tenía una (el seed es idempotente).

## Agentes que participaron

Ninguno. El trabajo lo hizo el orquestador.

## Prompts usados

No aplica.

## Decisiones del orquestador

- **"Theirs" en todos los conflictos:** `main` es la fuente de verdad del trabajo ya enviado, y lo único exclusivo de la rama privada es el WIP, `.claude/` y la guía.
- **Correo para avisos:** solo el de contacto verificado (RF-80, D-062 de David). Nunca el institucional.

## Archivos creados y modificados

- **Por el merge:** todo lo de los PR #13 a #16.
- **Correo y exportación:**
  - `apps/api/src/modules/jobs/mailer.service.ts`
  - `notifications/worker/notification-fanout.service.ts`
  - `notifications/worker/send-email.processor.ts`
  - `notifications/worker/notification-worker.spec.ts`
  - `lifecycle/processors/personal-data-export.processor.ts`
- **Tipos:** `announcements/announcements.service.spec.ts`

## Verificación

| Comando                                           | Resultado                                        |
| ------------------------------------------------- | ------------------------------------------------ |
| `prisma migrate deploy`                           | 4 migraciones aplicadas; `migrate status` al día |
| `pnpm db:seed`                                    | ok                                               |
| api: lint / `tsc -p tsconfig.json` / test / build | 0 / 0 / 946 tests ok / ok                        |
| web: lint / tsc / test / build                    | 0 / 0 / 363 tests ok / ok                        |
| worker build                                      | ok                                               |

No se corrieron los e2e.

## Pendientes y decisiones abiertas

- **Login por código:** probarlo en el navegador. El admin entra con su código y la misma contraseña de prueba de antes.
- **Dev 5:** retomar 5d y 5g (pantallas y e2e) y luego la 5f.
- **Ajuste ya hecho en `0052802`:** el WIP de 5d leía `institutionalEmail`.

## Expediente

[.claude/tareas/20261030-dev5-administracion.md](../tareas/20261030-dev5-administracion.md)
