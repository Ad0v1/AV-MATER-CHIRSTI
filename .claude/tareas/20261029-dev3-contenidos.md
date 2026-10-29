# Dev 3: contenidos, entregas y almacenamiento (RF-26..31, RF-33..40, RNF-03/18)

Pedido por el usuario: "avanza con lo del dev 3"
Flujo: completo
Vueltas de corrección: 0/2
Entorno: local con Docker (MySQL, Redis, MinIO, ClamAV healthy), rama `features/adolfo` en `aec68f4`; se sube solo a `mio`. `NODE_OPTIONS=--dns-result-order=ipv4first` y calentar MySQL (error 45028).

## Contexto

- Dev 3 es de Christian (`features/juica`, sin trabajo subido). Se hace con agentes solo en el repo privado; no va al equipo sin acuerdo.
- `origin/features/luchito` tiene el PR #3 ABIERTO "feat(storage): RNF-03 RNF-18 servicio de almacenamiento con URLs firmadas": `apps/api/src/modules/storage/` (README, config, constants, object-key.util, service con URLs firmadas, types, module, specs) y una dependencia nueva en `apps/api/package.json` (+ lockfile). Se debe reutilizar, no duplicar.
- `origin/develop` tiene el login real de David (Dev 1), aún no integrado en `features/adolfo`. No hace falta para la API de Dev 3; sí para las pantallas por rol.
- Dev 2 completo: `AcademicAccessService` (pertenencia docente/estudiante/apoderado a curso-sección), matrículas, CourseSection, D-029, D-030 (años de solo lectura), D-037 (BFF web).
- Dev 4 tiene el motor de notas en `packages/shared/src/grading/` y necesitará `Submission` para calificar; Dev 5 consumirá eventos de tareas y entregas (node:events, D-031).
- Pedido del usuario: máxima eficiencia con los agentes.

---

## Informes

### INFORME 1 — arquitecto-integrador

Estado: LISTO
Requisitos: RF-26..31, RF-33..40, RN-05, RN-06, RN-08, RN-09, RN-10, RN-12, RN-14, RNF-03, RNF-18
Resumen: dentro del alcance v1. Dueño dev3-contenidos; modelador-bd antes (5 entidades nuevas en `prisma/schema/contents.prisma` + relaciones inversas en auth.prisma y academic.prisma). 6 fases (3a..3f), priorizando entregas y su contrato de lectura (3d, destraba a Dev 4) y eventos (3c, 3d, para Dev 5). No pudo leer el PDF de la ERS (falta pdftoppm): RF-29/30/31 deducidos de docs/02, 09 y 10.
Hallazgos:

- [MEDIO] docs/02_MODELO_ENTIDADES.md:33 — `Assignment.neGrade` choca con `noSubmissionGrade` (docs/03:48, motor de Dev 4) → usar `noSubmissionGrade` y corregir docs/02.
- [MEDIO] docs/03 — falta `GET /assignments/:id/submissions` (lista del docente, la necesita Dev 4).
- [BAJO] .env.example:21-26 — faltan S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE, TTL y CLAMAV_HOST.

Decisiones:

1. RF de Dev 3: RF-26 clases PDF; RF-27 lecturas con aviso de copyright y reutilizable; RF-28 tarea (instrucciones, plazo, NE por defecto 0 RN-05, tamaño máx. 20 por defecto y tope 50 RN-08, tardías); RF-29 editar solo con período abierto (RN-10); RF-30 papelera 30 días; RF-31 ver/descargar solo miembros; RF-33 entrega PDF; RF-34 validar contenido real del PDF; RF-35 rechazar por tamaño; RF-36 reentrega con historial inmutable, la última limpia es la oficial (RN-09); RF-37 tardía solo si se permite, marcada sin descuento (RN-06); RF-38 seis estados visibles (docs/04, D-008); RF-39 constancia; RF-40 ClamAV, un infectado nunca se descarga; RNF-03/18 bucket privado, claves UUID, URL firmada corta tras permisos, subida directa a S3.
2. Modelo (`contents.prisma`, una migración, convenciones del proyecto): enums MaterialKind {CLASS, READING}, FilePurpose {MATERIAL, ASSIGNMENT_ATTACHMENT, SUBMISSION}, FileUploadStatus {PENDING, COMPLETED, EXPIRED}, FileScanStatus {PENDING, CLEAN, INFECTED, INVALID}, FileRejectReason {TOO_LARGE, NOT_PDF, ENCRYPTED_PDF, INFECTED, MISSING_OBJECT}.
   - StoredFile: id, objectKey VarChar(255) @unique (UUID del servidor, sin nombre original), purpose, courseSectionId FK, assignmentId? FK (obligatorio si SUBMISSION), uploadedById FK User, originalName VarChar(255) saneado, maxBytes Int, sizeBytes Int?, sha256 Char(64)?, uploadStatus, scanStatus, rejectReason?, intentExpiresAt, completedAt?, scannedAt?, purgedAt?, createdAt, updatedAt. CHECK StoredFile_size_chk (NULL o 1..52428800 y ≤ maxBytes), StoredFile_clean_chk (CLEAN exige COMPLETED, sizeBytes y sha256), StoredFile_purpose_chk (SUBMISSION exige assignmentId). Índices (uploadedById, uploadStatus), (scanStatus), (courseSectionId).
   - Material: id, courseSectionId FK, periodId? FK (D-010), kind, title VarChar(200), description Text?, fileId FK @unique, isReusable @default(false), deletedAt?, deletedById? FK User, createdById FK, createdAt, updatedAt. CHECK Material_deleted_chk (deletedAt y deletedById juntos). Índice (courseSectionId, kind, deletedAt).
   - Assignment: id, courseSectionId FK, periodId FK obligatorio, title VarChar(200), instructions Text, dueAt DateTime(3), maxSizeBytes Int @default(20971520), noSubmissionGrade Decimal(4,2) @default(0), allowLate @default(false), attachmentFileId? FK @unique, deletedAt?, createdById FK, createdAt, updatedAt. CHECK Assignment_maxSize_chk (1..52428800) y Assignment_neGrade_chk (0..20). Índice (courseSectionId, periodId, dueAt).
   - Submission: id, assignmentId FK, enrollmentId FK, createdAt, updatedAt; @@unique([assignmentId, enrollmentId]); índice (enrollmentId).
   - SubmissionVersion: id, submissionId FK, versionNumber SmallInt, fileId FK @unique (idempotencia), receivedAt DateTime(3), isLate, createdAt; @@unique([submissionId, versionNumber]); triggers BEFORE UPDATE/DELETE con SQLSTATE 45000 (inmutable, como AuditLog). La purga (Dev 5) borra el objeto y marca StoredFile.purgedAt.
   - Sin marcadores TRUE/NULL (la versión oficial es la de mayor versionNumber; solo se crean con archivo CLEAN).
   - Relaciones inversas: auth.prisma (User: uploadedFiles, createdMaterials, deletedMaterials, createdAssignments) y academic.prisma (CourseSection: materials, assignments, storedFiles; AcademicPeriod: materials, assignments; Enrollment: submissions). Solo campos de relación.
   - Constancia (RF-39) calculada desde SubmissionVersion + StoredFile.
3. Fases: 3a integrar storage de luchito + modelador-bd (contents.prisma, migración con CHECK y triggers) + registrar StorageModule, ContentsModule y SubmissionsModule vacíos en app.module (M). 3b flujo de archivos: intent → complete (HEAD ≤ maxBytes, magic %PDF-, %%EOF, sin /Encrypt, sha256 en stream, ClamAV INSTREAM por node:net detrás de FileScanner, rechazo borra el objeto) → download-url solo CLEAN tras pertenencia; `POST /files/upload-intents`, `POST /files/:id/complete`, `POST /files/:id/download-url` (M). 3c tareas con RN-10, RN-05/08, bitácora contents.assignment.\* y ContentsEventPublisher; `POST/GET /course-sections/:id/assignments`, `GET/PATCH/DELETE /assignments/:id` (M). 3d entregas: entregar, reentregar, tardías, historial, constancia, displayStatus parcial, lista del docente, SubmissionsReadService para Dev 4; `POST /assignments/:id/submissions`, `GET /assignments/:id/submissions/me`, `GET /submissions/:id/versions`, `GET /assignments/:id/submissions` (M). 3e materiales con papelera ≤ 30 días; `GET/POST /course-sections/:id/materials`, `PATCH/DELETE /materials/:id`, `POST /materials/:id/restore` (S-M). 3f pantallas `curso/[id]/{clases,lecturas,tareas}` con subida directa a MinIO (L). Orden: 3a → (3b ∥ 3c) → (3d ∥ 3e) → 3f.
   Contratos: intent `{purpose, courseSectionId, assignmentId?, fileName, sizeBytes, contentType:"application/pdf"}` → 201 `{fileId, uploadUrl, method, fields?, headers?, expiresAt, maxBytes}` (413, 409, 20/min); complete → 200 `{fileId, scanStatus:"CLEAN", sizeBytes, sha256}` (413, 415, 422 INFECTED, 503); entrega `{fileId}` → 201 `{submissionId, versionId, versionNumber, receivedAt, isLate, receipt}` (mismo fileId → 200); lista del docente `items[{enrollmentId, studentId, fullName, submissionId|null, latestVersion|null, versionCount}]`. ADMIN escribe con bitácora; GUARDIAN no ve materiales ni archivos.
4. Storage de luchito: integrarlo sin reimplementar (el arquitecto proponía cherry-pick; el usuario eligió merge). Revisar su API (PUT o POST firmado, TTL, clave, S3\_\*) al inicio de 3b. Compartidos con autorización: apps/api/package.json + lockfile, app.module.ts (una vez en 3a), auth.prisma (Dev 1), academic.prisma (Dev 2), prisma/migrations, .env.example, docker-compose.yml (solo si MinIO necesita CORS), CSP de la web (3f). Config S3/ClamAV local al módulo storage.
5. Eventos (node:events, D-031, después del commit y de la bitácora, sin datos personales): assignment.created.v1, assignment.updated.v1, submission.accepted.v1, submission.rejected.v1, material.published.v1. Contrato para Dev 4: SubmissionsReadService (getAssignmentForGrading, listSubmissionSummaries) y `computeDisplayStatus` puro en submissions/display-status.ts. Dev 3 nunca escribe en Grade.
6. Decisiones del usuario: (1) storage de luchito y compartidos; (2) receivedAt = hora del servidor en complete, escaneo síncrono detrás de FileScanner, período cerrado bloquea entregas; (3) MiB (20 MiB = 20971520, 50 MiB = 52428800); (4) Material.periodId opcional, TTL subida 5 min y descarga 60 s, apoderado sin materiales. Recomendación: sí a todo.
   Fuera: detección de duplicados, descuento por tardía, formatos no PDF, Drive/Classroom; calificación (Dev 4); anuncios, notificaciones, purga y modo soporte (Dev 5); worker de escaneo (Dev 5, después).
   Pendientes: comparar RF-29/30/31 con la ERS; docs/08 (decisiones 2–4 y eventos) y corregir neGrade en docs/02; verificar MinIO (bucket privado, CORS), ClamAV (EICAR) y la migración.
   Para: modelador-bd — fase 3a tras las decisiones del usuario.

### Decisión del orquestador 1 — integración de ramas

Pregunta al usuario sobre el storage de luchito; respuesta: "Merge de su rama (Recomendado)". Hecho:

- `9f2a99d` merge de origin/features/luchito (sin conflictos; trae apps/api/src/modules/storage/).
- `ee749b6` merge de origin/develop (login de David, 2FA, respaldos; la opción elegida incluía traerlo). Conflictos resueltos conservando ambos lados en app.module.ts, app.setup.ts (trustProxy + JSON_BODY_LIMIT), pnpm-workspace.yaml (overrides + argon2 en allowBuilds) y apps/api/package.json; lockfile regenerado. Choque de tipos S3Client (presigner 3.1159 vs client 3.1153) → SDK alineado a ^3.1159.0. createTestApp de develop usa una base falsa en memoria: se añadió `createDbTestApp` en apps/api/test/helpers.ts y se usa en academic-api, academic-clone y users-promotion. Sin cambios de migraciones (prisma migrate status: al día).
- Verificación: api lint ok, api test 39/423, api build ok, e2e 9/292, web lint ok, web test 13/275, web build ok, prettier ok.
- Sin push a mio todavía.

### Decisión del orquestador 2 — aprobaciones del usuario

El usuario respondió: reglas del plan "Sí, todas (Recomendado)" (decisiones 2–4: receivedAt al confirmar la subida, escaneo síncrono detrás de FileScanner, período cerrado bloquea entregas; MiB con 20 por defecto y tope 50; Material.periodId opcional, TTL 5 min subida y 60 s descarga, apoderado sin materiales) y archivos compartidos "Sí, autorizo (Recomendado)" (relaciones inversas en auth.prisma y academic.prisma, registro de 3 módulos en app.module.ts, variables S3/ClamAV en .env.example y CORS de MinIO en docker-compose.yml si hace falta; cambios mínimos marcados como pendientes de revisión por su dueño). Sigue modelador-bd con la fase 3a.

### INFORME 2 — modelador-bd (fase 3a)

Estado: LISTO
Resumen: prisma/schema/contents.prisma con 5 enums y 5 modelos según la Decisión 2; relaciones inversas en auth.prisma (User) y academic.prisma (AcademicPeriod, CourseSection, Enrollment) con comentario de autorización; migración 20261029224632_contents_base con 7 CHECK (size, clean, purpose, deleted, maxSize, neGrade y el extra SubmissionVersion_versionNumber_chk) y 2 triggers de inmutabilidad de SubmissionVersion; aplicada y probada con ROLLBACK (todos los rechazos y aceptaciones esperados, 0 filas tras el ROLLBACK).
Comandos: prisma validate/format ok; migrate dev ok; migrate status al día; db:generate ok; api build ok; api test 39/423; db:seed ok; prettier ok.
Hallazgos: [BAJO] StoredFile.originalName puede contener el nombre del alumno → sanear y no registrarlo en bitácora ni eventos (seguridad); [BAJO] docs/02:33 sigue con neGrade.
Decisiones: extras defensivos (CHECK versionNumber ≥ 1, @@index([assignmentId]) en StoredFile); nombres de relación: StoredFile.assignment/Assignment.submissionFiles, Assignment.attachmentFile/StoredFile.attachedToAssignment, StoredFile.material y StoredFile.submissionVersion (1:1), createdBy/deletedBy/uploadedBy.
Pendientes: revisión de los dueños de auth.prisma y academic.prisma; neGrade en docs/02; reglas de servicio (Assignment.periodId del mismo año que la CourseSection; StoredFile.assignmentId de la misma courseSectionId).
Para: dev3-contenidos.

### Decisión del orquestador 3 — módulos y paralelo

Para que 3b y 3c corran a la vez sin tocar el mismo archivo, el orquestador creó tres módulos vacíos (apps/api/src/modules/files/files.module.ts, contents/contents.module.ts y submissions/submissions.module.ts) y los registró en app.module.ts con un comentario de autorización del usuario (pendiente de revisión por Dev 1). StorageModule de luchito no se registra globalmente: lo importa FilesModule. api build ok. Se lanzan en paralelo dos dev3-contenidos: 3b (solo modules/files/ y modules/storage/) y 3c (solo modules/contents/ para tareas).

### INFORME 3 — dev3-contenidos (fase 3c, tareas)

Estado: LISTO
Requisitos: RF-28, RF-29, RN-05, RN-08, RN-10, RN-12, RN-14, D-007, D-031
Resumen: 5 rutas en contents/ (`POST/GET /course-sections/:id/assignments`, `GET/PATCH/DELETE /assignments/:id`); crean y editan docente asignado o ADMIN, leen docente, estudiante vigente y ADMIN, apoderado 403; RN-10 (período abierto y del mismo año), RN-05/08 con Zod estricto, adjunto validado, borrado lógico con 409 si hay entregas, bitácora sin textos libres, ContentsEventPublisher (assignment.created.v1, assignment.updated.v1) exportado.
Archivos: contents/{contents.module (importa AcademicModule; exporta ContentsEventPublisher y AssignmentsService), assignments.controller, assignments.service, assignments.dto, assignments.policy, contents-events, contents-audit, assignments.policy.spec, contents-events.spec}.ts; test/contents-assignments.e2e-spec.ts
Comandos: api lint 0; api test 43/473 (35 nuevos); api build ok; e2e contents-assignments 22/22 en dos corridas (0 filas residuales; trigger presente); prettier ok; db:seed ok. tsc --noEmit con errores ajenos (files/pdf-inspector.ts de la 3b y test/academic-schema.e2e-spec.ts por rootDir, preexistente). No corrió la suite e2e completa para no chocar con la 3b.
Hallazgos:

- [MEDIO] test/contents-assignments.e2e-spec.ts:~130 — para limpiar sus SubmissionVersion (inmutables), el e2e quita el trigger SubmissionVersion_no_delete, borra solo sus filas (prefijo `QA-3C `, claves `qa-3c/`) y lo repone en un finally, con un segundo cliente `useTextProtocol: true` (MySQL no admite DROP/CREATE TRIGGER preparado, error 1295); beforeAll repone el trigger si una corrida se cortó → revisar seguridad.
- [BAJO] PATCH no permite cambiar periodId (400).
- [BAJO] dueAt debe ser futuro al crear o cambiar (422); no se valida que caiga dentro del período.

Decisiones:

1. AssignmentView como docs/03 (noSubmissionGrade texto "0.00", fechas ISO UTC) + periodIsOpen, createdAt, updatedAt; periodId obligatorio al crear; noSubmissionGrade número o texto, guardado con 2 decimales.
2. Errores: período cerrado o año no activo 409; período de otro año 422; inexistente 404; adjunto inválido 422; adjunto ya usado 409; DELETE con versiones 409; tarea borrada 404; DELETE ok 204.
3. Bloqueos: AcademicPeriod FOR SHARE → Assignment FOR UPDATE (DELETE); adjunto StoredFile FOR UPDATE. La 3d debe tomar período FOR SHARE → Assignment FOR SHARE/UPDATE y comprobar deletedAt IS NULL.
4. Eventos sin títulos ni nombres: created `{assignmentId, courseSectionId, periodId, dueAt, allowLate, createdAt}`; updated con changedFields[] en orden fijo y updatedAt; material.published.v1 ya tipado para la 3e.
5. Bitácora contents.assignment.created/updated/deleted después del commit; en updated solo campos no texto y changedFields con nombres (title e instructions sin valor); recordContents reutilizable.
6. DELETE no publica evento; el adjunto queda enlazado.

Pendientes: docs/03 (GET lista, DELETE, assignment.updated.v1).
Para: orquestador — QA y seguridad revisen el manejo del trigger; la 3d respeta la Decisión 3; la 3e reutiliza ContentsEventPublisher y recordContents.

### Decisión del orquestador 4

Se reanuda al mismo agente de la 3c con la 3e (materiales, misma carpeta contents/) mientras la 3b sigue. El hallazgo del trigger en el e2e se lleva a seguridad y QA en la revisión conjunta de 3b+3c.

### INFORME 4 — dev3-contenidos (fase 3e, materiales)

Estado: LISTO
Requisitos: RF-26, RF-27, RF-29, RF-30, RF-31, RN-10, RN-12, RN-14, D-010, D-031
Resumen: GET/POST /course-sections/:id/materials, PATCH/DELETE /materials/:id (papelera) y POST /materials/:id/restore; lecturas con aviso de copyright e isReusable; escriben docente asignado o ADMIN con RN-10 si hay período; apoderado 403; papelera con ?includeDeleted=true solo docente/ADMIN; bitácora contents.material.* y evento material.published.v1. Extraídos a contents-guards.ts el bloqueo del período y el permiso de escritura (tareas sin cambio de conducta, e2e 22/22).
Archivos nuevos: contents/{materials.controller, materials.service, materials.dto, materials.policy, materials.policy.spec, contents-guards}.ts; test/contents-materials.e2e-spec.ts. Modificados: contents.module.ts, assignments.service.ts.
Comandos: api lint 0; api test 45/521; api build ok; e2e contents-materials 14/14 y con contents-assignments 36/36; prettier ok; db:seed ok (0 filas de prueba, triggers presentes, 5 períodos cerrados como el seed).
Hallazgos: [MEDIO] materials.policy.ts:15 — texto de READING_COPYRIGHT_NOTICE redactado por el agente; falta validación legal de la institución. [BAJO] includeDeleted muestra también los de más de 30 días (con restorableUntil); purga de Dev 5. [BAJO] restaurar un material con archivo purgado → 409.
Decisiones: (1) MaterialView {id, courseSectionId, periodId|null, kind, title, description|null, fileId, isReusable, copyrightNotice|null, deletedAt|null, restorableUntil|null, createdAt, updatedAt}; (2) isReusable solo READING (POST 400, PATCH 422); PATCH solo title/description/isReusable; (3) errores: archivo inválido 422, ya publicado 409, período cerrado 409, borrado 404, restore fuera de papelera o > 30 días 409 (el día 30 aún se puede), DELETE 204, restore 200; (4) orden de bloqueos: AcademicPeriod FOR SHARE → Assignment/Material FOR UPDATE → StoredFile FOR UPDATE (la 3d debe respetarlo); (5) bitácora created/updated/deleted/restored sin textos; (6) includeDeleted: estudiante y docente ajeno 403.
Pendientes: docs/03; validación legal del aviso; suite e2e completa (no se corrió por la 3b en paralelo).

### Decisión del orquestador 5 — más paralelo

El agente de 3c/3e queda libre y conserva el contexto de contents-guards y del orden de bloqueos, así que hace la 3d (entregas, carpeta submissions/) ahora, en paralelo con la 3b que sigue en files/. A la vez, qa-tester y seguridad-cumplimiento revisan 3c+3e (solo lectura en seguridad; QA solo tests de contents/).

### INFORME 5 — dev3-contenidos (fase 3b, archivos)

Estado: LISTO
Requisitos: RF-31, RF-33, RF-34, RF-35, RF-37 (plazo en la subida), RF-40, RNF-03, RNF-18
Resumen: `POST /files/upload-intents`, `POST /files/:id/complete` y `POST /files/:id/download-url` en modules/files/. Subida directa a MinIO con PUT firmado (5 min); complete valida HEAD ≤ maxBytes → stream con sha256, `%PDF-`, `%%EOF` y sin `/Encrypt` → ClamAV INSTREAM por node:net detrás de FileScanner; si rechaza, borra el objeto y deja INVALID o INFECTED. Descarga solo CLEAN tras permisos (60 s). Storage de luchito: PUT firmado, TTL 300 s, claves `{scope}/{año}/{mes}/{uuid}.pdf`, S3_ACCESS_KEY/S3_SECRET_KEY con respaldo MINIO_ROOT_*; cambios solo aditivos. e2e reales con MinIO y ClamAV: QA-005, 006, 011 y 012.
Archivos: nuevos files/{files.controller, files.service, files.dto, files-audit, files-events, file-scanner, clamav.scanner, clamav.config, pdf-inspector}.ts + specs (files.service, clamav.scanner, pdf-inspector) y test/files.e2e-spec.ts; modificados files.module.ts, storage/{storage.service, storage.config, storage.constants, object-key.util, storage.types, storage.service.spec, storage.config.spec}.ts y .env.example. Sin tocar contents/, app.module.ts ni docker-compose.yml.
Comandos: api lint ok; api test 45/521; api build ok; e2e files + app 20/20 con MySQL, MinIO y ClamAV reales; prettier ok; format:check global falla solo por .agents/; db:seed ok.
Hallazgos:

- [ALTO, corregido] TOCTOU: la URL PUT sigue válida 5 min y se podría resubir otro contenido tras el escaneo. Corrección: el intent apunta a la cuarentena `incoming/` (nuevo scope); lectura y escaneo con If-Match del ETag del HEAD; si queda CLEAN se copia con CopySourceIfMatch al destino (submissions/, materials/, assignments/) y se borra la cuarentena.
- [MEDIO] huérfanos en `incoming/` → regla de ciclo de vida del bucket a 24 h (Dev 1, infraestructura/R2).
- [BAJO] CORS de MinIO no hizo falta en local (preflight 204); en R2 hay que configurarlo (3f / Dev 1).
- [BAJO] S3_ENDPOINT=http://127.0.0.1:9000 en .env.example; en producción debe ser el endpoint público.

Decisiones:

1. intent → 201 `{fileId, uploadUrl, method:'PUT', headers, expiresAt, maxBytes}` (20/min); complete → 200 `{fileId, scanStatus:'CLEAN', sizeBytes, sha256, completedAt}` (completedAt = hora del servidor al empezar complete = receivedAt de la 3d); download-url → 200 `{url, method:'GET', expiresAt}` con `{inline?}` opcional.
2. Errores: 413 FILE_TOO_LARGE; 415 INVALID_PDF/ENCRYPTED_PDF; 422 FILE_INFECTED; 503 ANTIVIRUS_UNAVAILABLE/STORAGE_UNAVAILABLE (queda PENDING, reintentable); 409 DEADLINE_PASSED, UPLOAD_NOT_FOUND, UPLOAD_EXPIRED, OBJECT_CHANGED; 404 si confirma otro usuario. complete idempotente.
3. Permisos: MATERIAL/ASSIGNMENT_ATTACHMENT docente asignado o ADMIN, tope 50 MiB, sin assignmentId; SUBMISSION solo STUDENT (ADMIN 403), con assignmentId, misma sección, no borrada, período abierto y plazo o allowLate, revalidado en complete (si falla, EXPIRED y borra el objeto). Descarga: solo CLEAN y no purgado; GUARDIAN 403; SUBMISSION para el dueño ACTIVE, docente asignado o ADMIN; material o adjunto publicado para cualquier miembro (papelera: estudiante 404); sin publicar solo quien subió o ADMIN.
4. Bitácora files.upload-intent.created, .upload.accepted, .upload.rejected, .upload.expired, .download-url.issued, solo con ids, propósito, tamaños, sha256 y motivo; nunca originalName ni firma del antivirus (la firma solo al log warn con el fileId).
5. Evento submission.rejected.v1 `{uploadId, assignmentId, courseSectionId, studentId, reason, rejectedAt}` (FilesEventPublisher exportado).
6. Storage: nuevos headObject, openObjectStream(key, etag), copyObject(src, dst, etag); TTL de descarga 60 s; acepta también S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY. FilesModule reexporta StorageModule y FileScanner.

Pendientes: ciclo de vida de `incoming/` y CORS en R2 (Dev 1); revisión de .env.example (Dev 1) y del storage (luchito); barrido de intents vencidos (Dev 5); la 3d acepta solo SUBMISSION CLEAN del mismo uploadedById y assignmentId y usa completedAt como receivedAt.

### Decisión del orquestador 6

Se lanzan en paralelo qa-tester y seguridad-cumplimiento sobre la 3b (files/ y storage/), mientras la 3d avanza en submissions/ y siguen las revisiones de 3c+3e. Se avisa al agente de la 3d de las condiciones del INFORME 5 (completedAt como receivedAt; solo SUBMISSION CLEAN del mismo estudiante y tarea).

### INFORME 6 — seguridad-cumplimiento (fases 3c y 3e)

Estado: APROBADO (0 CRÍTICO, 0 ALTO; 1 MEDIO y 2 BAJO sin bloquear)
Verificado: @Roles de clase sin GUARDIAN (assignments.controller.ts:29, materials.controller.ts:30); assertCanWriteCourseSection (contents-guards.ts:30-40) y assertCanAccessCourseSection; papelera solo docente/ADMIN (materials.service.ts:144-147); Zod estricto; transacciones con lockOpenPeriod y orden Period → Assignment/Material → StoredFile (contents-guards.ts:12); DELETE de tarea cuenta versiones dentro de la transacción (assignments.service.ts:244-257); updates condicionales; P2002 → 409; assertAttachmentUsable y assertFileUsable exigen propósito, misma sección, CLEAN, no purgado y no usado (422 único); bitácora y eventos sin textos libres; aviso de copyright fijo y adecuado (pendiente de validación legal).
Hallazgos:

1. MEDIO — test/contents-assignments.e2e-spec.ts:36, :124-163 — DROP/CREATE TRIGGER sin guarda de BD (solo skipIf sin DATABASE_URL): contra staging/producción quitaría la inmutabilidad (RN-14), con una ventana entre :141 y :147. Corrección preferida: no tocar el trigger (dejar las versiones de prueba con prefijo o BD de tests dedicada); mínimo: guarda que exija host local o BD _test/_dev, E2E_ALLOW_TRIGGER_DDL=1 y NODE_ENV distinto de production, con SELECT DATABASE().
2. BAJO — materials.service.ts:169-171, 202-204, 226-228 y assignments.service.ts:182-183, 238-239 — 404 vs 403 permite enumerar ids (UUID) → opcional devolver 404 sin permiso.
3. BAJO — materials.service.ts:240-244 — restore no bloquea StoredFile al comprobar purgedAt → FOR UPDATE como en assertFileUsable (nota para la purga de Dev 5).
   Sin datos de menores, secretos ni SQL sin parámetros.

### INFORME 7 — seguridad-cumplimiento (fase 3b)

Estado: APROBADO (sin CRÍTICO ni ALTO; 3 MEDIO y 4 BAJO)
Verificado: permisos de intent y complete (files.service.ts:146, 152, 449-504; controller sin GUARDIAN :20); descarga (apoderado 403 :418, solo CLEAN no purgado :390); cuarentena con If-Match y CopySourceIfMatch (storage.service.ts:206-235, 409 OBJECT_CHANGED); KEY_PATTERN sin nombre original (object-key.util.ts:5); originalName saneado (:110) y fuera de bitácora, eventos y logs; TTL 300/60 s con content-type y content-length firmados; .env.example sin secretos reales; submission.rejected.v1 con studentId opaco aceptable (D-034, docs/03).
Hallazgos:

- [MEDIO] clamav.scanner.ts:17-18, files.service.ts:274-281 — "INSTREAM size limit exceeded" → 503 siempre para PDF de 25-50 MB (StreamMaxLength por defecto 25 MB) → código propio o StreamMaxLength >= 50M en clamd (Docker, Dev 1).
- [MEDIO] files.controller.ts:26 — throttle 20/min por IP: un salón tras el mismo NAT comparte cupo → tracker por usuario o límite mayor para STUDENT.
- [MEDIO] files.controller.ts:34-41 — complete sin throttle propio (lee hasta 50 MB por llamada) → @Throttle moderado (30/min por usuario).
- [BAJO] storage.service.ts:198-210 — sin ETag del HEAD se pierde If-Match → 503.
- [BAJO] pdf-inspector.ts:67-75 — no bloquea /JavaScript, /Launch, /EmbeddedFile (se confía en ClamAV); opcional.
- [BAJO] clamav.scanner.ts:59-61 — timeout por inactividad, no total; opcional.
- [BAJO] files.service.ts:213 — log warn con file.id y firma del virus (aceptable).
  Pendientes: probar StreamMaxLength con un PDF de 30-50 MB y la respuesta 412 de MinIO.

### Decisión del orquestador 7 — correcciones de 3b

Se reanuda al agente de la 3b con los 3 MEDIO y el BAJO del ETag en un solo mensaje. StreamMaxLength de clamd va en docker-compose.yml (compartido, autorizado por el usuario en la Decisión 2).

### INFORME 8 — qa-tester (fases 3c y 3e)

Estado: LISTO (sin bugs; 12 casos nuevos pasan a la primera)
Archivos (solo tests): test/contents-assignments.e2e-spec.ts (+6: maxSizeBytes en 52428800/52428801/0; noSubmissionGrade "20.001", "20.01", "-0.01" rechazados y "20.00", "0" aceptados; PATCH/DELETE de docente ajeno 403 sin bitácora ni eventos; adjunto de otra sección 422; período de 2025 400/422; privacidad de bitácora y eventos) y test/contents-materials.e2e-spec.ts (+6: restore a 30 días menos 10 min 200 y más 10 min 409; docente ajeno y apoderado 403; archivo purgado 409; período cerrado 409; periodId de otro año 422 e inexistente 404; privacidad).
Comandos: api test 45/521; e2e contents-* 48/48 en varias corridas; lint sin avisos; prettier ok; db:seed ok. No se corrió la suite e2e completa.
Nota: el e2e de tareas sigue tocando el trigger (MEDIO del INFORME 6, en corrección dentro de la 3d).

### INFORME 9 — dev3-contenidos (correcciones de seguridad de la 3b)

Estado: LISTO
Cambios: docker-compose.yml:60-64 CLAMD_CONF_StreamMaxLength 64M (verificado en el contenedor; comentario de autorización); file-scanner.ts:10 variante TOO_LARGE; clamav.scanner.ts:17-18 "INSTREAM size limit exceeded" → TOO_LARGE; files.service.ts:196-204 HEAD sin ETag → 503 STORAGE_UNAVAILABLE sin cambiar estado; :222-229 TOO_LARGE → 413 FILE_TOO_LARGE, borra el objeto, INVALID/TOO_LARGE y submission.rejected.v1; files-throttle.ts nuevo (trackByUser user:<id> o IP; UPLOAD_INTENT 20/min y COMPLETE 30/min con getTracker por ruta, sin tocar el guard global); files.controller.ts:27, :36 @Throttle; files-hardening.spec.ts nuevo (5 tests).
Comandos: api lint ok; api test 547/548 (falla clamav.scanner.spec.ts:119, test de QA que espera el comportamiento viejo); api build ok; e2e files 25/25; prettier ok; clamav reiniciado y healthy; escaneo real 30 MiB CLEAN en 6,0 s y 50 MiB CLEAN en 7,1 s.
Hallazgo: [MEDIO] clamav.scanner.spec.ts:119 espera ScannerUnavailableError → QA lo cambia a `{ status: "TOO_LARGE" }` o lo borra.
Pendientes: revisión de Dev 1 de docker-compose.yml.

### INFORME 10 — qa-tester (fase 3b)

Estado: LISTO (sin bugs)
Comandos: api test 47/558; e2e files 25/25 dos veces tras las correcciones; db:seed ok; prettier en los specs (eslint no disponible con pnpm exec; la API usa oxlint).
Tests añadidos: pdf-inspector.spec.ts (+5: maxBytes+1, /Encrypt sin %EOF, %EOF fuera de los últimos 1024 bytes, trozos de 1 byte); files.service.spec.ts (bloque "complete: casos límite" y descargas: papelera, otra sección, apoderado, estudiante no activo, ADMIN); test/files.e2e-spec.ts (+8: sin %EOF 415, 2048/2049 bytes, re-PUT tras y antes de complete, allowLate vencida, tarea que vence entre intent y complete 409 DEADLINE_PASSED, INFECTED sin descarga, material sin publicar/publicado/otra sección/apoderado/papelera; afterAll borra los Material); clamav.scanner.spec.ts:119 ajustado a TOO_LARGE.
Notas: OBJECT_CHANGED real (412) solo con mocks; clamd caído y 503 por ETag faltante no cubiertos en e2e (Docker compartido); throttle por usuario no probado con el throttler activo.
Pendientes: barrido de intents vencidos (Dev 5) y ciclo de vida de incoming/ (Dev 1).
