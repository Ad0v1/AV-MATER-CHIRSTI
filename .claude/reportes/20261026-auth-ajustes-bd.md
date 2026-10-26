# Reporte — Ajustes del esquema de auth y bitácora

> Reporte retroactivo, escrito el 26/10/2026 cuando el usuario pidió reportes por tarea. Los prompts son los literales que usó el orquestador.

## Pedido

- **Usuario:** "aplica todo lo del 'Orden Recomendado', utiliza los agentes de IA para que te apoyen con este tema … ten en cuenta que estamos en local y se sube el avance a mi propia repo"
- **Fecha:** 26/10/2026 · **Flujo:** completo · **Rama:** `features/adolfo` · **Commit:** `67b7319` (subido a `mio`)

## Resultado

Se aplicaron los hallazgos 1–7 de la auditoría de base de datos sobre el módulo de auth (de Dev 1, como propuesta):

- Los usuarios no se pueden borrar físicamente (FK `Restrict` en `PolicyAcceptance` y `AuditLog`); las bajas son por `status`.
- La bitácora `AuditLog` no se puede editar ni borrar (triggers en MySQL).
- La bitácora registra la entidad afectada (`entityType`, `entityId`) y tiene índice por fecha.
- Ids UUIDv7 en `CHAR(36)`.
- `PolicyAcceptance` guarda `ip` y `userAgent` como evidencia de consentimiento.
- El servicio de auditoría llena los campos nuevos y recorta la IP a 45 caracteres.

## Agentes que participaron

| #   | Agente                   | Modelo | Qué hizo                                                                                                     | Estado                     |
| --- | ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------ | -------------------------- |
| 1   | `arquitecto-integrador`  | Opus   | Plan; detectó que MySQL exige soltar las FK antes de cambiar el tipo y que las cascadas no disparan triggers | LISTO                      |
| 2   | `modelador-bd`           | Opus   | Esquema, migración `auth_ajustes_bitacora`, triggers y pruebas en MySQL                                      | LISTO                      |
| 3   | `dev1-plataforma`        | Opus   | `AuditEvent` con `entityType`/`entityId`; recorte de IP                                                      | LISTO                      |
| 4   | `qa-tester`              | Sonnet | 8 tests nuevos (15 → 23)                                                                                     | LISTO                      |
| 5   | `seguridad-cumplimiento` | Sonnet | Auditoría: sin CRÍTICO/ALTO; 3 MEDIO pendientes                                                              | APROBADO                   |
| 6   | `revisor-pr`             | Sonnet | Pidió formatear un spec                                                                                      | CAMBIOS_PEDIDOS → resuelto |
| 7   | `documentador`           | Haiku  | D-021..D-024 en docs/08, contrato de auditoría en docs/03, convenciones en docs/02                           | LISTO                      |

## Prompts usados

### 1. arquitecto-integrador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-auth-ajustes-bd.md (léelo completo, junto con C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: planificar la aplicación de los hallazgos 1–7 del expediente sobre prisma/schema/auth.prisma (Prisma 7, MySQL 8.4) y una migración nueva. Requisitos: RNF-14, RNF-15, RF-07, RF-04, RF-08, RN-14, RNF-09..13.

Revisa en concreto:
- prisma/schema/auth.prisma, prisma/schema/base.prisma, prisma/migrations/20261020135810_auth_base/migration.sql.
- apps/api/src/common/audit/audit.service.ts y prisma-audit.sink.ts, y cualquier otro código en apps/api/src (excluye apps/api/src/generated) que use User, PolicyAcceptance, AuditLog o LocalCredential, para saber si el cambio de onDelete, los campos nuevos (entityType/entityId, ip, userAgent) o el tipo Char(36) rompen algo y quién debe ajustarlo.
- Los tests existentes en apps/api (test/ y *.spec.ts / *.test.ts) que toquen estos modelos.
- docs/02, docs/03 (contrato del servicio de auditoría), docs/08 (D-012, D-013, D-019).

Confirma si @default(uuid(7)) está soportado por la versión de Prisma instalada (mira node_modules/prisma/package.json o node_modules/@prisma/*). Si no, propone alternativa.

Indica: si el cambio de código en apps/api/src/common/audit es necesario y qué agente lo hace (dev1-plataforma), si el contrato de auditoría en docs/03 cambia, y el orden exacto de pasos. Este cambio va en el repo privado del usuario como propuesta para Dev 1. No modifiques archivos. Termina con el INFORME del protocolo.
```

### 2. modelador-bd

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-auth-ajustes-bd.md (léelo completo, incluido el INFORME 1 del arquitecto, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: aplicar el punto 2 de Decisiones del INFORME 1 en prisma/schema/auth.prisma y crear la migración nueva `auth_ajustes_bitacora`. El usuario autorizó en este repo privado editar auth.prisma (de Dev 1) como propuesta y crear la carpeta nueva en prisma/migrations/. No edites la migración 20261020135810_auth_base ni base.prisma. Estamos en local con Docker y MySQL levantados (servicio `mysql` de docker compose, healthy). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI.

Pasos:
1. Editar auth.prisma según el INFORME 1 (incluye actualizar el comentario de AuditLog: los usuarios se dan de baja con status y nunca se borran).
2. `pnpm db:migrate --create-only --name auth_ajustes_bitacora` (si pnpm no pasa el flag, usa `pnpm exec prisma migrate dev --create-only --name auth_ajustes_bitacora`).
3. Revisar el SQL generado: las 3 FK (LocalCredential_userId_fkey, PolicyAcceptance_userId_fkey, AuditLog_actorId_fkey) deben soltarse antes de los MODIFY a CHAR(36) y recrearse después; PolicyAcceptance y AuditLog con ON DELETE RESTRICT ON UPDATE RESTRICT. Corrígelo a mano si hace falta.
4. Agregar al final los 2 triggers de una sola sentencia, sin DELIMITER.
5. Aplicar: `pnpm exec prisma migrate dev` (o `pnpm db:migrate`), luego `pnpm db:generate`.
6. Verificar los criterios de terminado del INFORME 1: `pnpm exec prisma migrate status`; con `docker compose exec -T mysql sh -c 'mysql -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "..."'` comprobar SHOW TRIGGERS LIKE 'AuditLog' (2), que un UPDATE y un DELETE sobre AuditLog fallan con 45000 (inserta antes un registro de prueba y no lo dejes visible si puedes; si no puedes borrarlo por el trigger, avísalo en Pendientes), y que DELETE de un User con PolicyAcceptance o AuditLog falla con 1451 (usa datos de prueba ficticios; los registros de prueba que no se puedan borrar por los triggers/Restrict, anótalos en Pendientes). `pnpm --filter api build`.
No leas .env (usa la variable de entorno del contenedor como se indica). No hagas commit ni cambies de rama. Termina con el INFORME del protocolo, incluyendo la ruta de la migración y su SQL resumido.
```

### 3. dev1-plataforma

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-auth-ajustes-bd.md (léelo completo, incluidos los INFORMES 1 y 2, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo (flujo autorizado por el usuario en su repo privado, como propuesta para Dev 1): en C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\common\audit\:
1. audit.service.ts: agregar `entityType?: string` y `entityId?: string` a `AuditEvent`, con un comentario breve de la convención (entityType = nombre de entidad de docs/02, p. ej. 'Grade'; entityId = UUID de la raíz del agregado).
2. prisma-audit.sink.ts: mapear entityType y entityId con `?? null`, y truncar ip: `record.ip?.slice(0, 45) ?? null`.
3. Si hay otros sinks (LogAuditSink, memoria) que listan campos explícitamente, inclúyelos de forma coherente (no son datos personales).
Requisitos: RNF-14, RNF-15. Sigue el estilo del código existente. No modifiques tests (eso lo hace qa-tester) salvo que la compilación lo exija; si lo exige, dilo en el INFORME. No toques prisma/ ni otros módulos.
Al terminar corre `pnpm --filter api lint`, `pnpm --filter api test` y `pnpm --filter api build`. No hagas commit. Termina con el INFORME del protocolo.
```

### 4. qa-tester

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-auth-ajustes-bd.md (léelo completo, incluido el INFORME 3, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: tests en apps/api para RNF-14/RNF-15, siguiendo el estilo de los tests existentes (Vitest):
1. `PrismaAuditSink.write` con un PrismaService simulado: guarda entityType/entityId cuando vienen; null cuando no vienen; recorta una ip de más de 45 caracteres a 45; no altera una ip normal.
2. `LogAuditSink`: incluye entityType/entityId en el registro y no escribe beforeState/afterState.
3. Si existe audit.service.spec.ts, amplíalo con un evento que lleve entityType/entityId.
Los triggers y el Restrict en MySQL ya los verificó modelador-bd en local (INFORME 2); no hace falta un test de integración con BD ahora: anótalo en Pendientes como posible test e2e futuro.
Solo crea o modifica archivos de test. Corre `pnpm --filter api test` y `pnpm --filter api lint`. No hagas commit. Termina con el INFORME del protocolo.
```

### 5. seguridad-cumplimiento

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-auth-ajustes-bd.md (léelo completo, incluidos los INFORMES 1, 2 y 3, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: auditar los cambios de esta tarea (RNF-09..15, RF-07, RN-14, Ley 29733):
- C:\Proyectos\AV-MATER-CHIRSTI\prisma\schema\auth.prisma
- C:\Proyectos\AV-MATER-CHIRSTI\prisma\migrations\20261026164848_auth_ajustes_bitacora\migration.sql
- C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\common\audit\ (audit.service.ts, prisma-audit.sink.ts, log sink)
Revisa: que la bitácora sea efectivamente solo inserción (triggers, FK Restrict, qué no cubre: TRUNCATE/DROP, cascadas); evidencia de consentimiento (ip, userAgent) y su tratamiento como dato personal (incluye menores), finalidad y retención; que el log no filtre datos personales o secretos (beforeState/afterState); riesgos de UUIDv7 (revela fecha); privilegios del usuario de BD en producción (docker/mysql/init.sql es solo local). No modifiques archivos. Termina con el INFORME del protocolo (APROBADO si no hay CRÍTICO ni ALTO; si hay, CAMBIOS_PEDIDOS con archivo:línea y corrección).
```

### 6. revisor-pr

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-auth-ajustes-bd.md (léelo completo, INFORMES 1–5, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo.

Tu encargo: revisión final según tu archivo de agente. Alcance esperado del diff: prisma/schema/auth.prisma, prisma/migrations/20261026164848_auth_ajustes_bitacora/, apps/api/src/common/audit/ (código y tests), y .claude/tareas/ (expediente, lo escribe el orquestador). Ignora .agents/ y skills-lock.json (sin seguimiento, no van en el commit). El cambio a auth.prisma y common/audit (Dev 1) está autorizado por el usuario en su repo privado como propuesta; señala en Pendientes que al equipo debe ir como PR para Dev 1, no mezclado con trabajo de Dev 4/5.
Corre pnpm lint, pnpm test, pnpm build y pnpm format:check (si format:check falla solo por archivos de .agents/ o del expediente, indícalo sin contarlo como fallo de la tarea). Propón el mensaje de commit con la convención tipo(módulo): ID resumen. Termina con el INFORME del protocolo.
```

### 7. documentador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-auth-ajustes-bd.md (léelo completo, INFORMES 1–6, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). La tarea está aprobada.

Tu encargo, solo dentro de C:\Proyectos\AV-MATER-CHIRSTI\docs\ y con el estilo de esos documentos (marca todo como PROPUESTA, pendiente de revisión de Dev 1):
1. docs/08_DECISIONES.md: nueva decisión con el siguiente número libre (mira la tabla; probablemente D-021), estado PROPUESTA, aprobadores Dev 1 + todos: "PK UUIDv7 en CHAR(36) y FK hacia User en CHAR(36); usuarios sin borrado físico (baja por status, FK Restrict en PolicyAcceptance y AuditLog); AuditLog solo inserción con triggers; entityType/entityId en la bitácora". Si la tabla tiene columna de relación, relaciónala con D-004 y D-019. Añade también como pendientes (estado PENDIENTE) los 3 MEDIO de seguridad: privilegios de BD en producción (dos usuarios), finalidad/retención de PolicyAcceptance.ip/userAgent (incluye menores), y lista blanca/redacción de beforeState/afterState.
2. docs/03_CONTRATOS.md: sección "Servicio de auditoría (D-019, Dev 1)" con el contrato del punto 4 del INFORME 1 (AuditEvent con entityType/entityId, ip máx. 45, fecha la pone el servicio en UTC, solo inserción) y la regla "beforeState/afterState solo con los campos modificados, sin secretos ni datos personales completos".
3. docs/02_MODELO_ENTIDADES.md: en la tabla de agregados, actualizar los campos mínimos de PolicyAcceptance (ip, userAgent) y AuditLog (entityType, entityId); en Convenciones, añadir que las PK son UUIDv7 en CHAR(36) y que toda FK hacia User usa @db.Char(36).
No toques manuales de usuario (no hay funcionalidad visible nueva). No hagas commit. Termina con el INFORME del protocolo.
```

## Decisiones del orquestador

- Lanzó `qa-tester` y `seguridad-cumplimiento` en paralelo (seguridad es de solo lectura).
- Corrigió él mismo el formato que pidió `revisor-pr` (`prettier --write`), contado como vuelta 1/2.
- Corrigió el comentario obsoleto de `audit.service.ts:20` que señaló `documentador`.
- Verificó por su cuenta la migración (`git status`, SQL y `prisma migrate status`).

## Archivos

- `prisma/schema/auth.prisma`
- `prisma/migrations/20261026164848_auth_ajustes_bitacora/migration.sql` (nuevo)
- `apps/api/src/common/audit/{audit.service.ts, prisma-audit.sink.ts, audit.service.spec.ts, prisma-audit.sink.spec.ts}`
- `docs/02_MODELO_ENTIDADES.md`, `docs/03_CONTRATOS.md`, `docs/08_DECISIONES.md`
- `.claude/tareas/20261026-auth-ajustes-bd.md`

## Verificación

- `prisma migrate status`: al día. `SHOW TRIGGERS`: 2.
- En MySQL (transacción con ROLLBACK): UPDATE/DELETE en `AuditLog` → error 45000; DELETE de `User` con historial → 1451.
- `pnpm lint`, `pnpm test` (23), `pnpm build`: ok. `format:check`: ok en el alcance.

## Pendientes

- Hallazgo 8 (correo obligatorio para apoderados) espera D-013.
- D-022 privilegios de BD en producción · D-023 retención de ip/userAgent · D-024 redacción de before/afterState.
- Al equipo: PR propio para Dev 1. Avisar la convención `CHAR(36)`.

## Expediente

[.claude/tareas/20261026-auth-ajustes-bd.md](../tareas/20261026-auth-ajustes-bd.md)
