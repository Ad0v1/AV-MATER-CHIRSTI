# Dev 2, Fase 2: API académica y AcademicAccessService

Pedido por el usuario: "Sigue con la Fase 2 de Dev 2: API académica y AcademicAccessService, con los agentes."
Flujo: completo
Vueltas de corrección: 1/2
Entorno: local con Docker (MySQL con la migración `academic_estructura` y el seed cargado), rama `features/adolfo`; el avance se sube solo a `mio`.

## Contexto

- Fase 1 hecha: `.claude/tareas/20261026-dev2-estructura.md` y `.claude/reportes/20261026-dev2-estructura.md` (commit `9f70bc8`). Ahí está el plan por fases del arquitecto (INFORME 1, Decisión 1) y los hallazgos de seguridad que pasan a F2/F3 (INFORME 4: rol correcto en FK hacia `User`, `isActive` de sección y curso-sección, marcadores TRUE/NULL, bitácora de acciones académicas).
- Dev 2 es de un compañero: **no va al equipo** sin acuerdo; depende de D-021.
- La rama de David (Dev 1, `features/david`) también modifica `apps/api/src/app.module.ts`, `auth`, `session` y el layout: tocar lo mínimo en archivos compartidos y nunca su módulo de auth.

## Alcance de la Fase 2 (según el plan de la Fase 1)

RF-09, 10, 11, 12, 13, 14, 17; RN-10, RN-11, RN-12:

- `apps/api/src/modules/academic/`: CRUD de años, períodos, secciones y cursos; asignación y reasignación de docentes; cierre y reapertura de períodos con motivo en la bitácora; años inactivos de solo lectura; activación de año en una transacción.
- Endpoints de `docs/03`: `GET /course-sections/:id/context` y `GET /me/course-sections`.
- `AcademicAccessService` exportado por `AcademicModule` para Dev 3/4/5: `getCourseSectionContext`, `assertTeacherOf`, `isPeriodOpen`, `listCurrentEnrollments`, `listEnrollmentsOfStudent`, `getLinkedStudentIds`.
- Eventos: `period.closed.v1`; propuestos `period.reopened.v1` y `academic-year.closed.v1`.

**Fuera de alcance:** usuarios, altas y traslados (F3), importación (F4), pantallas (F5), clonación y promoción (F6).

---

## Informes

### INFORME 1 — arquitecto-integrador

Estado: LISTO
Resumen: F2 en alcance v1 (ERS §3.2, prioridad Alta). Sin cambio de esquema. Dueño `dev2-estructura`. Módulo `modules/academic` con 6 controladores, validación con Zod (ya está en apps/api), `AcademicAccessService` exportado y eventos en proceso con `node:events`. Compartidos: 2 líneas en `app.module.ts` y 1 en `vitest.config.e2e.ts`.

Hallazgos:

- [ALTO] `common/auth/roles.guard.ts:26` — una ruta sin `@Roles` queda abierta, incluso sin sesión → `@Roles` a nivel de clase en todos los controladores; test 401 por controlador.
- [MEDIO] `AuditService` no acepta cliente de transacción → orden: commit, luego `audit.record`, luego evento. Pedir a Dev 1 `record(event, tx?)`.
- [MEDIO] RF-17 vs RF-09/15: "solo lectura" se define en la Decisión 4 (D-030 PROPUESTA).
- [MEDIO] Los e2e corren en paralelo y F2 cambia el año activo → `fileParallelism: false` y años 2095..2099.
- [BAJO] El filtro de errores no acepta códigos propios → status + mensaje fijo en español; pedir a Dev 1.
- [BAJO] Prisma P2002/P2003/P2025 sin mapear (500) → mapear en el módulo.
- [BAJO] La sesión solo trae `{id, role}` → `AcademicAccessService` comprueba `status ACTIVE`.

**Decisión 1 — Estructura `apps/api/src/modules/academic/`**

- `academic.module.ts`: sin imports (Prisma y Audit son @Global). Controllers: AcademicYears, AcademicPeriods, Sections, Courses, CourseSections, MeCourseSections. Providers: un servicio por recurso + `AcademicAccessService` + `AcademicEventPublisher`. **exports: [AcademicAccessService, AcademicEventPublisher]**.
- `<recurso>.controller.ts` / `<recurso>.service.ts` con `.spec.ts` al lado (Vitest).
- `academic.dto.ts`: esquemas Zod; fechas `z.iso.date()` ('YYYY-MM-DD'); ids `z.uuid()`; textos `.trim()`.
- `zod-validation.pipe.ts` (local): `BadRequestException({ message: issues.map(i => ({ path, message })) })` → 400 VALIDATION_ERROR con details. Uso: `@Body(new ZodValidationPipe(schema))`, `@Param('id', new ZodValidationPipe(z.uuid()))`.
- `academic.errors.ts`: `mapPrismaError`: P2002 y P2003 → 409; P2025 → 404; resto se relanza.
- `academic.mappers.ts`: `toDateOnly`, `fromDateOnly` (UTC 00:00), `marker(v) → boolean`, `diffFields(before, after)` (solo cambiados, D-024).
- `academic-policy.ts` (funciones puras): `isYearReadOnly(year, activeYear)`, `validatePeriodDates(year, periods)`, `periodKindFor(sequence)` / `PERIOD_LABELS` (D-002).
- `academic-events.ts`: tipos y `AcademicEventPublisher`.
- `request-user.ts`: `currentUser(req)` (401 si falta) y `actorOf(req) → { id, ip }`, siguiendo `auth.controller.ts` (`req.user`). Único punto a cambiar si Dev 1 cambia la sesión.
- Respuestas: timestamps ISO UTC; `@db.Date` como 'YYYY-MM-DD'; marcadores TRUE/NULL como boolean; listas `{ items, total }`.
- Bitácora: action `academic.<entidad>.<verbo>`, module `'academic'`.

**Decisión 2 — Endpoints (prefijo /api/v1).** ADMIN = `@Roles('ADMIN')` a nivel de clase salvo indicación. Errores: 400 validación, 401 sin sesión, 403 rol/pertenencia, 404 no existe, 409 duplicado/cerrado/solo lectura, 422 regla de negocio.

Años (ADMIN):

- `POST /academic-years` `{ year: 2000..2100, periods: [{ sequence 1..4, startDate, endDate }] }` (exactamente 4, sin repetir) → 201 `{ id, year, isActive, closedAt, readOnly, periods }`. Año (isActive NULL) + 4 períodos en una `$transaction`; `kind`/`label` derivados de sequence. 409 si existe; 422 por fechas.
- `GET /academic-years` → `{ items: [{ id, year, isActive, closedAt, readOnly }], total }`, year descendente.
- `GET /academic-years/:id` → con períodos (aunque sea solo lectura).
- `PATCH /academic-years/:id` `{ year }` → solo si no es solo lectura, no activo y sin secciones (si no 409); mueve las fechas de los períodos al nuevo año en la transacción; 409 si el año ya existe.
- `POST /academic-years/:id/activate` → 409 si `closedAt != null`; si ya activo, 200 sin cambios ni bitácora; si no, en `$transaction`: `updateMany({ isActive: true } → null)` y `update(id → true)`; P2002 por concurrencia → 409.
- `POST /academic-years/:id/close` → 409 si ya cerrado; 422 si hay períodos abiertos; transacción `closedAt = now`, `isActive = null`. Emite `academic-year.closed.v1`.

Períodos (ADMIN):

- `PATCH /academic-periods/:id` `{ startDate?, endDate? }` (al menos uno) → `{ id, academicYearId, sequence, kind, label, startDate, endDate, closedAt, isOpen }`. 409 si año solo lectura o período cerrado; 422 por fechas.
- `POST /academic-periods/:id/close` `{ reason?: 1..500 }` → 409 si cerrado o año solo lectura; `closedAt = now`; emite `period.closed.v1`.
- `POST /academic-periods/:id/reopen` `{ reason: 10..500 }` obligatorio (RF-11/RN-10) → 409 si no está cerrado o su año no está activo o está cerrado; `closedAt = null`; emite `period.reopened.v1`.

Secciones (ADMIN):

- `GET /academic-years/:yearId/sections` → `{ items: [{ id, academicYearId, gradeLevel, code, isActive }], total }`.
- `POST /academic-years/:yearId/sections` `{ gradeLevel 1..5, code /^[A-Z0-9]{1,8}$/ }` (a mayúsculas) → 201; 404 año; 409 solo lectura o duplicado.
- `PATCH /sections/:id` `{ code?, isActive? }` → 409 si solo lectura, duplicado o desactivar con matrículas vigentes. gradeLevel no cambia.

Cursos (ADMIN, catálogo global):

- `GET /courses?includeInactive=true|false` (por defecto false).
- `POST /courses` `{ name 1..120 }` → 201; 409 duplicado.
- `PATCH /courses/:id` `{ name?, isActive? }`; 409 duplicado.

Curso-sección:

- `GET /sections/:sectionId/course-sections` (ADMIN) → `{ items: [{ id, sectionId, course: { id, name }, teacher: { id, fullName } | null, isActive }], total }`.
- `POST /sections/:sectionId/course-sections` (ADMIN) `{ courseId, teacherId?: uuid | null }` → 201; 404 sección/curso; 409 solo lectura, sección inactiva o duplicado; 422 curso inactivo o docente no válido.
- `PATCH /course-sections/:id` (ADMIN) `{ isActive }`; 409 solo lectura.
- `PUT /course-sections/:id/teacher` (ADMIN) `{ teacherId: uuid | null }` → asignar/reasignar/quitar (D-029); 409 solo lectura; 422 docente no válido; mismo docente → 200 sin cambios ni bitácora.
- `GET /course-sections/:id/context` con `@Roles('ADMIN','TEACHER','STUDENT','GUARDIAN')`: `access.assertCanAccessCourseSection(user, id)` y luego `getCourseSectionContext(id)` → `{ id, isActive, readOnly, academicYear: { id, year, isActive, closedAt }, section: { id, gradeLevel, code, isActive }, course: { id, name }, teacher: { id, fullName } | null, periods, currentPeriodId }`. `readOnly` = año solo lectura, no activo, o sección/curso-sección inactivos. `currentPeriodId` según hoy en America/Lima. Sin correos ni datos de estudiantes.
- `GET /me/course-sections` (`@Roles('TEACHER','STUDENT')`) → `{ items: [{ id, course, section, academicYear: { id, year }, teacher, enrollmentId? }], total }`. Solo año activo y curso-sección/sección activos. TEACHER: `teacherId = me`. STUDENT: curso-secciones de la sección de su matrícula `isCurrent: true` del año activo, con `enrollmentId`. Sin año activo → []. GUARDIAN/ADMIN → 403.

**Decisión 3 — AcademicAccessService (contrato para Dev 3/4/5)**

- `getActiveYear(): { id, year } | null`.
- `getCourseSectionContext(courseSectionId)`: 404 si no existe; no comprueba permisos.
- `assertCanAccessCourseSection(user, courseSectionId)`: 404 si no existe; 403 si el usuario no está ACTIVE; pasa si ADMIN; TEACHER si `teacherId === user.id`; STUDENT si tiene matrícula `isCurrent: true` en esa sección; GUARDIAN si algún vinculado cumple la regla de STUDENT.
- `assertTeacherOf(userId, courseSectionId)`: 404 / 403 (incluye teacherId null).
- `isPeriodOpen(periodId)`: 404; true solo si `closedAt === null` y el año tiene `isActive === true` y `closedAt === null`.
- `assertCourseSectionWritable(courseSectionId, periodId?)`: 404; 409 si año no activo o cerrado, o sección/curso-sección inactivos. Con periodId: 404; 422 si es de otro año; 409 si cerrado.
- `listCurrentEnrollments(sectionId)` → `[{ enrollmentId, studentId, fullName, status, effectiveFrom }]` (`isCurrent: true`, por fullName; incluye INACTIVE). 404 si no existe la sección.
- `listEnrollmentsOfStudent(studentId, academicYearId)` → vigentes y cerradas por effectiveFrom, con `isCurrent` boolean, `effectiveTo`, `endReason`; [] si no hay.
- `getLinkedStudentIds(guardianId)` → `string[]`.
- **Marcadores TRUE/NULL:** vigente/activo = `{ isCurrent: true }` / `{ isActive: true }`; cerrada/no activo = `null`. Cerrar o desactivar escribe `null`, **nunca `false`** (CHECK 3819). `Section/Course/CourseSection.isActive` son booleanos normales.

**Decisión 4 — Validaciones**

- `year` 2000..2100.
- `validatePeriodDates`: `endDate >= startDate`; fechas dentro del año calendario; `start(n+1) > end(n)` (sin solapes, huecos permitidos); 422 con details.
- Docente: existe, `role === 'TEACHER'`, `status === 'ACTIVE'`; si no 422 "El usuario no es un docente activo".
- Sección activa para crear curso-sección (409); curso activo (422).
- Solo lectura (D-030): `readOnly = closedAt != null || (isActive == null && activeYear != null && year < activeYear.year)`. Un año futuro no cerrado se puede preparar.
- Validar antes de escribir y mapear P2002/P2003 por concurrencia.

**Decisión 5 — Bitácora** (después del commit; `actorId`, `ip`, `module 'academic'`, solo campos cambiados, ids, nunca nombres ni correos): `academic.year.create|update|activate|deactivate|close`, `academic.period.update|close|reopen` (con `reason`), `academic.section.create|update`, `academic.course.create|update`, `academic.course_section.create|update|assign_teacher` (before/after `teacherId`). Lecturas no se registran.

**Decisión 6 — Eventos** (D-031 PROPUESTA): `AcademicEventPublisher` sobre `EventEmitter` de `node:events`; `publish(e)` y `on(type, handler) → unsubscribe`; después del commit y la bitácora; errores de handlers al Logger sin afectar la respuesta. Tipos: `period.closed.v1 { periodId, academicYearId, closedAt }`, `period.reopened.v1 { periodId, academicYearId, reopenedAt }`, `academic-year.closed.v1 { academicYearId, year, closedAt }` (ISO UTC).

**Decisión 7 — Archivos compartidos**

- `apps/api/src/app.module.ts`: `import { AcademicModule } from './modules/academic/academic.module.js';` y `AcademicModule` al final de `imports`.
- `apps/api/vitest.config.e2e.ts`: `fileParallelism: false` en `test`.
- Sin package.json nuevos (zod ^4 ya existe). No tocar pnpm-lock, app.setup.ts, common/ ni auth/.

**Decisión 8 — Agentes y criterios**

1. `dev2-estructura`: Decisiones 1–6 + los 2 compartidos. Unit tests: `validatePeriodDates`, `isYearReadOnly`, `diffFields`, `ZodValidationPipe`, `AcademicAccessService` con Prisma simulado (cada rama de pertenencia, no ACTIVE → 403, marcador null → false, isPeriodOpen con año inactivo → false, assertCourseSectionWritable 404/409/422). Criterio: api lint/test/build y prettier del módulo; `GET /api/v1/academic-years` sin sesión → 401.
2. `qa-tester`: `apps/api/test/academic-api.e2e-spec.ts` (skipIf sin DATABASE_URL; `createTestApp()`; sesiones con `SessionService.create({ id, role })` y usuarios del seed; bitácora vía `MemoryAuditSink`; datos propios en años 2095..2099 y cursos "QA-F2 "; en afterAll limpiar, reactivar 2026 y restaurar `closedAt` del I-2026 a 2026-05-05). Casos: 401/403 por controlador; años (201, 422, 409, activar/reactivar, cerrar con períodos abiertos 422, activar 2025 409); sección en 2025 → 409; docente no válido 422, docente02 200 con bitácora; reabrir I-2026 sin motivo 400 / con motivo 200 + evento; cerrar → evento; reabrir 2025 → 409; context de Matemática 3A (docente01 200, docente02 403, estudiante01 200, estudiante11 403, estudiante03 403 en 3A y 200 en 3B, estudiante59 403, apoderado01 200, apoderado02 403, admin 200, 404, 400); `/me/course-sections` (docente01 5, estudiante01 5 con enrollmentId, estudiante60 [], apoderado01 403); `isPeriodOpen`. Criterio: test:e2e todo en verde y `pnpm db:seed` con los mismos conteos.
3. `seguridad-cumplimiento`, 4. `revisor-pr`, 5. `documentador` (docs/03, docs/08 D-030 y D-031 y nota en D-019, docs/10).

Pendientes: D-030, D-031 PROPUESTA; pedir a Dev 1 `record(event, tx?)` y códigos propios en el filtro; fuera de F2: años anteriores en `/me`, matrículas y vínculos (F3). No va al equipo (D-021).
Para: dev2-estructura

### Decisión del orquestador

- Diff contra `origin/features/david` hecho por el orquestador: David no cambia `AuthenticatedUser`, `req.user` ni `RolesGuard`; en `app.module.ts` solo añade 3 providers (`AuthService`, `PasswordService`, `TotpService`), así que el choque se limita a líneas vecinas y se resuelve a mano.
- Autorizo los 2 archivos compartidos de la Decisión 7.

### INFORME 2 — dev2-estructura

Estado: LISTO
Archivos: apps/api/src/modules/academic/ (módulo, dto, errors, mappers, policy, events, audit, request-user, zod pipe, AcademicAccessService, 5 pares controlador/servicio + me-course-sections.controller) y 5 specs; compartidos autorizados: app.module.ts (AcademicModule) y vitest.config.e2e.ts (fileParallelism: false).
Endpoints: años (GET, POST, GET :id, PATCH, activate, close), períodos (PATCH, close, reopen), secciones (GET, POST, PATCH), cursos (GET, POST, PATCH), curso-sección (GET, POST, PATCH, PUT teacher) — todos ADMIN; GET /course-sections/:id/context (4 roles con pertenencia); GET /me/course-sections (TEACHER, STUDENT).
Comandos: api lint ok; api test 91 (11 archivos); api build ok; prettier ok; test:e2e 26/26; humo temporal (borrado): sin sesión 401, admin 200, estudiante 403, /me de docente01 y estudiante01 con 5, context 200, id no UUID 400.
Hallazgos: [MEDIO] el caso de QA "apoderado02 403 en 3A" está mal: apoderado02 está vinculado a estudiante02 (3A) → esperar 200 en 3A y 403 en Matemática 3B. [BAJO] el filtro común pone "Solicitud invalida" cuando message es lista. [BAJO] mensajes de Zod con z.locales.es() solo en el pipe. Preexistente: `tsc --noEmit` falla por academic-schema.e2e-spec.ts importando prisma/seed fuera del rootDir (de la Fase 1).
Decisiones: fechas 'YYYY-MM-DD' e ISO UTC también en AcademicAccessService; extras isYearReadOnly(year), periodIsOpen, toPeriodView, getCourseSectionContext(id, now?); assertTeacherOf exige ACTIVE; GUARDIAN no mira el estado del estudiante; /me devuelve [] a usuarios no ACTIVE; bitácora con marcadores como boolean y academic.year.deactivate; cierres con updateMany condicionado (409 en concurrencia); PATCH sin cambios → 200 sin escritura ni bitácora; orden 404 → 409 → 422.
Verificado por el orquestador: api test 91 en verde y archivos del alcance.
Para: qa-tester y seguridad-cumplimiento

### INFORME 3 — seguridad-cumplimiento

Estado: APROBADO (0 CRÍTICO, 0 ALTO)
Verificado: @Roles de clase en los 6 controladores (única sobrescritura correcta en context); pertenencia sin IDOR (se calcula con el id de la sesión; usuario no ACTIVE consultado en BD); context y /me sin correos ni datos de otros estudiantes; Zod en todas las entradas; errores sin detalles de Prisma; eventos sin datos personales; bitácora completa con solo campos cambiados; activar año en transacción con marcador.
Hallazgos:

1. [MEDIO] academic-years.service.ts:169-198 — activate comprueba closedAt fuera de la transacción → un close concurrente deja un año cerrado y activo. Corrección: dentro de la transacción, updateMany({ id, closedAt: null } → isActive true) con 409 si count 0, antes de desactivar el anterior.
2. [MEDIO] academic-years.service.ts:201-233 y academic-periods.service.ts:98-121 — close de año y reopen de período sin bloqueo → año cerrado con período abierto. Corrección: ambos en $transaction con la condición repetida en el where (reopen: closedAt not null y año activo y no cerrado; close: contar abiertos dentro de la transacción).
3. [MEDIO] academic-audit.ts:11-29 — si audit.record falla tras el commit, el cambio queda sin bitácora ni evento. Corrección mínima: capturar en recordAcademic y Logger.error con action, entityId y actorId (sin before/after). Real: AuditService.record(event, tx?) de Dev 1.
4. [BAJO] listCurrentEnrollments y listEnrollmentsOfStudent no comprueban permisos → advertencia en JSDoc y docs/03 (el caller valida).
5. [BAJO] reason de texto libre podría contener nombres de menores → aviso en la UI (F5).
6. [BAJO] 404 vs 403 revela existencia (UUID no adivinables; aceptable).
7. [BAJO] asignar docente sin transacción (riesgo bajo; las lecturas comprueban ACTIVE).
8. [BAJO] handlers de eventos no deben poner datos personales en errores.
   Para: orquestador / revisor-pr

### INFORME 4 — qa-tester

Estado: LISTO
Archivo: apps/api/test/academic-api.e2e-spec.ts (59 tests contra MySQL).
Cobertura: 401/403 por controlador; context por rol y pertenencia (incluye apoderado02 200 en 3A y 403 en 3B; trasladado, retirado e inactivo); /me; años (crear, duplicado, fechas, renombrar, activar con bitácora activate/deactivate, cerrar con eventos); períodos (PATCH, cerrar, reabrir con motivo y evento, 2025 → 409); secciones, cursos y docentes (422 por rol, bitácora assign_teacher, no-op sin bitácora); isPeriodOpen; test final de conteos contra la línea base.
Comandos: test:e2e 85/85 dos veces; lint ok; prettier ok; db:seed con los mismos conteos.
Hallazgos: [BAJO] la limpieza borra años 2095..2099 y cursos "QA-F2 "; [BAJO] `any` con eslint-disable en la tabla de rutas. Preexistente: tsc --noEmit falla por academic-schema.e2e-spec.ts (Fase 1).
Para: dev2-estructura (correcciones de seguridad)

### Decisión del orquestador (vuelta 1/2)

Se corrigen ahora los MEDIO 1, 2 y 3 y el BAJO 4 del INFORME 3:

- 1 y 2: comprobaciones repetidas dentro de la transacción con updateMany condicionado (409 si count 0), sin dejar el año anterior desactivado.
- 3: corrección mínima. recordAcademic captura el fallo de audit.record, hace Logger.error con action, entityType, entityId y actorId (sin before/after) y **no** convierte la respuesta en 500, porque el cambio ya está confirmado; el evento se publica igual. La corrección real (record dentro de la transacción) queda pedida a Dev 1.
- 4: advertencia en el JSDoc de listCurrentEnrollments y listEnrollmentsOfStudent: el llamador debe validar permisos antes y no devolver la lista a STUDENT ni GUARDIAN.
  Los BAJO 5–8 quedan anotados (UI en F5; riesgos aceptados).

### INFORME 5 — dev2-estructura (corrección 1/2)

Estado: LISTO
Archivos: academic-years.service.ts (activate y close), academic-periods.service.ts (reopen en $transaction), academic-locks.ts (nuevo: lockAcademicYear con SELECT … FOR UPDATE parametrizado), academic-audit.ts (try/catch + Logger.error sin before/after ni mensaje), academic.errors.ts (P2034 → 409), academic-access.service.ts (JSDoc), academic-concurrency.spec.ts (nuevo, 11 tests).
Comandos: api lint ok; api test 102/102; build ok; prettier ok; test:e2e 85/85.
Decisiones: cerrar año y reabrir período bloquean primero la fila de AcademicYear (toda operación futura que cambie el estado del año o abra/cierre períodos debe hacer lo mismo); activate = desactivar el activo → activar con updateMany { id, closedAt: null } → 409 dentro de la callback si count 0 (rollback); recordAcademic nunca lanza.
Hallazgos: [BAJO] el log de fallo de bitácora solo trae error.name y code; [BAJO] academic-locks.ts usa el nombre de tabla `AcademicYear` (actualizar si se renombra).
Verificado por el orquestador: api test 102/102.
Para: revisor-pr

### INFORME 6 — revisor-pr

Estado: APROBADO
Resumen: Cumple las Decisiones 1–7 y las correcciones del INFORME 5. Alcance: modules/academic (27 archivos), academic-api.e2e-spec.ts, app.module.ts (+2) y vitest.config.e2e.ts (+2); nada en common/, auth/, session/, prisma/ ni package.json.
Comandos: lint ok; test 102/102; build 5/5; test:e2e 85/85; format:check falla solo por .agents/ y el expediente. Preexistente F1: tsc --noEmit por academic-schema.e2e-spec.ts.
Hallazgos (BAJO): lectura de prev en activate sin bloqueo (la carrera se resuelve por el UNIQUE → 409); nombre de tabla literal en academic-locks.ts; record(event, tx?) y códigos propios pendientes de Dev 1; advertencia de permisos de los listados → docs/03; aviso de reason en la UI (F5).
Commit propuesto: feat(academic): RF-09/10/11/12/13/14/17 API academica y AcademicAccessService (RN-10/11/12).
Para: documentador

### INFORME 7 — documentador

Estado: LISTO
Archivos: docs/03 (API académica, AcademicAccessService con advertencia de permisos, 3 eventos), docs/08 (D-030, D-031, nota en D-019), docs/10 (avance), docs/manuales/tecnico.md (nuevo).
Hallazgos: [MEDIO] readOnly del contexto es true también en un año futuro (más amplio que D-030) → Dev 2 decide; [BAJO] cerrar un período no exige año activo → Dev 2 confirma.

## Cierre

Fase 2 terminada. Reporte: .claude/reportes/20261026-dev2-api-academica.md. Commit en features/adolfo, subido solo a mio. No va al equipo (D-021).
