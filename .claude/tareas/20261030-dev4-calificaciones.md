# Dev 4: calificaciones y apoderados (RF-41..52, RN-01..07, RNF-31)

Pedido por el usuario: "avanzamos con las tareas del dev 4"
Flujo: completo
Vueltas de corrección: 0/2
Entorno: local con Docker, rama `features/adolfo` en `8a0f578`; se sube a `mio`. Dev 4 es del usuario: su trabajo sí puede ir al equipo, en rama limpia sin `.claude/` (docs/FLUJO_LOCAL_GITHUB_NUBE.md). `NODE_OPTIONS=--dns-result-order=ipv4first` y calentar MySQL (error 45028).

## Contexto

- Motor de notas ya hecho: `packages/shared/src/grading/` (decimal.js, RN-01..07, tests). Expedientes `20261026-motor-notas*.md`.
- Dev 2 completo: `AcademicAccessService` (pertenencia docente/estudiante/apoderado), matrículas, `GuardianStudent` revocable (RN-13), períodos con cierre (RN-10), D-030.
- Dev 3 completo: tareas (`Assignment.noSubmissionGrade`), entregas (`Submission`, `SubmissionVersion`), `SubmissionsReadService` (getAssignmentForGrading, listSubmissionSummaries) y `computeDisplayStatus({latestVersion, gradeState: 'GRADED'|'NE'|'EXEMPT'|null, dueAt, allowLate, now})` en `apps/api/src/modules/submissions/`; descarga firmada de PDF `POST /files/:id/download-url` (con `inline`); eventos `submission.accepted.v1` y otros (D-031). Expediente `20261029-dev3-contenidos.md`.
- Web: BFF D-037 (`apps/web/lib/api`), sesión por `requireUser()` en `apps/web/lib/session`, pantallas de curso en `apps/web/app/(app)/curso/[id]/` (tareas ya existe), placeholders en `curso/[id]/registro`, `mis-notas` y `apoderado`.
- Carpetas de Dev 4 (docs/FLUJO): `packages/shared/src/grading`, `apps/api/src/modules/grading`, `apps/web/app/(app)/curso/[id]/registro`, `apps/web/app/(app)/mis-notas`, `apps/web/app/(app)/apoderado`.
- Pedido del usuario: máxima eficiencia con los agentes y con los tokens.

---

## Informes

### INFORME 1 — arquitecto-integrador

Estado: LISTO
Requisitos: RF-41..52, RN-01..07, RNF-31 (también RN-10, RN-12, RN-14, RNF-14, RNF-19, RNF-24)
Resumen: dentro del alcance v1 (ERS §3.6–3.7). Motor puro hecho; Dev 2 y Dev 3 dan pertenencia, períodos cerrados, getAssignmentForGrading, listSubmissionSummaries, computeDisplayStatus y descarga inline. Falta Grade, API grading y 3 pantallas. 3 fases (4a BD + motor, 4b API, 4c web), una migración y cambios mínimos fuera de las carpetas de Dev 4 (2 relaciones inversas y 1 línea en app.module), sin dependencias nuevas.
Hallazgos: [MEDIO] submissions.service.ts:143,224 pasa gradeState null (Dev 3 muestra 3 de 6 estados; coordinar con su dueño). [MEDIO] no usar createMany({skipDuplicates}) para NE (INSERT IGNORE convierte CHECK en avisos): transacción leer-insertar y P2002. [BAJO] que la matrícula sea de la sección de la tarea lo valida el servicio.
Decisiones:

1. RF/RN: RF-41 nota 0..20; RF-42 comentario; RF-43 visor PDF; RF-44 NE automática; RF-45 NE editable con período abierto y reemplazo por tardía; RF-46 exoneración con motivo; RF-47 registro auxiliar; RF-48 promedio simple con literal; RF-49 dashboard; RF-50 bloqueo con período cerrado; RF-51 Mis notas; RF-52 apoderado solo lectura; RNF-31 cobertura ≥ 90 % y e2e de calificar.
2. Modelo `prisma/schema/grading.prisma`: enums GradeState {GRADED, NE, EXEMPT} y GradeSource {MANUAL, AUTO}; Grade {id uuid(7), assignmentId, enrollmentId, state, value Decimal(4,2)? (null solo EXEMPT), comment Text?, exemptionReason VarChar(500)?, source @default(MANUAL), gradedAt DateTime(3), createdAt, updatedAt; FK Restrict a Assignment y Enrollment; @@unique([assignmentId, enrollmentId]); @@index([enrollmentId])}. CHECK Grade_value_chk (null o 0..20), Grade_state_chk (GRADED/NE con value y sin motivo; EXEMPT sin value y con motivo; IS NOT NULL explícito), Grade_source_chk (AUTO solo NE). Sin marcadores, sin triggers, sin DELETE (RN-14), sin FK a User (D-032). Cierre por AcademicPeriod.closedAt; tabla literal por defecto detrás de un proveedor (RF-61 de Dev 5). Relaciones inversas: `grades Grade[]` en Assignment (contents.prisma) y Enrollment (academic.prisma).
3. Fases: 4a modelador-bd (grading.prisma, migración grading_base con 3 CHECK) en paralelo con dev4 en packages/shared/src/grading (resolveEffectiveEntry, isNeEligible, buildGradebook, gradeInputSchema; cobertura ≥ 90 %) (M). 4b apps/api/src/modules/grading (GradesService PUT, NeMaterializer, GradebookReadService exportado, GradingEventPublisher, suscripción a period.closed.v1; bitácora grading.grade.create/update y grading.grade.auto_ne; e2e grading.e2e-spec.ts) (L). 4c web (L).
   Endpoints: PUT /grades/:assignmentId/:enrollmentId (TEACHER asignado o ADMIN; cuerpo discriminado por state; 200 GradeView; 409 período/año cerrado; 422 NO_SUBMISSION, HAS_SUBMISSION, NOT_OVERDUE, matrícula de otra sección); GET /assignments/:id/grade-summary; GET /course-sections/:id/gradebook?periodId= (con dashboard); GET /me/grades?academicYearId= (sin exemptionReason); GET /guardian/students; GET /guardian/students/:studentId/grades. Reglas de lectura: filas vigentes + cerradas con nota o entrega; NE elegible si la matrícula estaba vigente en dueAt; needsRegrade = NE con versión tardía.
   Pantallas: curso/[id]/registro (matriz y dashboard), curso/[id]/registro/tarea/[assignmentId] (entregas, visor PDF, formulario), mis-notas, apoderado.
4. Compartidos: grading.prisma (nuevo, Dev 4); +1 línea en contents.prisma (Dev 3) y academic.prisma (Dev 2); migración; GradingModule vacío registrado por el orquestador en app.module.ts. Sin cambios en package.json, shared/index.ts ni submissions/.
5. Eventos: emite grade.updated.v1 (solo ids); consume period.closed.v1. Para Dev 5: notificación RF-53, job del worker de NE, tabla literal RF-61, reportes desde GradebookReadService, anuncios del apoderado.
6. Decisiones del arquitecto: A1 GRADED exige entrega, NE manual sin entrega y vencida, EXEMPT con período abierto; A2 NE virtual al leer; A3 NE AUTO se resincroniza con noSubmissionGrade mientras el período esté abierto; A4 "05" → "5.00"; A5 dashboard en registro, riesgo = literal C; A6 promedios al leer. Para el usuario: U1 NE como fila AUTO (recomendado) o solo virtual; U2 motivo de exoneración en Grade, visible solo para docente y ADMIN, nunca en bitácora; U3 bitácora con {state, value, source} antes/después (recomendado); U4 visor PDF por iframe (recomendado) o react-pdf.
   Fuera: promedio anual (D-014), ponderación, exportaciones (Dev 5), notificaciones, gradeState en pantallas de Dev 3, concurrencia optimista.
   Para: modelador-bd (4a) tras autorizaciones; dev4 en paralelo en shared/grading.

### Decisión del orquestador 1 — aprobaciones y arranque

El usuario aprobó U1–U4 ("Sí, todas (Recomendado)": NE AUTO como fila Grade; motivo de exoneración solo para docente y ADMIN y nunca en la bitácora; bitácora con {state, value, source} antes y después; visor PDF por iframe) y los compartidos ("Sí, autorizo (Recomendado)": +1 línea en contents.prisma y academic.prisma, registro en app.module). El orquestador registró GradingModule vacío en app.module.ts. En paralelo: modelador-bd (grading.prisma y migración) y dev4-calificaciones (parte pura de 4a en packages/shared/src/grading).

### INFORME 2 — modelador-bd (fase 4a)

Estado: LISTO
Resumen: prisma/schema/grading.prisma con GradeState, GradeSource y Grade según la Decisión 2 (FK Restrict, @@unique([assignmentId, enrollmentId]), @@index([enrollmentId]), sin FK a User); `grades Grade[]` en Assignment y Enrollment con comentario de autorización; migración 20261030020801_grading_base con Grade_value_chk, Grade_state_chk y Grade_source_chk, aplicada. Probados en ROLLBACK (FOREIGN_KEY_CHECKS=0 solo en esa sesión): 5 válidos aceptados y 12 indebidos rechazados (3819 y 1062); 0 filas tras el ROLLBACK.
Comandos: prisma format ok; db:migrate ok; migrate status al día; db:generate ok; db:seed ok; prettier ok; api build ok; api test 47/571.
Hallazgos: [BAJO] comment y exemptionReason son datos de menores (U2; revisar en 4b); [BAJO] el CHECK acepta exemptionReason vacío → la API exige texto recortado no vacío.
Para: dev4-calificaciones (4b): prisma.grade, enums, clave única assignmentId_enrollmentId; gradedAt lo pone el servicio; no usar createMany({skipDuplicates}).

### INFORME 3 — dev4-calificaciones (4a, parte pura)

Estado: LISTO
Resumen: en packages/shared/src/grading, reutilizando el motor: resolveEffectiveEntry (NE virtual, A2), isNeEligible, buildGradebook (+ summarizeAverage, riskLiteralOf) y normalizeGradeInput. shared no tiene zod: gradeInputSchema pasa a la API envolviendo normalizeGradeInput. 124 tests (6 archivos), cobertura 100 %.
Archivos: effective-entry.ts (+spec), gradebook.ts (+spec), grade-input.ts (+spec), errors.ts (INVALID_INPUT), grading/index.ts.
Comandos: shared test 124/124; lint (tsc) ok; build ok; cobertura v8 100 %; prettier ok.
Decisiones: (1) resolveEffectiveEntry → {state, value, virtual, needsRegrade}; la Grade guardada manda; NE virtual sin Grade, sin entrega, now > dueAt estricto y matrícula elegible. (2) isNeEligible con [effectiveFrom, effectiveTo). (3) buildGradebook → rows, columns y dashboard (distribución, noGrades, counts onTime/late/ne, riskLiteral = tramo que contiene 0, atRisk); INVALID_INPUT ante datos inconsistentes. (4) normalizeGradeInput → {ok, data|issues}; GRADED value obligatorio; NE value opcional (null = noSubmissionGrade); EXEMPT motivo recortado 10..500 y sin value; comment ≤ 2000 en los tres estados; "05" → "5.00". (5) La API pasa Decimal como string y now desde el servicio.
Hallazgo: [MEDIO] sin zod en shared → gradeInputSchema en la API (recomendado).

### Decisión del orquestador 2

gradeInputSchema va en la API (apps/api/src/modules/grading) envolviendo normalizeGradeInput; no se añade zod a shared (evita tocar package.json y el lockfile). Se reanuda al mismo dev4 con la 4b. Se omite QA aparte de la 4a: cobertura 100 % y la revisará el revisor.

### INFORME 4 — dev4-calificaciones (4b, BLOQUEADO)

Estado: BLOQUEADO — apps/api/package.json no declara @aula/shared; la API no puede importar el motor (rootDir impide la ruta relativa; copiarlo iría contra docs/03). Pide `"@aula/shared": "workspace:*"` y pnpm install. Diseño de la 4b ya decidido (orden de comprobaciones del PUT, NeMaterializer por transacción leer→insertar con reintento, lecturas, evento grade.updated.v1 con {gradeId, assignmentId, enrollmentId, courseSectionId, gradeStatus, source, updatedAt}).

### Decisión del orquestador 3

Pregunta al usuario; respuesta: "Sí, autorizo (Recomendado)". El orquestador añadió `@aula/shared: workspace:*` a apps/api/package.json con pnpm (actualiza pnpm-lock.yaml; sin dependencias externas) y reanudó al mismo dev4 con la 4b.

### INFORME 5 — dev4-calificaciones (4b, API)

Estado: LISTO
Requisitos: RF-41, 42, 44..52; RN-01..07, RN-10, RN-12, RN-14; RNF-31 (U1–U3, A1–A6)
Resumen: @aula/shared importa bien desde la API (Vitest, tsc, nest build y Node ESM). 6 endpoints; GradesService con reglas A1, 409 con período/año cerrado y 422 con code; NeMaterializer (filas AUTO al leer el docente y en period.closed.v1, resincroniza, A3); GradebookReadService exportado con buildGradebook; grade.updated.v1; bitácora solo {state, value, source} y changedFields. 25 unit y e2e de 13 casos.
Archivos: grading/{grading.module (importa AcademicModule y SubmissionsModule; exporta GradebookReadService y GradingEventPublisher), grading.controller, grading.dto (gradeInputSchema envuelve normalizeGradeInput), grading.policy (+spec), grades.service (+spec), gradebook-read.service, ne-materializer.service, grading-events, grading-audit, grading.types}.ts; test/grading.e2e-spec.ts.
Comandos: import de @aula/shared ok; api lint 0; api test 49/596; api build ok; e2e grading + submissions + contents-assignments 3/67 (grading solo 13/13); prettier ok; db:seed ok (Grade = 0).
Hallazgos: [MEDIO] period.closed.v1 materializa NE en todas las tareas vencidas del período; un e2e de otro dev que cierre un período por API con tareas QA dejaría Grade con FK Restrict → esos e2e borrarían antes las Grade. [BAJO] submissions sigue con gradeState null (Dev 3). [BAJO] reintento de 3 intentos y luego 409.
Decisiones: (1) PUT: 404 tarea → 403 → 404 matrícula → 422 ENROLLMENT_OUT_OF_SECTION → 409 assertCourseSectionWritable → lockOpenPeriod FOR SHARE (409) → 422 NO_SUBMISSION/HAS_SUBMISSION/NOT_OVERDUE/ENROLLMENT_NOT_ELIGIBLE (error.code); sin cambios no escribe; toda escritura manual queda MANUAL. (2) grade.updated.v1 {gradeId, assignmentId, enrollmentId, courseSectionId, gradeStatus, source, updatedAt}. (3) NeMaterializer solo con curso-sección y período escribibles (si no, NE virtual); en period.closed.v1 procesa las vencidas antes de closedAt; transacción por tarea con reintento; bitácora grading.grade.auto_ne con actor sistema. (4) Lecturas: filas vigentes + cerradas con datos; período por defecto el actual; otro año 422, inexistente 404; grade-summary con nota efectiva, comment, exemptionReason, source, entrega y displayStatus. (5) Mis notas/apoderado: por matrícula, curso-sección y período, sin promedio anual (D-014), sin exemptionReason (comprobado en e2e); /me solo STUDENT ACTIVE, /guardian solo GUARDIAN ACTIVE; no vinculado 403. (6) Tipos para la 4c en grading.types.ts.
Pendientes: 4c; docs/03 (documentador).

### Decisión del orquestador 4

En paralelo: qa-tester y seguridad-cumplimiento sobre grading/ (API) y el mismo dev4 con la 4c (solo web: curso/[id]/registro, mis-notas, apoderado).

### INFORME 6 — seguridad-cumplimiento (4b)

Estado: APROBADO (sin CRÍTICO ni ALTO; 2 MEDIO y 3 BAJO)
Verificado: @Roles TEACHER/ADMIN + assertCanWriteCourseSection en PUT, grade-summary y gradebook; 422 ENROLLMENT_OUT_OF_SECTION (grades.service.ts:128); me/grades solo STUDENT con user.id; guardian solo GUARDIAN con getLinkedStudentIds y 403; z.uuid y queries strictObject; sin SQL crudo; 409 antes de las reglas, lockOpenPeriod en la transacción, withRetry 3; NeMaterializer sin createMany/skipDuplicates y resincronización filtrada por AUTO+NE; exemptionReason y comment fuera de bitácora y eventos; exemptionReason solo para docente/ADMIN; bitácora con before/after (RNF-14).
Hallazgos:

- [MEDIO] grading-audit.ts:42-51 — bitácora después del commit y error tragado → escribirla dentro de la transacción para create/update (requiere AuditService.record(event, tx) de Dev 1).
- [MEDIO] grades.service.ts:117-131 — la matrícula se lee fuera de la transacción → releerla dentro de putInTx tras lockOpenPeriod.
- [BAJO] grading.dto.ts:11-22 — campos desconocidos ignorados (sin asignación masiva).
- [BAJO] grades.service.ts:114-115 — 404 antes del 403 (UUID).
- [BAJO] ne-materializer.service.ts:111 — materializePeriod público sin comprobación → marcar @internal.

### Decisión del orquestador 5

MEDIO 1: se mantiene la bitácora después del commit, como D-047 para todo el proyecto, hasta que Dev 1 ofrezca record(event, tx); se anota. MEDIO 2 y BAJO 3/5 se pasan al dev4 al terminar la 4c, junto con lo que pida QA.

### INFORME 7 — qa-tester (4b)

Estado: LISTO (sin bugs; sin tocar producción)
Archivos: grading/grading.edge.spec.ts (nuevo, 28 casos: límites de nota, NE con y sin valor, motivo 9/10/500/501 recortado, comentario 2000/2001, now = dueAt, effectiveTo = dueAt, auditState sin textos, cambio solo de comentario, AUTO → MANUAL); test/grading.e2e-spec.ts (de 13 a 21: 20.00/20.01, motivo 9/501 → 400 y 10/500 → 200, NE manual, AUTO editada pasa a MANUAL y no se resincroniza, PUT idéntico sin bitácora ni evento, privacidad, exonerado fuera del promedio, vínculo revocado 403, traslado y NE AUTO).
Comandos: e2e grading 21/21; api test 50/624; lint ok; prettier ok; db:seed ok.
Cobertura unit: grades.service 96 %, grading.policy 100 %, grading-audit 80 %, grading-events 65 %; gradebook-read, ne-materializer, controller y module solo por e2e. El motor (shared/grading) tiene 100 %. RNF-31 (≥ 90 % del módulo de notas): cumplido en el motor; la cobertura combinada unit + e2e de la API no está medida.

### INFORME 8 — dev4-calificaciones (4c, web)

Estado: LISTO
Resumen: pantallas de Dev 4 completas: registro auxiliar (/curso/[id]/registro?periodo=, con dashboard, matriz con caption y región enfocable, 6 estados con texto), calificar tarea (registro/tarea/[assignmentId], tarjetas por estudiante, visor PDF por iframe con URL firmada inline y enlace de respaldo, formulario Nota/NE/Exonerar con form-feedback, aviso de datos de salud, 422 por code), Mis notas (sin motivo de exoneración) y apoderado (selector ?estudiante= y vista de solo lectura, hueco para anuncios de Dev 5).
Archivos: curso/[id]/registro/{page.tsx, _lib/types.ts, _lib/grading-format.ts (+test), _lib/actions.ts, tarea/[assignmentId]/{page.tsx, grade-form.tsx, pdf-viewer.tsx}}; mis-notas/{page.tsx, _components/student-grades.tsx}; apoderado/page.tsx.
Comandos: web tsc ok; lint ok; test 304; build ok (PPR); prettier ok; humo con admin: páginas 200 y RoleGate redirige al admin; la API de :4000 corre código anterior a la 4b (404 en gradebook); db:seed ok.
Hallazgos: [ALTO, entorno] reiniciar la API de :4000; [MEDIO] curso/[id]/registro/layout.tsx con RoleGate solo TEACHER (ADMIN no entra aunque la API lo permite); [BAJO] iframe vulnerable a X-Frame-Options/CSP de S3 (verificar con PDF real).
Pendientes: humo con datos (docente03, estudiante, apoderado01 deben aceptar la política); PDF real; ux-accesibilidad.

### Decisión del orquestador 6

El orquestador reinicia la API de :4000 con el código actual. registro/layout.tsx está dentro de la carpeta de Dev 4: se autoriza `allow={['TEACHER', 'ADMIN']}`. Se pasan al mismo dev4 ese cambio y las correcciones de seguridad (releer la matrícula dentro de putInTx; materializePeriod @internal), y en paralelo ux-accesibilidad revisa las pantallas. El humo con datos de otros roles queda para el usuario (aceptar la política es decisión suya).

### INFORME 9 — ux-accesibilidad (4c)

Estado: APROBADO (sin CRÍTICO ni ALTO; solo lectura)
Comprobado: 6 estados con texto; dashboard con section/aria-labelledby y listas; formulario con labels, aria-invalid/aria-describedby, foco al primer inválido, FormAlert y SuccessRegion, aviso de datos de salud, radios de 44 px; iframe con title y enlace de respaldo; período cerrado con role="status" y sin formulario; apoderado con nav, aria-current y 44 px.
Hallazgos (no bloquean): [MEDIO] grade-form.tsx:151-166 sin contador visible del motivo; [MEDIO] registro/page.tsx:139-144 enlace de tarea en text-xs < 44 px; [BAJO] pdf-viewer.tsx:24-31 doble clic sin guarda y sin anuncio; [BAJO] matriz solo con scroll a 360 px; [BAJO] dashboard sin mensaje "sin datos".

### Decisión del orquestador 7

Los 2 MEDIO y el BAJO del visor son cambios pequeños en carpetas de Dev 4: se encolan al mismo dev4 junto a su vuelta actual.

### INFORME 10 — dev4-calificaciones (ajustes y humo real)

Estado: LISTO
Cambios: registro/layout.tsx:4 allow TEACHER y ADMIN; grades.service.ts:186-210 relee la matrícula FOR SHARE dentro de putInTx tras lockOpenPeriod (404/422) y decide con esos datos (+2 unit); ne-materializer.service.ts:108 @internal; grade-form.tsx contador "N de 500" en aria-describedby; registro/page.tsx:141 enlace con min-h-11; pdf-viewer.tsx:15,35-37 guarda de doble clic y role="status" "PDF cargado".
Humo real (admin; estudiante01 solo por API para subir la entrega, sin aceptar la política): tarea 201; intent 201, PUT 200, complete CLEAN, entrega 201; tarea vencida en BD; grade-summary 200 con 8 NE AUTO; nota 17.00; /registro 200 con caption, 17.00, NE 2.00 y dashboard; /registro/tarea 200 con visor y formulario; download-url inline 200 y PDF application/pdf inline sin X-Frame-Options ni CSP. Limpieza con la guarda; objeto huérfano en MinIO.
Comandos: api lint ok; api test 626; api build ok; e2e grading 21; web tsc/lint/test 304/build ok; prettier ok; db:seed ok.
Pendientes: iframe en navegador real; humo de Mis notas, apoderado y docente cuando el usuario acepte la política con esas cuentas.

### INFORME 11 — revisor-pr (Dev 4)

Estado: APROBADO (sin CRÍTICO ni ALTO)
Alcance: solo lo permitido (shared/grading, api grading + e2e, app.module, api package.json + lockfile, web registro/mis-notas/apoderado, grading.prisma, +relaciones en academic/contents, migración grading_base, expediente). Fuera: .agents/ y skills-lock.json.
Comandos: shared test 124 y build ok; api lint ok, test 50/626, build ok; e2e grading + submissions + contents-assignments 3/75; web lint ok, test 304, build ok; prettier ok; db:seed ok.
RNF-31: shared/grading 100 % en sentencias, ramas, funciones y líneas; API grading combinada unit + e2e: sentencias 91,97 %, líneas 94,93 %, funciones 95,69 %, ramas 81,08 %.
Hallazgos (BAJO): grading-events.ts y ne-materializer.service.ts con ramas sin cubrir; bitácora post-commit (D-047); contents.prisma +3 líneas (comentario y espaciado); gradeState null en submissions (Dev 3).
Pendientes: iframe en navegador real; humo de Mis notas/apoderado/docente con política aceptada por el usuario; record(event, tx) de Dev 1; gradeState en Dev 3; rama limpia sin .claude/ si va al equipo.
