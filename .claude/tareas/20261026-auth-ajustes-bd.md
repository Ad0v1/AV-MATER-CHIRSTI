# Ajustes del esquema de auth y bitácora (hallazgos 1–7 de la auditoría de BD)

Pedido por el usuario: "aplica todo lo del 'Orden recomendado', utiliza los agentes de IA para que te apoyen con este tema … estamos en local y se sube el avance a mi propia repo"
Flujo: completo
Vueltas de corrección: 1/2
Entorno: local, Docker levantado (mysql, redis, minio, clamav, mailpit healthy). Rama `features/adolfo`. El avance se sube solo a `mio`.

## Contexto

`prisma/schema/auth.prisma` es de **Dev 1**. El usuario (Dev 4/5) autoriza cambiarlo en su repo privado como **propuesta**; al equipo irá como PR o decisión para que Dev 1 la revise. La migración `20261020135810_auth_base` ya la aplicaron los compañeros: **no se edita**, se agrega una migración nueva.

## Hallazgos a aplicar (auditoría del 26/10/2026)

| #   | Hallazgo                                                                                                                                                                             | Corrección pedida                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `PolicyAcceptance` usa `onDelete: Cascade` y `AuditLog` usa `onDelete: SetNull` hacia `User`: borrar un usuario destruye la evidencia de consentimiento y deja la bitácora sin autor | `onDelete: Restrict` en ambas. Los usuarios se dan de baja con `status` (`INACTIVE`/`WITHDRAWN`), nunca se borran                   |
| 2   | `AuditLog` no registra sobre qué entidad se actuó                                                                                                                                    | Agregar `entityType String?` y `entityId String? @db.Char(36)` + `@@index([entityType, entityId])`                                  |
| 3   | El "solo inserción" de `AuditLog` no está protegido en la BD                                                                                                                         | Triggers `BEFORE UPDATE` y `BEFORE DELETE` con `SIGNAL SQLSTATE '45000'` (SQL manual en la migración, generada con `--create-only`) |
| 4   | PK `uuid()` v4 en `VARCHAR(191)`; todas las FK futuras lo copiarán                                                                                                                   | `@default(uuid(7)) @db.Char(36)` en todas las PK y FK hacia `User`                                                                  |
| 5   | `PolicyAcceptance` sin evidencia del consentimiento                                                                                                                                  | Agregar `ip String? @db.VarChar(45)` y `userAgent String? @db.VarChar(255)`                                                         |
| 6   | Sin índice por fecha para listar bitácora                                                                                                                                            | `@@index([occurredAt])` en `AuditLog`                                                                                               |
| 7   | `AuditLog.ip` en `VARCHAR(191)`                                                                                                                                                      | `@db.VarChar(45)`                                                                                                                   |

**Fuera de esta tarea:** hallazgo 8 (`institutionalEmail` obligatorio para apoderados) depende de la decisión D-013, pendiente de la institución.

Código que usa estos modelos: `apps/api/src/common/audit/audit.service.ts`, `apps/api/src/common/audit/prisma-audit.sink.ts`.

---

## Informes

### INFORME 1 — arquitecto-integrador

Estado: LISTO
Resumen: El único código que usa estos modelos es `apps/api/src/common/audit` (`PrismaAuditSink.write` → `auditLog.create`; `auth.controller.ts:45` llama a `audit.record`). Los tests usan sinks en memoria (no se rompen). Prisma 7.10.1: `uuid(7)` soportado.
Hallazgos:

- [ALTO] Migración nueva: MySQL no permite `MODIFY` de columnas en una FK → soltar las 3 FK (LocalCredential, PolicyAcceptance, AuditLog) antes de los `MODIFY … CHAR(36)` y recrearlas después; verificar en el SQL de `--create-only`.
- [ALTO] Las acciones en cascada de FK no disparan triggers → `onDelete: Restrict, onUpdate: Restrict` en PolicyAcceptance.user y AuditLog.actor. LocalCredential se queda en Cascade.
- [ALTO] Transversal: FK futuras hacia `User.id` deben ser `@db.Char(36)` → avisar a Dev 2/3/4/5.
- [MEDIO] `AuditEvent` sin `entityType`/`entityId` → agregarlos en `audit.service.ts` y mapearlos en `prisma-audit.sink.ts` (`?? null`).
- [MEDIO] `ip` VarChar(45): truncar en el sink (`record.ip?.slice(0, 45) ?? null`).
- [MEDIO] `entityType` → `@db.VarChar(64)`; convención: `entityId` = UUID de la raíz del agregado.
- [BAJO] TRUNCATE/DROP no disparan triggers → en producción el usuario de la app sin DROP/ALTER/TRIGGER.
- [BAJO] UUIDv7 revela fecha de creación; registrarlo en la decisión.
  Decisiones:

1. Orden: modelador-bd → dev1-plataforma (`common/audit`) → qa-tester → seguridad-cumplimiento → revisor-pr → documentador. Sin ux.
2. Esquema (solo `auth.prisma`):
   - User: `id String @id @default(uuid(7)) @db.Char(36)`.
   - LocalCredential: `userId String @id @db.Char(36)`; relación Cascade sin cambios.
   - PolicyAcceptance: `id @default(uuid(7)) @db.Char(36)`, `userId @db.Char(36)`, `ip String? @db.VarChar(45)`, `userAgent String? @db.VarChar(255)`, relación `onDelete: Restrict, onUpdate: Restrict`.
   - AuditLog: `id @default(uuid(7)) @db.Char(36)`, `actorId String? @db.Char(36)`, `ip String? @db.VarChar(45)`, `entityType String? @db.VarChar(64)`, `entityId String? @db.Char(36)`, relación `onDelete: Restrict, onUpdate: Restrict`, `@@index([entityType, entityId])`, `@@index([occurredAt])`; se mantienen los índices actuales.
   - Actualizar el comentario de AuditLog (ya no SetNull: los usuarios no se borran).
3. Migración nueva `auth_ajustes_bitacora` (no editar `auth_base`). Triggers de una sola sentencia, sin DELIMITER:
   `CREATE TRIGGER AuditLog_no_update BEFORE UPDATE ON AuditLog FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog es solo insercion';` y `AuditLog_no_delete BEFORE DELETE`.
4. Contrato propuesto para docs/03: `AuditService.record(event: AuditEvent)`, `AuditEvent = { actorId?; action ('<modulo>.<verbo>'); module; entityType?; entityId?; ip? (máx. 45); beforeState?; afterState? }`, fecha la pone el servicio (UTC). Solo inserción.
   Criterios de terminado (modelador-bd): migración aplicada sin errores; `prisma migrate status` al día; `SHOW TRIGGERS LIKE 'AuditLog'` = 2; UPDATE/DELETE manual en AuditLog falla con 45000; DELETE de User con PolicyAcceptance/AuditLog falla con 1451; `pnpm --filter api build` pasa.
   Pendientes: avisar convención Char(36) al equipo; privilegios TRIGGER en producción; truncado de userAgent/ip cuando Dev 1 implemente RF-07.
   Para: modelador-bd

### INFORME 2 — modelador-bd

Estado: LISTO
Archivos: `prisma/schema/auth.prisma` (mod.), `prisma/migrations/20261026164848_auth_ajustes_bitacora/migration.sql` (nuevo), cliente regenerado en `apps/api/src/generated/prisma/`.
Resumen: Esquema aplicado según la Decisión 2 del INFORME 1. Prisma generó el SQL ya en orden (DROP de las 3 FK → MODIFY a CHAR(36) → índices → FK recreadas: LocalCredential CASCADE, PolicyAcceptance y AuditLog RESTRICT/RESTRICT). Triggers agregados a mano al final.
Comandos: migrate dev --create-only ok; migrate dev ok; db:generate ok; migrate status "up to date"; SHOW TRIGGERS = 2; en transacción con ROLLBACK y datos ficticios: UPDATE/DELETE en AuditLog → 1644 (45000), DELETE User con AuditLog o PolicyAcceptance → 1451; 0 filas de prueba restantes; `pnpm --filter api build` ok.
Verificado por el orquestador: git status, SQL de la migración y `prisma migrate status`.
Hallazgos:

- [MEDIO] MODIFY a CHAR(36) truncaría ids > 36; hoy no hay datos afectados.
- [BAJO] Producción: el usuario de migración necesita privilegio TRIGGER; el de la app, sin DROP/ALTER/TRIGGER.
- [BAJO] Datos personales nuevos: PolicyAcceptance.ip y userAgent (incluye menores) → revisar retención y finalidad.
  Decisiones: convención transversal `@db.Char(36)` en FK hacia User y `@default(uuid(7)) @db.Char(36)` en PK nuevas.
  Pendientes: avisar al equipo la convención; privilegios en producción; truncar ip/userAgent cuando se implemente RF-07.
  Para: dev1-plataforma — agregar `entityType?`/`entityId?` a `AuditEvent` (audit.service.ts); mapearlos con `?? null` y truncar `ip` a 45 en prisma-audit.sink.ts. Borrar User con bitácora falla con P2003; AuditLog update/delete falla con 45000.

### INFORME 3 — dev1-plataforma

Estado: LISTO
Archivos: `apps/api/src/common/audit/audit.service.ts`, `apps/api/src/common/audit/prisma-audit.sink.ts`.
Resumen: `AuditEvent` gana `entityType?`/`entityId?` (convención: nombre de entidad de docs/02 y UUID de la raíz del agregado). `PrismaAuditSink` los guarda con `?? null` y recorta `ip` a 45. `LogAuditSink` ya los incluye por rest spread y sigue sin escribir before/afterState.
Comandos: api lint ok; api test ok (5 archivos, 15 tests); api build ok.
Hallazgos: [BAJO] el sink no valida largo de entityType (64) / entityId (36) → convención en docs/03 o test. [BAJO] ningún llamador pasa aún entityType/entityId → Dev 4/5 en acciones críticas.
Decisiones: firma de `AuditService.record` sin cambios (campos opcionales).
Para: qa-tester — tests de PrismaAuditSink (entityType/entityId, null por defecto, ip recortada) y LogAuditSink (incluye entityType/entityId, sin before/afterState).

### INFORME 4 — qa-tester

Estado: LISTO
Archivos: `apps/api/src/common/audit/prisma-audit.sink.spec.ts` (nuevo), `apps/api/src/common/audit/audit.service.spec.ts` (mod.).
Resumen: PrismaAuditSink (entityType/entityId; null por defecto; ip de 100 → 45; ip normal y de 45 sin cambios; solo `create`). LogAuditSink (incluye entityType/entityId; sin before/afterState). AuditService: conserva entityType/entityId. Nombres con RNF-14/15.
Comandos: api test ok (6 archivos, 23 tests); api lint ok.
Hallazgos: [BAJO] sin validación de largo de entityType/entityId (convención).
Pendientes: test e2e futuro con MySQL para triggers (45000) y Restrict (P2003/1451); hoy verificado a mano en el INFORME 2.
Para: seguridad-cumplimiento

### INFORME 5 — seguridad-cumplimiento

Estado: APROBADO (sin CRÍTICO ni ALTO)
Resumen: Solo inserción efectivo a nivel fila (triggers + FK Restrict). No cubierto: TRUNCATE, DROP, DROP TRIGGER y privilegios de producción.
Hallazgos:

- [MEDIO] `docker/mysql/init.sql:3` (GRANT ALL, solo local) — sin esquema de privilegios de producción → documentar dos usuarios de BD: migración (CREATE/ALTER/DROP/INDEX/REFERENCES/TRIGGER) y app (SELECT/INSERT/UPDATE/DELETE, sin DROP/ALTER/TRIGGER; REVOKE UPDATE, DELETE ON AuditLog).
- [MEDIO] `auth.prisma:51-54` — ip/userAgent de consentimiento (incluye menores) sin finalidad ni retención documentadas → registrar finalidad, plazo y anonimización (poner NULL tras el plazo) en docs/04 y política de privacidad; definir qué userId acredita el consentimiento de un menor.
- [MEDIO] `prisma-audit.sink.ts:23-24` — before/afterState sin filtrar; registros inmutables → lista blanca/redacción antes de que Dev 4/5 los usen; en docs/03: "solo campos modificados".
- [BAJO] UUIDv7 revela fecha; no usar ids como secreto.
- [BAJO] LogAuditSink deja ip/actorId en logs (hoy no enlazado).
- [BAJO] entityType/entityId sin validar; decidir si un fallo de bitácora aborta la acción.
- [BAJO] `auth.controller.ts:49` — `req.ip` requiere `trust proxy` en producción.
- [BAJO] MODIFY a CHAR(36) no reversible limpiamente; respaldar antes de aplicar en ambientes con datos.
  Pendientes: privilegios de BD en despliegue (Dev 1); retención de ip/userAgent; redacción de estados de bitácora (Dev 4/5); `db push` no crea triggers, usar siempre migraciones.
  Para: revisor-pr

### INFORME 6 — revisor-pr

Estado: CAMBIOS_PEDIDOS → resuelto (vuelta 1/2)
Comandos: lint ok; test ok (23); build ok; format:check falló solo en `prisma-audit.sink.spec.ts` (y en `.agents/`, fuera de alcance).
Corrección aplicada por el orquestador (solo formato, sin cambios de lógica): `prettier --write` en el spec y en este expediente; `prettier --check` del alcance ok; api test ok.
Mensaje de commit: `feat(auth): RNF-14/15 bitacora solo insercion, entidad auditada y ids UUIDv7 Char(36)`.
Pendientes: al equipo, como PR para Dev 1 (no mezclado con Dev 4/5); test e2e con MySQL; convención Char(36); privilegios de BD en producción; retención de ip/userAgent; lista blanca de before/afterState; contrato AuditEvent en docs/03; respaldar antes del MODIFY en ambientes con datos.
Para: documentador

### INFORME 7 — documentador

Estado: LISTO
Archivos: `docs/08_DECISIONES.md` (D-021 PROPUESTA; D-022 privilegios de BD, D-023 retención ip/userAgent, D-024 redacción de estados: PENDIENTE), `docs/03_CONTRATOS.md` (sección "Servicio de auditoría"), `docs/02_MODELO_ENTIDADES.md` (campos y convención CHAR(36)/UUIDv7).
Hallazgo resuelto por el orquestador: comentario obsoleto en `audit.service.ts:20`.
Pendientes: `docs/10_TRAZABILIDAD.md` y `docs/04_REGLAS_ESTADOS.md` sin actualizar (siguiente tarea).

## Cierre

Tarea terminada. Commit en `features/adolfo`, subido solo a `mio`.
