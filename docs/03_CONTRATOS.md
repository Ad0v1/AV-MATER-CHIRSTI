# 03 — Contratos entre módulos y API propuesta

> Contratos **PROPUESTOS**, no aparecen como URLs ni payloads literales en la ERS. Deben consensuarse con el equipo ANTES de escribir consumidores. La ERS sí obliga a roles, permisos, formatos y flujos referenciados.

## Convención API común

- Prefijo: `/api/v1` (propuesta). JSON, UUID, fechas ISO-8601 con zona explícita.
- Autenticación: sesión segura manejada por Dev 1 (no fijar aquí JWT/cookies internas antes del contrato Auth).
- Respuesta de error propuesta: `{ "error": {"code": "FORBIDDEN", "message": "...", "details": []}, "requestId": "..." }`.
- HTTP: 400 validación; 401 no autenticado; 403 sin rol/pertenencia; 404 recurso no visible; 409 conflicto/estado cerrado; 413 archivo excesivo; 415 PDF no válido; 422 reglas de negocio; 503 antivirus/almacenamiento temporalmente no disponible.
- Paginación propuesta: `page`, `pageSize`, `items`, `total`.

## Endpoints base por responsable (mínimo para integración)

| Dueño | Endpoint propuesto | Actor autorizado | Uso |
|---|---|---|---|
| Dev 1 | `GET /auth/me` | autenticado | Usuario, rol, estado y capacidades |
| Dev 2 | `GET /course-sections/:id/context` | usuario con pertenencia | Año, curso, sección, docente, período/estado |
| Dev 2 | `GET /me/course-sections` | docente/estudiante | Cursos accesibles sin duplicar lógica |
| **Dev 3** | `GET /course-sections/:id/materials` | miembros del curso/admin | Clases y lecturas autorizadas |
| **Dev 3** | `POST /course-sections/:id/materials` | docente asignado/admin soporte | Publicar PDF (validado) |
| **Dev 3** | `POST /course-sections/:id/assignments` | docente asignado/admin soporte | Crear tarea |
| **Dev 3** | `GET /assignments/:id` | miembros del curso/admin | Configuración, plazo y estado |
| **Dev 3** | `PATCH /assignments/:id` | docente asignado/admin soporte | Editar si período abierto |
| **Dev 3** | `POST /files/upload-intents` | actor autorizado | Solicitar subida temporal privada |
| **Dev 3** | `POST /files/:id/complete` | propietario autorizado | Confirmar objeto S3; pasa a validación/scan |
| **Dev 3** | `POST /assignments/:id/submissions` | estudiante matriculado | Asociar versión limpia; registro de entrega |
| **Dev 3** | `GET /assignments/:id/submissions/me` | estudiante matriculado | Historial, estado, constancia |
| **Dev 3** | `GET /submissions/:id/versions` | dueño/docente/admin | Historial/versiones válidas |
| **Dev 3** | `POST /files/:id/download-url` | actor con pertenencia | URL firmada de corta duración |
| Dev 4 | `PUT /grades/:assignmentId/:enrollmentId` | docente asignado/admin soporte | Calificación/NE/exoneración |
| Dev 4 | `GET /assignments/:id/grade-summary` | docente asignado/admin | Consulta evaluaciones |
| Dev 5 | `GET /admin/reports` | administrador | Reportes institucionales |

**Nota:** los endpoints `/files/...` y `/assignments/.../submissions` deben funcionar juntos: la operación final de entrega debe ser idempotente, no aceptar un PDF pendiente de scan y respetar `dueAt` según la marca temporal acordada.

## Ejemplo de `Assignment` (propuesta)

```json
{
  "id": "uuid",
  "courseSectionId": "uuid",
  "periodId": "uuid",
  "title": "Práctica de matemática",
  "instructions": "Resolver y subir en PDF",
  "dueAt": "2026-10-20T23:59:00-05:00",
  "maxSizeBytes": 20971520,
  "noSubmissionGrade": "0.00",
  "allowLate": true,
  "attachmentFileId": null
}
```

El máximo por defecto es 20 MB y el tope configurable por tarea es 50 MB (RF-28, RF-35, RN-08). Acordar si el equipo documentará MB como 1 000 000 bytes o MiB como 1 048 576 bytes; el ejemplo usa MiB pero **la ERS no distingue unidades**.

## Eventos publicados (propuestos, para no crear acoplamiento directo)

| Evento | Emisor | Consumidor | Datos mínimos |
|---|---|---|---|
| `assignment.created.v1` | Dev 3 | Dev 5 | assignmentId, courseSectionId, dueAt |
| `submission.accepted.v1` | Dev 3 | Dev 4/5 | assignmentId, enrollmentId, submissionId, versionId, receivedAt, isLate |
| `submission.rejected.v1` | Dev 3 | Dev 5 | uploadId, reason, studentId |
| `grade.updated.v1` | Dev 4 | Dev 5 | assignmentId, enrollmentId, gradeStatus |
| `period.closed.v1` | Dev 2 | Dev 3/4/5 | periodId, academicYearId, closedAt |
| `period.reopened.v1` | Dev 2 (en proceso, D-031) | Dev 3/4/5 | periodId, academicYearId, reopenedAt |
| `academic-year.closed.v1` | Dev 2 (en proceso, D-031) | Dev 3/4/5 | academicYearId, year, closedAt |
| `user.status-changed.v1` | Dev 2 (PROPUESTA F3, D-034) | Dev 1 (RF-08, pendiente), Dev 3/4/5 | userId, role, previousStatus, status, changedAt, closedEnrollmentIds |
| `enrollment.transferred.v1` | Dev 2 (PROPUESTA F3, D-034) | Dev 3/4/5 | studentId, academicYearId, fromEnrollmentId, toEnrollmentId, fromSectionId, toSectionId, transferredAt |
| `file.purge-requested.v1` | Dev 5 | Dev 3 | fileId, reason, academicYearId |

**Esto es un catálogo recomendado, no una obligación de tecnología event-driven**. En Sprint 0 basta con tipos/contratos y mocks; Dev 1 y Dev 5 aprueban el bus/cola y la semántica de entrega (al menos una vez, reintentos, idempotencia).

## Regla sobre cambios incompatibles

Cambiar nombre/tipo de una propiedad compartida o de un evento = actualizar documentación, tests de contrato y consumidores en un PR acordado. No editar el schema de otro dueño sin revisión.

## Servicio de auditoría (D-019, Dev 1)

> **Estado: PROPUESTA**, pendiente de revisión de Dev 1. Refleja `apps/api/src/common/audit/audit.service.ts` y `prisma-audit.sink.ts` (rama `features/adolfo`, sin PR aún). La tabla `AuditLog` está en `prisma/schema/auth.prisma` (ver D-021).

Interfaz única para todos los módulos:

```ts
AuditService.record(event: AuditEvent): Promise<void>
```

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `actorId` | UUID (`CHAR(36)`) | No | Usuario que actúa; vacío en acciones del sistema |
| `action` | string | Sí | Convención `<modulo>.<verbo>`; hoy no se valida |
| `module` | string | Sí | Módulo que emite el evento |
| `entityType` | string (máx. 64) | No | Nombre de la entidad de `02_MODELO_ENTIDADES.md` (p. ej. `Grade`) |
| `entityId` | UUID (`CHAR(36)`) | No | UUID de la raíz del agregado; hoy no se valida el formato |
| `ip` | string (máx. 45) | No | Si llega más largo, el sink lo recorta a 45 caracteres |
| `beforeState` | objeto | No | Solo campos modificados (ver reglas) |
| `afterState` | objeto | No | Solo campos modificados (ver reglas) |

Reglas:

- **Fecha:** `occurredAt` la asigna el servicio en UTC al registrar. El llamador no la envía.
- **Solo inserción:** el servicio no ofrece actualizar ni borrar. La base rechaza `UPDATE` y `DELETE` sobre `AuditLog` (triggers, error 45000).
- **Estados:** `beforeState`/`afterState` contienen solo los campos modificados, sin secretos (hashes, secretos TOTP, tokens) ni datos personales completos.
- **Sin base de datos:** el sink de log (`LogAuditSink`) descarta `beforeState`/`afterState` y no los escribe.
- **Entidad:** `entityType` y `entityId` se guardan con `null` cuando no se envían.

Pendiente (D-022, D-023, D-024): validar largo y formato de `entityType`/`entityId`; lista blanca o redacción de estados; plazo de retención de `ip` y `userAgent` de consentimiento.

## Motor de notas (`@aula/shared` → grading, Dev 4)

> **Estado: PROPUESTA.** Implementado en `packages/shared/src/grading/` (rama `features/adolfo`, sin PR aún). Precisión y redondeo pendientes de acuerdo en D-025 y D-026. Es un contrato **interno** entre paquetes: lo consumen la API de calificaciones (Dev 4) y los reportes (Dev 5). No es un endpoint HTTP.

Funciones puras: sin NestJS, Prisma, I/O ni fecha del sistema. No guardan nada: la API pasa las notas y persiste el resultado.

Errores: `GradingError` con `code` (`INVALID_GRADE`, `INVALID_STATE` o `INVALID_SCALE`) e `issues` (solo con `INVALID_SCALE`).

**Tipos**

- `GradeInput`: `string | number`, nota tal como llega (`"13.50"` o `13.5`).
- `GradeCents`: nota en centésimas enteras 0..2000. Solo se obtiene con `parseGrade`.
- `GradeState`: `'GRADED' | 'NE' | 'EXEMPT'`.
- `GradeEntry`: `{ state: 'GRADED' | 'NE', value }` o `{ state: 'EXEMPT' }` (sin valor).
- `AverageResult`: `{ status: 'OK', rounded, sumCents, counted, exempt }` o `{ status: 'NO_GRADES', counted: 0, exempt }`.
- `LiteralBand` (`{ literal, min, max }`), `LiteralScale` (lista de tramos), `LiteralScaleIssue` (`{ code, index?, message }`) y `LiteralScaleIssueCode`.
- `GradingErrorCode`: `'INVALID_GRADE' | 'INVALID_STATE' | 'INVALID_SCALE'`.

**Constantes**

- `GRADE_MIN = 0` y `GRADE_MAX = 20`.
- `DEFAULT_NO_SUBMISSION_GRADE = '0.00'`: nota NE predeterminada (RN-05).
- `DEFAULT_LITERAL_SCALE`: AD 18..20, A 14..17, B 11..13, C 0..10. Inmutable.

**Funciones públicas**

- `parseGrade(input): GradeCents`: valida RN-01 y convierte a centésimas. Lanza `INVALID_GRADE`.
- `isValidGrade(input): boolean`: igual que `parseGrade`, pero sin lanzar.
- `formatGrade(input): string`: nota con 2 decimales (`13.5` → `"13.50"`).
- `resolveNoSubmissionGrade(configured?): string`: nota NE de la tarea o `"0.00"` si no hay configuración (RN-05).
- `calculateAverage(entries): AverageResult`: promedio simple con un solo redondeo, .5 hacia arriba. No muta la entrada. Lanza `INVALID_STATE` o `INVALID_GRADE`.
- `validateLiteralScale(scale): LiteralScaleIssue[]`: lista de problemas de la tabla; vacía si es válida.
- `assertLiteralScale(scale): void`: lanza `INVALID_SCALE` con `issues`.
- `toLiteral(rounded, scale = DEFAULT_LITERAL_SCALE): string`: literal de un promedio ya redondeado. Lanza `INVALID_GRADE` si no es entero 0..20.

**Reglas que cumple**

| Regla | Cómo la cumple el motor |
| --- | --- |
| RN-01 | `parseGrade` acepta solo notas 0..20 con hasta 2 decimales. |
| RN-02 | `calculateAverage` es un promedio simple, sin ponderación. |
| RN-03 | Suma y divide con `decimal.js` y redondea una sola vez, .5 hacia arriba (`ROUND_HALF_UP`, D-026). |
| RN-04 | `toLiteral` usa la tabla validada; por defecto AD, A, B, C. |
| RN-05 | Una entrada `NE` cuenta como nota con el valor que pasa la API (`resolveNoSubmissionGrade`). |
| RN-06 | `GradeEntry` no tiene `isLate` ni penalización. Una entrega tardía es `GRADED`. |
| RN-07 | `EXEMPT` no suma ni cuenta; solo aumenta `exempt`. |

**Uso por los consumidores**

- La API de calificaciones (Dev 4) convierte las filas de `Grade` a `GradeEntry`, usa `resolveNoSubmissionGrade` para las NE y guarda el resultado; no recalcula en otro lugar.
- Los reportes (Dev 5) **no recalculan** promedios ni literales: leen `AverageResult` y usan `toLiteral` del motor.
- Un promedio sin notas que cuenten es `NO_GRADES`, nunca `0` (D-026). La interfaz muestra "sin nota".
- `toLiteral` recibe el `rounded` de `calculateAverage`, nunca un promedio sin redondear.
- `apps/api` todavía no declara `@aula/shared` como dependencia: se añade con la tarea de la API de grading.

## API académica (Dev 2, RF-09..14 y RF-17)

> **Estado: PROPUESTA.** Implementado en `apps/api/src/modules/academic/` (rama `features/adolfo`, sin PR aún) y aprobado por `revisor-pr` el 26/10/2026. Depende de la aceptación del dueño de Dev 2 y de D-021 (FK hacia `User` en `CHAR(36)`). Las pantallas son de la fase 5. Esta sección sigue el código: si cambia una firma, un error o un campo, se actualiza aquí.

### Convenciones

- Prefijo `/api/v1`. Todos los endpoints requieren sesión: sin ella, 401.
- Roles: se comprueban a nivel de clase (`@Roles`). Un rol que no aparece en la fila recibe 403.
- Fechas solo-día: `YYYY-MM-DD`. Timestamps: ISO-8601 en UTC. Ids: UUID (400 si no es UUID).
- Marcadores TRUE/NULL de la BD se exponen como `boolean` (ver "Regla de marcadores").
- Listas: `{ items, total }`. No hay paginación en F2.
- Errores: el código sale del status: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT`, 422 `BUSINESS_RULE_VIOLATION`. Cuando el error trae una lista de problemas (validación Zod o fechas de períodos), `message` es `"Solicitud invalida"` y `details` es `[{ path, message }]`. Pendiente de Dev 1: códigos de error propios por regla de negocio.

### Endpoints

Los cuerpos son JSON. La columna Rol lista quién puede llamar, según `@Roles` de cada controlador.

| Método y ruta | Rol | Cuerpo | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `GET /academic-years` | ADMIN | — | 200 `{ items: YearSummary[], total }`, año descendente | 403 |
| `POST /academic-years` | ADMIN | `{ year: 2000..2100, periods: [4 × { sequence: 1..4, startDate, endDate }] }`, sin secuencias repetidas | 201 `YearDetail` | 400; 409 si el año ya existe; 422 fechas (details) |
| `GET /academic-years/:id` | ADMIN | — | 200 `YearDetail` | 404 |
| `PATCH /academic-years/:id` | ADMIN | `{ year }` | 200 `YearDetail` | 400; 404; 409 solo lectura, año activo, con secciones o año existente; 422 fechas que no existen en el nuevo año |
| `POST /academic-years/:id/activate` | ADMIN | — | 200 `YearDetail` | 404; 409 si está cerrado o hay concurrencia. Si ya es el activo, 200 sin cambios ni bitácora |
| `POST /academic-years/:id/close` | ADMIN | — | 200 `YearDetail` | 404; 409 ya cerrado; 422 hay períodos abiertos |
| `PATCH /academic-periods/:id` | ADMIN | `{ startDate?, endDate? }` (al menos uno) | 200 `PeriodView` | 400; 404; 409 año de solo lectura o período cerrado; 422 fechas |
| `POST /academic-periods/:id/close` | ADMIN | `{ reason? }` (1..500 caracteres) | 200 `PeriodView` | 400; 404; 409 ya cerrado o año de solo lectura |
| `POST /academic-periods/:id/reopen` | ADMIN | `{ reason }` obligatorio (10..500 caracteres) | 200 `PeriodView` | 400 sin motivo; 404; 409 no cerrado, año no activo o año cerrado |
| `GET /academic-years/:yearId/sections` | ADMIN | — | 200 `{ items: SectionView[], total }` | 400; 404 año |
| `POST /academic-years/:yearId/sections` | ADMIN | `{ gradeLevel: 1..5, code }` (`[A-Z0-9]{1,8}`, se pasa a mayúsculas) | 201 `SectionView` | 400; 404; 409 solo lectura o sección duplicada |
| `PATCH /sections/:id` | ADMIN | `{ code?, isActive? }` (al menos uno) | 200 `SectionView` | 400; 404; 409 solo lectura, código duplicado o desactivar con matrículas vigentes |
| `GET /courses` | ADMIN | Query `includeInactive` (`true` o `false`; por defecto `false`) | 200 `{ items: CourseView[], total }` | 400 |
| `POST /courses` | ADMIN | `{ name }` (1..120 caracteres) | 201 `CourseView` | 400; 409 nombre duplicado |
| `PATCH /courses/:id` | ADMIN | `{ name?, isActive? }` (al menos uno) | 200 `CourseView` | 400; 404; 409 nombre duplicado |
| `GET /sections/:sectionId/course-sections` | ADMIN | — | 200 `{ items: CourseSectionView[], total }` | 400; 404 sección |
| `POST /sections/:sectionId/course-sections` | ADMIN | `{ courseId, teacherId? }` (`teacherId` puede ser null) | 201 `CourseSectionView` | 400; 404 sección o curso; 409 solo lectura, sección inactiva o curso duplicado; 422 curso inactivo o docente no válido |
| `PATCH /course-sections/:id` | ADMIN | `{ isActive }` | 200 `CourseSectionView` | 400; 404; 409 solo lectura |
| `PUT /course-sections/:id/teacher` | ADMIN | `{ teacherId }` (uuid o null, D-029) | 200 `CourseSectionView` | 400; 404; 409 solo lectura; 422 docente no válido. Mismo docente: 200 sin cambios ni bitácora |
| `GET /course-sections/:id/context` | ADMIN, TEACHER, STUDENT, GUARDIAN (con pertenencia) | — | 200 `CourseSectionContext` | 400; 403 sin pertenencia o usuario no activo; 404 |
| `GET /me/course-sections` | TEACHER, STUDENT | — | 200 `{ items: MyCourseSection[], total }` | 403 para GUARDIAN y ADMIN |

Formas de respuesta comunes:

- `YearSummary`: `{ id, year, isActive: boolean, closedAt, readOnly }`. `YearDetail` es `YearSummary` más `periods: PeriodView[]`.
- `PeriodView`: `{ id, academicYearId, sequence, kind, label, startDate, endDate, closedAt, isOpen }`. `kind` y `label` según D-002: `FIRST_BIMESTER` "I Bimestre", `SECOND_BIMESTER` "II Bimestre", `THIRD_TRIMESTER` "III Trimestre", `FOURTH_TRIMESTER` "IV Trimestre".
- `SectionView`: `{ id, academicYearId, gradeLevel, code, isActive }`.
- `CourseView`: `{ id, name, isActive }`.
- `CourseSectionView`: `{ id, sectionId, course: { id, name }, teacher: { id, fullName } | null, isActive }`.

`readOnly` de `YearSummary` aplica D-030 (año cerrado, o no activo y anterior al activo). Un año futuro no cerrado se puede preparar.

### GET /course-sections/:id/context

Roles ADMIN, TEACHER, STUDENT y GUARDIAN. ADMIN siempre; los demás solo si tienen pertenencia (`assertCanAccessCourseSection`, ver más abajo).

```json
{
  "id": "uuid",
  "isActive": true,
  "readOnly": false,
  "academicYear": { "id": "uuid", "year": 2026, "isActive": true, "closedAt": null },
  "section": { "id": "uuid", "gradeLevel": 3, "code": "A", "isActive": true },
  "course": { "id": "uuid", "name": "Matemática" },
  "teacher": { "id": "uuid", "fullName": "Nombre del docente" },
  "periods": [
    {
      "id": "uuid",
      "academicYearId": "uuid",
      "sequence": 1,
      "kind": "FIRST_BIMESTER",
      "label": "I Bimestre",
      "startDate": "2026-03-01",
      "endDate": "2026-04-30",
      "closedAt": null,
      "isOpen": true
    }
  ],
  "currentPeriodId": "uuid"
}
```

- `teacher` es `null` si la sección no tiene docente.
- `readOnly` es `true` si el año está cerrado; o no es el activo y es anterior al activo (D-030); o el año no está activo, también si es futuro, porque ahí no se escriben notas ni tareas; o la sección o el curso-sección están inactivos. El campo puede confundirse con D-030: ver D-030 en `08_DECISIONES.md`.
- `currentPeriodId` es el período cuyo rango incluye hoy en `America/Lima`; `null` si cae en un hueco o fuera del año.
- No incluye correos ni datos de estudiantes.

### GET /me/course-sections

Roles TEACHER y STUDENT. GUARDIAN y ADMIN reciben 403.

```json
{
  "items": [
    {
      "id": "uuid",
      "course": { "id": "uuid", "name": "Matemática" },
      "section": { "id": "uuid", "gradeLevel": 3, "code": "A" },
      "academicYear": { "id": "uuid", "year": 2026 },
      "teacher": { "id": "uuid", "fullName": "Nombre del docente" },
      "enrollmentId": "uuid"
    }
  ],
  "total": 1
}
```

- Solo cuenta el año activo y los curso-sección y secciones activos.
- TEACHER: los cursos que dicta (`teacherId` es él). No aparece `enrollmentId`.
- STUDENT: los cursos de la sección de su matrícula vigente en el año activo, con `enrollmentId`.
- Sin año activo, o con usuario no ACTIVE: `items: []`.
- Los años anteriores quedan fuera (F3).

### AcademicAccessService (contrato para Dev 3, 4 y 5)

Exportado por `AcademicModule`. Lo usan los servicios de otros módulos; no es HTTP. Las firmas están en `apps/api/src/modules/academic/academic-access.service.ts`.

| Método | Devuelve | Errores | Semántica |
| --- | --- | --- | --- |
| `getActiveYear()` | `{ id, year }` o `null` | — | Año activo; a lo sumo uno (RN-11). |
| `isYearReadOnly(year)` | `boolean` | — | Auxiliar: aplica D-030 con el año activo si hace falta. |
| `getCourseSectionContext(courseSectionId, now?)` | `CourseSectionContext` | 404 | No comprueba permisos: llamar antes a `assertCanAccessCourseSection`. |
| `assertCanAccessCourseSection(user, courseSectionId)` | `void` | 404; 403 | El usuario debe estar ACTIVE en la BD (la sesión solo trae `id` y `role`). ADMIN siempre; TEACHER si es el docente asignado; STUDENT con matrícula vigente en la sección; GUARDIAN si algún estudiante vinculado tiene matrícula vigente en la sección. |
| `assertTeacherOf(userId, courseSectionId)` | `void` | 404; 403 | Pasa solo si es el docente asignado y está ACTIVE. Sin docente (`teacherId` null) → 403. |
| `isPeriodOpen(periodId)` | `boolean` | 404 | `true` solo si el período no está cerrado y su año está activo y sin cerrar. Año inactivo → `false`. |
| `assertCourseSectionWritable(courseSectionId, periodId?)` | `void` | 404; 409; 422 | Para notas, tareas y materiales. 404 si no existe; 409 si el año no está activo o está cerrado, o si la sección o el curso-sección están inactivos. Con `periodId`: 404 si el período no existe; 422 si es de otro año; 409 si está cerrado. |
| `listCurrentEnrollments(sectionId)` | `CurrentEnrollment[]` | 404 sección | Matrículas vigentes (incluye estudiantes INACTIVE), por nombre. |
| `listEnrollmentsOfStudent(studentId, academicYearId)` | `StudentEnrollment[]` | — | Matrículas vigentes y cerradas del año, por `effectiveFrom`. Vacío si no hay. |
| `getLinkedStudentIds(guardianId)` | `string[]` | — | Ids de los estudiantes vinculados al apoderado. |

Tipos:

- `CurrentEnrollment`: `{ enrollmentId, studentId, fullName, status, effectiveFrom }`.
- `StudentEnrollment`: `{ enrollmentId, sectionId, academicYearId, isCurrent: boolean, effectiveFrom, effectiveTo, endReason }`.
- `CourseSectionContext` y `PeriodView`: como en la sección de endpoints.

> **Advertencia (seguridad).** `listCurrentEnrollments` y `listEnrollmentsOfStudent` **no validan permisos**. El llamador debe comprobar antes que el actor puede ver esa sección o ese estudiante (por ejemplo, con `assertCanAccessCourseSection` o el rol ADMIN) y **nunca debe devolver estas listas a STUDENT ni a GUARDIAN**, porque exponen a otros estudiantes.

**Regla de marcadores TRUE/NULL**

- En la BD, `AcademicYear.isActive` y `Enrollment.isCurrent` valen `TRUE` o `NULL`, nunca `FALSE` (CHECK; MySQL rechaza el `FALSE` con el error 3819). Año activo = `TRUE`; año inactivo o cerrado = `NULL`. Matrícula vigente = `TRUE`; matrícula cerrada = `NULL`.
- Al cerrar un año o una matrícula se escribe `NULL`, nunca `FALSE`.
- En la API y en el servicio, el marcador se expone como `boolean` con `marker(valor) = valor === true`. `NULL` se ve como `false`.
- `Section.isActive`, `Course.isActive` y `CourseSection.isActive` son booleanos normales: desactivar escribe `false`.

### Eventos del módulo académico (D-031)

> **Estado: PROPUESTA.** Se publican en proceso con `AcademicEventPublisher` (`node:events`). Solo llegan a suscriptores del mismo proceso de la API: no hay cola, reintentos ni persistencia. Se publican después del commit y de la bitácora. Un handler que falla se registra en el log y no cambia la respuesta.

```ts
type AcademicEventMap = {
  'period.closed.v1': { periodId: string; academicYearId: string; closedAt: string };
  'period.reopened.v1': { periodId: string; academicYearId: string; reopenedAt: string };
  'academic-year.closed.v1': { academicYearId: string; year: number; closedAt: string };
};
```

- Todas las fechas van en ISO-8601 UTC.
- Cerrar un año emite solo `academic-year.closed.v1`; no emite un `period.closed.v1` por cada período.
- Suscripción: `publisher.on(type, handler)` devuelve la función para desuscribirse.

### Bitácora del módulo académico

- Acciones `academic.<entidad>.<verbo>` con `module: 'academic'`: `year.create|update|activate|deactivate|close`, `period.update|close|reopen`, `section.create|update`, `course.create|update`, `course_section.create|update|assign_teacher`.
- Solo ids y campos cambiados (`before`/`after`); nunca nombres ni correos. Las lecturas no se registran.
- Se escribe después del commit. Si falla, el cambio no se revierte y el fallo queda en el log (pendiente de Dev 1: escribir dentro de la transacción, D-019).
- El motivo de reapertura y de cierre de período es texto libre. No debe contener datos de menores; la pantalla (fase 5) debe avisarlo.

## API de usuarios (Dev 2, F3: RF-18, 19, 20, 22, 23, 24, 25; RN-13)

> **Estado: PROPUESTA.** Implementado en `apps/api/src/modules/users/` (rama `features/adolfo`, sin commit ni PR) y aprobado por `revisor-pr` (INFORME 8, 26/10/2026). Depende de la aceptación del dueño de Dev 2 y de D-021; no va al repo del equipo sin acuerdo (D-033). Las pantallas son de la fase 5. Esta sección sigue el código: si cambia una ruta, un campo o un error, se actualiza aquí.

### Convenciones

- Prefijo `/api/v1`. **Los 14 endpoints son solo para ADMIN** (`@Roles('ADMIN')` a nivel de clase) y pasan por `ActiveActorGuard`: la sesión solo trae `id` y `role`, así que el guard comprueba en la BD que el actor siga `ACTIVE` y con ese rol. Si no, 403 "Tu cuenta no está activa". Sin sesión, 401.
- Entrada estricta: un campo desconocido responde 400 (p. ej. `role` en el `PATCH`). Las fechas de matrícula, traslado y cierre **nunca** las envía el cliente: las pone el servidor.
- Ids UUID (400 si no lo son). Marcadores TRUE/NULL (`isCurrent`, `isActive`) se exponen como `boolean`.
- Errores con el mismo formato del módulo académico: 400 `VALIDATION_ERROR` (con `details`), 401, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT`, 422 `BUSINESS_RULE_VIOLATION`. Un bloqueo mutuo de MySQL (deadlock, 1213) se responde 409 "El registro cambió o está en uso; vuelve a intentarlo".
- Correo: se guarda en minúsculas y sin espacios, máximo 191 caracteres, único (409). Nombre: 3..120 caracteres, espacios colapsados, sin caracteres de control.
- Dominio: si la variable `INSTITUTION_EMAIL_DOMAIN` está definida, los correos de STUDENT, TEACHER y ADMIN deben pertenecer a ese dominio (422). GUARDIAN queda exento hasta D-013. Sin la variable no se valida el dominio y se registra un aviso en el log.
- El rol de un usuario no cambia (D-012).

### Vistas

- `UserView`: `{ id, institutionalEmail, fullName, role, status, createdAt, updatedAt }`.
- `UserListItem` (solo en `GET /users`): `{ id, institutionalEmail, fullName, role, status, currentSection }`, donde `currentSection` es `{ id, gradeLevel, code }` o `null` (sección de la matrícula vigente del año).
- `EnrollmentView`: `{ id, academicYear: { id, year }, section: { id, gradeLevel, code }, isCurrent, effectiveFrom, effectiveTo, endReason }`.
- `GuardianLinkView`: `{ id, guardian: { id, fullName, status }, student: { id, fullName, status }, isActive, createdAt, revokedAt }`.

### Paginación y búsqueda (`GET /users`)

- `page`: 1..1000 (por defecto 1). `pageSize`: 1..100 (por defecto 20). Fuera de rango, 400.
- `q`: 2..100 caracteres, texto literal (`%` y `_` no son comodines), sin distinguir mayúsculas, sobre nombre y correo. Tope de **5000 coincidencias**: si hay más, `total` y las páginas se calculan sobre las primeras 5000 (por id). Orden: `fullName` y luego `id`.
- `gradeLevel` y `sectionId` exigen `role=STUDENT`; si no, 400. Se buscan en la matrícula vigente del año indicado (por defecto, el activo). Sin año activo no hay coincidencias.

### Endpoints

| Método y ruta | Cuerpo / query | Respuesta | Errores |
| --- | --- | --- | --- |
| `GET /users` | Query: `q?`, `role?`, `status?`, `gradeLevel?`, `sectionId?`, `academicYearId?`, `page?`, `pageSize?` | 200 `{ items: UserListItem[], total, page, pageSize }` | 400 |
| `GET /users/:id` | — | 200 `UserView` + `currentEnrollment` (STUDENT: `EnrollmentView` o `null`, año activo) + `guardians` (STUDENT: `GuardianLinkView[]` vigentes) o `students` (GUARDIAN: vigentes) | 400; 404 |
| `PATCH /users/:id` | `{ fullName?, institutionalEmail? }` (al menos uno) | 200 `UserView`. Sin cambios, 200 sin bitácora | 400; 404; 409 correo en uso; 422 dominio |
| `PUT /users/:id/status` | `{ status: ACTIVE \| INACTIVE \| WITHDRAWN, reason?: 1..500 }` | 200 `{ user: UserView, closedEnrollments: EnrollmentView[] }`. Mismo estado: 200 con `closedEnrollments: []`, sin bitácora | 400; 404; 409 sobre sí mismo o último ADMIN activo |
| `POST /students` | `{ institutionalEmail, fullName, sectionId }` | 201 `{ user: UserView, enrollment: EnrollmentView }` | 400; 404 sección; 409 correo, sin año activo, año cerrado, sección inactiva; 422 sección de otro año, dominio |
| `POST /students/:id/enrollments` | `{ sectionId }` | 201 `EnrollmentView` | 400; 404 estudiante o sección; 409 ya tiene matrícula vigente en el año, sin año activo, año cerrado, sección inactiva; 422 no es STUDENT, está WITHDRAWN o la sección es de otro año |
| `POST /students/:id/transfer` | `{ sectionId, reason?: 1..500 }` | 200 `{ closed: EnrollmentView, current: EnrollmentView }` | 400; 404; 409 sin matrícula vigente en el año, sin año activo, año cerrado, sección inactiva, concurrencia; 422 no es STUDENT, está WITHDRAWN, misma sección, otro grado o sección de otro año |
| `GET /students/:id/enrollments` | Query: `academicYearId?` | 200 `{ items: EnrollmentView[], total }`, por `effectiveFrom` | 400; 404; 422 no es STUDENT |
| `GET /students/:id/guardians` | Query: `includeRevoked?` (`true` o `false`, por defecto `false`) | 200 `{ items: GuardianLinkView[], total }` | 400; 404; 422 no es STUDENT |
| `POST /teachers` | `{ institutionalEmail, fullName }` | 201 `UserView` (role TEACHER) | 400; 409 correo; 422 dominio |
| `POST /guardians` | `{ institutionalEmail, fullName, studentIds }` (uuid, 1..10, sin repetir) | 201 `{ user: UserView, links: GuardianLinkView[] }`, en una transacción | 400; 409 correo; 422 algún estudiante no existe, no es STUDENT o está WITHDRAWN |
| `GET /guardians/:id/students` | Query: `includeRevoked?` | 200 `{ items: GuardianLinkView[], total }` | 400; 404; 422 no es GUARDIAN |
| `POST /guardians/:id/students` | `{ studentId }` | 201 `GuardianLinkView` | 400; 404 apoderado o estudiante; 409 vínculo vigente duplicado; 422 no es GUARDIAN, apoderado WITHDRAWN, estudiante no es STUDENT o está WITHDRAWN, mismo id |
| `POST /guardian-links/:id/revoke` | `{ reason }` (obligatorio, 10..500) | 200 `GuardianLinkView` (`isActive: false`, `revokedAt`) | 400; 404; 409 ya revocado |

Las rutas de la tabla cuelgan de `/api/v1`. Los estudiantes sin matrícula vigente en el año activo aparecen con `currentSection: null`.

### Reglas de estado (RF-23)

- `STUDENT` → `WITHDRAWN`: en la misma transacción cierra sus matrículas vigentes de años **no cerrados** (`isCurrent` NULL, `effectiveTo` = instante del servidor, `endReason` `WITHDRAWAL`). Las de años cerrados no se tocan.
- `INACTIVE` no toca las matrículas. `WITHDRAWN` → `ACTIVE` no reabre ninguna: para volver a matricularlo se usa `POST /students/:id/enrollments`.
- Un ADMIN no cambia su propio estado (409) ni deja el sistema sin ADMIN activo (409). Si el objetivo es ADMIN, los cambios de estado se serializan.
- Los vínculos de apoderado no se revocan al retirar al estudiante: `getLinkedStudentIds` los deja fuera por estado (ver abajo).
- Sin borrado físico. Un docente inactivo conserva su `teacherId` en las secciones.

### Matrícula, traslado y vínculos (RF-18, RF-20, RF-24, RN-13)

- **Fechas del servidor.** La alta fija `effectiveFrom` = ahora. El traslado usa `at = max(ahora, effectiveFrom de la matrícula vigente)`: cierra la anterior con `effectiveTo = at` y `endReason` `TRANSFER`, y la nueva nace con `effectiveFrom = at`. Un cierre nunca es anterior al inicio.
- **Traslado.** Debe ser dentro del mismo año (el de la sección destino) y del mismo grado, a una sección distinta. Si dos traslados idénticos llegan en paralelo, uno responde 200 y el otro 422 "El estudiante ya está matriculado en esa sección".
- **Vínculo.** Un solo vigente por par apoderado–estudiante. Revocar escribe `isActive` NULL y `revokedAt` (no borra). Revincular crea un vínculo nuevo con otro `id`. `includeRevoked=true` devuelve también los revocados.
- **`getLinkedStudentIds(guardianId)`** (contrato para Dev 3/4/5, `AcademicAccessService`): devuelve solo vínculos vigentes con estudiantes **no WITHDRAWN**. Dev 3/4/5 no deben volver a filtrar por estado ni por revocación. Un apoderado sin estudiantes válidos recibe 403 en el contexto del curso-sección.

> **Advertencia (datos de menores).** Los motivos (`reason` de estado, traslado y revocación) se guardan tal cual en la bitácora, que es inmutable (D-024). **No deben contener datos personales, de salud ni familiares** del estudiante o de su familia. Ejemplos válidos: "traslado a otro colegio", "vínculo registrado por error". No válidos: diagnósticos, situaciones de custodia o datos de terceros. La pantalla (fase 5) debe avisarlo; el catálogo de motivos queda pendiente.

### Bitácora del módulo users

- Módulo `users`, acción `users.<entidad>.<verbo>`, después del commit. Solo ids, estados, motivos y **nombres de campos cambiados**: nunca correos, nombres de personas ni valores personales (RNF-09/11, D-024). Un fallo de escritura no revierte el cambio y se registra en el log con acción, entidad y actor.
- Acciones: `users.user.create` (`{ role, status }`), `users.user.update` (`{ changedFields }`, sin valores), `users.user.status_change` (`{ status }` → `{ status, reason? }`), `users.enrollment.create`, `users.enrollment.transfer` (entidad = la matrícula nueva; `endReason: 'TRANSFER'`, `reason?`), `users.enrollment.withdraw` (una por matrícula cerrada), `users.guardian_link.create`, `users.guardian_link.revoke` (`{ isActive: true }` → `{ isActive: false, reason }`).
- Entidades: `User`, `Enrollment`, `GuardianStudent`. Las lecturas no se registran.
- Pendiente de Dev 1: escribir la bitácora dentro de la transacción (`record(event, tx)`, D-019).

### Eventos del módulo users (D-034)

> **Estado: PROPUESTA.** Se publican en proceso con `AcademicEventPublisher`, como los eventos de D-031: después del commit y de la bitácora, sin cola ni reintentos. Sin datos personales.

```ts
type UsersEventMap = {
  'user.status-changed.v1': {
    userId: string;
    role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'GUARDIAN';
    previousStatus: 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN';
    status: 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN';
    changedAt: string; // ISO UTC
    closedEnrollmentIds: string[];
  };
  'enrollment.transferred.v1': {
    studentId: string;
    academicYearId: string;
    fromEnrollmentId: string;
    toEnrollmentId: string;
    fromSectionId: string;
    toSectionId: string;
    transferredAt: string; // ISO UTC
  };
};
```

- `user.status-changed.v1` solo se emite si el estado cambia (no con el mismo estado).
- `enrollment.transferred.v1` se emite solo en el traslado (no en la alta ni en la rematrícula).
- Dev 1 debe revocar las sesiones del usuario al recibir `user.status-changed.v1` (RF-08, pendiente; hoy una sesión dura hasta 8 h). Mientras tanto, `ActiveActorGuard` y los `assertCanAccessCourseSection` consultan el estado en la BD.

### Concurrencia

- Orden de bloqueos en las transacciones: (0) si el objetivo es ADMIN, los ADMIN activos; (1) el usuario (o los usuarios, por id) `FOR UPDATE`; (2) el año `FOR SHARE`; después, las escrituras. Las condiciones se revalidan dentro de la transacción.
- Un deadlock o un conflicto de escritura de MySQL (1213, P2034) se responde 409 "El registro cambió o está en uso; vuelve a intentarlo". El cliente puede reintentar.
