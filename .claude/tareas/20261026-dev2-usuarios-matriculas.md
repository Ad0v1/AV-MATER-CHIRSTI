# Dev 2, Fase 3: usuarios, matrículas, traslados y apoderados

Pedido por el usuario: "Sigue con la Fase 3 de Dev 2: usuarios, matrículas, traslados y apoderados, con los agentes."
Flujo: completo
Vueltas de corrección: 1/2
Entorno: local con Docker (MySQL con migraciones y seed), rama `features/adolfo`; se sube solo a `mio`.

## Contexto

- Fase 1 (esquema y seed): `.claude/tareas/20261026-dev2-estructura.md`, commit `9f70bc8`.
- Fase 2 (API académica y `AcademicAccessService`): `.claude/tareas/20261026-dev2-api-academica.md`, commit `ef2cad4`. Patrones a seguir: `apps/api/src/modules/academic/` (Zod pipe, mapPrismaError, recordAcademic, request-user, bloqueo de fila, marcadores TRUE/NULL, `@Roles` a nivel de clase).
- Plan por fases (Fase 1, INFORME 1, Decisión 1): **F3 = RF-18, 19, 20, 22, 23, 24, 25; RN-13** → `apps/api/src/modules/users/`: alta de estudiante con matrícula, alta de docente y apoderado, vínculo apoderado–estudiante, edición, estados con bitácora, traslado transaccional, búsqueda y filtros paginados.
- Pendientes heredados para F3:
  - Seguridad Fase 1 (INFORME 4): rol correcto en cada FK hacia `User` (STUDENT en matrícula, GUARDIAN/STUDENT en el vínculo), `guardianId !== studentId`; `GuardianStudent` sin finalidad, conservación ni revocación auditable (decidir `revokedAt`/`createdById` o bitácora); `effectiveTo >= effectiveFrom` al cerrar matrículas.
  - QA Fase 1: el CHECK de fechas salta antes que el de `isCurrent` si las fechas no son coherentes.
  - Revisor Fase 1: pasar siempre `sectionId` y `academicYearId` juntos en `Enrollment`.
  - Fase 2: toda operación que cambie el estado del año o abra/cierre períodos bloquea primero la fila de `AcademicYear`.
- Decisiones abiertas relacionadas: D-012 (rol único), D-013 (identidad del apoderado: correo institucional o cuenta local), D-021 (ids CHAR(36)).
- Dev 1 (David) es dueño de `User` para autenticación (RF-03, RF-08) y está cambiando `auth`/`session`: no tocar su módulo. Dev 2 gestiona altas y edición de usuarios (RF-18..23).
- **No va al equipo** sin acuerdo con el dueño de Dev 2; depende de D-021.

## Alcance

Solo la Fase 3. Fuera: importación masiva (F4), pantallas (F5), clonación y promoción (F6).

---

## Informes

### INFORME 1 — arquitecto-integrador

Estado: LISTO
Resumen: F3 en alcance v1 (ERS §3.3). Un solo cambio de esquema: `GuardianStudent` con `id` propio, marcador TRUE/NULL y `revokedAt`. `User` y `auth.prisma` sin cambios. Módulo nuevo `apps/api/src/modules/users/` (solo ADMIN) que importa `AcademicModule` y utilidades de `modules/academic/`. 2 eventos nuevos en el publicador. `app.module.ts` +2.

Hallazgos:

- [ALTO] `RolesGuard` no mira `status` y no hay revocación de sesiones por usuario → un usuario pasado a INACTIVE/WITHDRAWN conserva la sesión hasta 8 h (RF-08). En F3: `ActiveActorGuard` local en `modules/users` y evento `user.status-changed.v1`; la corrección real es de Dev 1.
- [MEDIO] PK compuesta de `GuardianStudent` impide historial de revocaciones y no da UUID para la bitácora → Decisión 1.
- [MEDIO] RNF-14 pide valor anterior y nuevo; D-024 y RNF-09/11 piden no guardar datos personales → la edición registra solo los nombres de campos cambiados. Decidir en D-024.
- [MEDIO] No hay variable de dominio institucional y `config/` es de Dev 1 → token local `INSTITUTION_EMAIL_DOMAIN`; pedir la variable a Dev 1.
- [MEDIO] D-013 pendiente → el apoderado no tiene regla de dominio.
- [BAJO] El seed usa la clave `guardianId_studentId` → `findFirst` + `create`.
- [BAJO] `academic-schema.e2e-spec.ts:233` debe contar vínculos vigentes y los 3 CHECK nuevos.
- [BAJO] `getLinkedStudentIds` debe filtrar `isActive: true` (y su spec).
- [BAJO] Confirmar que `contains` escapa `%` y `_` → caso e2e.
- [BAJO] docs/02 y docs/03 a actualizar.

**Decisión 1 — Esquema** (modelador-bd, `prisma/schema/academic.prisma`). Revocación en la fila (RN-13/14, seguridad F1, RF-52). Sin `createdById`/`revokedById` (evita tocar `auth.prisma`; el actor queda en `AuditLog`). Motivo solo en la bitácora.

```prisma
model GuardianStudent {
  id         String    @id @default(uuid(7)) @db.Char(36)
  guardianId String    @db.Char(36)
  studentId  String    @db.Char(36)
  // TRUE = vigente; NULL = revocado; nunca FALSE (CHECK). UNIQUE(guardianId, studentId, isActive):
  // un solo vínculo vigente por par; los revocados se conservan (RN-13/14, D-032).
  isActive   Boolean?  @default(true)
  createdAt  DateTime  @default(now())
  revokedAt  DateTime?

  guardian User @relation("GuardianStudentGuardian", fields: [guardianId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  student  User @relation("GuardianStudentStudent", fields: [studentId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([guardianId, studentId, isActive])
  @@index([studentId])
}
```

Migración `guardian_student_revocable` con `--create-only` y este SQL en lugar del generado:

```sql
ALTER TABLE `GuardianStudent`
  ADD COLUMN `id` CHAR(36) NULL FIRST,
  ADD COLUMN `isActive` BOOLEAN NULL DEFAULT true,
  ADD COLUMN `revokedAt` DATETIME(3) NULL;
-- Filas previas (solo datos de desarrollo): UUID() v1 es aceptable para ellas.
UPDATE `GuardianStudent` SET `id` = UUID() WHERE `id` IS NULL;
-- Índice único antes de soltar la PK: la FK de guardianId necesita un índice que empiece por guardianId.
CREATE UNIQUE INDEX `GuardianStudent_guardianId_studentId_isActive_key`
  ON `GuardianStudent`(`guardianId`, `studentId`, `isActive`);
ALTER TABLE `GuardianStudent` DROP PRIMARY KEY, MODIFY `id` CHAR(36) NOT NULL, ADD PRIMARY KEY (`id`);
-- Invariantes (MySQL 8.4). Si MySQL responde 3823, quitar solo GuardianStudent_distinct_chk.
ALTER TABLE `GuardianStudent`
  ADD CONSTRAINT `GuardianStudent_isActive_chk` CHECK (
    (`isActive` = 1 AND `revokedAt` IS NULL) OR (`isActive` IS NULL AND `revokedAt` IS NOT NULL)),
  ADD CONSTRAINT `GuardianStudent_dates_chk` CHECK (`revokedAt` IS NULL OR `revokedAt` >= `createdAt`),
  ADD CONSTRAINT `GuardianStudent_distinct_chk` CHECK (`guardianId` <> `studentId`);
```

Impacto: seed paso 8 con `findFirst({ guardianId, studentId, isActive: true })` + `create` (mismos conteos); `getLinkedStudentIds` con `isActive: true` (un apoderado revocado recibe 403 en el contexto).

**Decisión 2 — Estructura `apps/api/src/modules/users/`**

- `users.module.ts`: `imports: [AcademicModule]`. Controladores: Users, Students, Teachers, Guardians, GuardianLinks. Providers: `UsersService`, `EnrollmentsService`, `GuardianLinksService`, `ActiveActorGuard`, token `INSTITUTION_EMAIL_DOMAIN`. Sin exports.
- Archivos: `users.dto.ts` (Zod), `users-policy.ts` (puro: `normalizeEmail`, `checkEmailDomain`, `closeInstant`, `assertStatusChangeAllowed`, `buildUserSearchWhere`), `users-audit.ts` (`recordUsers`, nunca lanza, `module 'users'`), `users-locks.ts` (`lockUserForUpdate`, `lockYearForShare`, `$queryRaw` parametrizado), `users.errors.ts`, `user-views.ts`, `active-actor.guard.ts`, servicios, controladores y `.spec.ts`.
- Importa de `../academic/`: `zod-validation.pipe.ts`, `request-user.ts`, `academic.mappers.ts`, `academic.errors.ts`, `academic-policy.ts` (`todayInLima`). No se mueve nada; no se toca `common/`.
- Cambios en `modules/academic`: 2 tipos nuevos en `AcademicEventMap`; filtro `isActive` en `getLinkedStudentIds`.

**Decisión 3 — Endpoints** (`/api/v1`; `@Roles('ADMIN')` y `@UseGuards(ActiveActorGuard)` a nivel de clase; Zod `strictObject`: campo desconocido → 400). Vistas: `UserView` `{ id, institutionalEmail, fullName, role, status, createdAt, updatedAt }`; `EnrollmentView` `{ id, academicYear:{id,year}, section:{id,gradeLevel,code}, isCurrent, effectiveFrom, effectiveTo, endReason }`; `GuardianLinkView` `{ id, guardian:{id,fullName,status}, student:{id,fullName,status}, isActive, createdAt, revokedAt }`.

| Método y ruta                         | Cuerpo / query                                                                                                                                | Respuesta                                                                                            | Errores                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /users` (RF-25)                  | `q?` 2..100, `role?`, `status?`, `gradeLevel?` 1..5, `sectionId?`, `academicYearId?` (activo por defecto), `page` (1), `pageSize` 1..100 (20) | `{ items: (UserView sin fechas + currentSection \| null), total, page, pageSize }` por fullName e id | 400 (grado/sección con role ≠ STUDENT)                                                                    |
| `GET /users/:id`                      | —                                                                                                                                             | `UserView` + `currentEnrollment` (STUDENT) + `guardians` vigentes (STUDENT) o `students` (GUARDIAN)  | 400, 404                                                                                                  |
| `PATCH /users/:id` (RF-22)            | `{ fullName?, institutionalEmail? }`                                                                                                          | `UserView`; sin cambios → 200 sin bitácora                                                           | 404; 409 correo; 422 dominio                                                                              |
| `PUT /users/:id/status` (RF-23)       | `{ status, reason?: 1..500 }`                                                                                                                 | `{ user, closedEnrollments }`; mismo estado → 200 sin bitácora                                       | 404; 409 sobre sí mismo o último ADMIN activo                                                             |
| `POST /students` (RF-18)              | `{ institutionalEmail, fullName, sectionId }`                                                                                                 | 201 `{ user, enrollment }`                                                                           | 404; 409 correo, sin año activo, año cerrado, sección inactiva; 422 sección de otro año, dominio          |
| `POST /students/:id/enrollments`      | `{ sectionId }`                                                                                                                               | 201 `EnrollmentView`                                                                                 | 404; 409 ya vigente, sección inactiva, sin año activo; 422 no STUDENT, WITHDRAWN, otro año                |
| `POST /students/:id/transfer` (RF-24) | `{ sectionId, reason?: 1..500 }`                                                                                                              | `{ closed, current }`                                                                                | 404; 409 sin vigente, sección inactiva, concurrencia; 422 no STUDENT, misma sección, otro grado, otro año |
| `GET /students/:id/enrollments`       | `academicYearId?`                                                                                                                             | `{ items, total }`                                                                                   | 404; 422                                                                                                  |
| `GET /students/:id/guardians`         | `includeRevoked?`                                                                                                                             | `{ items, total }`                                                                                   | 404; 422                                                                                                  |
| `POST /teachers` (RF-19)              | `{ institutionalEmail, fullName }`                                                                                                            | 201 `UserView`                                                                                       | 409; 422 dominio                                                                                          |
| `POST /guardians` (RF-20)             | `{ institutionalEmail, fullName, studentIds: uuid[1..10] }`                                                                                   | 201 `{ user, links }` (transacción)                                                                  | 409; 422                                                                                                  |
| `GET /guardians/:id/students`         | `includeRevoked?`                                                                                                                             | `{ items, total }`                                                                                   | 404; 422                                                                                                  |
| `POST /guardians/:id/students`        | `{ studentId }`                                                                                                                               | 201 `GuardianLinkView`                                                                               | 404; 409 duplicado; 422 roles, mismo id, WITHDRAWN                                                        |
| `POST /guardian-links/:id/revoke`     | `{ reason: 10..500 }`                                                                                                                         | `GuardianLinkView`                                                                                   | 400; 404; 409 ya revocado                                                                                 |

Efectos del estado: STUDENT → WITHDRAWN cierra en la transacción las matrículas vigentes de años no cerrados (`isCurrent` NULL, `effectiveTo`, `WITHDRAWAL`); INACTIVE no toca la matrícula; WITHDRAWN → ACTIVE no reabre (rematricular con `POST /students/:id/enrollments`); TEACHER inactivo conserva `teacherId`; los vínculos no se revocan solos; sin borrado físico. Solo ADMIN ve este módulo y los correos.

**Decisión 4 — Validaciones**

1. Rol en cada FK (`studentId` STUDENT, `guardianId` GUARDIAN) → 422; `guardianId !== studentId` → 422; rol inmutable (D-012).
2. Matricular o trasladar: no WITHDRAWN (INACTIVE sí). Vincular: ninguno WITHDRAWN. El ADMIN no cambia su propio estado ni deja el sistema sin ADMIN activo (409).
3. Correo: `trim().toLowerCase()`, `z.email()`, máx. 191, único (P2002 → 409). Dominio vía token `INSTITUTION_EMAIL_DOMAIN` (lee `process.env.INSTITUTION_EMAIL_DOMAIN`, null si no está → sin validar y Logger.warn) para STUDENT, TEACHER y ADMIN; GUARDIAN exento hasta D-013. `fullName`: trim, espacios colapsados, 3..120, sin caracteres de control.
4. Sección destino: existe (404); del año activo (422); año activo y no cerrado (409); sección activa (409). Traslado: mismo año, mismo `gradeLevel` (otro → 422), sección distinta (422). `sectionId` y `academicYearId` siempre juntos desde la fila de `Section`.
5. Fechas solo del servidor: `at = max(now, current.effectiveFrom)`; `effectiveTo = at` y, en traslado, nuevo `effectiveFrom = at`.
6. Bloqueos en orden global: (1) `User` del estudiante `FOR UPDATE` → (2) `AcademicYear` `FOR SHARE` → escrituras; revalidar dentro de la transacción; cierre con `updateMany({ id, isCurrent: true })` (count 0 → 409) y luego crear. Alta de estudiante: solo (2). P2002/P2003/P2034 → 409.
7. Marcadores: cerrar o revocar escribe `null`, nunca `false`.

**Decisión 5 — Bitácora y eventos**

- Bitácora (`module 'users'`, después del commit, nunca lanza, solo ids, nunca correos ni nombres): `users.user.create` (after `{ role, status }`), `users.user.update` (after `{ changedFields }` sin valores), `users.user.status_change` (`{ status }` → `{ status, reason? }`), `users.enrollment.create`, `users.enrollment.transfer` (entidad = la nueva; before/after con enrollmentId y sectionId, `endReason: 'TRANSFER'`, `reason?`), `users.enrollment.withdraw`, `users.guardian_link.create`, `users.guardian_link.revoke` (`{ isActive: true }` → `{ isActive: false, reason }`).
- Eventos (después de la bitácora): `user.status-changed.v1 { userId, role, previousStatus, status, changedAt, closedEnrollmentIds }` y `enrollment.transferred.v1 { studentId, academicYearId, fromEnrollmentId, toEnrollmentId, fromSectionId, toSectionId, transferredAt }`.

**Decisión 6 — Compartidos:** `app.module.ts` +2 (`UsersModule` después de `AcademicModule`); `prisma/schema/academic.prisma` y carpeta nueva de migración. No se tocan `auth.prisma`, `package.json`, `pnpm-lock`, `env.ts`, `common/`, `app.setup.ts`.

**Decisión 7 — Agentes y criterios**

1. `modelador-bd`: validate/format sin cambios; migración aplicada e in sync; `SHOW CREATE TABLE GuardianStudent` con PK `id`, UNIQUE nuevo y 3 CHECK; las 3 filas del seed con `id` e `isActive=1`; ROLLBACK: segundo vínculo vigente → 1062, `isActive=0` → 3819, revocado sin `revokedAt` → 3819, mismo id → 3819 (o 3823 documentado); `db:generate` ok; `git diff auth.prisma` vacío. No corre el seed.
2. `dev2-estructura`: seed paso 8; `getLinkedStudentIds` y spec; 2 eventos; módulo `users`; `app.module.ts` +2. Unit tests de policy, DTO, servicios con Prisma simulado y guard. api lint/test/build; prettier; `pnpm db:seed` ×2 con los mismos conteos (68 usuarios, 2 años, 8 períodos, 7 secciones, 5 cursos, 30 CourseSection, 62 matrículas, 59 vigentes, 3 vínculos vigentes); humo `GET /api/v1/users` sin sesión → 401.
3. `qa-tester`: `apps/api/test/users-api.e2e-spec.ts` + ajuste de `academic-schema.e2e-spec.ts:233`. Lectura con el seed (401/403; filtros: `role=STUDENT&gradeLevel=3` → 20, `sectionId=3A` → 9, `q=docente` → 5, WITHDRAWN → estudiante60, INACTIVE STUDENT → estudiante59, `q='%'`/`'_'` → 0, paginación, `pageSize=101` → 400, `role=TEACHER&gradeLevel=3` → 400; historiales de estudiante03, 01 y 60; docente → 422). Escritura solo con usuarios `qa-f3-*@colegio.example` en 3A/3B/4A de 2026 (alta, duplicado, 2025 → 422, 404, dominio → 422; traslado con fechas, contexto 3A → 403 y 3B → 200, misma sección → 422, 4A → 422, carrera → 200 + 409; WITHDRAWN con evento, ACTIVE, rematrícula, INACTIVE, mismo estado sin bitácora, admin sobre sí → 409; docente asignable; apoderado, vínculos inválidos, duplicado, revocar sin motivo → 400, revocar → contexto 403, revocar otra vez → 409, revincular con id nuevo, `includeRevoked` → 2; PATCH con `role` → 400, correo de admin → 409, sin cambios, `changedFields`). `afterAll` borra vínculos, matrículas y usuarios QA; test final de conteos. test:e2e en verde dos veces y seed con los mismos conteos.
4. `seguridad-cumplimiento` (IDOR, roles, correos solo ADMIN, bitácora, bloqueos, guard, menores). Sin ux (no hay pantallas).
5. `revisor-pr`. 6. `documentador` (docs/02, 03, 04, 08: D-032, D-033, D-034; 10).

Pendientes: pedidos a Dev 1 (RF-08 con sesiones abiertas, variable de dominio, `record(event, tx?)`); decisiones D-013, D-024, D-032 (finalidad y conservación de vínculos, institución); fechas del cliente y cambio de grado en traslado (hoy no). No va al equipo (D-021, D-027).
Para: modelador-bd

### Decisión del orquestador

- Diff contra `origin/features/david` hecho por el orquestador: David **no** cambia `auth.prisma` ni añade migraciones (solo `auth_base`); su `env.ts` no tiene variable de dominio; `common/session` solo añade `setIfAbsent` (sin revocación por usuario); `auth.service.ts` comprueba `status` solo al iniciar sesión. El plan sigue tal cual: el token local `INSTITUTION_EMAIL_DOMAIN` y el `ActiveActorGuard` son necesarios.
- Autorizo: `prisma/schema/academic.prisma` (modelo `GuardianStudent`), la carpeta nueva de migración y `app.module.ts` (+2). No se toca `.env.example`.

### INFORME 2 — modelador-bd

Estado: LISTO
Archivos: prisma/schema/academic.prisma (GuardianStudent), prisma/migrations/20261026235821_guardian_student_revocable/migration.sql (nuevo; carpeta creada a mano porque Prisma 7 rechaza --create-only en entorno no interactivo, con el SQL manual).
Cambio respecto al plan: GuardianStudent_isActive_chk corregido a `(isActive IS NOT NULL AND isActive = 1 AND revokedAt IS NULL) OR (isActive IS NULL AND revokedAt IS NOT NULL)`, porque la versión original dejaba pasar (NULL, NULL): una condición UNKNOWN no hace fallar un CHECK en MySQL.
Comandos: validate/format ok; migración aplicada e "Already in sync" (sin drift); SHOW CREATE TABLE con PK id, UNIQUE nuevo, 3 CHECK y FK RESTRICT; 3 filas con id e isActive=1; ROLLBACK: segundo vigente 1062, isActive=0 3819, revocado sin revokedAt 3819, mismo id 3819 (sin 3823), revokedAt < createdAt 3819, revocar/revincular varias veces ok; db:generate ok; auth.prisma sin cambios; api build ok.
Hallazgos:

- [ALTO] Fase 1, migration 20261026174231_academic_estructura:144-146 — Enrollment_isCurrent_chk tiene el mismo defecto: acepta isCurrent NULL sin effectiveTo ni endReason (comprobado). → Migración nueva que lo recree con `isCurrent IS NOT NULL AND isCurrent = 1 AND …` + caso e2e.
- [BAJO] seed paso 8 usa la clave vieja → dev2.
  Decisión: todo CHECK sobre un marcador TRUE/NULL protege la rama TRUE con IS NOT NULL.
  Para: dev2-estructura

### Decisión del orquestador

Se corrige ya el hallazgo ALTO (CHECK de Enrollment de la Fase 1) con una migración nueva `enrollment_iscurrent_check_fix`, a cargo de modelador-bd, **antes** de lanzar a dev2-estructura (para no cambiar migraciones mientras dev2 corre el seed y los tests). No se edita la migración de la Fase 1 (ya está en el repo).

### INFORME 3 — modelador-bd (corrección del CHECK de Enrollment)

Estado: LISTO
Archivo: prisma/migrations/20261027000217_enrollment_iscurrent_check_fix/migration.sql (nuevo; la de la Fase 1 sin cambios).
Resumen: Enrollment_isCurrent_chk recreado con `isCurrent IS NOT NULL AND isCurrent = 1 AND …` en la rama TRUE. 0 de 62 filas lo violaban antes de aplicar. Sin drift.
Comandos: ROLLBACK: cerrar sin fecha ni motivo → 3819 (antes pasaba); isCurrent=0 → 3819; cerrada sin endReason → 3819; cierre correcto → ok. api build ok; test:e2e 85/85.
Revisión de los demás CHECK: correctos (columnas NOT NULL o patrón `x IS NULL OR …`).
Hallazgo: [BAJO] faltan casos e2e de cierre sin fecha/motivo y de GuardianStudent revocado sin revokedAt → qa-tester.
Decisión: patrón obligatorio en CHECK de marcadores TRUE/NULL: `<col> IS NOT NULL AND <col> = 1` en la rama TRUE.
Verificado por el orquestador: prisma migrate status al día.
Para: dev2-estructura

### INFORME 4 — dev2-estructura

Estado: LISTO
Archivos: seed paso 8 (findFirst + create); modules/academic (getLinkedStudentIds con isActive true y spec; 2 eventos); app.module.ts (+2); módulo nuevo apps/api/src/modules/users/ (5 controladores, 3 servicios, dto, policy, audit, locks, errors, views, ActiveActorGuard, institution-domain, queries) y 7 archivos de test.
Endpoints: GET /users, GET /users/:id, PATCH /users/:id, PUT /users/:id/status, POST /students, POST /students/:id/enrollments, POST /students/:id/transfer, GET /students/:id/enrollments, GET /students/:id/guardians, POST /teachers, POST /guardians, GET /guardians/:id/students, POST /guardians/:id/students, POST /guardian-links/:id/revoke.
Comandos: db:seed x3 con los mismos conteos (3 vínculos vigentes); api lint ok; api test 180 (18 archivos); build ok; prettier ok; humo temporal en MySQL (borrado): 401 sin sesión, filtros, circuito alta → traslado → apoderado → revocar → WITHDRAWN → rematrícula; test:e2e 85/85.
Hallazgos:

- [MEDIO] Prisma `contains` no escapa comodines (`%` devolvía 68) → búsqueda q con $queryRaw y LOCATE (sin comodines, parametrizado).
- [BAJO] carrera teórica entre desactivar una sección y matricular en ella (SectionsService.update no bloquea) → pendiente.
- [BAJO] q exige 2..100: usar q=%% y q=__ para probar comodines.
  Decisiones: bloqueos lockUserForUpdate → lockActiveAdminIds (si ADMIN) → lockYearForShare, varios usuarios en orden de id; marcadores null; fechas del servidor; WITHDRAWN solo cierra matrículas de años no cerrados; grado/sección exigen role=STUDENT; sección destino: 404 / 409 año cerrado o sin año activo / 422 otro año / 409 inactiva; ActiveActorGuard también da 403 si el rol de BD no coincide con la sesión; token de dominio con o sin '@'.
  Para el QA: dominio con overrideProvider(INSTITUTION_EMAIL_DOMAIN); dos traslados idénticos dan 200 + 422; transfer y revoke responden 200.
  Verificado por el orquestador: api test en verde.
  Para: qa-tester y seguridad-cumplimiento

### INFORME 5 — seguridad-cumplimiento

Estado: APROBADO (0 CRÍTICO, 0 ALTO)
Verificado: @Roles('ADMIN') + ActiveActorGuard en los 5 controladores; correos solo para ADMIN; strictObject (role/status no se cambian por PATCH); 4 $queryRaw parametrizados, LOCATE sin comodines; protección del propio y del último ADMIN con bloqueo; bitácora sin correos ni nombres; eventos sin datos personales; vínculos revocables y apoderado revocado sin acceso; orden de bloqueos coherente; fechas del servidor; dominio no evadible con subdominios.
Hallazgos:

1. [MEDIO] RF-08 fuera de este módulo: usuarios no ACTIVE conservan sesión en Dev 3/4/5 → Dev 1 revoca sesiones con user.status-changed.v1; mientras tanto cada endpoint consulta status.
2. [MEDIO] Retirar a un estudiante no corta los vínculos de apoderado y getLinkedStudentIds no mira el estado del estudiante → decidir en D-032.
3. [MEDIO] Motivos de texto libre en la bitácora (posibles datos de menores) → advertencia en docs/03 y en la UI; evaluar catálogo; conservación en D-024.
4. [MEDIO] Bitácora después del commit → record(event, tx) de Dev 1.
5. [BAJO] Posible deadlock entre cambios de estado de ADMIN distintos (orden objetivo → ADMIN activos); un 1213 fuera de P2034 daría 500.
6. [BAJO] searchIds sin LIMIT y page hasta 100000.
7. [BAJO] Sin INSTITUTION_EMAIL_DOMAIN no se valida dominio → Dev 1 la hace obligatoria en producción.
8. [BAJO] Un ADMIN puede cambiar el correo de otro ADMIN (vector de toma de cuenta; queda en bitácora) → aceptable en v1.
9. [BAJO] ActiveActorGuard añade una consulta por petición.
   Para: revisor-pr

### Decisión del orquestador

Cuando termine qa-tester, dev2-estructura corrige en esta fase (vuelta 1/2):

- Hallazgo 2: `getLinkedStudentIds` excluye estudiantes WITHDRAWN (filtro por estado, no revocación automática: es reversible si el estudiante se reincorpora y no destruye historial). Documentar en D-032.
- Hallazgo 5: bloquear primero la lista de ADMIN activos (si el objetivo es ADMIN) y después el objetivo; mapear también el deadlock 1213 / P2010 a 409.
- Hallazgo 6: `page` máximo 1000 y `LIMIT` en la consulta raw de búsqueda.
- Hallazgo 3: advertencia en docs/03 (documentador) y JSDoc en los DTO; el aviso en la UI queda para F5.
  Los hallazgos 1, 4 y 7 son de Dev 1; el 8 se acepta en v1.

### INFORME 6 — qa-tester

Estado: LISTO
Archivos: apps/api/test/users-api.e2e-spec.ts (nuevo, 86 tests); apps/api/test/academic-schema.e2e-spec.ts (vínculos vigentes y 8 casos nuevos de CHECK con ROLLBACK).
Cobertura: 401/403 en las 14 rutas; filtros y paginación con el seed; historiales; altas, duplicados, años y secciones inválidas, dominio, fechas del cliente → 400; traslado con fechas del servidor, bitácora, evento y cambio de acceso al contexto; estados con eventos; docente asignable; vínculos, revocación, revinculación e includeRevoked; PATCH; ActiveActorGuard con ADMIN inactivo; bitácora y eventos sin correos ni nombres; concurrencia (traslados 200 + 422; altas, matrículas, vínculos y revocaciones 201/200 + 409).
Comandos: test:e2e 179/179 tres veces; lint ok; prettier ok; db:seed con los mismos conteos.
Hallazgos (BAJO): año cerrado → 409 y año abierto no activo → 422 (coherente con el INFORME 4; docs/03 debe reflejarlo); "último ADMIN activo" solo cubierto por tests unitarios.
Para: dev2-estructura (correcciones de la decisión anterior)

### INFORME 7 — dev2-estructura (corrección 1/2)

Estado: LISTO
Cambios: getLinkedStudentIds excluye estudiantes WITHDRAWN por estado (sin revocar; INACTIVE siguen contando); changeStatus lee el rol sin bloqueo y, si el objetivo es ADMIN, bloquea primero los ADMIN activos y luego el objetivo; mapPrismaError convierte el deadlock 1213 (P2010 / errno / TransactionWriteConflict) en 409, también en el módulo academic; page máximo 1000 y searchIds con ORDER BY id LIMIT 5000; JSDoc de advertencia en los esquemas de motivo.
Archivos: academic-access.service.ts y spec, academic.errors.ts, academic.mappers.spec.ts, users-locks.ts, users.service.ts y spec, users.dto.ts y spec.
Comandos: prettier ok; api lint ok; api test 185/185; build ok; test:e2e 179/179 (ninguno afectado). Preexistente: tsc --noEmit TS6059 por academic-schema.e2e-spec.ts.
Hallazgos (BAJO): con más de 5000 coincidencias el total se calcula sobre los primeros 5000 (aceptable en v1); el mapeo del deadlock también cambia academic (500 → 409, favorable).
Verificado por el orquestador: api test 185/185.
Para: revisor-pr

### INFORME 8 — revisor-pr

Estado: APROBADO
Resumen: Alcance solo en carpetas de Dev 2; Decisiones 1–7 y correcciones del INFORME 7 presentes en el código; ALTO de los INFORMES 2 y 3 resueltos.
Comandos: lint ok; test 185/185; build 5/5; test:e2e 179/179; migrate status al día (5 migraciones); db:seed con los mismos conteos; format:check falla solo por .agents/ y el expediente.
Hallazgos: [MEDIO] heredados de Dev 1 (RF-08, bitácora en transacción, variable de dominio); [BAJO] tope de 5000 en búsqueda; carrera teórica al desactivar sección; "último ADMIN" solo en unit tests; deadlock 1213 → 409 también en academic (anotar en el commit).
Para: documentador

### INFORME 9 — documentador

Estado: LISTO
Archivos: docs/02, 03 (API de usuarios, eventos, advertencia de motivos), 04 (revocación, retiro, traslado, patrón de CHECK), 08 (D-032, D-033, D-034; pedidos a Dev 1 en D-019; nota en D-027), 10, docs/manuales/tecnico.md (Módulo de usuarios).
Hallazgos: ruta de .env.example incorrecta en tecnico.md (corregida por el orquestador); docs/propuestas/schema.propuesto.prisma con la clave compuesta antigua (borrador histórico, sin tocar); RF-21 es de F4.

## Cierre

Fase 3 terminada. Reporte: .claude/reportes/20261026-dev2-usuarios-matriculas.md. Commit en features/adolfo, subido solo a mio. No va al equipo (D-021).
