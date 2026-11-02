# 02 — Diccionario maestro de entidades y relaciones (versión de propuesta)

**NO es una base de datos definitiva.** Las entidades salen de los conceptos y funcionalidades de la ERS; **nombres, claves, campos y cardinalidades específicos son propuestas técnicas** para revisión en Sprint 0. El borrador de Prisma está en `propuestas/schema.propuesto.prisma` y debe aprobarse antes de generar migraciones.

## Convenciones propuestas

- Claves primarias UUIDv7 en `id`, guardadas como `CHAR(36)` (`@default(uuid(7)) @db.Char(36)`). Toda FK hacia `User` usa `@db.Char(36)` (D-021).
- Foráneas con sufijo `Id`; `createdAt`/`updatedAt` si hay cambios; referencias a objetos sin URLs públicas.
- `User` = una identidad; jamás crear otra tabla `StudentUser`, `TeacherUser` o `Alumno` redundante.
- Una `Enrollment` registra pertenencia a una sección; el historial de traslado debe preservarse (RF-24).
- `CourseSection` relaciona curso, sección y docente: no confundir con `Course` (catálogo).
- Una tarea es `Assignment`, **no** crear otra entidad independiente `Activity` para el mismo concepto.
- Una entrega lógica por estudiante/matrícula y tarea: `Submission`; múltiples PDFs/versiones: `SubmissionVersion`.
- Calificación y NE son del dominio de Dev 4 (`Grade`); Dev 3 expone entregas e historial.

## Diccionario de agregados

| Entidad | Dueño | Campos mínimos propuestos | Reglas/relaciones de ERS |
|---|---|---|---|
| `User` | Dev 2, auth Dev 1 | id, institutionalEmail, name, role, status | RF-03, RF-18..23; no acceso si inactivo/retirado |
| `LocalCredential` | Dev 1 | userId, passwordHash, totp* | RF-04; respaldo solo admin |
| `PolicyAcceptance` | Dev 1 | userId, policyVersion, acceptedAt, ip, userAgent | RF-07; ip y userAgent son evidencia del consentimiento (retención pendiente, D-023) |
| `GuardianStudent` | Dev 2 | id (`CHAR(36)`), guardianId, studentId, isActive (TRUE o NULL), createdAt, revokedAt | RF-20, RF-52, RN-13; vínculo revocable en la fila (PROPUESTA F3, D-032); finalidad y plazo de conservación PENDIENTE INSTITUCIÓN (ver docs/04) |
| `AcademicYear` | Dev 2 | year (único), isActive (TRUE o NULL, único), closedAt, createdAt, updatedAt | RF-09; solo uno activo (invariante 1, D-027) |
| `AcademicPeriod` | Dev 2 | academicYearId, sequence (1..4), kind (enum `AcademicPeriodKind`), label, startDate, endDate (`@db.Date`), closedAt | RF-10/11; exactamente cuatro tipos/denominaciones documentadas (D-002), con CHECK de sequence/kind y de fechas; sin solapes en el servicio |
| `Section` | Dev 2 | academicYearId, gradeLevel(1..5), code, isActive | RF-12; único por año, grado y código |
| `Course` | Dev 2 | name (único), isActive | RF-13 |
| `CourseSection` | Dev 2 | sectionId, courseId, teacherId (opcional, D-029), isActive | RF-14, RN-12; único por sección y curso; `teacherId` nulo mientras no hay docente |
| `Enrollment` | Dev 2 | studentId, sectionId, academicYearId, isCurrent (TRUE o NULL), effectiveFrom, effectiveTo, endReason (enum `EnrollmentEndReason`) | RF-18/24; preservar movimientos y notas; invariante 2 (D-027) |

**Nombres finales del modelo académico (PROPUESTA del 26/10/2026, pendiente de revisión del dueño de Dev 2).** Fuente: `prisma/schema/academic.prisma` en el repo privado, migración `academic_estructura`. Depende de D-021 (FK hacia `User` en `CHAR(36)`). Enums: `AcademicPeriodKind` (`FIRST_BIMESTER`, `SECOND_BIMESTER`, `THIRD_TRIMESTER`, `FOURTH_TRIMESTER`) y `EnrollmentEndReason` (`TRANSFER`, `WITHDRAWAL`, `YEAR_END`, `CORRECTION`). Una matrícula vigente tiene `isCurrent` TRUE y no tiene `effectiveTo` ni `endReason`; una cerrada tiene `isCurrent` NULL, `effectiveTo` y `endReason`.
| `Material` | **Dev 3** | courseSectionId, periodId?, type, title, description, fileId, reusable, deletedAt | RF-26/27/29/30/31 |
| `Assignment` | **Dev 3** | courseSectionId, periodId, title, instructions, dueAt, maxSizeBytes, noSubmissionGrade, allowLate, attachmentFileId?, deletedAt | RF-28/29, RN-05/08/10 |
| `StoredFile` | **Dev 3** | objectKey, bytes, MIME, checksum?, uploadStatus, scanStatus, uploadedById | RNF-03/18, RF-34/35/40 |
| `Submission` | **Dev 3** | assignmentId, enrollmentId, createdAt | RF-33/36/38; única por alumno-matrícula/tarea |
| `SubmissionVersion` | **Dev 3** | submissionId, fileId, versionNumber, receivedAt, isLate | RF-36/37/39; historial inmutable |
| `Grade` | Dev 4 | assignmentId, enrollmentId, state, value?, comment?, exemptionReason?, source, gradedAt | RF-41..46, RN-01..07; **un único dueño de NE** |
| `Announcement` | Dev 5 | scope, courseSectionId?, text | RF-32 |
| `Notification` | Dev 5 | recipientId, eventType, deliveredAt? | RF-53 |
| `InstitutionSetting` | Dev 5 | key, value | RF-61 |
| `AuditLog` | Dev 1 | actorId, action, module, entityType, entityId, before/after, ip, occurredAt | RNF-14/15; solo inserción, reforzado con triggers en BD (D-021); entityId = UUID de la raíz del agregado |
| `BackgroundJob` | Dev 5 / infra | type, targetId, state | RNF-19; exportación, aviso, purga, scan (ownership a acordar) |

`*`: los detalles TOTP son responsabilidades de seguridad de Dev 1; nunca almacenar secreto TOTP sin protección.

**Vínculo apoderado–estudiante (PROPUESTA F3, 26/10/2026, D-032).** `GuardianStudent` ya no tiene clave compuesta: tiene `id` propio (`@default(uuid(7)) @db.Char(36)`) y `isActive` vale TRUE (vigente) o NULL (revocado), nunca FALSE. Revocar escribe `isActive` NULL y `revokedAt`; el vínculo no se borra, así se conserva el historial. Índice `UNIQUE(guardianId, studentId, isActive)`: un solo vigente por par; los revocados (NULL) no chocan entre sí. Tres CHECK: `GuardianStudent_isActive_chk` (vigente sin `revokedAt`, o revocado con `revokedAt`), `GuardianStudent_dates_chk` (`revokedAt >= createdAt`) y `GuardianStudent_distinct_chk` (`guardianId <> studentId`). Migración `20261026235821_guardian_student_revocable`.

**Modelo de contenidos (Dev 3, PROPUESTA del 29/10/2026).** Esquema en `prisma/schema/contents.prisma`, migración `20261029224632_contents_base`. Cinco entidades: `StoredFile`, `Material`, `Assignment`, `Submission` y `SubmissionVersion`. Enums: `MaterialKind` (`CLASS`, `READING`), `FilePurpose` (`MATERIAL`, `ASSIGNMENT_ATTACHMENT`, `SUBMISSION`), `FileUploadStatus` (`PENDING`, `COMPLETED`, `EXPIRED`), `FileScanStatus` (`PENDING`, `CLEAN`, `INFECTED`, `INVALID`) y `FileRejectReason` (`TOO_LARGE`, `NOT_PDF`, `ENCRYPTED_PDF`, `INFECTED`, `MISSING_OBJECT`). Los nombres reales difieren de la tabla en `Material.kind` (no `type`), `Material.isReusable` (no `reusable`) y `Assignment.noSubmissionGrade` (no `neGrade`; el CHECK de la migración conserva el nombre `Assignment_neGrade_chk`). `Material.periodId` es opcional (D-042). `SubmissionVersion` es inmutable: triggers `BEFORE UPDATE` y `BEFORE DELETE` con SQLSTATE 45000, como `AuditLog`. Los CHECK de tamaño, PDF limpio, finalidad y papelera van en la misma migración.

**Modelo de calificaciones (Dev 4, PROPUESTA del 30/10/2026).** Esquema en `prisma/schema/grading.prisma`, migración `20261030020801_grading_base`. Una fila `Grade` por tarea y matrícula (`@@unique([assignmentId, enrollmentId])`). Sin borrado físico (RN-14): las FK son `Restrict`. Sin FK a `User` (D-032): quien calificó queda en la bitácora. Enums: `GradeState` (`GRADED`, `NE`, `EXEMPT`) y `GradeSource` (`MANUAL`, `AUTO`; por defecto `MANUAL`). Campos:

- `state`: obligatorio.
- `value` `Decimal(4,2)`: nota de 0 a 20 (RN-01). Solo puede ser nulo en `EXEMPT`.
- `comment` `Text`: comentario del docente (hasta 2000 caracteres en la API). Es dato de menores: no va a la bitácora ni a eventos.
- `exemptionReason` `VarChar(500)`: motivo de la exoneración. Solo lo ven el docente y el ADMIN (D-049).
- `source`: `AUTO` solo para una NE que materializa el sistema.
- `gradedAt` `DateTime(3)`: lo asigna el servicio. Además, `createdAt` y `updatedAt`.

CHECK (Prisma no los modela; van en la migración):

- `Grade_value_chk`: `value` es nulo o está entre 0 y 20.
- `Grade_state_chk`: `GRADED` y `NE` llevan `value` y no llevan `exemptionReason`; `EXEMPT` no lleva `value` y sí `exemptionReason`.
- `Grade_source_chk`: `source = AUTO` solo si `state = NE`.

## Cardinalidades esenciales

- `AcademicYear` 1:N `AcademicPeriod` y 1:N `Section`.
- `Section` 1:N `Enrollment` y 1:N `CourseSection`.
- `CourseSection` 1:N `Material` y 1:N `Assignment`.
- `Assignment` 1:N `Submission`; `Enrollment` 1:N `Submission`.
- `Submission` 1:N `SubmissionVersion`; cada versión apunta a un `StoredFile` privado.
- `(assignmentId, enrollmentId)` único para `Submission` **y** para `Grade` (independientemente de si hay entrega, dado que NE puede existir sin PDF).
- `Grade` referencia tarea y matrícula, **no necesariamente una versión PDF**: soporta NE y exoneraciones sin archivo.
- `GuardianStudent` N:M entre apoderados y estudiantes (vigentes y revocados; ver el apartado del vínculo).

## Invariantes que no resuelve solo el ORM

1. Solo un `AcademicYear` activo simultáneamente (transacción/constraint validada). **Imposición en BD (PROPUESTA, D-027):** `isActive` vale TRUE o NULL, nunca FALSE (CHECK `AcademicYear_isActive_chk`); la columna es `UNIQUE` y MySQL admite varios NULL, así que a lo sumo una fila tiene TRUE. El cambio de año activo se hace en una transacción (servicio, F2).
2. Un estudiante no debe tener dos matrículas vigentes simultáneas en el mismo año (validación transaccional; RF-24). **Imposición en BD (PROPUESTA, D-027):** `isCurrent` vale TRUE (vigente) o NULL (cerrada); `UNIQUE(academicYearId, studentId, isCurrent)` deja una sola vigente por estudiante y año; el CHECK `Enrollment_isCurrent_chk` exige que una vigente no tenga `effectiveTo` ni `endReason`, y que una cerrada los tenga. La rama TRUE empieza con `isCurrent IS NOT NULL`: sin esa condición, una fila con `isCurrent` NULL y sin fechas daba UNKNOWN y MySQL la aceptaba (corregido en la migración `20261027000217_enrollment_iscurrent_check_fix`). La FK compuesta `(sectionId, academicYearId)` hace que el año de la matrícula sea el de su sección.
3. Una `Assignment` debe pertenecer a un período del **mismo año lectivo** que su `CourseSection` (servicio de dominio).
4. Un docente crea tareas únicamente en sus `CourseSection` y durante períodos abiertos (RN-10/12).
5. Un estudiante solo puede entregar si pertenece a la sección correspondiente y se cumplen vencimiento/formato/tamaño (RN-08/09/12).
6. Una versión PDF solo se vuelve visible/descargable después del análisis antivirus satisfactorio (diseño de seguridad propuesto).
7. Notas y eventos de bitácora deben conservarse cuando se purgan PDF según RF-66/RN-14.

Quedan en el servicio (F2, PROPUESTA del 26/10/2026): rol correcto en `CourseSection.teacherId`; `Section.isActive` y `CourseSection.isActive` comprobados en el servicio (RN-10); y bitácora de acciones críticas académicas (D-019).

Resuelto en F3 (módulo `users`, PROPUESTA, sin commit): rol correcto en `Enrollment.studentId` (STUDENT) y en `GuardianStudent` (GUARDIAN el apoderado, STUDENT el estudiante), comprobado en el servicio con 422; `guardianId` distinto de `studentId` (servicio y CHECK `GuardianStudent_distinct_chk`); fechas coherentes al cerrar (`effectiveTo >= effectiveFrom` en BD, `revokedAt >= createdAt` en BD). Un estudiante WITHDRAWN no se matricula, no se traslada y no se vincula.

## Campos/decisiones todavía por cerrar

- Modelo de permisos multirol o rol único; ERS habla de cuatro perfiles pero no define roles múltiples.
- Reinscripción, traslados a otra sección y matrícula histórica (cómo identificar matrícula activa). Propuesta en D-011 y D-027: la matrícula activa es la de `isCurrent` TRUE; un traslado cierra una matrícula y abre otra (RF-24).
- Asociar `Material` opcionalmente a un período; no es inequívoco para clases/lecturas.
- Vencimiento exacto e idempotencia del `SubmissionVersion` con subida directa a S3.
- Retención de PDF de libros reutilizables y relación entre copia nueva/antigua al clonar año.
- Persistencia de comprobantes de entrega vs generación al consultar.
- Motor de promedios y posibles notas anuales: pregunta pendiente en ERS §8.
