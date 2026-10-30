# Reporte — Dev 5 (parcial: fases 5a, 5b, 5c y 5e)

## Pedido

- Texto del usuario: "va, pasemos a desarrollar lo del dev 5". Luego: "Commit y seguir".
- Fecha: 30/10/2026. Flujo completo. Rama `features/adolfo` (base `7809bc7`).
- Commits: el de esta tarea (Dev 5) y uno aparte con el stub de Dev 3 (`files/`).
- Este reporte es **parcial**. Las fases 5d, 5f y 5g siguen en curso en el mismo expediente y se agregarán al reporte cuando terminen.

## Resultado

Dev 5 ya tiene la base para trabajar:

- **5a. Tablas nuevas:** anuncios, notificaciones, configuración institucional (una sola fila) y trabajos en segundo plano. Tienen 11 reglas CHECK que se probaron contra MySQL.
- **5b. Motor de colas:**
  - Colas BullMQ sobre Redis y un worker que corre como proceso aparte (`worker.main.ts`; `apps/worker` solo lo lanza).
  - Correo mínimo a Mailpit.
  - Tres barridos automáticos: NE, subidas vencidas y caducidad de exportaciones.
  - El ciclo de cada trabajo en segundo plano, con descarga firmada de 60 s.
- **5c. Configuración institucional (RF-61):** pantalla para el nombre, la tabla de notas literales, el plazo de purga y el logo. El logo es PNG o JPEG de hasta 512 KB, se valida por sus bytes y pasa por ClamAV. El registro de notas, Mis notas y la vista del apoderado ya usan la tabla configurada.
- **5e. Calendario de plazos (RF-54):** para estudiante, docente y apoderado, con FullCalendar en hora de Lima. En celular se ve como lista.
- **Stub de Dev 3 (U12, autorizado):** `FileLifecycleService` para expirar subidas vencidas y purgar archivos.

## Agentes que participaron

| #   | Agente                 | Modelo   | Qué hizo                                        | Estado                             |
| --- | ---------------------- | -------- | ----------------------------------------------- | ---------------------------------- |
| 1   | arquitecto-integrador  | heredado | Plan de 7 fases, U1–U12, contratos              | BLOQUEADO (decisiones del usuario) |
| 2   | modelador-bd           | heredado | admin.prisma, migración admin_base              | LISTO                              |
| 3   | dev3-contenidos        | heredado | Stub U12 FileLifecycleService                   | LISTO                              |
| 4   | dev5-administracion    | heredado | 5b colas, worker, mailer y barridos             | LISTO                              |
| 5   | qa-tester              | heredado | QA de 5b y U12, más 6 errores de tsc corregidos | LISTO                              |
| 6   | seguridad-cumplimiento | heredado | Auditoría de 5b y U12                           | APROBADO                           |
| 7   | revisor-pr             | heredado | Revisión de 5a, 5b y U12                        | APROBADO                           |
| 8   | dev5-administracion    | heredado | 5c configuración y 5e calendario                | LISTO                              |
| 9   | qa-tester              | heredado | QA de 5c y 5e                                   | LISTO                              |
| 10  | seguridad-cumplimiento | heredado | Auditoría de 5c y 5e                            | APROBADO                           |
| 11  | ux-accesibilidad       | heredado | Revisión de pantallas                           | CAMBIOS_PEDIDOS                    |
| 12  | dev5-administracion    | heredado | Vuelta de corrección 1/2 (13 puntos)            | LISTO                              |
| 13  | ux-accesibilidad       | heredado | Re-revisión                                     | APROBADO                           |
| 14  | revisor-pr             | heredado | Revisión de 5c y 5e                             | APROBADO                           |

## Prompts usados

### 1. arquitecto-integrador — Plan de Dev 5 por fases

```
Expediente: .claude/tareas/20261030-dev5-administracion.md (rama features/adolfo, base 7809bc7).

Encargo: planifica TODO el trabajo de Dev 5 (dev5-administracion): RF-32 y RF-53..67, más RNF-19. Lee docs/00_INICIO_Y_MAPA.md, docs/02..05, docs/08 (decisiones D-001..D-057), docs/10_TRAZABILIDAD.md y la ERS si está en docs/. Revisa el código existente que Dev 5 consumirá: apps/worker (estado actual), docker-compose.yml (Redis), apps/api/src/modules/{grading (GradebookReadService, GradingEventPublisher, grade.updated.v1, NeMaterializer), contents, submissions, academic, audit/bitácora}, packages/shared/src/grading, y prisma/schema/.

Entrega en tu INFORME (formato de .claude/PROTOCOLO_AGENTES.md, conciso, máximo ~60 líneas):
1. Qué entra en el alcance v1 (ERS §7) y qué no; avisa si algún RF está fuera.
2. Lista RF por RF con una línea: qué es y qué consume de Dev 1..4.
3. Fases pequeñas y ordenadas (5a, 5b, ...) pensadas para lanzar el mínimo de agentes: por fase, modelo de datos (si pide modelador-bd), API, worker, web, y tamaño S/M/L. Marca qué fases pueden ir en paralelo sin tocar los mismos archivos.
4. Cambios de esquema propuestos (modelos, enums, CHECK) y migraciones.
5. Archivos compartidos o de otros devs que haría falta tocar (app.module.ts, package.json, docker-compose, schema de otros, nav.ts, etc.) y dependencias npm nuevas (p. ej. BullMQ, exceljs, generador PDF, archiver): una por línea, con por qué.
6. Decisiones que debe tomar el usuario (U1, U2, ...) con tu recomendación.
7. Contratos/eventos nuevos para docs/03.
No implementes nada.
```

### 2. modelador-bd — Fase 5a esquema Dev 5

```
Expediente: .claude/tareas/20261030-dev5-administracion.md (lee el INFORME 1 del arquitecto y la Decisión del orquestador 1). Rama features/adolfo.

Encargo (fase 5a, Dev 5): crea `prisma/schema/admin.prisma` con los modelos del plan del arquitecto: Announcement (+enum AnnouncementScope INSTITUTION/GRADE/COURSE_SECTION), Notification (+NotificationType ASSIGNMENT_CREATED/ASSIGNMENT_DUE_SOON/GRADE_PUBLISHED/ANNOUNCEMENT_PUBLISHED, +EmailStatus PENDING/SENT/SKIPPED/FAILED, dedupeKey VarChar(191) @unique, índice recipientId+readAt+createdAt, sin textos), InstitutionSettings (fila única id=1 con CHECK, name, logoObjectKey?, logoMime?, literalScale Json, purgeAfterDays Int @default(60) CHECK 1..3650, updatedById?, updatedAt) y BackgroundJob (+JobType SECTION_EXPORT/BULK_EXPORT/YEAR_BACKUP/PERSONAL_DATA_EXPORT/PURGE_YEAR, +JobStatus QUEUED/RUNNING/SUCCEEDED/FAILED/EXPIRED, params Json solo ids, resultObjectKey?, resultBytes?, errorCode?, attempts, timestamps, expiresAt?). Sin FK a User (D-032); FK Restrict a AcademicYear y CourseSection con relaciones inversas mínimas en academic.prisma (autorizado). CHECK: Announcement_scope_chk (alcance coherente y gradeLevel 1..5), Announcement_deleted_chk, InstitutionSettings id/purge, BackgroundJob estado/resultado coherentes. Sigue las convenciones de grading.prisma y contents.prisma (uuid(7), DateTime(3), nombres de CHECK, IS NOT NULL explícito).
Genera la migración `admin_base` (CHECK añadidos a mano en el SQL, como en grading_base), aplícala en la BD local y corre `pnpm db:seed`. Entorno: export NODE_OPTIONS=--dns-result-order=ipv4first; si MySQL da el error 45028, calienta con `docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'`. No leas .env. Verifica: prisma validate, migrate status, api build (tsc) y un INSERT inválido por cada CHECK que falle. No toques nada fuera de prisma/. Devuelve INFORME conciso (protocolo de .claude/PROTOCOLO_AGENTES.md).
```

### 3. dev3-contenidos — U12 FileLifecycleService

```
Expediente: .claude/tareas/20261030-dev5-administracion.md (lee el INFORME 1, U12 y la Decisión del orquestador 2). Rama features/adolfo. Encargo único y autorizado por el usuario, para destrabar a Dev 5: crea `FileLifecycleService` en apps/api/src/modules/files/ y expórtalo desde FilesModule. Toca solo esa carpeta.

API del servicio:
- `expireIntents(now: Date): Promise<number>`: marca como vencidos o limpia los intents de subida (UploadIntent o lo que exista) que pasaron su plazo, borra el objeto de `incoming/` si existe y devuelve cuántos procesó. Debe ser idempotente.
- `purge(fileId: string, actorId: string | null): Promise<'PURGED' | 'ALREADY_PURGED' | 'SKIPPED_REUSABLE'>`:
  - Borra el objeto del storage y marca `StoredFile.purgedAt`.
  - No purga un archivo ligado a un Material `isReusable`.
  - Escribe la bitácora `files.file.purge` sin datos personales (actor null = sistema).
  - Es idempotente.

Usa los servicios que ya existen (StorageService, AuditService, Prisma). Agrega unit tests con mocks. Corre api lint, test y build. Si `pnpm --filter api exec tsc --noEmit -p tsconfig.json` falla, di si la causa es tuya o anterior. No toques app.module, package.json ni prisma/. Devuelve un INFORME conciso según .claude/PROTOCOLO_AGENTES.md.
```

### 4. dev5-administracion — Fase 5b colas y worker

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee los INFORMES 1 y 2 y las Decisiones del orquestador 1 y 2. El usuario aprobó U1–U12 y los archivos compartidos. Rama features/adolfo.

Encargo: fase 5b (RNF-19), sin pantallas.

1. Dependencias: `pnpm --filter api add bullmq nodemailer archiver` y `pnpm --filter api add -D @types/nodemailer @types/archiver` (autorizado). No agregues otras dependencias.
2. `apps/api/src/modules/queue/`: QueueModule (productor) con las colas notifications, exports, lifecycle y maintenance sobre Redis. Usa la configuración de env.ts; agrega allí y en .env.example `SMTP_HOST/PORT/FROM`, `GOTENBERG_URL`, `EXPORT_TTL_DAYS=7` y `WORKER_CONCURRENCY` (autorizado).
3. `apps/api/src/modules/jobs/`:
   - Servicio de BackgroundJob: crear, consultar y obtener la URL de descarga firmada de 60 s con StorageService. Respeta el ciclo de estados que impone el CHECK (INFORME 2).
   - Mailer nodemailer a Mailpit, con un correo mínimo sin datos sensibles (U3).
   - Procesadores registrados por nombre, con los jobs repetibles `maintenance:ne-sweep` y `maintenance:intent-sweep`.
   - El NE se barre con `NeMaterializer.materializeAssignment` de grading. Hay autorización para exportarlo desde grading.module.ts.
   - El barrido de intents llama a `FileLifecycleService.expireIntents(now)` de FilesModule. El agente dev3 lo está creando en paralelo con la firma `expireIntents(now: Date): Promise<number>` y `purge(fileId, actorId|null)`. Si todavía no existe al compilar, deja la inyección lista y repórtalo.
4. `apps/api/src/worker.main.ts` con `NestFactory.createApplicationContext` (U1), que procesa las colas. `apps/worker` queda como lanzador fino (package.json y src/index.ts) y debe correr con `pnpm --filter worker dev`.
5. Registra QueueModule y JobsModule en app.module.ts (autorizado).
6. No toques los archivos de files/, donde trabaja dev3.

Unit tests con mocks de Redis y SMTP. Corre api lint, test y build, y `tsc --noEmit -p tsconfig.json` (el modelador dice que falla; indica si es anterior). Prueba de humo real: levanta el worker contra el Redis de Docker, encola un job de prueba y envía un correo a Mailpit. Entorno: `NODE_OPTIONS=--dns-result-order=ipv4first` y nunca leas .env.

INFORME conciso según .claude/PROTOCOLO_AGENTES.md. En "Para:" indica lo que las fases 5c..5g deben usar (nombres de colas, cómo encolar y cómo registrar un procesador).
```

### 5. qa-tester — QA de 5b y U12

```
Expediente: .claude/tareas/20261030-dev5-administracion.md (lee los INFORMES 3 y 4). Rama features/adolfo.

Encargo: QA de la fase 5b (apps/api/src/modules/queue, jobs, worker.main.ts y apps/worker) y del stub U12 (apps/api/src/modules/files/file-lifecycle.service.ts). Solo puedes tocar archivos de test.
1. Revisa que los unit tests cubran los casos límite:
   - assertJobData: '@', saltos de línea, más de 64 caracteres, objetos anidados.
   - Ciclo de estados de BackgroundJob y reintento.
   - JobError sin reintento.
   - Expiración de resultados.
   - Mailer: inyección de cabeceras.
   - Purga: reutilizable, ya purgado, S3 caído y 404.
   - expireIntents: el lote y la gracia de 15 min.
   Agrega los que falten.
2. Escribe e2e contra MySQL, como los existentes con createDbTestApp y db-test-guard:
   - `test/jobs.e2e-spec.ts`: ciclo real de BackgroundJob contra los CHECK y descarga 410 tras EXPIRED.
   - `test/file-lifecycle.e2e-spec.ts`: barrido de un intent PENDING vencido y purga de un StoredFile no reutilizable frente a uno reutilizable. Usa MinIO si está arriba; si no, mockea StorageService.
   Limpia los datos que crees.
3. Corrige los 5 errores anteriores de `pnpm --filter api exec tsc --noEmit -p tsconfig.json`: grading.edge.spec.ts (3), test/academic-schema.e2e-spec.ts (1) y test/db-test-guard.ts (1).
4. Corre api test, test:e2e solo de los specs nuevos más grading, files y submissions, lint y ese tsc. Mide la cobertura de queue/, jobs/ y file-lifecycle (meta ≥ 90 % de líneas).
Entorno: NODE_OPTIONS=--dns-result-order=ipv4first. Calienta MySQL si aparece el error 45028 con `docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'`. No leas .env.
Devuelve un INFORME conciso con los bugs encontrados en código de producción como hallazgos para el dev, sin corregirlos tú.
```

### 6. seguridad-cumplimiento — Seguridad de 5b y U12

```
Expediente: .claude/tareas/20261030-dev5-administracion.md (lee los INFORMES 1 a 4). Rama features/adolfo.

Encargo: auditoría de seguridad de solo lectura de la fase 5b y del stub U12. Archivos:
- apps/api/src/modules/queue/
- apps/api/src/modules/jobs/ (job-result.storage, mailer.service, background-job.service, tracked-job.runner, processors/)
- apps/api/src/worker.main.ts
- apps/worker/
- apps/api/src/modules/files/file-lifecycle.service.ts y files-audit.ts
- prisma/schema/admin.prisma y su migración admin_base
- apps/api/src/config/env.ts y .env.example (las variables nuevas)

Revisa:
- Datos personales en los payloads de Redis y en la bitácora (RNF-09, Ley 29733, menores).
- Inyección de cabeceras y contenido en el correo.
- Claves S3 de exports/: que no haya path traversal, TTL de 60 s, Content-Disposition y que un no dueño no pueda descargar (findForActor y createDownloadUrl).
- Autorización de BackgroundJob: JOB_NOT_FOUND para quien no es dueño.
- Reintentos y DoS: tamaño de lote, jobs repetibles y concurrencia.
- Secretos en los defaults de env.
- Purga: que no borre lo que no debe (isReusable) y que quede en bitácora.
- Retención de Notification (hallazgo del modelador): propone un plazo.

INFORME conciso con severidades (CRÍTICO/ALTO/MEDIO/BAJO), archivo:línea y la corrección propuesta.
```

### 7. revisor-pr — Revisión final de 5a y 5b

```
Expediente: .claude/tareas/20261030-dev5-administracion.md (INFORMES 1 a 6 y Decisiones del orquestador 1 a 3). Rama features/adolfo, cambios sin commit sobre 7809bc7 (`git status` y `git diff`).

Encargo: revisión final de las fases 5a (esquema admin.prisma y migración admin_base), 5b (queue/, jobs/, worker.main.ts, apps/worker) y del stub U12 (files/file-lifecycle), más los tests de QA.

Verifica:
- La definición de terminado de docs/06.
- Que solo se tocaron carpetas permitidas o compartidos autorizados (lista en la Decisión 1 y pnpm-workspace.yaml en la Decisión 3). Ignora .claude/, .agents/ y skills-lock.json.
- Que pasen: pnpm install --frozen-lockfile, api lint, api test, api build, `tsc --noEmit -p tsconfig.json`, worker lint/build, web build y prettier --check sobre los archivos cambiados.
- Que los @ts-ignore de QA estén justificados.
Entorno: NODE_OPTIONS=--dns-result-order=ipv4first. No leas .env.

Para los e2e basta con los resultados del INFORME 6, salvo que dudes. Devuelve APROBADO o CAMBIOS_PEDIDOS en un INFORME conciso.
```

### 8. dev5-administracion — Fases 5c y 5e

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee el INFORME 1 (contratos), el 4 (cómo usar colas y jobs) y la Decisión 4. Rama features/adolfo, con la fase 5b ya aprobada.

El usuario aprobó U4, U5, U10 y U11 y autorizó los compartidos. Haz dos fases en serie.

**5c: RF-61, configuración institucional**
- API `apps/api/src/modules/settings/`:
  - `GET /admin/settings` y `PUT /admin/settings` (solo ADMIN). Campos: name, literalScale (validada con `validateLiteralScale`/`assertLiteralScale` de @aula/shared) y purgeAfterDays entre 1 y 3650.
  - `PUT /admin/settings/logo` (U5): PNG o JPEG de hasta 512 KiB, sin SVG. Valida los bytes mágicos y pásalo por ClamAV con el FileScanner de Dev 3. Guárdalo en S3 bajo `institution/<uuid>.<ext>` con el mismo patrón que JobResultStorage o un storage propio; no uses StoredFile. Borra el logo anterior.
  - `GET /institution/branding`: nombre y URL firmada del logo, para cualquier usuario autenticado.
  - InstitutionSettings se lee siempre con `where {id:1}` y solo se actualiza; nunca se crea.
  - Bitácora `settings.update` con los campos cambiados, sin valores sensibles.
- `LiteralScaleProvider`: inyéctalo en `apps/api/src/modules/grading/gradebook-read.service.ts` (autorizado) para que el registro use la escala configurada en lugar de DEFAULT_LITERAL_SCALE. Que tenga un fallback a la escala por defecto y que los tests de grading sigan pasando.
- Web: pantalla `admin/configuracion` (hoy es un PlaceholderPage) con el formulario de datos, la tabla literal editable, el plazo de purga y la subida del logo, siguiendo el patrón BFF D-037 de las pantallas existentes.

**5e: RF-54, calendario**
- `GET /me/calendar?from&to` (máximo 62 días): plazos de tareas publicadas de los cursos-sección del estudiante (matrícula vigente), del docente (sus asignaciones) y del apoderado (opcional `?studentId=`, solo si está vinculado). Usa los servicios de Dev 2 y Dev 3.
- Web: pantalla de calendario con FullCalendar (U10), solo con los plugins daygrid y list. Instala `@fullcalendar/react @fullcalendar/core @fullcalendar/daygrid @fullcalendar/list` en web (autorizado). En pantallas de 360 px debe abrir en vista de lista, ser accesible con teclado y lector de pantalla, y no exponer textos sensibles.
- Registra los módulos en app.module.ts y agrega las entradas en nav.ts y routes.ts según el rol (autorizado).

Hazlo con unit tests y e2e (`test/settings.e2e-spec.ts` y `test/calendar.e2e-spec.ts`) contra MySQL. Corre api y web lint, test y build, `tsc -p tsconfig.json` y prettier.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first. Si MySQL da el error 45028, calienta con `docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'`. No leas .env.

Devuelve un INFORME conciso por fase según el protocolo.
```

### 9. qa-tester — QA de 5c y 5e

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee el INFORME 8. Rama features/adolfo.

Encargo: QA de 5c y 5e. Revisa:
- 5c (RF-61): apps/api/src/modules/settings/, el LiteralScaleProvider en grading y la web en admin/configuracion.
- 5e (RF-54): apps/api/src/modules/notifications/calendar.* y la web en calendario/.

Solo puedes tocar archivos de test. Agrega lo que falte:
- Registro y "mis notas" con una escala personalizada (un literal 'X' de riesgo), y que se restaure después.
- Logo:
  - 0 bytes;
  - 512 KiB justos y 512 KiB + 1 (413);
  - SVG o GIF renombrado;
  - PNG con IHDR inválido;
  - mayor de 4096 px;
  - roles no ADMIN (403);
  - la URL de branding para los 4 roles.
- Calendario:
  - exactamente 62 días y 63 días;
  - from ≥ to;
  - tarea con deletedAt;
  - matrícula no vigente;
  - apoderado con studentId no vinculado (403);
  - studentId enviado por un estudiante (400);
  - el tope de 500 con truncated.
- Web: los tests de settings-form y de calendar.ts, en los casos límite.

Corre api test, los e2e de settings, calendar y grading, web test, lint y tsc. Mide la cobertura de settings/ y calendar (meta: 90 % de líneas).

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first. Calienta MySQL si da el error 45028. No leas .env.

Entrega un INFORME conciso. Los bugs de producción van como hallazgos, sin corregirlos.
```

### 10. seguridad-cumplimiento — Seguridad de 5c y 5e

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee los INFORMES 5 y 8. Rama features/adolfo.

Encargo: auditoría de solo lectura de 5c y 5e.

Archivos a revisar:
- apps/api/src/modules/settings/
- apps/api/src/modules/notifications/calendar.*
- El cambio en grading/gradebook-read.service.ts
- La web: apps/web/app/(app)/admin/configuracion/ y calendario/

Revisa:
- La subida del logo: multer en memoria, límites, validación por bytes y dimensiones, ClamAV, que no se acepte SVG ni archivos políglotas, el rate limit y el borrado del logo anterior.
- La URL firmada del logo de 10 min: acéptala o recházala con justificación.
- La bitácora de settings: que no tenga datos sensibles.
- Que solo ADMIN pueda ver y cambiar la configuración.
- Que el branding exija sesión.
- El calendario:
  - Pertenencia por rol.
  - Que el apoderado solo vea a sus vinculados.
  - Que no se filtren instrucciones ni datos de otros estudiantes; mira el campo `students` del apoderado.
  - Los límites de rango y el tope.
- Las Server Actions de la web: que solo reenvíen aula_sid (D-037) y que no haya XSS en el render de los títulos en FullCalendar.

Entrega un INFORME conciso con severidad, archivo:línea y la corrección.
```

### 11. ux-accesibilidad — UX de configuración y calendario

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee el INFORME 8. Rama features/adolfo.

Encargo: revisión de solo lectura de las pantallas nuevas:
- apps/web/app/(app)/admin/configuracion/ (formulario, tabla literal editable de 1 a 10 tramos y subida de logo)
- apps/web/app/(app)/calendario/ (FullCalendar 6.1.22 con daygrid y list; vista de lista con menos de 640 px)
- Las entradas en apps/web/lib/nav.ts

Criterios:
- Coherencia con shadcn/ui y las pantallas existentes, por ejemplo registro y tareas.
- Diseño desde 360 px, sin scroll horizontal.
- WCAG 2.1 AA: etiquetas, errores asociados, foco al agregar o quitar un tramo, anuncio de estado, contraste, objetivos de 44 px, uso con teclado y lector de pantalla en FullCalendar, y aviso de la zona horaria.
- Textos en español claros.

Entrega un INFORME conciso con severidad, archivo:línea y la corrección propuesta.
```

### 12. SendMessage (reanudación) — Correcciones de 5c/5e, vuelta 1

```
Correcciones de 5c y 5e (vuelta 1/2). Detalle en el expediente .claude/tareas/20261030-dev5-administracion.md, INFORMES 9, 10 y 11. Aplícalas todas en una sola pasada.

UX (INFORME 9):
1. settings-form `add`: enfoca el campo Literal de la fila nueva, igual que en `remove`.
2. Agrega un `<p role="status" className="sr-only">` con "Tramo agregado. Ahora hay N tramos" o "Tramo quitado. Quedan N tramos".
3. Calendario: `timeZone="America/Lima"` en FullCalendar, coherente con `formatDue` y el aria-label. Aviso visible: "Las horas están en hora de Perú (Lima)".
4. `err.bands`: con id y role="alert", y súmalo al aria-describedby del fieldset. Que useFormRefs pueda enfocarlo.
5. Cobertura: deja la lista visible sin aria-live. Usa un resumen sr-only que se anuncie solo cuando cambia entre válido y no válido.
6. Eventos de FullCalendar: color con contraste de 4,5:1 o más, usando los tokens del tema (eventColor/eventTextColor o `--fc-*`). Revisa el modo oscuro y el foco visible en .fc-event y .fc-daygrid-more-link.
7. En pantallas angostas oculta el botón "Mes" (`end: narrow ? 'listMonth' : 'dayGridMonth,listMonth'`, o equivalente). Al ensanchar, vuelve a mes.
8. Quita el `title` duplicado donde ya hay aria-label.
9. Cuando quede una sola fila, muestra el texto "Debe quedar al menos un tramo". Cambia "512 KiB" por "512 KB" en los textos de la web.

Seguridad (INFORME 10):
10. logo-image.ts: el PNG debe terminar exactamente en el chunk IEND y el JPEG en FF D9, sin bytes de más; si no, 415 INVALID_IMAGE. Agrega tests con payload pegado al final.
11. `@Throttle` de 30 por minuto por usuario en `PUT /admin/settings`.

QA (INFORME 11):
12. Quita la rama NaN muerta de calendar.dto.ts:26-27.
13. Alinea `validRange` de la web con la API (exigir segundos) y ajusta el test marcado "HALLAZGO" en calendar.qa.spec.ts.

Corre api y web lint, test, tsc y build, los e2e de settings, settings-logo y calendar, y prettier. Devuelve un INFORME conciso con lo hecho, punto por punto.
```

### 13. SendMessage (reanudación) — Re-revisión corta de UX tras correcciones

```
Re-revisión corta (vuelta 1/2) de tus hallazgos 1 a 12 en configuracion/ y calendario/. dev5 los corrigió; el detalle está en el INFORME 12 del expediente .claude/tareas/20261030-dev5-administracion.md. Hay archivos nuevos en calendario/: _components/lima-time-zone-plugin.ts y _lib/lima-time.ts.

Fíjate sobre todo en:
- el contraste de los eventos con --primary/--primary-foreground, en claro y en oscuro;
- el foco visible;
- la vista angosta sin "Mes";
- los anuncios sr-only.

Devuelve APROBADO o CAMBIOS_PEDIDOS en un INFORME breve.
```

### 14. revisor-pr — Revisión final de 5c y 5e

```
Expediente: .claude/tareas/20261030-dev5-administracion.md (INFORMES 8 a 13 y Decisiones 5 a 7). Rama features/adolfo. Los cambios no tienen commit y se suman a lo de 5a+5b, que ya aprobaste en el INFORME 7.

Encargo: revisión final de 5c (RF-61: settings/, LiteralScaleProvider en grading, web admin/configuracion) y 5e (RF-54: notifications/calendar.*, web calendario/), con los tests de QA y la vuelta de corrección 1.

Verifica:
- La definición de terminado de docs/06.
- Las carpetas y los compartidos autorizados: gradebook-read.service.ts, app.module.ts, nav.ts, routes.ts, web package.json y lockfile con @fullcalendar 6.1.22.
- Que pasen: pnpm install --frozen-lockfile, lint, tsc, test y build de api y web, y prettier --check sobre los archivos cambiados.
Para los e2e usa los resultados de los INFORMES 11 y 12, salvo que tengas dudas.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first. No leas .env.

Devuelve APROBADO o CAMBIOS_PEDIDOS en un INFORME conciso.
```

## Decisiones del orquestador

1. **Cambio de rama:** volví de `envio` a `features/adolfo`, respaldando antes `.claude/` y `CLAUDE.md`. Comparé el respaldo y no había diferencias. La rama `envio` se conserva para el push al equipo.
2. **Decisiones U1–U12:** el usuario aprobó las recomendaciones del arquitecto y autorizó los archivos compartidos. Eso incluye las dependencias bullmq, nodemailer, archiver y @fullcalendar, Gotenberg, app.module, env, nav y routes, y los cambios en grading y academic.prisma. También autorizó usar dev3 una sola vez para el stub U12, y se le avisó.
3. **Paralelismo:**
   - dev3 (U12) en paralelo con dev5 (5b), porque usan carpetas distintas.
   - QA y seguridad en paralelo; en 5c y 5e también con UX.
   - 5c y 5e los hizo un solo agente, en serie, para no chocar en app.module, nav y routes.
4. **`pnpm-workspace.yaml`:** agregué `msgpackr-extract: false`, una dependencia nativa opcional de bullmq. Sin eso, `pnpm install --frozen-lockfile` fallaba en CI.
5. **Vuelta de corrección 1/2:** se le enviaron a dev5, en un solo mensaje, los hallazgos ALTO y MEDIO de UX, el MEDIO de seguridad (IEND/EOI) y los BAJO de QA.
6. **Corrección manual:** cambié `outline-ring` por `outline-foreground` en deadline-calendar.tsx, un BAJO de UX sobre el contraste del foco.
7. **Comentario de la migración `admin_base`:** no se editó, porque cambiar una migración ya aplicada rompe su checksum. La aclaración va en docs.

## Archivos creados y modificados

- **Esquema:** `prisma/schema/admin.prisma` (nuevo), `prisma/schema/academic.prisma` (relaciones inversas) y `prisma/migrations/20261030140220_admin_base/`.
- **API, módulos nuevos:**
  - `apps/api/src/modules/queue/`
  - `jobs/`, con `processors/`
  - `settings/`
  - `notifications/calendar.*`
  - `apps/api/src/worker.main.ts`
- **API, archivos modificados:** `app.module.ts`, `config/env.ts`, `grading/grading.module.ts`, `grading/gradebook-read.service.ts` y `apps/api/package.json`.
- **API, tests:**
  - e2e: `jobs`, `file-lifecycle`, `settings`, `settings-logo` y `calendar` (`*.e2e-spec.ts`).
  - Corregidos por tsc: `grading.edge.spec.ts`, `users-prisma.mock-spec.ts`, `academic-schema.e2e-spec.ts` y `db-test-guard.ts`.
- **Worker:** `apps/worker/package.json`, `src/index.ts` y `src/node.d.ts`.
- **Web:**
  - Pantallas: `apps/web/app/(app)/admin/configuracion/` y `apps/web/app/(app)/calendario/`.
  - Archivos modificados: `lib/nav.ts`, `lib/routes.ts` y `apps/web/package.json`.
- **Raíz:** `.env.example`, `pnpm-lock.yaml` y `pnpm-workspace.yaml`.
- **Commit aparte (stub de Dev 3):** `apps/api/src/modules/files/{file-lifecycle.service.ts, file-lifecycle.service.spec.ts, files.module.ts, files-audit.ts}`.

## Verificación

| Comando                                                      | Resultado                           |
| ------------------------------------------------------------ | ----------------------------------- |
| `pnpm install --frozen-lockfile`                             | ok                                  |
| api lint / `tsc -p tsconfig.json` / build                    | 0 / 0 / ok                          |
| api test                                                     | 70 archivos, 797 tests ok           |
| e2e completo (INFORME 11)                                    | 20 archivos, 485 tests ok           |
| e2e de settings, settings-logo y calendar tras la corrección | 33/33                               |
| web lint / tsc / test / build                                | 0 / 0 / 18 archivos, 353 tests / ok |
| worker lint / build                                          | ok                                  |
| prettier --check (archivos cambiados)                        | ok                                  |
| migración `admin_base` + `pnpm db:seed`                      | ok                                  |
| Humo del worker con Redis y Mailpit                          | ok                                  |

## Pendientes y decisiones abiertas

- **Fases que faltan:** 5d (anuncios y notificaciones), 5g (bitácora, datos personales, respaldo anual, purga y almacenamiento) y 5f (reportes XLSX, PDF y ZIP, y dashboard).
- **Hallazgos de seguridad MEDIO que tocan a esas fases:**
  - retención de Notification;
  - límite de trabajos activos por usuario;
  - si el ADMIN puede descargar el `PERSONAL_DATA_EXPORT`, y el registro `job.download` en la bitácora;
  - precondiciones de la purga.
- **Pendientes de 5f:** WorkerModule debe importar LiteralScaleModule. Además, Gotenberg en docker-compose.
- **Dev 1:**
  - credenciales SMTP y TLS de producción;
  - mostrar el branding en la cabecera;
  - `img-src` en la CSP.
- **Documentación:**
  - docs/02 (U11), docs/03 (contratos de jobs, settings, branding y calendar) y D-031 (U2);
  - agregar las carpetas `notifications/` y `calendario/` en docs/AGENTES_IA.md.
- **Verificación en local:** prueba en un navegador real de la subida del logo y del calendario a 360 px, con teclado y lector de pantalla.
- **Rama limpia para el equipo:** `files/` es de Dev 3.

## Expediente

[.claude/tareas/20261030-dev5-administracion.md](../tareas/20261030-dev5-administracion.md)
