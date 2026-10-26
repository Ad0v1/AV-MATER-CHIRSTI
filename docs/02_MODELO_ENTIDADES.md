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
| `GuardianStudent` | Dev 2 | guardianId, studentId | RF-20, RF-52 |
| `AcademicYear` | Dev 2 | year, active | RF-09; solo uno activo |
| `AcademicPeriod` | Dev 2 | academicYearId, sequence, label, startAt, endAt, closedAt | RF-10/11; exactamente cuatro tipos/denominaciones documentadas |
| `Section` | Dev 2 | academicYearId, gradeLevel(1..5), code | RF-12 |
| `Course` | Dev 2 | name, active | RF-13 |
| `CourseSection` | Dev 2 | sectionId, courseId, teacherId | RF-14, RN-12 |
| `Enrollment` | Dev 2 | studentId, sectionId, effectiveFrom, effectiveTo | RF-18/24; preservar movimientos y notas |
| `Material` | **Dev 3** | courseSectionId, periodId?, type, title, description, fileId, reusable, deletedAt | RF-26/27/29/30/31 |
| `Assignment` | **Dev 3** | courseSectionId, periodId, title, instructions, dueAt, maxSizeBytes, neGrade, allowLate, attachmentFileId?, deletedAt | RF-28/29, RN-05/08/10 |
| `StoredFile` | **Dev 3** | objectKey, bytes, MIME, checksum?, uploadStatus, scanStatus, uploadedById | RNF-03/18, RF-34/35/40 |
| `Submission` | **Dev 3** | assignmentId, enrollmentId, createdAt | RF-33/36/38; única por alumno-matrícula/tarea |
| `SubmissionVersion` | **Dev 3** | submissionId, fileId, versionNumber, receivedAt, isLate | RF-36/37/39; historial inmutable |
| `Grade` | Dev 4 | assignmentId, enrollmentId, value?, state, comment, exemptionReason | RF-41..48, RN-01..07; **un único dueño de NE** |
| `Announcement` | Dev 5 | scope, courseSectionId?, text | RF-32 |
| `Notification` | Dev 5 | recipientId, eventType, deliveredAt? | RF-53 |
| `InstitutionSetting` | Dev 5 | key, value | RF-61 |
| `AuditLog` | Dev 1 | actorId, action, module, entityType, entityId, before/after, ip, occurredAt | RNF-14/15; solo inserción, reforzado con triggers en BD (D-021); entityId = UUID de la raíz del agregado |
| `BackgroundJob` | Dev 5 / infra | type, targetId, state | RNF-19; exportación, aviso, purga, scan (ownership a acordar) |

`*`: los detalles TOTP son responsabilidades de seguridad de Dev 1; nunca almacenar secreto TOTP sin protección.

## Cardinalidades esenciales

- `AcademicYear` 1:N `AcademicPeriod` y 1:N `Section`.
- `Section` 1:N `Enrollment` y 1:N `CourseSection`.
- `CourseSection` 1:N `Material` y 1:N `Assignment`.
- `Assignment` 1:N `Submission`; `Enrollment` 1:N `Submission`.
- `Submission` 1:N `SubmissionVersion`; cada versión apunta a un `StoredFile` privado.
- `(assignmentId, enrollmentId)` único para `Submission` **y** para `Grade` (independientemente de si hay entrega, dado que NE puede existir sin PDF).
- `Grade` referencia tarea y matrícula, **no necesariamente una versión PDF**: soporta NE y exoneraciones sin archivo.
- `GuardianStudent` N:M entre apoderados y estudiantes.

## Invariantes que no resuelve solo el ORM

1. Solo un `AcademicYear` activo simultáneamente (transacción/constraint validada).
2. Un estudiante no debe tener dos matrículas vigentes simultáneas en el mismo año (validación transaccional; RF-24).
3. Una `Assignment` debe pertenecer a un período del **mismo año lectivo** que su `CourseSection` (servicio de dominio).
4. Un docente crea tareas únicamente en sus `CourseSection` y durante períodos abiertos (RN-10/12).
5. Un estudiante solo puede entregar si pertenece a la sección correspondiente y se cumplen vencimiento/formato/tamaño (RN-08/09/12).
6. Una versión PDF solo se vuelve visible/descargable después del análisis antivirus satisfactorio (diseño de seguridad propuesto).
7. Notas y eventos de bitácora deben conservarse cuando se purgan PDF según RF-66/RN-14.

## Campos/decisiones todavía por cerrar

- Modelo de permisos multirol o rol único; ERS habla de cuatro perfiles pero no define roles múltiples.
- Reinscripción, traslados a otra sección y matrícula histórica (cómo identificar matrícula activa).
- Asociar `Material` opcionalmente a un período; no es inequívoco para clases/lecturas.
- Vencimiento exacto e idempotencia del `SubmissionVersion` con subida directa a S3.
- Retención de PDF de libros reutilizables y relación entre copia nueva/antigua al clonar año.
- Persistencia de comprobantes de entrega vs generación al consultar.
- Motor de promedios y posibles notas anuales: pregunta pendiente en ERS §8.
