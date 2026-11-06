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

---

# Actualización 07/11/2026: fases 5d y 5g

## Pedido

- Textos del usuario: "va, pasemos a desarrollar lo del dev 5"; después "Sí, retomar" (06/11) y "Commit y subir".
- Rama: `features/adolfo`, sobre `0052802`.

## Resultado

**5d, anuncios y notificaciones (RF-32, RF-53):**

- El docente publica anuncios por curso y el ADMIN para la institución o por grado. El estudiante y el apoderado los leen en `/anuncios`.
- Campana con contador en la cabecera.
- Avisos de tarea nueva, tarea por vencer en 24 h, nota manual y anuncio.
- El correo se envía solo al correo de contacto verificado.
- Retención: leídos 90 días, no leídos 180, tope de 365.
- Límites al publicar: 5 anuncios por minuto, 20 o 50 por día, y 20 000 destinatarios por evento.

**5g, administración (RF-55/56, RF-62..67):**

- `/admin/bitacora`: filtros, modo soporte y datos sensibles ocultos.
- `/admin/almacenamiento`:
  - uso del espacio;
  - respaldos ZIP por sección al cerrar el año;
  - aviso de purga;
  - exportación de los datos personales de un estudiante.
- Purga: solo con el año cerrado, respaldos existentes en S3 y el plazo cumplido. El plazo mínimo es de 30 días.
- Trabajos en segundo plano:
  - `job.download` se registra en la bitácora antes de firmar la descarga;
  - máximo 3 trabajos activos por usuario;
  - los trabajos colgados se cierran solos.

## Agentes que participaron

| #     | Agente                       | Qué hizo                                                  | Estado                                |
| ----- | ---------------------------- | --------------------------------------------------------- | ------------------------------------- |
| 1-2   | dev5-administracion ×2       | Primer intento de 5d y 5g en paralelo                     | Cortados por timeout (dejaron un WIP) |
| 3-4   | dev5-administracion ×2       | Reanudación                                               | Cortados (fin de sesión)              |
| 5-6   | dev5-administracion ×2       | Terminar 5d y 5g (web y e2e)                              | LISTO                                 |
| 7-9   | qa / seguridad / ux sobre 5d | Revisión                                                  | LISTO / APROBADO / CAMBIOS_PEDIDOS    |
| 10-12 | qa / seguridad / ux sobre 5g | Revisión (QA arregló el fixture de grading)               | CAMBIOS_PEDIDOS / APROBADO / APROBADO |
| 13-15 | dev5 y ux                    | Vuelta de corrección 1/2 de cada fase y re-revisión de UX | LISTO / APROBADO                      |
| 16    | revisor-pr                   | Revisión final de 5d y 5g                                 | APROBADO                              |

## Prompts usados (literales)

### 1. dev5-administracion — Fase 5d anuncios y notificaciones

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee el INFORME 1 (contratos y U3), el INFORME 4 (cómo usar colas y jobs), el INFORME 5 (seguridad, hallazgo 1 y el punto final sobre lotes) y la Decisión 8. Rama features/adolfo, último commit 95fd504.

Encargo: fase 5d (RF-32 y RF-53). En paralelo, otro agente dev5 hace la 5g en admin-audit/ y lifecycle/; no toques esas carpetas.

1. RF-32, anuncios. Crea `apps/api/src/modules/announcements/` con estos contratos:
   - `GET` y `POST /course-sections/:id/announcements`: el TEACHER asignado o un ADMIN.
   - `POST /announcements`: el ADMIN crea anuncios con scope INSTITUTION o GRADE.
   - `PATCH` y `DELETE /announcements/:id`: soft-delete. Solo el autor o un ADMIN.
   - `GET /me/announcements`: para STUDENT, TEACHER y GUARDIAN. El apoderado puede pasar `?studentId` solo si ese estudiante está vinculado a él.
   - Al publicar, emite `announcement.published.v1`.
   - Registra los cambios en la bitácora sin el cuerpo del anuncio.
   - Title de hasta 150 caracteres. El body es texto plano y nunca se renderiza como HTML.
2. RF-53, notificaciones. Trabaja en `apps/api/src/modules/notifications/` (el calendario ya vive ahí).
   - Los listeners de la API reciben estos eventos y encolan en la cola `notifications` con un jobId idempotente:
     - `assignment.created.v1` y `assignment.updated.v1`, de Dev 3; revisa sus nombres reales;
     - `grade.updated.v1`, solo cuando es MANUAL;
     - `announcement.published.v1`.
   - Los procesadores del worker resuelven los destinatarios: estudiantes con matrícula vigente y sus apoderados, según U3. Del apoderado solo se usa el correo si existe.
   - Crean las Notification con un `dedupeKey` por destinatario y encolan los correos en lotes de 50 a 100. Usan `MailerService.sendNotice`, que manda un correo mínimo.
   - Barrido `maintenance:due-soon`: avisa de las tareas que vencen en 24 h.
   - Barrido diario `maintenance:notification-retention` (INFORME 5, hallazgo 1):
     - borra las notificaciones leídas con más de 90 días;
     - borra las no leídas con más de 180 días;
     - nunca guarda una notificación más de 365 días;
     - pasa a SKIPPED los correos PENDING o FAILED con más de 7 días;
     - trabaja en lotes de 1000 y deja bitácora solo con conteos.
   - Endpoints: `GET /me/notifications?unread&page`, `POST /me/notifications/:id/read` y `POST /me/notifications/read-all`. Una persona nunca puede ver ni marcar las notificaciones de otra.
   - El mensaje se arma al leer, a partir de `type` y `entityId`, sin datos de otros estudiantes.
3. Web:
   - Anuncios del docente dentro del curso. Mira `apps/web/app/(app)/curso/[id]/` y la lista de COURSE_ROUTES.
   - `admin/anuncios`.
   - Vista de anuncios para el estudiante y para el apoderado.
   - Campana con contador y lista en `(app)/layout.tsx` o en el sidebar (Dev 1; autorizado, con el cambio mínimo).
   - Todo debe funcionar desde 360 px, cumplir WCAG AA y seguir el patrón BFF D-037.
4. Registro:
   - Registra los módulos en app.module.ts y los procesadores en jobs/worker.module.ts.
   - Agrega las entradas en nav.ts y routes.ts.
   - Esos archivos son compartidos con el agente de 5g: haz solo Edits mínimos de inserción y relee el archivo justo antes de cada cambio.

Agrega unit tests y los e2e `test/announcements.e2e-spec.ts` y `test/notifications.e2e-spec.ts` contra MySQL. Puedes probar los procesadores sin Redis, espiando QueueService. Corre lint, tsc, test y build de api y web, y prettier.

Entorno: `NODE_OPTIONS=--dns-result-order=ipv4first`. Si MySQL da el error 45028, calienta la conexión. No leas .env.

Devuelve un INFORME conciso según el protocolo.
```

### 2. dev5-administracion — Fase 5g bitácora y ciclo de vida

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee los INFORMES 1, 3 (FileLifecycleService), 4 (colas y jobs) y 5 (seguridad, hallazgos 2, 3, 4 y 7), y la Decisión 8. Rama features/adolfo, último commit 95fd504.

Encargo: la fase 5g, que cubre RF-55/56, RF-62, RF-63, RF-64, RF-65, RF-66 y RF-67. En paralelo, otro agente dev5 hace la 5d en announcements/ y notifications/. No toques esas carpetas.

Partes de la fase:
1. RF-62 y RF-55/56, bitácora y modo soporte. Crea `apps/api/src/modules/admin-audit/` con `GET /admin/audit-logs?actorId&action&module&from&to&page`, solo para ADMIN y de solo lectura.
   - El modo soporte (U9) se deriva al leer: es una acción de un actor ADMIN en los módulos contents, submissions o grading. Muéstralo con una marca.
   - Web: `admin/bitacora`, que hoy es un placeholder, con filtros, paginación y uso desde 360 px.
2. `apps/api/src/modules/lifecycle/`:
   - RF-63: `POST /admin/students/:id/personal-data-export` responde 202 y crea un job PERSONAL_DATA_EXPORT. El resultado es un JSON dentro de un ZIP con User, Enrollment, GuardianStudent, PolicyAcceptance, entregas (solo los metadatos) y notas con comentario y exemptionReason (U8). El ADMIN puede descargarlo (Decisión 8). Toda descarga de cualquier job deja bitácora `job.download` con jobId, tipo y actor.
   - Endpoints de jobs para la web: `GET /admin/jobs/:id` y `POST /admin/jobs/:id/download-url`, si 5f todavía no los creó. Ponlos en jobs/ con un controlador.
   - Límite en `BackgroundJobService.create` (hallazgo 2): como máximo 3 jobs QUEUED o RUNNING por solicitante, con 429 JOB_LIMIT. Para YEAR_BACKUP y PURGE_YEAR, si ya hay uno activo del mismo año, responde 409.
   - RF-65: al recibir `academic-year.closed.v1` (Dev 2; revisa el nombre real), se encola un YEAR_BACKUP por año. Genera un ZIP por sección con las entregas y los materiales del año, más un índice. Crea la utilidad ZIP compartida en jobs/ con archiver y subida por stream a S3 con JobResultStorage. Ajusta su regex si hace falta, porque 5f la va a reutilizar.
   - El barrido de RUNNING colgados (hallazgo 7) pasa a FAILED con STALLED los jobs con más de 1 h, dentro de result-expiry-sweep.
   - RF-66, purga (U7 y hallazgo 4): el procesador PURGE_YEAR solo actúa si el año está cerrado, todos sus YEAR_BACKUP terminaron SUCCEEDED y ya pasó `InstitutionSettings.purgeAfterDays`. Usa `FileLifecycleService.purge` sobre los archivos de ese año, salvo los isReusable. Borra los ZIP anuales (U6) y las Notification del año. Deja bitácora `lifecycle.purge` con conteos. Agrega un barrido diario que encole la purga elegible.
   - RF-67: `GET /admin/storage-usage?academicYearId`, con la suma de sizeBytes sin purgar por año, grado y curso. `GET /admin/academic-years/:id/backups` lista los respaldos con su descarga.
   - Web: `admin/almacenamiento` con el uso, los respaldos, el aviso de que hay que descargar antes de la purga y el botón para exportar los datos de un estudiante, con el estado del job y la descarga.
   - RF-64: no implementes nada. Solo escribe el e2e que verifica que, con el período cerrado, las entregas quedan en solo lectura.
3. Registro: registra los módulos en app.module.ts y los procesadores en jobs/worker.module.ts, y agrega las entradas en nav.ts y routes.ts. Son archivos compartidos con el agente de 5d: haz solo Edits mínimos de inserción y relee cada archivo justo antes de editarlo.

Agrega unit tests y e2e (`test/admin-audit.e2e-spec.ts` y `test/lifecycle.e2e-spec.ts`) contra MySQL y MinIO. Corre lint, tsc, test y build de api y web, y prettier.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first. Si MySQL da el error 45028, calienta la conexión. No leas .env.

Devuelve un INFORME conciso según el protocolo.
```

### 3. SendMessage (reanudación) — Retomar 5d tras corte

```
Tu ejecución se cortó por un timeout del stream mientras revisabas MySQL para los e2e. Sigue desde ahí: los unit tests ya pasaban.
- Antes de nada, revisa con git status el estado de tus archivos.
- Si MySQL no responde, caliéntalo con `docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'`.
- Corre los comandos largos con un timeout explícito y no esperes más de 5 min por comando.
- El agente de 5g sigue trabajando en paralelo. Si tsc marca errores en sus archivos, ignóralos.
- Termina los e2e, lint, tsc, build y prettier, y devuelve el INFORME.
```

### 4. SendMessage (reanudación) — Retomar 5g tras corte

```
Tu ejecución se cortó por un timeout del stream mientras corrías los tests de jobs. Sigue desde ahí.
- Antes de nada, revisa con git status el estado de tus archivos.
- Corre los comandos largos con un timeout explícito y no esperes más de 5 min por cada uno.
- Los errores en archivos de 5d (announcements/ y notifications/) son del otro agente, que sigue trabajando: ignóralos.
- Termina tus e2e, lint, tsc, build y prettier, y devuelve el INFORME.
```

### 5. dev5-administracion — Terminar 5d anuncios y notificaciones

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee el INFORME 1 (contratos y U3), el INFORME 5 (seguridad, hallazgo 1 y lotes) y las Decisiones 8 y 9. Rama features/adolfo, último commit con HEAD actual.

Encargo: terminar la fase 5d (RF-32 y RF-53). La API ya existe a medias en `apps/api/src/modules/announcements/` y `notifications/` (con `worker/`), compila y tiene unit tests. **Primero revisa qué hay y qué falta.** No rehagas lo que ya funciona.

Qué falta:
1. **Completar la API frente a los contratos del INFORME 1.**
   - Anuncios: por curso-sección (TEACHER asignado o ADMIN), INSTITUTION/GRADE (ADMIN), PATCH/DELETE soft y `GET /me/announcements`. El apoderado puede pasar `?studentId`, solo de un estudiante vinculado.
   - Notificaciones: `GET /me/notifications`, marcar como leída y marcar todas.
   - Barridos `maintenance:due-soon` y `notification-retention`: leídas 90 días, no leídas 180, tope de 365, correos 7 días.
   - Correo: solo con `deliverableEmail()` de `jobs/mailer.service.ts`.
   - Con el login por código de David, el apoderado está en `GuardianStudent` con `isPrimary`: avisa a todos los vínculos vigentes.
2. **Web (BFF D-037, desde 360 px, WCAG AA, estilo de las pantallas existentes):**
   - Anuncios del docente dentro del curso (agregar la pestaña a COURSE_ROUTES).
   - `admin/anuncios`.
   - Lista de anuncios para el estudiante y el apoderado.
   - Campana con contador y lista en el layout o el sidebar de `(app)`, con un cambio mínimo (autorizado).
   - Registrar las rutas en nav.ts y routes.ts.
3. **E2e contra MySQL:** `test/announcements.e2e-spec.ts` y `test/notifications.e2e-spec.ts`. Los procesadores se prueban espiando QueueService, sin Redis.

**Restricciones:**
- En paralelo, otro agente dev5 termina la 5g en `admin-audit/`, `lifecycle/` y `jobs/`. No toques esas carpetas.
- En `app.module.ts`, `nav.ts`, `routes.ts` y `worker.module.ts`, solo inserciones mínimas con Edit, y relee el archivo antes de cada cambio.
- **Cada comando largo con `timeout 300`**, para no colgarte. Si algo tarda más, córtalo y repórtalo.
- Entorno: `NODE_OPTIONS=--dns-result-order=ipv4first`; la base local ya tiene las migraciones de David. No leas `.env`.

Corre lint, `tsc -p tsconfig.json`, test y build de api y web, tus e2e y prettier. No hagas commit. Devuelve un INFORME conciso según el protocolo.
```

### 6. dev5-administracion — Terminar 5g bitácora y ciclo de vida

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee los INFORMES 1, 3, 4 y 5 (seguridad: hallazgos 2, 3, 4 y 7) y las Decisiones 8 y 9. Rama features/adolfo, HEAD actual.

Encargo: terminar la fase 5g (RF-55/56, RF-62..67). La API ya existe a medias en `apps/api/src/modules/admin-audit/`, `lifecycle/` y en `jobs/` (`jobs.controller`, `job-download`, `zip-archive`). Compila y tiene unit tests. **Primero revisa qué hay y qué falta.** No rehagas lo que ya funciona.

Qué falta:
1. **Completar la API.**
   - `GET /admin/audit-logs` con filtros y la marca de modo soporte (U9).
   - RF-63: exportación de datos personales. El ADMIN puede descargarla y queda en la bitácora como `job.download` (Decisión 8). Usa `contactEmail` y `institutionalEmail`; el segundo ahora es opcional.
   - Límite de 3 jobs QUEUED o RUNNING por usuario, con 429 `JOB_LIMIT`. Para `YEAR_BACKUP` o `PURGE_YEAR` duplicados del mismo año, 409.
   - RF-65: `YEAR_BACKUP` al recibir `academic-year.closed.v1`, con un ZIP por sección.
   - Barrido de RUNNING colgados: pasan a FAILED STALLED después de 1 h.
   - RF-66: `PURGE_YEAR`, solo con el año cerrado, los respaldos en SUCCEEDED y `purgeAfterDays` cumplido. Usa `FileLifecycleService.purge` y deja bitácora `lifecycle.purge`.
   - RF-67: `GET /admin/storage-usage` y `GET /admin/academic-years/:id/backups`.
2. **Web (BFF D-037, desde 360 px, WCAG AA):**
   - `admin/bitacora` (hoy es un placeholder): filtros y paginación.
   - `admin/almacenamiento`: uso de almacenamiento, respaldos con su descarga, aviso antes de la purga, y un botón para exportar los datos de un estudiante que muestre el estado del job y la descarga.
3. **E2e contra MySQL y MinIO:**
   - `test/admin-audit.e2e-spec.ts`;
   - `test/lifecycle.e2e-spec.ts`;
   - un caso de RF-64: con el período cerrado, la entrega es de solo lectura.

**Restricciones:**
- En paralelo, otro agente dev5 termina la 5d en `announcements/` y `notifications/`. No toques esas carpetas.
- En `app.module.ts`, `nav.ts`, `routes.ts` y `worker.module.ts`, solo inserciones mínimas con Edit, releyendo el archivo antes de cada cambio.
- **Cada comando largo con `timeout 300`**, para no colgarte. Si algo tarda más, córtalo y repórtalo.
- Entorno: `NODE_OPTIONS=--dns-result-order=ipv4first`. No leas `.env`.

Corre lint, `tsc -p tsconfig.json`, test y build de api y web, tus e2e y prettier. No hagas commit. Devuelve un INFORME conciso según el protocolo.
```

### 7. qa-tester — QA de 5d

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee los INFORMES 1, 5 y 15. Rama features/adolfo.

Encargo: QA de la fase 5d (RF-32 y RF-53).
- API: `apps/api/src/modules/announcements/` y `notifications/`, sin contar los archivos de calendario.
- Web: `(app)/anuncios`, `(app)/admin/anuncios`, `(app)/curso/[id]/anuncios` y `(app)/_notifications`.

Solo toca archivos de test. Agrega los casos límite que falten:
- Permisos de anuncios por rol y alcance: un docente ajeno recibe 403; un estudiante o apoderado que intenta crear recibe 403; un apoderado con un `studentId` no vinculado recibe 403.
- Título de 150 caracteres frente a 151, y body con HTML que se guarda como texto.
- Soft delete: un anuncio borrado no aparece.
- Notificaciones: una persona no puede leer ni marcar las de otra; `read-all` solo marca las propias; la paginación.
- `dedupeKey`: no hay duplicados.
- Un usuario sin correo verificado queda SKIPPED, usando `deliverableEmail`.
- Lotes de 100.
- Retención 90/180/365 y correos de 7 días, en sus límites exactos.
- Due-soon 24 h, en el límite.

Corre api test, los e2e de 5d, web test, lint y `tsc`. Mide la cobertura de `announcements/` y `notifications/` (meta: 90 % de líneas).

**Restricciones:**
- Otro agente sigue trabajando en `admin-audit/`, `lifecycle/` y `jobs/`: ignora sus errores.
- Cada comando largo con `timeout 300`.
- `NODE_OPTIONS=--dns-result-order=ipv4first`. No leas `.env`.

Devuelve un INFORME conciso. Los bugs de producción van como hallazgos, sin corregirlos.
```

### 8. seguridad-cumplimiento — Seguridad de 5d

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee los INFORMES 1, 5 y 15. Rama features/adolfo.

Encargo: auditoría de solo lectura de la fase 5d. Archivos:
- `apps/api/src/modules/announcements/`
- `apps/api/src/modules/notifications/` (sin el calendario)
- `apps/api/src/modules/jobs/mailer.service.ts` (`deliverableEmail`)
- La web: `(app)/anuncios`, `(app)/admin/anuncios`, `(app)/curso/[id]/anuncios`, `(app)/_notifications` y el cambio en `lib/api/server.ts`.

Revisa:
- **Permisos por rol y pertenencia.** El apoderado solo ve los anuncios de sus vinculados. Nadie lee ni marca notificaciones ajenas.
- **XSS:** el body debe renderizarse como texto plano.
- **Datos de menores:**
  - En las notificaciones: el mensaje se arma al leer y no debe mostrar datos de otros estudiantes.
  - En los correos: no deben llevar datos.
  - En los payloads de la cola: no deben llevar correos.
- **Retención (hallazgo 1 del INFORME 5).**
- **Lotes y DoS:** anuncios INSTITUTION masivos y el rate limit de la creación.
- **Bitácora sin el cuerpo** del anuncio.
- **Server Actions:** que solo reenvíen `aula_sid`.

INFORME conciso con severidades (CRÍTICO/ALTO/MEDIO/BAJO), archivo:línea y la corrección propuesta.
```

### 9. ux-accesibilidad — UX de anuncios y campana

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee el INFORME 15. Rama features/adolfo.

Encargo: revisión de solo lectura de las pantallas de 5d:
- `apps/web/app/(app)/anuncios/`
- `(app)/admin/anuncios/page.tsx`
- `(app)/curso/[id]/anuncios/page.tsx`
- `(app)/_notifications/notification-bell.tsx`, junto con su uso en `(app)/layout.tsx`
- Las entradas nuevas en `lib/nav.ts`

Criterios:
- Coherencia con shadcn/ui y con las pantallas existentes.
- Diseño desde 360 px.
- WCAG 2.1 AA:
  - la campana: contador con nombre accesible, foco al abrir y cerrar el Sheet, anuncio de los no leídos;
  - formularios con errores asociados;
  - diálogo de retiro;
  - objetivos táctiles de 44 px;
  - contraste en claro y oscuro.
- Textos en español claros.

Devuelve un INFORME conciso, con APROBADO o CAMBIOS_PEDIDOS, cada hallazgo con severidad y archivo:línea, y la corrección propuesta.
```

### 10. qa-tester — QA de 5g y fixture grading

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee los INFORMES 1, 5 y 18 y la Decisión 11. Rama features/adolfo.

Encargo: QA de la fase 5g. Solo puedes tocar archivos de test.
- API: `admin-audit/`, `lifecycle/` y `jobs/`.
- Web: `admin/bitacora` y `admin/almacenamiento`.

1. **Arregla el fixture de `apps/api/test/grading.e2e-spec.ts:704`**, que viola `GuardianStudent_isPrimary_chk` desde el login por código de David. Revisa la migración `users_codigo_apoderados`: `isPrimary` es TRUE/NULL y solo puede haber un principal vigente por alumno.
2. **Agrega los casos límite que falten:**
   - Bitácora:
     - filtros en sus bordes: rango de fechas, acción inexistente y paginación;
     - solo ADMIN (403 para otros roles);
     - el modo soporte se deriva bien;
     - no se expone la IP.
   - JOB_LIMIT:
     - con 3 jobs activos, el 4.º da 429;
     - un respaldo o purga duplicado del mismo año da 409;
     - STALLED a 1 h y a 6 h, en el límite exacto.
   - PURGE_YEAR:
     - cada precondición U7 por separado: año abierto, respaldo FAILED, plazo no cumplido;
     - los archivos isReusable no se purgan.
   - RF-63:
     - lo que no es ADMIN da 403;
     - `job.download` queda en la bitácora;
     - el JSON no trae datos de otros alumnos.
   - Web: los tests de `audit.ts` y `storage.ts` en sus límites.
3. **Corre** api test, el e2e completo (con `timeout 600`), web test, lint y `tsc`. Mide la cobertura de `admin-audit/`, `lifecycle/` y `jobs/` (meta: 90 % de líneas).

**Restricciones:**
- En paralelo, otro QA trabaja sobre `announcements/` y `notifications/`. No toques esos archivos.
- Cada comando largo con timeout.
- Entorno: `NODE_OPTIONS=--dns-result-order=ipv4first`. No leas `.env`.

Devuelve un INFORME conciso. Los bugs de producción van como hallazgos, sin corregirlos.
```

### 11. seguridad-cumplimiento — Seguridad de 5g

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee los INFORMES 1, 5 y 18. Rama features/adolfo.

Encargo: auditoría de solo lectura de la fase 5g. Archivos:
- `apps/api/src/modules/admin-audit/`
- `apps/api/src/modules/lifecycle/`
- `jobs/` (`jobs.controller`, `job-download`, `zip-archive` y los cambios en `background-job.service`)
- La web: `admin/bitacora` y `admin/almacenamiento`, con sus Server Actions.

Revisa:
- **Bitácora:** solo ADMIN, sin IP ni datos sensibles en pantalla, y filtros sin inyección.
- **RF-63:**
  - que el JSON solo traiga datos del titular;
  - la decisión de que el ADMIN descarga (Decisión 8), con `job.download` en la bitácora;
  - que la URL firmada dure 60 s;
  - que la Server Action no filtre la URL a terceros y valide http/https.
- **ZIP:**
  - path traversal y zip slip en los nombres de las entradas;
  - streaming y tamaño;
  - que no entren archivos purgados ni ajenos.
- **PURGE_YEAR:** precondiciones U7, que no borre isReusable, idempotencia y bitácora.
- **JOB_LIMIT y 409.**
- **Barrido STALLED:** 1 h y 6 h.
- **Ley 29733 y menores.**

Entrega un INFORME conciso con severidades (CRÍTICO/ALTO/MEDIO/BAJO), archivo:línea y la corrección.
```

### 12. ux-accesibilidad — UX de bitácora y almacenamiento

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee el INFORME 18. Rama features/adolfo.

Encargo: revisión de solo lectura de las pantallas de la fase 5g:
- `apps/web/app/(app)/admin/bitacora/`: filtros, tabla, paginación, insignia de modo soporte y `<details>`.
- `apps/web/app/(app)/admin/almacenamiento/`:
  - uso por año y grado;
  - respaldos con su descarga;
  - aviso de purga;
  - exportación de datos con sondeo cada 3 s y región de estado.

Criterios:
- Coherencia con shadcn/ui y con el resto de pantallas.
- Diseño desde 360 px; la tabla de bitácora en celular.
- WCAG 2.1 AA:
  - tablas accesibles;
  - filtros etiquetados;
  - anuncios del sondeo sin hablar en exceso;
  - foco tras exportar y tras descargar;
  - contraste de la insignia y del aviso de peligro en claro y oscuro;
  - objetivos de 44 px.
- Textos en español claros.

Devuelve un INFORME conciso con APROBADO o CAMBIOS_PEDIDOS. Para cada hallazgo indica severidad, archivo:línea y la corrección propuesta.
```

### 13. SendMessage (reanudación) — Correcciones de 5d, vuelta 1

```
Correcciones de la fase 5d (vuelta 1 de 2). El detalle está en el expediente, INFORMES 16 (UX) y 17 (seguridad). Aplícalas todas en una sola pasada.

**UX**
1. **[ALTO] Contraste del contador** (`notification-bell.tsx:123`): el globo debe pasar 4,5:1 en modo claro y en oscuro. Usa tokens, por ejemplo `bg-destructive text-destructive-foreground`, o define un par que cumpla.
2. **[ALTO] Anuncio de avisos nuevos:** agrega un `<span className="sr-only" role="status" aria-live="polite">` fuera del Sheet. Debe decir "Tienes N avisos sin leer" solo cuando el contador sube, no en la carga inicial.
3. **Foco estable tras retirar o editar un anuncio:** el foco va a un título con `tabIndex={-1}` o a un status "Anuncio retirado" / "Anuncio actualizado".
4. **No cerrar el AlertDialog mientras está `pending`.** Además, `aria-live` en "Retirando…".
5. **Nav:** quita de `lib/nav.ts` el ítem "Anuncios del curso", que apunta a `demo`. Al curso se entra desde la pestaña del curso.
6. **Destinatarios:** usa el mismo patrón de label que "Grado".
7. **BAJO:**
   - un `h2` sr-only "Lista de anuncios" en `/anuncios`;
   - quita `aria-current` del `span`;
   - en "Marcar como leído", un `aria-label` con parte del mensaje.

**Seguridad**
8. **[MEDIO] Límites al crear anuncios:**
   - `@Throttle` de 5 por minuto por usuario para crear (deja 30/min para PATCH y DELETE);
   - tope por autor en 24 h: 20 INSTITUTION/GRADE o 50 de curso, con 429 `ANNOUNCEMENT_LIMIT`.
9. **[MEDIO] Tope de destinatarios por evento:** 20000, con aviso en el log, o pagina `studentsOfSections` por cursor.
10. **[BAJO] Revalidar la pertenencia al leer avisos** de anuncio o tarea (`notifications.service.ts:160-203`). Si el destinatario ya no tiene acceso, mensaje genérico.
11. **[BAJO]** `@UseGuards(ActiveActorGuard)` en `MeAnnouncementsController`.
12. **[BAJO] E2e de due-soon:** aíslalo para que solo afirme sobre su propia tarea y estudiante, sin `created > 0` global.

En paralelo trabajan QA, seguridad y UX sobre 5g (`admin-audit/`, `lifecycle/`, `jobs/`, `admin/bitacora`, `admin/almacenamiento`): no los toques. Los comandos con `timeout 300`.

Al terminar corre lint, `tsc`, test y build de api y web, los e2e de 5d y prettier. Devuelve un INFORME conciso punto por punto.
```

### 14. SendMessage (reanudación) — Re-revisión corta de UX 5d

```
Re-revisión corta de tus hallazgos de la 5d (vuelta 1/2). dev5 los corrigió y el detalle está en el INFORME 22 del expediente.

Verifica sobre todo:
- el globo con `bg-danger`;
- el status sr-only cuando sube el contador;
- el foco tras retirar o editar, con `list-status.tsx` y el `h3` con `tabIndex`;
- el diálogo bloqueado mientras está `pending`;
- el patrón de label de "Destinatarios".

Devuelve APROBADO o CAMBIOS_PEDIDOS en un INFORME breve.
```

### 15. SendMessage (reanudación) — Correcciones de 5g, vuelta 1

```
Correcciones de la fase 5g (vuelta 1 de 2). El detalle está en el expediente, INFORMES 20 (UX), 21 (seguridad) y 24 (QA). Aplícalas todas en una sola pasada.

QA:
1. [MEDIO] Bitácora: lo que `rangeError` acepta en la web, la API también debe aceptarlo. Deja el límite de la web en 399 días o ajusta `buildAuditQuery`, y quita el `.fails` de `audit.edge.test.ts`.
2. [BAJO] `formatBytes(1048575)` debe dar "1 MB". Quita el `.fails` de `storage.edge.test.ts`.

Seguridad:
3. [MEDIO] En `failStalled`, pasar también a FAILED (`QUEUE_STALLED`) los QUEUED con más de 1 h si son exportaciones, o más de 6 h si son YEAR_BACKUP o PURGE_YEAR. Agrega su test.
4. [MEDIO] Para PERSONAL_DATA_EXPORT y YEAR_BACKUP, registrar `job.download` en la bitácora ANTES de firmar la URL; si la bitácora falla, responder 503.
5. [MEDIO] Mínimo de `purgeAfterDays` en 30 (`settings.dto.ts` PURGE_MIN_DAYS, el CHECK de la BD no se toca; la web de `/admin/configuracion` debe validar igual). Ajusta los tests.
6. [MEDIO] Antes de purgar, comprobar con `HeadObject` que cada respaldo exista y pese más de 0 bytes; si no, `PURGE_NOT_ELIGIBLE`. En el respaldo, contar los archivos excluidos en `indice.csv` y en la bitácora `lifecycle.purge`.
7. [BAJO] En producción, la Server Action de descarga solo acepta `https:`.
8. [BAJO] `zipSegment`: prefijar `_` a nombres reservados de Windows (CON, NUL, COM1…).
9. [BAJO] En la vista de la bitácora, redactar las claves `email`, `reason` y `comment` en `beforeState`/`afterState`, o recortarlas a 200 caracteres.

UX:
10. [MEDIO] Tabla de bitácora: debajo de `md` mostrar tarjetas, o dar al contenedor con scroll `tabIndex={0}`, `role="region"` y `aria-label`.
11. [MEDIO] Foco tras exportar y descargar: usar `aria-disabled` con un guardia en lugar de `disabled`; enfocar el botón de descarga cuando aparezca, y tras descargar devolver el foco al botón.
12. [MEDIO] Que los nombres accesibles empiecen por el texto visible ("Descargar ZIP del respaldo…", "Ver solo sus acciones (nombre)").
13. [MEDIO] Fechas inválidas: `aria-invalid` y `aria-describedby` en Desde y Hasta.
14. [BAJO] `aria-busy` mientras se prepara; anunciar el error una sola vez; aviso de purga con `role="status"` en lugar de `alert`; uso por grado como lista.

En paralelo no hay otros agentes escribiendo. Usa `timeout 300` en los comandos. Al terminar corre lint, `tsc`, test y build de api y web, los e2e de 5g y prettier. Devuelve un INFORME conciso, punto por punto.
```

### 16. revisor-pr — Revisión final de 5d y 5g

```
Expediente: .claude/tareas/20261030-dev5-administracion.md (INFORMES 15 a 25, Decisiones 9 a 14). Rama features/adolfo. Los cambios de 5d y 5g están sin commit, sobre `0052802` y el reporte posterior (`git status` y `git diff`).

Encargo: revisión final de 5d (RF-32, RF-53) y 5g (RF-55/56, RF-62..67), incluidas las vueltas de corrección.

1. **Definición de terminado** de docs/06.
2. **Carpetas tocadas:** solo las permitidas o compartidos autorizados (`app.module.ts`, `worker.module.ts`, `nav.ts`, `routes.ts`, `(app)/layout.tsx`, una línea en `lib/api/server.ts`, `settings.dto.ts` y el fixture de `grading.e2e`). Ignora `.claude/`, `.agents/`, `skills-lock.json`, `docs.zip` y `docs/criterios.rar`.
3. **Verifica en el código** que estén aplicados:
   - seguridad de 5g, puntos 4, 6, 7 y 9 del INFORME 25;
   - UX de 5g, puntos 10 a 14;
   - de 5d, el throttle y el tope diario, `MAX_RECIPIENTS` y `reachOf`.
4. **Corre:**
   - `pnpm install --frozen-lockfile`;
   - lint, `tsc` y build de api y web, más el lint y build del worker;
   - api test y web test;
   - el e2e completo con `timeout 900`;
   - `prettier --check` sobre los archivos cambiados.

Entorno: `NODE_OPTIONS=--dns-result-order=ipv4first`, Docker arriba. No leas `.env`.

Devuelve APROBADO o CAMBIOS_PEDIDOS en un INFORME conciso, con el mensaje de commit propuesto.
```

## Decisiones del orquestador

- **Integración previa:** antes de retomar se trajo `main` del equipo (login por código de David). El correo para avisos pasó a `deliverableEmail()`. Hay reporte aparte: `20261106-integrar-main-equipo.md`.
- **Reparto en paralelo:** 5d y 5g se trabajaron en paralelo, en carpetas distintas. Los compartidos se tocaron solo con inserciones.
- **Una sola vuelta de corrección por fase:** se juntaron los hallazgos de QA, seguridad y UX en un mensaje por agente.
- **Compartidos aceptados:**
  - una línea `apiServer.delete` en `lib/api/server.ts` (Dev 1);
  - la campana en `(app)/layout.tsx`;
  - el fixture de `grading.e2e` (Dev 4).
- **Plazo de purga:** mínimo de 30 días por recomendación de seguridad. D-015 sigue abierta, con 60 días por defecto.
- **Jobs colgados:** STALLED a la 1 h, pero a las 6 h para respaldo y purga.
- **Revisión cruzada:** la re-revisión de UX de 5d decía que quedaban 3 puntos; el orquestador comprobó con grep que ya estaban corregidos.
- **Sin re-revisión separada en 5g:** el revisor verificó en el código los puntos de seguridad y UX.

## Archivos

- **API:**
  - `apps/api/src/modules/{announcements,notifications,admin-audit,lifecycle,jobs}/`
  - `settings/settings.dto.ts`
  - tests e2e: `announcements`, `notifications`, `admin-audit(-edge)`, `lifecycle(-edge)`, `jobs`, `grading`
- **Web:** `(app)/anuncios`, `(app)/admin/{anuncios,bitacora,almacenamiento,configuracion}`, `(app)/curso/[id]/anuncios`, `(app)/_notifications`, `(app)/layout.tsx`, `lib/{nav,routes}.ts`, `lib/api/server.ts`

## Verificación

| Comando                          | Resultado           |
| -------------------------------- | ------------------- |
| `pnpm install --frozen-lockfile` | ok                  |
| api: lint, tsc, build            | ok                  |
| api: test                        | 1041 ok             |
| web: lint, tsc, build            | ok                  |
| web: test                        | 445 ok              |
| worker: lint y build             | ok                  |
| e2e completo                     | 28 archivos, 623 ok |
| prettier --check                 | ok                  |

## Pendientes

- **5f:** reportes XLSX/PDF, ZIP masivo y dashboard.
- **Documentador:**
  - docs/02 y docs/03 (contratos y códigos `AUDIT_UNAVAILABLE`, `QUEUE_STALLED`, `ANNOUNCEMENT_LIMIT`);
  - docs/04 (retención);
  - docs/05 (procedimiento ARCO);
  - AGENTES_IA (carpetas nuevas).
- **Pruebas manuales:** en el navegador a 360 px y con lector de pantalla.
- **Pestaña de anuncios del curso:** falta en la barra de pestañas (Dev 2/3).
- **Detalles BAJO del revisor:**
  - mover `WINDOWS_RESERVED`;
  - el reencolado diario de PURGE_YEAR cuando falta un respaldo;
  - `redactState` solo se aplica en la web.

---

# Actualización: fase 5f, reportes (RF-57..60)

## Pedido

- **Textos del usuario:** "realiza el 5f", "sigue implementando 5f" y "Commit y subir".
- **Rama:** `features/adolfo`, sobre `5edccf0`.

## Resultado

Pantalla `/admin/reportes`, solo para ADMIN:

- **Listado de cursos-sección** con su docente y un enlace a su registro de notas (RF-57).
- **Exportación por sección** (RF-58):
  - **Excel:** textos escapados contra fórmulas.
  - **PDF:** generado con Gotenberg, con HTML escapado y CSP.
  - Ninguno de los dos lleva comentarios ni motivos de exoneración.
- **ZIP de todas las secciones** en segundo plano (RF-59). Tope de 300 cursos-sección y 200 MiB, con 3 h antes de marcarlo como colgado.
- **Dashboard institucional** con conteos y sin nombres (RF-60). Si hay más de 60 cursos, pide filtrar por grado.
- **Descargas:** se registran en la bitácora antes de firmar el enlace.
- **Gotenberg en docker-compose:**
  - escucha solo en loopback;
  - sin JS;
  - con límites de memoria y CPU, `read_only` y `cap_drop` ALL.

## Agentes que participaron

| #   | Agente                 | Qué hizo                 | Estado                                                                        |
| --- | ---------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| 1   | dev5-administracion    | Implementó 5f            | LISTO                                                                         |
| 2   | qa-tester              | 69 tests nuevos          | LISTO                                                                         |
| 3   | seguridad-cumplimiento | Auditoría                | APROBADO (5 MEDIO)                                                            |
| 4   | ux-accesibilidad       | Revisión de la pantalla  | APROBADO (2 MEDIO)                                                            |
| 5   | dev5-administracion    | Vuelta de corrección 1/2 | LISTO                                                                         |
| 6   | revisor-pr             | Revisión final           | CAMBIOS_PEDIDOS: 2 tests e2e con el plazo viejo (los corrigió el orquestador) |

## Prompts usados (literales)

### 1. dev5-administracion — Fase 5f reportes y dashboard

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee los INFORMES 1, 4, 5, 18 y 25 y las Decisiones 1 y 15. Rama features/adolfo, HEAD 5edccf0.

Encargo: fase 5f (RF-57..60), solo para ADMIN. Reutiliza lo que ya existe; no rehagas nada.

API (`apps/api/src/modules/reports/`):
1. **RF-57**: el ADMIN ve el registro de cualquier docente y curso-sección. Reutiliza `GradebookReadService` de grading. Agrega un listado de cursos-sección del año con su docente, filtrable por grado y sección.
2. **RF-58**: `POST /admin/exports` con `{type: SECTION_EXPORT, courseSectionId, periodId, format: XLSX|PDF}`, que devuelve 202 `{jobId}` usando `BackgroundJobService` (JOB_LIMIT y 409 ya existen). El procesador `exports:section-export`:
   - toma los datos de `buildGradebook` / `GradebookReadService` y la tabla literal de `LiteralScaleProvider` (WorkerModule debe importar `LiteralScaleModule`);
   - pone en la cabecera el logo y el nombre institucional (`InstitutionSettings`), curso, docente, sección y período;
   - **XLSX con exceljs**: toda celda de texto escapada contra fórmulas (`escapeCsvCell` o el equivalente para exceljs, D-035);
   - **PDF con Gotenberg** por HTTP (`GOTENBERG_URL`): HTML propio con todo el texto escapado, sin JS, con timeout y sin recursos externos (el logo va embebido en base64);
   - sube el resultado con `JobResultStorage` y lo marca con `TrackedJobRunner`.
3. **RF-59**: `BULK_EXPORT` (por año y período, con formato) genera un ZIP con un archivo por sección, usando `zip-archive.ts` en streaming. Agrega un tope de secciones y de bytes.
4. **RF-60**: `GET /admin/reports/dashboard?academicYearId&periodId` con promedios por grado y sección, distribución AD/A/B/C, estudiantes en riesgo (conteos, sin nombres en el agregado) y entregas a tiempo, tarde y NE. No recalcules: usa el motor `buildGradebook`/`summarizeAverage`.
5. `GET /admin/jobs/:id` y la descarga ya existen (`jobs.controller`); úsalos.

Infra:
- Agrega `gotenberg/gotenberg:8` a `docker-compose.yml`, solo en la red local, en el puerto 3001 de 127.0.0.1 (autorizado).
- Si el contenedor no levanta, el e2e del PDF debe mockear el cliente HTTP y el resto seguir.

Web (`/admin/reportes`, hoy un placeholder; BFF D-037; desde 360 px; WCAG AA; mismo patrón que `admin/almacenamiento`):
- filtros de año, período, grado y sección;
- lista de secciones con docente, enlace a ver su registro (RF-57) y botones Excel y PDF;
- botón "ZIP de todas las secciones";
- estado del trabajo con sondeo y descarga, reutilizando `job-download-button` y el patrón de exportación (con foco, `aria-busy` y label-in-name);
- dashboard con tablas accesibles; si hay gráfico, siempre con su tabla equivalente.

Tests: unit (constructores XLSX y HTML, escape, agregados del dashboard) y e2e `test/reports.e2e-spec.ts` contra MySQL y MinIO (permisos 403 para quien no es ADMIN, JOB_LIMIT, XLSX que se abre con exceljs y trae las celdas esperadas, ZIP con N entradas).

Restricciones:
- No se puede usar el promedio anual (D-014).
- No toques grading más allá de importar o exportar lo necesario.
- Comandos con `timeout 300`; el e2e completo con `timeout 900`.
- `NODE_OPTIONS=--dns-result-order=ipv4first`. No leas `.env`. No hagas commit.

Corre lint, tsc, test y build de api, web y worker, los e2e y prettier. Devuelve un INFORME conciso según el protocolo.
```

### 2. qa-tester — QA de 5f

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee el INFORME 27. Rama features/adolfo.

Encargo: QA de la fase 5f (`apps/api/src/modules/reports/` y la web `admin/reportes`). Solo puedes tocar archivos de test.

Agrega los casos límite que falten:
- **Logo:** PNG y JPEG reales en el XLSX y en el PDF; si el logo falla, el reporte sale sin él.
- **Datos vacíos:** sección sin estudiantes, curso sin docente y período sin tareas.
- **Gotenberg caído:** el job se reintenta y termina FAILED con `PDF_UNAVAILABLE`; también `PDF_TOO_LARGE` y `PDF_INVALID`.
- **BULK:** con PDF; topes de 300 cursos-sección y 200 MiB; `NO_COURSE_SECTIONS`.
- **Escape:** celdas que empiezan con `= + - @` y títulos con HTML/`<script>` en el XLSX y en el HTML del PDF.
- **XLSX:** NE como "NE x.xx", EXO y celdas vacías; nunca comentario ni `exemptionReason`.
- **Dashboard:** que coincida con la suma de los registros por sección; `REPORT_TOO_LARGE` con más de 300; sin nombres.
- **Permisos:** 403 para quien no es ADMIN en todos los endpoints de reportes; `PERIOD_MISMATCH`, 404 y 422.
- **Throttle:** el 429 con el limitador real, en un test aparte.
- **Web:** tests de `reports.ts` en sus límites.

Corre api test, `reports.e2e` y el e2e completo (`timeout 900`), web test, lint y tsc. Mide la cobertura de `reports/` (meta 90 % de líneas).

`NODE_OPTIONS=--dns-result-order=ipv4first`; Gotenberg ya está en docker-compose. No leas `.env`.

Devuelve un INFORME conciso. Los bugs de producción van como hallazgos, sin corregirlos.
```

### 3. seguridad-cumplimiento — Seguridad de 5f

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee los INFORMES 21 y 27. Rama features/adolfo.

Encargo: auditoría de solo lectura de la fase 5f. Revisa estos archivos:
- `apps/api/src/modules/reports/`
- el cambio en `settings/institution-logo.storage.ts`
- el servicio gotenberg en `docker-compose.yml`
- la web `admin/reportes`, con sus Server Actions

Qué revisar:
- **Inyección de fórmulas en el XLSX (D-035)** y **XSS/HTML injection en el HTML del PDF**.
- **Gotenberg:**
  - flags;
  - que no haga fetch de recursos externos (SSRF);
  - que solo escuche en loopback;
  - timeouts y límite de tamaño, incluidas las respuestas chunked.
- **Datos de menores en las exportaciones:**
  - qué columnas llevan;
  - que nunca incluyan comentarios ni `exemptionReason` (D-049);
  - que el dashboard no lleve nombres.
- **Permisos:** solo ADMIN.
- **Bitácora:** `reports.export.request`, y `job.download` antes de firmar en `SECTION_EXPORT`/`BULK_EXPORT`, si corresponde.
- **DoS:**
  - dashboard síncrono de hasta 300 gradebooks;
  - topes del ZIP;
  - throttle;
  - JOB_LIMIT.
- **Rutas dentro del ZIP**, con nombres de curso y sección maliciosos.

Entrega un INFORME conciso con severidades (CRÍTICO/ALTO/MEDIO/BAJO), archivo:línea y la corrección propuesta.
```

### 4. ux-accesibilidad — UX de admin/reportes

```
Expediente: .claude/tareas/20261030-dev5-administracion.md. Lee el INFORME 27 y, como referencia de lo ya corregido en la 5g, el INFORME 20. Rama features/adolfo.

Encargo: revisión de solo lectura de `apps/web/app/(app)/admin/reportes/` y de sus componentes (export-button, filtros, lista de secciones y dashboard).

Criterios:
- Coherencia con shadcn/ui y con `admin/almacenamiento`.
- Diseño desde 360 px: tablas en una región enfocable o en tarjetas.
- WCAG 2.1 AA:
  - label-in-name en los botones Excel, PDF y ZIP;
  - `aria-disabled` y `aria-busy`;
  - foco cuando aparece la descarga;
  - sondeo que no hable de más;
  - tablas del dashboard accesibles (caption y scope);
  - filtros con etiqueta y error asociado;
  - contraste en claro y oscuro;
  - objetivos de 44 px.
- Textos en español claros.

Devuelve un INFORME conciso con APROBADO o CAMBIOS_PEDIDOS. Cada hallazgo con severidad, archivo:línea y la corrección propuesta.
```

### 5. SendMessage (reanudación) — Correcciones de 5f, vuelta 1

```
Correcciones de la fase 5f (vuelta 1 de 2). El detalle está en los INFORMES 28 (UX) y 29 (seguridad) del expediente. QA no encontró bugs y agregó tests: no los rompas. Hazlo todo en una sola pasada.

Seguridad:
1. [MEDIO] Agregar SECTION_EXPORT y BULK_EXPORT a `AUDIT_FIRST` en `job-download.service.ts`. Ajusta su test.
2. [MEDIO] `gotenberg.client.ts`: leer `response.body` por trozos con un contador y abortar con `PDF_TOO_LARGE` al pasar `MAX_PDF_BYTES`. Un `content-length` ausente o NaN cuenta como "no declarado". Agrega un test con una respuesta chunked grande.
3. [MEDIO] Dashboard: throttle de 5/min. Si el año tiene más de 60 cursos-sección y no hay filtro de grado, responde 422 `REPORT_NEEDS_GRADE_FILTER`; la web debe pedir el grado. El tope de 300 se queda como está.
4. [MEDIO] `STALLED_AFTER_MS.BULK_EXPORT` en 3 h. Revisa que el `lockDuration` y el timeout de BullMQ del worker no lo corten antes.
5. [MEDIO] `docker-compose.yml`, servicio gotenberg: `mem_limit` de 1g, `cpus` de 1.0, `--api-body-limit=10MB`, `--chromium-max-queue-size=10`, `--chromium-restart-after=50`, `cap_drop: [ALL]` y `read_only` con tmpfs en /tmp, si Gotenberg arranca así. Después verifica con un PDF real que el logo `data:` sigue saliendo.
6. [BAJO] En el ZIP, recorta el nombre base y luego agrega la extensión, para que `.xlsx` o `.pdf` nunca se pierdan.
7. [BAJO] Test de regresión de D-049: si entra un comentario o un motivo de exoneración de ejemplo, no debe aparecer en el XLSX ni en el HTML (agrégalo si QA no lo cubrió ya).

UX:
8. [MEDIO] `export-button.tsx`: si falla el sondeo, desbloquea el botón y deja reintentar.
9. [MEDIO] `focusOnMount` solo si el foco sigue en el botón de exportar o en `body`; si no, solo `announce`.
10. [BAJO]
    - quita `aria-busy` del `<p>`;
    - anuncia "Recarga la página…" cuando se detiene el sondeo;
    - agrega una leyenda de AD, A, B y C;
    - muestra un mensaje si el año no tiene períodos;
    - pon un texto de ayuda cuando los filtros no devuelven nada.

Al terminar corre, con `timeout`, lint, tsc, test y build de api, web y worker; los e2e de reports (los tres) y prettier. Si cambias docker-compose, recrea el contenedor de Gotenberg y prueba un PDF real. Devuelve un INFORME conciso punto por punto.
```

### 6. revisor-pr — Revisión final de 5f

```
Expediente: .claude/tareas/20261030-dev5-administracion.md (INFORMES 27 a 31 y Decisiones 15 a 18). Rama features/adolfo. Los cambios están sin commit sobre `5edccf0` (usa `git status` y `git diff`).

Encargo: revisión final de la fase 5f (RF-57..60) con su vuelta de corrección.

1. **Definición de terminado** de docs/06.
2. **Carpetas y archivos compartidos autorizados:** `reports/`, `jobs/`, `app.module.ts`, `worker.module.ts`, `institution-logo.storage.ts`, `docker-compose.yml` y la web en `admin/reportes`. Ignora `.claude/`, `.agents/`, `skills-lock.json`, `docs.zip` y `docs/criterios.rar`.
3. **Verifica en el código** que estén aplicados los puntos 1 a 10 del INFORME 31. Revisa también los 2 tests de QA que se cambiaron y la configuración de Gotenberg.
4. **Corre:**
   - `pnpm install --frozen-lockfile`;
   - lint, tsc y build de api, web y worker;
   - api test y web test;
   - el e2e completo con `timeout 900` (Gotenberg está levantado);
   - `prettier --check` sobre los archivos cambiados.

`NODE_OPTIONS=--dns-result-order=ipv4first`. No leas `.env`.

Devuelve APROBADO o CAMBIOS_PEDIDOS en un INFORME conciso, con un mensaje de commit propuesto.
```

## Decisiones del orquestador

- Un solo agente dev5 y luego una sola vuelta de corrección con todos los hallazgos.
- El orquestador ajustó él mismo 2 tests de `lifecycle-edge.e2e-spec.ts`: esperaban 1 h y el STALLED de BULK_EXPORT pasó a 3 h. BULK_EXPORT ahora tiene su propio test de límite. Como el revisor ya había verificado todo lo demás, la fase se dio por aprobada con el e2e en verde.
- Se borró `e2e_tmp.log`, que dejó el revisor.

## Archivos

- **API:** `apps/api/src/modules/reports/` (nuevo), `jobs/{background-job,job-download}.service.ts`, `settings/institution-logo.storage.ts`, `app.module.ts` y `jobs/worker.module.ts`.
- **Tests:** `reports*.spec.ts`, `test/reports*.e2e-spec.ts`, `test/lifecycle-edge.e2e-spec.ts` y `job-download.service.spec.ts`.
- **Web:** `apps/web/app/(app)/admin/reportes/`.
- **Infra:** `docker-compose.yml` (gotenberg).

## Verificación

| Comando                                              | Resultado               |
| ---------------------------------------------------- | ----------------------- |
| install frozen, lint, tsc y build (api, web, worker) | ok                      |
| api test                                             | 1106 ok                 |
| web test                                             | 463 ok                  |
| e2e completo                                         | 31 archivos, 653/653 ok |
| PDF real con logo vía Gotenberg                      | 200, logo embebido      |

## Pendientes

- **Documentador:** actualizar docs/03 con los endpoints `/admin/reports/*` y `/admin/exports`, los códigos (`REPORT_NEEDS_GRADE_FILTER`, `PDF_*`, `BULK_TOO_LARGE`, `AUDIT_UNAVAILABLE`) y la bitácora previa a la descarga.
- **Pruebas manuales:** en el navegador, a 360 px y con lector de pantalla. Revisar a ojo los Excel y PDF generados.
- **D-014 (promedio anual):** sigue fuera.
- **Gotenberg en producción:** solo en la red interna.
