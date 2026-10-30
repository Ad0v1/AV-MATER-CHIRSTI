# 10 — Índice de trazabilidad ERS → módulo → documentos

La correspondencia de RF y dev reproduce el **Plan de Trabajo**. Los detalles de RF/RN/RNF deben leerse en la ERS original.

| IDs de la ERS | Desarrollador según plan | Documentos maestros relacionados |
|---|---|---|
| RF-01..08 | Dev 1 | 01, 02 (`User`, `PolicyAcceptance`), 05, 06 |
| RF-09..17 | Dev 2 | 02 (`AcademicYear`, `AcademicPeriod`, `Section`, `CourseSection`) |
| RF-18..25 | Dev 2 | 02 (`User`, `Enrollment`, `GuardianStudent`), 05 |
| **RF-26..31** | **Dev 3** | **02 (`Material`, `Assignment`), 03, 04, 05, 09** |
| RF-32 | Dev 5 | 02 (`Announcement`), 03 |
| **RF-33..40** | **Dev 3** | **02 (`Submission`, `SubmissionVersion`, `StoredFile`), 03, 04, 05, 09** |
| RF-41..51 | Dev 4 | 02 (`Grade`), 03, 04, 09 |
| RF-52 | Dev 4 | 02 (`GuardianStudent`), 05 |
| RF-53..54 | Dev 5 | 02 (`Notification`), 03 |
| RF-55..63 | Dev 5 | 02 (`InstitutionSetting`), 05 |
| RF-64..67 | Dev 5 | 02 (`StoredFile` conserva metadatos, purga coordinada), 04 |
| RN-01..07 | Dev 4 con integración Dev 3 | 02, 04, 09 |
| RN-08..09 | Dev 3 | 02, 04, 09 |
| RN-10..15 | Transversal | 02, 04, 05, 09 |
| RNF-01..08 | Dev 1; **RNF-03 además Dev 3** | 01, 03, 05 |
| RNF-09..15 | Dev 1 / transversal | 05, 06 |
| RNF-16..19 | Transversal; **RNF-18 Dev 3** | 01, 03, 07, 09 |
| RNF-20..23 | Dev 1 + Dev 5 según tareas | 01, 07 |
| RNF-24..27 | Todos | 06, 09 |
| RNF-28..30 | Dev 1 / todos | 01, 06, 07 |
| RNF-31..32 | Dev 4 / QA de todos | 06, 09 |

**Nota de avance (RN-01..07):** motor de notas implementado como funciones puras en `packages/shared/src/grading/` (`grade-value.ts`, `average.ts`, `literal-scale.ts`, `errors.ts`), con 82 casos de prueba en `grade-value.spec.ts`, `average.spec.ts` y `literal-scale.spec.ts` (`pnpm --filter @aula/shared test`). Cubre RN-01 a RN-07 a nivel de motor; QA-008 (RN-06) y QA-020 (RN-03/04) tienen casos. Pendiente: esquema `Grade`, API y pantallas (RF-41..52), y el acuerdo de D-025 y D-026. Sin PR aún.

**Nota de avance (RF-09, 10, 12, 13, 14, 18, 20 y 24; PROPUESTA del 26/10/2026):** solo modelo de datos y seed. Esquema en `prisma/schema/academic.prisma` (años, períodos, secciones, cursos, `CourseSection` con docente opcional, matrículas y vínculos apoderado–estudiante). Migración `prisma/migrations/20261026174231_academic_estructura`, con 7 CHECK. Seed ficticio en `prisma/seed/` (`pnpm db:seed`, D-028). Test: `apps/api/test/academic-schema.e2e-spec.ts` (18 casos; corre con `pnpm --filter api test:e2e` contra la base local y se omite sin `DATABASE_URL`). Pendiente: API de matrículas y vínculos (F3), importación (F4) y pantallas (F5); el resto de RF-09..25 sigue sin avance. La API de años, períodos, secciones, cursos y contexto está en la nota siguiente. Sin commit ni PR; depende de D-021 y de D-027 a D-029.

**Nota de avance (RF-09, 10, 11, 12, 13, 14 y 17; API y servicio; PROPUESTA del 26/10/2026):** API REST en `apps/api/src/modules/academic/`: años (crear, editar, activar, cerrar; RF-09, RF-17), períodos (fechas, cierre y reapertura con motivo; RF-10, RF-11), secciones (RF-12), cursos y curso-sección con asignación de docente (RF-13, RF-14), `GET /course-sections/:id/context` y `GET /me/course-sections`. Incluye `AcademicAccessService` para Dev 3/4/5 y los eventos en proceso (D-031). Reglas: un solo año activo (RN-11), reapertura con motivo obligatorio (RN-10) y alcance de RN-12. Contrato en `03_CONTRATOS.md`, sección "API académica".

- Pruebas unitarias (`pnpm --filter api test`): `academic-policy.spec.ts`, `academic.mappers.spec.ts`, `academic-access.service.spec.ts`, `academic-events.spec.ts`, `zod-validation.pipe.spec.ts` y `academic-concurrency.spec.ts` (11 casos de concurrencia).
- Pruebas de integración (`pnpm --filter api test:e2e`): `apps/api/test/academic-api.e2e-spec.ts` (59 casos contra MySQL con el seed: 401/403 por controlador, contexto por rol y pertenencia, `/me/course-sections`, años, períodos, secciones, cursos, docentes, `isPeriodOpen`, bitácora y eventos). Sin `DATABASE_URL` se omiten.
- Pendiente: pantallas (fase 5); bitácora dentro de la transacción y códigos de error propios (Dev 1, D-019); decisiones D-030 (solo lectura) y D-031 (eventos en proceso); aceptación del dueño de Dev 2 y de D-021. Sin PR; no va al repo del equipo sin acuerdo.

**Nota de avance (RF-18, 19, 20, 22, 23, 24 y 25, y RN-13; API y servicio; PROPUESTA del 26/10/2026):** módulo `apps/api/src/modules/users/` (solo ADMIN, `ActiveActorGuard`): altas de estudiante con matrícula (RF-18), docentes (RF-19), apoderados con sus vínculos (RF-20), edición de nombre y correo (RF-22), estados con bitácora y cierre de matrículas al retirar (RF-23), matrícula de estudiante existente y rematrícula, traslado transaccional dentro del mismo año y grado (RF-24), y búsqueda paginada con filtros (RF-25). Vínculos revocables con marcador TRUE/NULL (RN-13, D-032). Contrato en `03_CONTRATOS.md`, sección "API de usuarios"; decisiones D-032 a D-034. Esquema en `prisma/schema/academic.prisma` (`GuardianStudent`), migración `20261026235821_guardian_student_revocable`, y corrección del CHECK de matrícula en `20261027000217_enrollment_iscurrent_check_fix`.

- Pruebas unitarias (`pnpm --filter api test`, 185 casos en el paquete según INFORME 7): `users-policy.spec.ts`, `users.dto.spec.ts`, `users.service.spec.ts`, `enrollments.service.spec.ts`, `guardian-links.service.spec.ts` y `active-actor.guard.spec.ts`; además, `academic-access.service.spec.ts` y `academic.mappers.spec.ts` para el filtro de vínculos y el deadlock.
- Pruebas de integración (`pnpm --filter api test:e2e`, 179 casos en total según INFORME 8): `apps/api/test/users-api.e2e-spec.ts` (86 casos según INFORME 6: 401 y 403 en las 14 rutas, filtros y paginación con el seed, historiales, altas, duplicados, traslados con fechas del servidor, estados, vínculos y revocación, PATCH, privacidad de bitácora y eventos, y concurrencia). `apps/api/test/academic-schema.e2e-spec.ts` añade casos de CHECK de `GuardianStudent` y de cierre de matrícula sin fecha ni motivo (con ROLLBACK).
- Pendiente: pantallas (fase 5, incluido el aviso sobre motivos de texto libre); importación (F4); RF-21 no está en esta fase; RF-08 (revocar sesiones, Dev 1); variable `INSTITUTION_EMAIL_DOMAIN` obligatoria en producción (Dev 1); D-013 (dominio del apoderado); finalidad y plazo de conservación de vínculos (institución, D-032). Las pruebas e2e y el seed necesitan MySQL local con Docker: verificar en local. Sin commit ni PR; no va al repo del equipo sin acuerdo (D-021, D-033).

**Nota de avance (RF-21, API y servicio; PROPUESTA del 27/10/2026):** importación masiva de estudiantes, docentes y apoderados desde CSV o XLSX, con plantillas, vista previa y confirmación todo o nada (SHA-256 del archivo, sin estado entre llamadas). Código en `apps/api/src/modules/users/import/`: `user-import.controller.ts`, `user-import.service.ts`, `import-validator.ts`, `import-template.ts`, `csv-parser.ts`, `xlsx-guard.ts`, `xlsx-xml.ts`, `xlsx-reader.ts`, `csv-escape.ts`, `import.constants.ts` y `uuid-v7.ts`. Cambios en piezas de F3: `users-audit.ts` (`entityType` y `entityId` opcionales), `users.dto.ts` (`fullNameSchema` rechaza nombres que empiezan por `= + - @`), `users.errors.ts` y `academic.dto.ts` (exporta `sectionCode`). Compartidos: `exceljs` 4.4.0 en `apps/api/package.json` y el `overrides` de `multer` y `body-parser` en `pnpm-workspace.yaml` (D-036). Sin cambios de esquema. Contrato en `03_CONTRATOS.md`, sección "Importación masiva (Dev 2, RF-21)"; decisión en D-035.

- Pruebas unitarias (`pnpm --filter api test`, 314 casos según INFORME 10): `csv-parser.spec.ts`, `xlsx-guard.spec.ts`, `xlsx-reader.spec.ts`, `import-validator.spec.ts` (los 21 códigos de fila), `csv-escape.spec.ts`, `uuid-v7.spec.ts`, `import-file.spec.ts`, `import-template.spec.ts`, `user-import.service.spec.ts` (con Prisma simulado) y `user-import.controller.spec.ts`.
- Pruebas de integración (`pnpm --filter api test:e2e`, 246 casos en total según INFORME 10): `apps/api/test/users-import.e2e-spec.ts` (401 y 403 en las 3 rutas; plantillas; preview y commit de los 3 tipos; los 21 códigos; límites de tamaño y de filas; archivos hostiles como ZIP bomba, macros, DOCTYPE y campo extra Unicode; 422 sin cambios; 409 por hash y por carrera; bitácora sin datos personales; 429 en una app propia).
- Verificación de seguridad: INFORME 9 (aprobado con 0 CRÍTICO y 0 ALTO tras las correcciones H1 a H12) e INFORME 10 (revisor).
- Pendiente: pantalla de carga (fase 5); prueba con `.xlsx` guardados por Excel y LibreOffice reales; aceptación del dueño de Dev 2, de D-021 y de D-035; decisión de Dev 1 sobre D-036 y la bitácora dentro de la transacción (D-019). Las pruebas de integración necesitan MySQL local con el seed: verificar en local con Docker. Sin commit ni PR; no va al repo del equipo sin acuerdo.

**Nota de avance (RF-09..14, RF-17..25; interfaz de F5; PROPUESTA del 29/10/2026):** pantallas de administración en `apps/web/app/(app)/admin/` sobre la API de F2–F4, con llamadas desde el servidor (D-037).

- Estructura (RF-09, 10, 11, 12, 13, 14 y 17; aprobada por `revisor-pr`, INFORME 9): `estructura/page.tsx` (años), `estructura/anios/nuevo/`, `estructura/anios/[anioId]/` (año, períodos y secciones), `estructura/anios/[anioId]/secciones/[seccionId]/` (curso-sección y docente) y `estructura/cursos/`.
- Usuarios (RF-18, 19, 20, 22, 23, 24, 25 y RN-13; aprobada por `revisor-pr`, INFORME 17): `usuarios/page.tsx` (lista, filtros, búsqueda y paginación), `usuarios/nuevo/{estudiante,docente,apoderado}/` y `usuarios/[id]/` (ficha: edición, estado, matrícula, traslado, apoderados y vínculos). Lo común está en `admin/_shared/`.
- Importación (RF-21; aprobada por `revisor-pr`, INFORME 24): `usuarios/importar/` (plantilla, vista previa y confirmación) y el Route Handler `usuarios/importar/archivo/[accion]/route.ts`.
- Pruebas: Vitest de lógica pura (`pnpm --filter web test`). Sin Playwright todavía.
- Pendiente: prueba manual en navegador (360 px, teclado y lector de pantalla); Playwright con axe; login real de Dev 1, que sustituye `dev-session` y `dev-role`; limitación de peticiones detrás del BFF (Dev 1); RF-15 y RF-16 (F6) fuera de esta fase. Sin commit ni PR; no va al repo del equipo sin acuerdo (D-037).

**Nota de avance (RF-15 y RF-16, RN-15; API, pantallas y pruebas; PROPUESTA del 29/10/2026, F6 de Dev 2):** clonar la estructura de un año en otro (RF-15) y promoción en bloque de estudiantes con propuesta, corrección y confirmación todo o nada (RF-16, RN-15, D-038).

- **RF-15 (clonar):** `POST /academic-years/:id/clone-structure` en `apps/api/src/modules/academic/` (`academic-clone.service.ts`, `academic-clone-policy.ts`, `academic-locks.ts`). Pantalla `apps/web/app/(app)/admin/estructura/anios/[anioId]/clonar/`, con `_components/clone-structure.tsx` y `_lib/clone.ts`.
- **RF-16 (promoción):** `GET /academic-years/:id/promotion-proposal` y `POST /academic-years/:id/promotion` en `apps/api/src/modules/users/promotion/` (`promotion-policy.ts`, `promotion.service.ts`, `promotion.controller.ts`, `promotion.dto.ts`). Pantalla `apps/web/app/(app)/admin/estructura/anios/[anioId]/promocion/`, con `_components/promotion-screen.tsx` y `_lib/promotion-machine.ts`.
- **Pruebas unitarias:** `academic-clone-policy.spec.ts`, `academic-clone-locks.spec.ts`, `promotion-policy.spec.ts` y `api-exception-413.spec.ts` (`pnpm --filter api test`); `clone.test.ts`, `promotion-machine.test.ts`, `promotion-a11y.test.ts` y `apps/web/lib/api/timeout.test.ts` (`pnpm --filter web test`).
- **Pruebas de integración:** `apps/api/test/academic-clone.e2e-spec.ts` (clonación, docentes, segundo clon 409, origen posterior 422, bitácora sin nombres) y `apps/api/test/users-promotion.e2e-spec.ts` (18 casos: propuesta, todo o nada, huella 409, tandas con `EXCLUDE`, `YEAR_END`, origen cerrado, paralelo, límite de 2000 decisiones, bitácora solo con ids).
- **Pendiente:** texto literal de RF-15 y RF-16 en la ERS sin confirmar; ¿los egresados pasan a `INACTIVE`? (por ahora no); revisión de Dev 1 del límite de cuerpo (512 KB) y del 413 en `app.setup.ts` y `api-exception.filter.ts`; JSON mal formado sigue en 500 (Dev 1); prueba manual en navegador. Las pruebas necesitan MySQL local con el seed: verificar en local con Docker. Sin commit ni PR; no va al repo del equipo sin acuerdo (D-038).

**Nota de avance (RF-26..31, RF-33..40, RNF-03 y RNF-18; API, pantallas y pruebas; PROPUESTA del 29/10/2026, Dev 3):** archivos con antivirus y almacenamiento privado, tareas, materiales, entregas y constancia. Contrato en `03_CONTRATOS.md`, sección "API de contenidos, archivos y entregas"; decisiones D-039 a D-047 en `08_DECISIONES.md`.

- Archivos y almacenamiento: `apps/api/src/modules/files/` (intent, complete y descarga; inspección del PDF y ClamAV detrás de `FileScanner`) y `apps/api/src/modules/storage/` (servicio de luchito, integrado sin duplicar).
- Tareas: `apps/api/src/modules/contents/assignments.*`. Materiales: `contents/materials.*` y `contents-guards.ts` (período y permisos).
- Entregas: `apps/api/src/modules/submissions/` (entrega, reentrega, historial, constancia y `SubmissionsReadService` para Dev 4).
- Pantallas: `apps/web/app/(app)/curso/[id]/clases/`, `lecturas/` y `tareas/` (con `_materials/`).
- Pruebas unitarias: `files.service.spec.ts`, `clamav.scanner.spec.ts`, `pdf-inspector.spec.ts`, `files-hardening.spec.ts`, `storage.service.spec.ts`, `storage.config.spec.ts`, `assignments.policy.spec.ts`, `materials.policy.spec.ts`, `contents-events.spec.ts`, `submissions.policy.spec.ts` (`pnpm --filter api test`) y `assignment-format.test.ts` (`pnpm --filter web test`).
- Pruebas de integración (`pnpm --filter api test:e2e`, con MySQL, MinIO y ClamAV locales): `apps/api/test/files.e2e-spec.ts`, `contents-assignments.e2e-spec.ts`, `contents-materials.e2e-spec.ts`, `submissions.e2e-spec.ts` y `db-test-guard.e2e-spec.ts`.

| RF | Estado | Dónde | Pruebas |
| --- | --- | --- | --- |
| RF-26 | Implementado (API y pantalla) | `contents/materials.*`, `_materials/` | `contents-materials.e2e-spec.ts` |
| RF-27 | Implementado; texto legal del aviso pendiente | `materials.policy.ts`, `isReusable` (solo API) | `contents-materials.e2e-spec.ts` |
| RF-28 | Implementado (API y pantalla de creación) | `contents/assignments.*`, `tareas/create-assignment-form.tsx` | `contents-assignments.e2e-spec.ts` |
| RF-29 | Implementado en API; edición en pantalla pendiente | `assignments.service.ts` (RN-10) | `contents-assignments.e2e-spec.ts` |
| RF-30 | Implementado en API (papelera de 30 días); sin pantalla | `materials.service.ts` (`restore`) | `contents-materials.e2e-spec.ts` |
| RF-31 | Implementado en API; descarga del PDF en pantalla pendiente | `files.service.ts` (`assertCanDownload`) | `files.e2e-spec.ts` |
| RF-33 | Implementado (API y pantalla del estudiante) | `submissions/`, `tareas/submit-form.tsx` | `submissions.e2e-spec.ts` |
| RF-34 | Implementado (cabecera, fin de archivo, cifrado y ClamAV) | `files/pdf-inspector.ts`, `clamav.scanner.ts` | `pdf-inspector.spec.ts`, `files.e2e-spec.ts` |
| RF-35 | Implementado (413 y borrado del objeto) | `files.service.ts` (`TOO_LARGE`) | `files-hardening.spec.ts`, `files.e2e-spec.ts` |
| RF-36 | Implementado (versiones inmutables, RN-09) | `submissions.service.ts`, triggers de `SubmissionVersion` | `submissions.e2e-spec.ts` |
| RF-37 | Implementado (tardía sin descuento, RN-06) | `submissions.policy.ts`, `display-status.ts` | `submissions.policy.spec.ts`, `submissions.e2e-spec.ts` |
| RF-38 | Parcial: `PENDING`, `SUBMITTED` y `SUBMITTED_LATE`; `GRADED`, `NOT_SUBMITTED` y `EXEMPT` dependen de Dev 4 | `display-status.ts` | `submissions.policy.spec.ts` |
| RF-39 | Implementado (constancia con referencia, fecha, archivo y estado) | `submissions.types.ts`, `tareas/receipt-view.tsx` | `submissions.e2e-spec.ts` |
| RF-40 | Implementado (ClamAV; un archivo infectado nunca se descarga) | `clamav.scanner.ts`, `files.service.ts` | `clamav.scanner.spec.ts`, `files.e2e-spec.ts` |
| RNF-03 | Implementado (bucket privado, claves UUID, cuarentena) | `storage/`, `files/` | `storage.service.spec.ts`, `files.e2e-spec.ts` |
| RNF-18 | Implementado (URL firmada de 60 s tras los permisos) | `storage.config.ts`, `files.service.ts` | `storage.config.spec.ts`, `files.e2e-spec.ts` |

- Pendiente: texto legal del aviso de copyright (RF-27); pantalla de descarga del PDF, edición y borrado de tareas, papelera y marca de reutilizable de materiales; estados GRADED, NOT_SUBMITTED y EXEMPT con Dev 4 (RF-38); prueba en navegador real y con lector de pantalla; ciclo de vida de `incoming/` y CORS de R2 (Dev 1); barrido de intents vencidos (Dev 5); bitácora dentro de la transacción (D-047, Dev 1). Verificar en local con Docker las pruebas e2e completas.

## Fuente original por tema

| Tema | Archivo y sección/página impresa |
|---|---|
| Alcance, roles, períodos | ERS §§1-2, pp. 2-3 |
| Auth, estructura académica | ERS §3.1-3.2, pp. 4-5 |
| Usuarios, contenidos | ERS §3.3-3.4, p. 5 |
| Entregas, calificación | ERS §3.5-3.6, pp. 6-7 |
| Reportes y ciclo de vida | ERS §§3.7-3.10, pp. 7-8 |
| RN, RNF y seguridad | ERS §§4-5, pp. 9-11 |
| Stack y asuntos por confirmar | ERS §§6-8, p. 12 |
| División de módulos | Plan §2, pp. 2-4 |
| Sprints | Plan §3, p. 5 |
| Git y DoD | Plan §§4-5, pp. 5-6 |
