# Dev 5 — Anuncios, notificaciones, reportes, ciclo de vida y worker

Pedido por el usuario: "va, pasemos a desarrollar lo del dev 5"
Flujo: completo
Vueltas de corrección: 1/2

Rama: features/adolfo (base 7809bc7). Alcance: RF-32, RF-53..67, RNF-19.

### INFORME 1 — arquitecto-integrador

Estado: BLOQUEADO (decisiones del usuario)
Requisitos: RF-32, RF-53..67, RNF-19 (además RN-12, RN-14, RNF-02/03/09/14/18/24/26)
Resumen: Los 16 RF y RNF-19 están dentro de v1 (ERS §7). No existe nada de Dev 5: el worker es un console.log, no hay bullmq, nodemailer, archiver ni Gotenberg, y la web tiene placeholders. Redis y Mailpit ya están en docker-compose y exceljs 4.4.0 ya está en la API. Propone 7 fases (5a..5g) con un solo modelador-bd.
Hallazgos:

- [ALTO] grading.module.ts:18: NeMaterializer no se exporta; hay que exportar materializeAssignment para el barrido de NE (archivo de Dev 4).
- [ALTO] Los eventos D-031/D-034 viven en el proceso de la API y el worker no los recibe: los listeners de la API encolan en BullMQ (U2).
- [MEDIO] StoredFile.courseSectionId es obligatorio: el logo va fuera de StoredFile (U5).
- [MEDIO] grading usa DEFAULT_LITERAL_SCALE: RF-61 necesita un LiteralScaleProvider en gradebook-read.service.ts (Dev 4).
- [MEDIO] La purga y el barrido de intents escriben StoredFile (Dev 3): FileLifecycleService en files/ (U12).
  Fases (cada una: dev5 → qa → seguridad [+ux] → revisor):
- 5a [modelador-bd, M]: admin.prisma (Announcement, Notification, InstitutionSettings de una fila, BackgroundJob), migración admin_base y relaciones inversas en academic.prisma.
- 5b [M]: bullmq, QueueModule, worker.main.ts, BackgroundJob, mailer a Mailpit, barridos de NE e intents.
- 5c [S-M]: RF-61, configuración, logo y LiteralScaleProvider.
- 5d [L]: RF-32 y RF-53, anuncios y notificaciones con campana.
- 5e [S]: RF-54, calendario.
- 5f [L]: RF-57..60, reportes XLSX y PDF (Gotenberg), ZIP y dashboard.
- 5g [M-L]: RF-55/56/62..67, bitácora, datos personales, respaldo anual, purga y almacenamiento.
- Paralelo tras 5b: 5c ∥ 5e y 5d ∥ 5g. app.module, nav y routes los aplica el orquestador en serie.
  Compartidos: app.module.ts; apps/api/package.json (bullmq, nodemailer, archiver y sus tipos); apps/worker; docker-compose (gotenberg:8); .env.example y config/env.ts; academic.prisma; grading.module.ts y gradebook-read.service.ts; files/ (U12); nav.ts, routes.ts y (app)/layout.tsx.
  Decisiones para el usuario (recomendación):
- U1: procesadores en apps/api/src/modules/jobs con la entrada worker.main.ts; apps/worker queda como lanzador.
- U2: un listener encola un job idempotente, más barridos periódicos; sin outbox; actualizar D-031.
- U3: correo mínimo sin datos sensibles y aviso completo en la plataforma; destinatarios estudiante y apoderado.
- U4: Gotenberg, con HTML escapado y sin JS.
- U5: logo PNG o JPEG ≤ 512 KiB, sin SVG, con bytes mágicos y ClamAV, en S3 institution/.
- U6: exportaciones se conservan 7 días; los ZIP anuales se borran con la purga.
- U7: purga solo con el año cerrado, todos los respaldos SUCCEEDED y el plazo cumplido; deja bitácora.
- U8: RF-63 JSON con notas, comentarios y exemptionReason (derecho ARCO); lo confirma la institución.
- U9: modo soporte derivado al leer la bitácora.
- U10: FullCalendar con daygrid y list.
- U11: InstitutionSettings tipada de una sola fila; actualizar docs/02.
- U12: autorizar a dev3 una vez para FileLifecycleService.
  Contratos: anuncios, notificaciones, calendario, configuración y branding, reportes y jobs, bitácora, datos personales, almacenamiento y respaldos (ver propuesta completa en la respuesta del agente); eventos announcement.published.v1 y job.finished.v1; colas notifications, exports, lifecycle y maintenance.
  Pendientes: D-015, D-013, D-014; e2e de colas, Gotenberg y correo en local con Docker.
  Para: usuario (U1, U2, U5, U11 antes de 5a; U12 antes de 5b) → luego modelador-bd (5a).

### Decisión del orquestador 1

El usuario aprobó U1–U12 tal como las recomendó el arquitecto y autorizó los compartidos. Eso incluye las dependencias bullmq, nodemailer, archiver y FullCalendar, Gotenberg en docker-compose, app.module, env y nav, los archivos de grading, y dev3 una sola vez para FileLifecycleService (stub de Dev 3, ya avisado al usuario). Siguiente paso: modelador-bd (5a).

### INFORME 2 — modelador-bd (5a)

Estado: LISTO
Archivos: prisma/schema/admin.prisma (nuevo); academic.prisma (AcademicYear.announcements/backgroundJobs, CourseSection.announcements); migrations/20261030140220_admin_base (11 CHECK + fila InstitutionSettings id=1 con escala por defecto).
Comandos: prisma format/validate ok; migrate dev ok; migrate status 8 al día; db:seed ok; api build ok; tsc -p tsconfig.build.json ok; tsc -p tsconfig.json FALLA (sin revisar). Cada CHECK, el UNIQUE y la FK rechazaron su caso inválido.
Hallazgos: [MEDIO] Notification sin plazo de retención (seguridad). [BAJO] nombre inicial 'I.E. Mater Christi' provisional.
Decisiones:

- BackgroundJob.academicYearId? con FK, índice e inversa.
- Sin FK a User.
- Notification.entityId sin FK; emailSentAt solo con SENT.
- InstitutionSettings: solo update where id=1.
- BackgroundJob.status: el CHECK impone el ciclo QUEUED→RUNNING→SUCCEEDED/FAILED/EXPIRED.
- Announcement.title ≤150.
  Pendientes: docs/02 (U11), D-031 (U2), retención de Notification.

### Decisión del orquestador 2

En paralelo:

- dev5 hace la 5b: colas, worker, BackgroundJob, mailer y barrido de NE.
- dev3 hace la U12, un stub autorizado, solo en apps/api/src/modules/files/: FileLifecycleService con expireIntents(now) y purge(fileId, actorId|null), exportado por FilesModule.

No comparten archivos. dev5 consume FileLifecycleService por su interfaz.

### INFORME 3 — dev3-contenidos (U12, stub autorizado)

Estado: LISTO
Archivos: files/file-lifecycle.service.ts (+spec, 14 tests), files.module.ts (export), files-audit.ts (actor null, acción file.purge).
Resumen:

- El intent es un StoredFile PENDING.
- expireIntents(now) pasa a EXPIRED, con una gracia de 15 min y en lotes de 500, borra el objeto en incoming/ y registra files.upload.expired.
- purge(fileId, actorId|null) devuelve PURGED, ALREADY_PURGED o SKIPPED_REUSABLE; da 404 si no existe; si S3 falla, lanza y no marca.
  Comandos: api test 51/641 ok; lint ok; build ok; prettier ok. tsc -p tsconfig.json da 5 errores ANTERIORES: grading.edge.spec.ts (3), academic-schema.e2e-spec.ts (1) y db-test-guard.ts (1).
  Hallazgos: [BAJO] complete() no corta en intentExpiresAt; el margen lo cubre.
  Pendientes: e2e de barrido y purga contra MySQL y MinIO.

### INFORME 4 — dev5-administracion (5b)

Estado: LISTO
Archivos:

- Nuevos: módulos queue/ (6 archivos + spec) y jobs/ (BackgroundJobService, JobResultStorage, MailerService, JobProcessorRegistry, TrackedJobRunner, WorkerHost y WorkerModule; procesadores ne-sweep, intent-sweep, result-expiry y mail-check, con 4 specs); worker.main.ts.
- Modificados (autorizados): api package.json, lockfile, env.ts, .env.example, app.module.ts, grading.module.ts (exporta NeMaterializer) y apps/worker (package.json, index.ts, node.d.ts).
  Comandos: api lint ok; test 56/685 ok; build ok; worker lint y build ok. tsc -p tsconfig.json sigue con los 5 errores anteriores. Humo: el worker corre con Redis, Mailpit recibió el correo, los barridos devolvieron 0 y el ciclo de BackgroundJob se probó contra los CHECK.
  Hallazgos:
- [ALTO] ERR_PNPM_IGNORED_BUILDS por msgpackr-extract: falta allowBuilds en pnpm-workspace.yaml.
- [MEDIO] JobResultStorage propio, porque StorageService solo admite PDF; usa exports/{año}/{mes}/{uuid}.{ext}.
- [MEDIO] SMTP de producción sin user/pass (Dev 1).
- [BAJO] el dev del worker compila la API; posible carrera con turbo.
- [BAJO] se agregó result-expiry-sweep (U6).
  Decisiones: assertJobData admite solo ids; prefijo aula:bull; 3 reintentos exponenciales; JOB_ROUTES por tipo; errores JOB_NOT_FOUND/NOT_READY/EXPIRED/QUEUE_UNAVAILABLE/STORAGE_UNAVAILABLE; correo de texto plano fijo.
  Para (5c..5g):
- QueueService.enqueue(queue, name, data, {jobId}) para avisos y barridos.
- BackgroundJobService.create, findForActor y createDownloadUrl para exportaciones.
- Procesador: JobProcessor con registry.register en onModuleInit, agregado a worker.module.ts; TrackedJobRunner.run y JobError.
- MailerService.sendNotice(email, type).

### Decisión del orquestador 3

- El orquestador agregó `msgpackr-extract: false` en pnpm-workspace.yaml, que entra en la autorización de dependencias. Con eso `pnpm install --frozen-lockfile` termina con exit 0.
- Se lanzan en paralelo qa-tester y seguridad-cumplimiento sobre 5b y el stub U12. QA también corrige los 5 errores de tsc anteriores, que están en archivos de test.

### INFORME 5 — seguridad-cumplimiento (5b + U12)

Estado: APROBADO (0 CRÍTICO y 0 ALTO; 4 MEDIO y 4 BAJO).
Verificado: payloads de Redis solo con ids; bitácora sin datos personales; correo de texto plano fijo y sin inyección; claves exports/ validadas con regex y URL de 60 s con attachment; JOB_NOT_FOUND para quien no es dueño; la purga respeta isReusable, es idempotente y deja bitácora; los valores por defecto de env no traen secretos.
Hallazgos:

1. [MEDIO] Retención de Notification:
   - leídas 90 días, no leídas 180 días, tope 365 días;
   - barrido diario maintenance:notification-retention;
   - borrado al purgar el año;
   - reintentos de correo solo 7 días, luego SKIPPED.
     Dueño: 5d/5g; agregar a docs/04.
2. [MEDIO] create() no limita los jobs activos: máximo 2-3 por usuario con 429 JOB_LIMIT; YEAR_BACKUP y PURGE_YEAR con 409 si ya hay uno activo (5f/5g).
3. [MEDIO] ADMIN puede descargar PERSONAL_DATA_EXPORT: confirmar en docs/05; registrar job.download en la bitácora (5g).
4. [MEDIO] purge() no verifica precondiciones: el procesador PURGE_YEAR debe verificarlas y el JSDoc debe documentarlas (5g).
5. [BAJO] SMTP de producción: user, pass y requireTLS (Dev 1).
6. [BAJO] Credenciales de Redis en producción.
7. [BAJO] RUNNING colgados: pasar a FAILED STALLED después de 1 h; regla de bucket para exports/.
8. [BAJO] ne-sweep sin tope por corrida (maxItems de 2000).
   Además: anuncios INSTITUTION en lotes de 50 a 100 con dedupeKey por destinatario (5d).

### INFORME 6 — qa-tester (5b + U12)

Estado: LISTO
Comandos:

- api test: 60 archivos / 714 tests ok.
- e2e jobs, file-lifecycle, grading, files y submissions: 5 archivos / 105 tests ok (33 nuevos).
- lint: 0.
- tsc -p tsconfig.json: 0 errores. Se corrigieron los 5 anteriores y un sexto que estaba oculto en users-prisma.mock-spec.ts.
- Cobertura de queue, jobs y file-lifecycle: 92,07 % de líneas.
  Archivos:
- Nuevos: queue.data.spec, tracked-job.runner.spec, mailer.injection.spec, background-job.edge.spec, test/jobs.e2e-spec y test/file-lifecycle.e2e-spec.
- Modificados: grading.edge.spec, users-prisma.mock-spec, academic-schema.e2e-spec y db-test-guard. Estos dos últimos llevan @ts-ignore por rootDir.
  Hallazgos:
- [BAJO] El comentario de la migración sobre el reintento a QUEUED no coincide con el código, que va de RUNNING a RUNNING.
- [BAJO] complete() no corta el intent cuando vence (ya reportado).
- [BAJO] expireResults recorre toda la tabla.
- [INFO] Los permisos HTTP de jobs quedan para 5f.
  Pendientes:
- Smoke del cableado del worker.
- rootDir en tsconfig.
- 30 avisos de prettier en archivos ajenos.

### INFORME 7 — revisor-pr (5a + 5b + U12)

Estado: APROBADO
Comandos:

- pnpm install --frozen-lockfile: ok.
- api lint, test (60/714) y build: ok.
- tsc: 0.
- worker lint y build: ok.
- web build: ok.
- prettier sobre los archivos cambiados: ok.
  Las carpetas y los compartidos están dentro de lo autorizado. Se aceptan los 2 @ts-ignore porque llevan justificación.
  Pendientes:
- Docker local.
- Los MEDIO de seguridad pasan a 5d, 5f y 5g.
- SMTP de producción (Dev 1).
- Comentario de la migración: no se edita, porque cambiar una migración ya aplicada rompe el checksum; se corrige en docs.
- docs/02 (U11) y D-031 (U2).
- En la rama limpia para el equipo, files/ es de Dev 3.
  Commits propuestos: feat(admin) y feat(files).

### Decisión del orquestador 4

Sin commit, porque el usuario no lo pidió. Un solo agente dev5 hace 5c y luego 5e, en serie, para no chocar en app.module, nav y routes.

### INFORME 8 — dev5-administracion (5c + 5e)

Estado: LISTO
5c RF-61:

- Endpoints: GET/PUT /admin/settings, PUT /admin/settings/logo (PNG o JPEG ≤512 KiB, ≤4096 px, bytes mágicos, ClamAV, institution/<uuid>, borra el anterior, 10 por minuto) y GET /institution/branding (URL de 10 min).
- LiteralScaleProvider global con caché de 10 s y fallback, inyectado @Optional en gradebook-read.service.
- Web: /admin/configuracion.
- Bitácora: settings.update (changedFields) y settings.logo.update (sha256, sin nombre).
  5e RF-54:
- GET /me/calendar?from&to[&studentId] para STUDENT, TEACHER y GUARDIAN (ADMIN recibe 403); máximo 62 días; tope de 500 con truncated.
- Web: /calendario con FullCalendar 6.1.22 (daygrid y list). En pantallas de menos de 640 px abre en lista.
- Se agregó el grupo "Agenda" en nav.
  Archivos:
- API: settings/ (9 archivos + 5 specs) y notifications/calendar.* (+2 specs); test/settings.e2e-spec.ts (12) y test/calendar.e2e-spec.ts (8).
- Web: admin/configuracion/ y calendario/.
- Modificados (autorizados): gradebook-read.service.ts, app.module.ts, nav.ts, routes.ts, web package.json y lockfile.
  Comandos:
- API: lint 0, tsc 0, build ok, test 67/773, e2e completo 19/472.
- Web: lint 0, tsc ok, test 17/319, build ok.
- prettier ok.
  Hallazgos:
- [MEDIO] clamd no detecta EICAR detrás de una cabecera PNG; el 422 FILE_INFECTED se prueba con un spy.
- [BAJO] el 413 de multer viene en inglés.
- [BAJO] la URL del logo dura 10 min (que lo confirme seguridad).
- [BAJO] el calendario muestra la hora del navegador.
- [BAJO] la carpeta calendario/ y el módulo en notifications/ no están en la lista de carpetas.
  Pendientes:
- Mostrar el branding en el layout (Dev 1).
- WorkerModule debe importar LiteralScaleModule (5f).
- docs/02 y docs/03.
- Prueba en navegador real.

### Decisión del orquestador 5

qa-tester, seguridad-cumplimiento y ux-accesibilidad en paralelo sobre 5c+5e.

### INFORME 9 — ux-accesibilidad (5c + 5e)

Estado: CAMBIOS_PEDIDOS
ALTO:

1. settings-form add: falta mover el foco al campo Literal de la fila nueva.
2. Falta un role=status sr-only que anuncie "Tramo agregado/quitado, N tramos".
3. Zona horaria incoherente: el aria-label usa Lima y FullCalendar la hora local. Se pide timeZone="America/Lima" y el aviso visible "hora de Perú (Lima)".
   MEDIO:
4. err.bands sin id ni role=alert y sin aria-describedby en el fieldset.
5. El aria-live de cobertura habla en cada tecla: debounce o solo al cambiar de estado.
6. El color por defecto de los eventos de FullCalendar (#3788d8) da unos 3,9:1: usar tokens con 4,5:1 o más, modo oscuro y foco visible.
7. A 360 px se puede pasar a la cuadrícula mensual: ocultar el botón Mes cuando la pantalla es angosta y volver a la vista mensual al ensanchar.
8. title y aria-label duplicados en la vista de mes.
   BAJO 9-12: tabla con roles (opcional), explicar el botón "quitar" deshabilitado, "512 KB" y role=status en "Cargando calendario".

### INFORME 10 — seguridad-cumplimiento (5c + 5e)

Estado: APROBADO (sin CRÍTICO ni ALTO)
Verificado:

- Logo: multer en memoria con límites; el tipo se detecta por bytes; ClamAV antes de subir y falla cerrado; clave UUID; borrado transaccional.
- URL firmada de 10 min: ACEPTADA.
- Bitácora sin datos sensibles.
- Solo ADMIN en settings; el branding exige sesión.
- Calendario: pertenencia por rol; el apoderado solo ve a sus vinculados, sin compañeros y sin instrucciones; rango y tope.
- Server Actions conforme a D-037; sin XSS.
  Hallazgos:
- [MEDIO] logo-image.ts no exige IEND ni EOI y acepta bytes al final (políglota).
- [BAJO] nosniff en S3.
- [BAJO] img-src en la CSP global.
- [BAJO] @Throttle de 30/min en PUT /admin/settings.

### INFORME 11 — qa-tester (5c + 5e)

Estado: LISTO (sin bugs en producción)
Archivos de test:

- Nuevos: settings-logo.e2e-spec (7), settings.qa.spec (11) y calendar.qa.spec (7).
- Ampliados: settings.e2e (13), calendar.e2e (13), settings-form.test y calendar.test.
  Comandos: api test 69/791, e2e 20/485, web test 17/350; lint y tsc en 0. Cobertura: settings y calendar 91,75 %.
  Hallazgos (BAJO):

1. La rama NaN de calendar.dto.ts:26-27 es código muerto.
2. validRange de la web acepta hh:mm sin segundos y la API no.
3. El límite de 10/min del logo también cuenta los rechazos.

### Decisión del orquestador 6 (vuelta de corrección 1/2)

Se devuelven a dev5, en un solo mensaje:

- UX: ALTO 1-3 y MEDIO 4-8, más los BAJO 10 y 11.
- Seguridad: el MEDIO de IEND/EOI y el @Throttle de 30/min.
- QA: los BAJO 1 y 2.
  Después, una revisión corta de ux y luego el revisor.

### INFORME 12 — dev5-administracion (corrección 1/2)

Estado: LISTO. Se aplicaron las 13 correcciones.
Cambios principales:

- Foco y anuncio sr-only de los tramos.
- Zona horaria America/Lima con un plugin propio (NamedTimeZoneImpl, UTC-5) y aviso visible.
- err.bands con role=alert.
- Cobertura anunciada solo cuando cambia el estado.
- Colores --primary y --primary-foreground con outline de foco de 3 px.
- En pantalla angosta queda solo la vista de lista.
- Se quitó el title duplicado; se usa "512 KB".
- El logo debe terminar exactamente en IEND (PNG) o en FFD9 (JPEG).
- @Throttle de 30/min en PUT /admin/settings.
- Se quitó la rama NaN.
- validRange exige segundos.
  Comandos:
- api: lint 0, tsc 0, build ok, test 70/797.
- e2e settings, settings-logo y calendar: 33/33.
- web: lint 0, tsc ok, test 18/353, build ok.
- prettier ok.
  Hallazgos: [BAJO] no se valida el CRC de PNG.
  Pendientes: prueba manual en navegador; docs/03; branding en la cabecera (Dev 1).

### INFORME 13 — ux-accesibilidad (re-revisión 1/2)

Estado: APROBADO. Los contrastes de los eventos superan 12:1 en claro y en oscuro.
Queda un BAJO: el foco con --ring en modo claro da 2,6:1.

### Decisión del orquestador 7

El orquestador cambió outline-ring por outline-foreground en las líneas 60-63 de deadline-calendar.tsx, un cambio de una sola clase. Siguiente paso: revisor-pr de 5c+5e.

### INFORME 14 — revisor-pr (5c + 5e)

Estado: APROBADO
Comandos: install frozen ok. API: lint 0, tsc 0, test 70/797, build ok. Web: lint 0, tsc 0, test 18/353, build ok. Prettier ok.
Hallazgos (BAJO): anotar notifications/ y calendario/ en docs/AGENTES_IA.md; quedan nosniff e img-src para 5g.
Commits propuestos: feat(admin) RF-61 y feat(notifications) RF-54; files/ (Dev 3) aparte.
Pendientes: WorkerModule debe importar LiteralScaleModule (5f); branding en el layout (Dev 1); docs/02 y docs/03.

### Decisión del orquestador 8

- El usuario pidió "Commit y seguir". Se hicieron los commits c39a2c9 (stub files/) y 95fd504 (Dev 5, 5a-5e, con el reporte parcial) y se subieron a mio.
- Se lanzan en paralelo dos agentes dev5: 5d (RF-32 y RF-53) y 5g (RF-55/56, RF-62..67).
- Ambos agentes pueden tocar app.module.ts, worker.module.ts, nav.ts y routes.ts, solo con inserciones mínimas mediante Edit, y releyendo el archivo antes de cada cambio.
- RF-63: el ADMIN sí descarga el PERSONAL_DATA_EXPORT, porque atiende el pedido ARCO, con bitácora job.download (seguridad, hallazgo MEDIO 3).
- 5g crea la utilidad ZIP compartida en jobs/, que 5f va a reutilizar.
