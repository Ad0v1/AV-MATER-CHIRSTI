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
- Correo: se guarda en minúsculas y sin espacios, máximo 191 caracteres, único (409). Nombre: 3..120 caracteres, espacios colapsados, sin caracteres de control y **sin empezar por `=`, `+`, `-` ni `@`** (desde la importación de RF-21, PROPUESTA; ver "Importación masiva (Dev 2, RF-21)").
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

> **Pendiente de decidir (F5):** `POST /guardians` con un `studentId` que no existe responde **404** en la API, pero la tabla dice **422** ("algún estudiante no existe"). No se ha resuelto: o se corrige la tabla o la API. Lo decide el dueño de Dev 2 con `arquitecto-integrador`. La web muestra el mensaje que devuelve la API en ambos casos.

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

## Importación masiva (Dev 2, RF-21)

> **Estado: PROPUESTA.** Implementado en `apps/api/src/modules/users/import/` (rama `features/adolfo`, sin commit ni PR) y aprobado por `revisor-pr` (INFORME 10, 27/10/2026). Depende de la aceptación del dueño de Dev 2, de D-021 y de D-035. No va al repo del equipo sin acuerdo. La pantalla de carga es de la fase 5. Esta sección sigue el código: si cambia una ruta, un límite, un código o un mensaje, se actualiza aquí.

### Convenciones

- Prefijo `/api/v1`. Los 3 endpoints son solo para ADMIN (`@Roles('ADMIN')` y `ActiveActorGuard`, como el resto de `users`). Sin sesión, 401; sin rol ADMIN o con cuenta no ACTIVE, 403. Los guards corren antes de leer el archivo: sin sesión nunca se lee el cuerpo.
- Multipart: el archivo va en el campo `file`; `type` y, en el commit, `sha256`. Un campo de más o mal formado responde 400 `VALIDATION_ERROR`.
- Tipos (`type`): `students`, `teachers`, `guardians`. Formatos (`format`): `xlsx`, `csv`.
- **Sin estado entre llamadas.** No hay token ni caché: la confirmación vuelve a subir el archivo y se compara su SHA-256 con el de la vista previa.
- Ningún mensaje repite el valor de una celda, un correo o un nombre. Los mensajes son fijos y en español.

### Endpoints

| Método y ruta | Entrada | Respuesta | Errores |
| --- | --- | --- | --- |
| `GET /users/import/template` | Query `type`, `format` (estricta) | 200 archivo, con `Content-Disposition: attachment; filename="plantilla-<type>.<format>"` y `Cache-Control: no-store` | 400; 401; 403 |
| `POST /users/import/preview` | multipart `file`, `type` | 200 `ImportReport` | 400; 401; 403; 409; 413; 415; 429 |
| `POST /users/import/commit` | multipart `file`, `type`, `sha256` (64 hexadecimales) | 201 `ImportCommitResult` | 400; 401; 403; 409; 413; 415; 422; 429 |

**Ruta puente de la web (F5, D-037).** La pantalla de importación no llama a la API desde el navegador. Usa el Route Handler de `apps/web` `/admin/usuarios/importar/archivo/{plantilla|preview|commit}`, que reenvía a estos endpoints solo con la cookie `aula_sid`: `plantilla` acepta GET y `preview` y `commit` aceptan POST con el mismo `file`, `type` y `sha256`. La ruta responde 403 si el `Origin` no es del mismo host, 413 si `Content-Length` falta o supera 1 MiB + 64 KiB, 415 si el cuerpo no es multipart y 400 si `type` o `format` no están en la lista blanca. El resto de códigos son los de la API. No guarda ni registra el archivo ni su nombre.

### Plantillas

Los encabezados pueden ir en cualquier orden. Se normalizan: sin espacios en los extremos, en minúsculas, sin tildes, y los espacios pasan a `_`. Una columna obligatoria que falta, una desconocida o una repetida responde 400. Las filas vacías se ignoran y el número de fila es el físico (encabezado = fila 1).

| Tipo | Columnas | Reglas |
| --- | --- | --- |
| `students` | `correo`, `nombre_completo`, `grado`, `seccion` | `grado` es un entero de 1 a 5. `seccion` es de 1 a 8 letras o dígitos (se pasa a mayúsculas) y se busca en el año activo por grado y código. La matrícula usa la fecha del servidor. |
| `teachers` | `correo`, `nombre_completo` | Correo del dominio institucional (`INSTITUTION_EMAIL_DOMAIN`). |
| `guardians` | `correo_apoderado`, `nombre_apoderado`, `correo_estudiante` | Una fila por par apoderado-estudiante; hasta 10 estudiantes por apoderado. El estudiante ya debe existir y no estar retirado. El apoderado queda exento de dominio (D-013). |

- Plantilla CSV: UTF-8 con BOM, separador `,`, fin de línea CRLF y solo la fila de encabezados. `Content-Type: text/csv; charset=utf-8`.
- Plantilla XLSX: hoja `Datos` (encabezados en negrita, fila 1 fija y lista 1..5 en `grado` hasta la fila 1001) y hoja `Instrucciones`. Sin filas de ejemplo. `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

### Flujo: vista previa y después confirmación

1. `POST /users/import/preview` con el archivo valida el archivo y lo compara con la BD con lecturas simples. **No escribe.** Devuelve `sha256` y `canConfirm`.
2. Si `canConfirm` es `true`, `POST /users/import/commit` con **los mismos bytes**, el mismo `type` y el `sha256` de la vista previa.
3. En el commit, si el SHA-256 no coincide, responde 409 y hay que volver a la vista previa. Si coincide, valida el archivo otra vez y revalida la BD dentro de una transacción. Si hay cualquier error, responde 422 con `details` y no escribe nada. Si todo está bien, crea usuarios, matrículas y vínculos **todo o nada** y responde 201.

- La transacción tiene un tiempo máximo de 20 s y una espera máxima de 5 s para entrar. Las escrituras van en bloques de 500.
- Dos commits del mismo archivo en paralelo dan 201 y 409, o 422 `EMAIL_TAKEN` si el segundo ya ve el correo ocupado. Nunca se duplica un usuario.
- La importación solo crea. Un correo que ya existe, también el de un apoderado, da `EMAIL_TAKEN`. Para vincular un estudiante a un apoderado existente se usa `POST /guardians/:id/students`.

### Respuestas

```ts
type ImportReport = {
  type: 'students' | 'teachers' | 'guardians';
  format: 'xlsx' | 'csv';
  sha256: string;            // 64 hexadecimales en minúsculas; es el que se envía al commit
  totalRows: number;         // filas de datos (sin encabezado ni vacías)
  validRows: number;         // totalRows - errorRows
  errorRows: number;         // filas distintas con al menos un error
  errors: ImportRowError[];  // ordenados por fila y columna; máximo 500
  errorsTruncated: boolean;  // true si hubo más de 500 errores
  summary: { users: number; enrollments: number; links: number }; // lo que se crearía
  canConfirm: boolean;       // true si no hay ningún error
};

type ImportRowError = {
  row: number;               // número físico de la fila (encabezado = 1)
  column: string | null;     // columna de la plantilla; null si afecta a toda la fila
  code: RowErrorCode;        // ver la tabla de códigos
  message: string;           // fijo en español; nunca el valor de la celda
};
```

- `ImportCommitResult` (201): `{ type, created: { users, enrollments, links } }`.
- En 422 el cuerpo es `{ error: { code: "BUSINESS_RULE_VIOLATION", message: "Solicitud invalida", details: ImportRowError[] }, requestId }`, con 500 errores como máximo.
- Un mensaje de duplicado añade la primera aparición: "… (primera aparición en la fila N)".

### Códigos de fila (21)

| Código | Cuándo | Mensaje |
| --- | --- | --- |
| `REQUIRED` | La celda obligatoria está vacía | El campo es obligatorio |
| `INVALID_EMAIL` | El correo no es válido | El correo no es válido |
| `EMAIL_DOMAIN` | El correo de estudiante o docente no es del dominio institucional (el de apoderado está exento, D-013) | El correo no pertenece al dominio institucional |
| `INVALID_NAME` | Nombre de menos de 3 o más de 120 caracteres, con control, o que empieza por = + - @ | El nombre no es válido (3 a 120 caracteres, sin empezar por = + - @) |
| `INVALID_GRADE` | `grado` no es un entero de 1 a 5 | El grado debe ser un número entero del 1 al 5 |
| `INVALID_SECTION` | `seccion` no tiene de 1 a 8 letras o dígitos | La sección debe tener de 1 a 8 letras o dígitos |
| `SECTION_NOT_FOUND` | No hay esa sección en el año activo (BD) | No existe esa sección en el año académico activo |
| `SECTION_INACTIVE` | La sección existe pero está inactiva (BD) | La sección está inactiva |
| `DUPLICATE_IN_FILE` | El correo se repite en el archivo | El correo está repetido en el archivo (primera aparición en la fila N) |
| `EMAIL_TAKEN` | Ya existe un usuario con ese correo (BD); en guardians, el correo del apoderado | Ya existe un usuario con ese correo |
| `STUDENT_NOT_FOUND` | No hay usuario con el correo del estudiante (BD) | No existe un estudiante con ese correo |
| `NOT_STUDENT` | El usuario de ese correo no es estudiante (BD) | El usuario de ese correo no es un estudiante |
| `STUDENT_WITHDRAWN` | El estudiante está retirado (BD) | El estudiante está retirado |
| `SAME_PERSON` | El correo del apoderado y el del estudiante son el mismo | El apoderado y el estudiante deben ser personas distintas |
| `NAME_MISMATCH` | El mismo apoderado aparece con otro nombre (primera aparición en la fila N) | El nombre del apoderado no coincide con el de su primera fila (primera aparición en la fila N) |
| `TOO_MANY_STUDENTS` | El apoderado tiene más de 10 estudiantes en el archivo | El apoderado supera el máximo de 10 estudiantes |
| `DUPLICATE_LINK` | Se repite el par apoderado-estudiante (primera aparición en la fila N) | El vínculo entre ese apoderado y ese estudiante está repetido (primera aparición en la fila N) |
| `FORMULA_NOT_ALLOWED` | La celda del XLSX tiene una fórmula | La celda tiene una fórmula; escribe el valor |
| `INVALID_CELL` | La celda del XLSX es fecha, booleano, error o número no entero | La celda debe ser texto o un número entero |
| `TOO_LONG` | La celda tiene más de 500 caracteres | La celda supera los 500 caracteres |
| `EXTRA_CELLS` | Hay datos fuera de las columnas de la plantilla (`column` es null) | La fila tiene datos fuera de las columnas de la plantilla |

### Errores de archivo

Todos los mensajes son fijos y no incluyen el nombre del archivo ni su contenido.

- **400 `VALIDATION_ERROR`** (archivo o campos):
  - "Debes adjuntar el archivo en el campo file"; "El archivo está vacío".
  - Encabezados: "La primera fila debe tener los encabezados de la plantilla"; "Falta una columna obligatoria de la plantilla"; "Hay una columna que no pertenece a la plantilla"; "Hay una columna repetida en los encabezados"; "Los encabezados deben ser texto".
  - Tamaño y filas: "El archivo no tiene filas de datos"; "El archivo supera el máximo de 1000 filas de datos"; "El archivo supera el máximo de 5000 filas, contando las vacías"; "Una fila del archivo tiene demasiadas columnas".
  - CSV: "Guarda el archivo como CSV UTF-8" (no es UTF-8); "El archivo CSV tiene una comilla sin cerrar".
  - XLSX: "El archivo está dañado o no es un Excel válido"; "El archivo no tiene hojas"; "El contenido del Excel descomprimido supera el límite permitido"; "El Excel tiene demasiadas partes internas"; "El Excel tiene demasiadas hojas, columnas, celdas, combinaciones, validaciones o nombres definidos; usa la plantilla".
  - Campos mal formados (`type`, `format`, `sha256` o campos de más): `details` con `path` y `message`.
- **401** sin sesión. **403** sin rol ADMIN o con cuenta no ACTIVE.
- **409 `CONFLICT`**:
  - "El archivo no coincide con el de la vista previa; vuelve a validarlo" (commit, SHA-256 distinto).
  - "No hay un año académico activo" y "El año académico está cerrado" (solo `students`, en la vista previa y en el commit).
  - "El registro cambió o está en uso; vuelve a intentarlo" (concurrencia, deadlock o transacción caducada).
  - "Ya existe un usuario con ese correo" (carrera en el índice único).
- **413 `PAYLOAD_TOO_LARGE`**: archivo de más de 1 MiB. Mensaje "File too large" (lo fija multer).
- **415 `UNSUPPORTED_MEDIA_TYPE`**:
  - "Formato no admitido: usa un archivo .xlsx o .csv" (otra extensión: `.xls`, `.xlsm`, `.ods`, `.exe`, sin extensión).
  - "El contenido del archivo no coincide con su extensión" (un ZIP con `.csv`, un CSV con `.xlsx`, un `.xlsx` cifrado, que es un contenedor OLE, o un ejecutable renombrado).
  - "El archivo CSV contiene datos binarios" (byte NUL).
  - "No se admiten archivos con macros" (`xl/vbaProject.bin`).
  - "El Excel contiene declaraciones XML no permitidas" (`DOCTYPE` o `ENTITY`).
  - "El Excel usa una característica no admitida (cifrado, ZIP64 o varios discos)" (también métodos de compresión no admitidos).
  - "El Excel tiene partes XML con una codificación no admitida (solo UTF-8)".
  - "El Excel usa nombres internos con una codificación no admitida" (campo extra Unicode).
- **422 `BUSINESS_RULE_VIOLATION`** (solo commit): errores de fila o de BD en `details`. Nada escrito.
- **429 `ERROR`**: más de 10 peticiones por minuto a preview o a commit (`IMPORT_RATE_LIMIT`). El filtro no tiene el 429 en su tabla, así que el código es `ERROR`.

### Límites

| Límite | Valor | Si se supera |
| --- | --- | --- |
| Tamaño del archivo | 1 MiB (1 048 576 bytes, D-007) | 413 |
| Filas de datos | 1000 (sin encabezado ni vacías) | 400 |
| Filas físicas | 5000 (contando vacías y encabezado) | 400 |
| Campos por registro CSV | 16 384 | 400 |
| Columnas útiles por fila | 30 (si hay datos después, `EXTRA_CELLS`) | Código de fila |
| Caracteres por celda | 500 | `TOO_LONG` |
| Errores devueltos | 500 | `errorsTruncated: true` |
| Celdas del libro XLSX | 50 000 | 400 |
| Hojas del libro XLSX | 50, con `sheetId` ≤ 1000 (solo se lee la primera) | 400 |
| Combinaciones (`mergeCell`) | 500 | 400 |
| Áreas de validación y nombres definidos | 50 000 celdas en total | 400 |
| Columnas del libro | Suma de la columna más alta de cada hoja ≤ 3 × 16 384 | 400 |
| Ancho de filas del libro | 500 000 (suma, fila a fila, de la columna más alta usada) | 400 |
| Partes del ZIP del XLSX | 100 | 400 |
| Descomprimido del XLSX | 8 MiB en total y 4 MiB por parte | 400 |
| Peticiones de preview y commit | 10 por minuto | 429 |
| Transacción del commit | 20 s de tiempo máximo y 5 s de espera | 409 si caduca |

### Exportaciones CSV (contrato para Dev 5)

Toda exportación CSV del sistema (reportes, listados, notas, bitácora) debe usar `escapeCsvCell` o `toCsvLine` de `apps/api/src/modules/users/import/csv-escape.ts`:

- Si la celda empieza por `=`, `+`, `-`, `@`, TAB o CR, se antepone un apóstrofo (`'`) para que la hoja de cálculo no la interprete como fórmula. Esto incluye los correos que empiezan por `+` o `-`. El apóstrofo cambia el valor exportado: es intencional.
- Si contiene `"`, `,`, `;`, CR o LF, se entrecomilla y las `"` internas se duplican (RFC 4180). El `;` se entrecomilla también para Excel con configuración regional hispana.
- `toCsvLine(cells, separator = ',')` une las celdas ya escapadas.

```ts
escapeCsvCell(value: string): string;
toCsvLine(cells: readonly string[], separator = ','): string;
```

- Los datos ya llegan sin espacios al inicio, pero el escape se aplica igual a todo texto que venga de la BD.
- Este contrato es para CSV. Para XLSX, Dev 5 debe revisar cómo escribe las celdas; no está probado aquí.

### Nombres (`fullNameSchema`, también en F3)

`fullNameSchema` rechaza los nombres que empiezan por `=`, `+`, `-` o `@`. Aplica a `POST /students`, `POST /teachers`, `POST /guardians` y a `PATCH /users/:id` cuando llega `fullName`: responde 400 `VALIDATION_ERROR` con `details` (`path: "fullName"`) y el mensaje "El nombre no puede empezar por = + - @".

Pendiente: comprobar en la base de datos real si hay nombres guardados que empiecen por esos caracteres. Un `PATCH` de ese nombre fallará hasta corregirlo.

### Bitácora

- Una entrada por importación confirmada, después del commit: `module: 'users'`, `action: 'users.import.commit'`, sin `entityType` ni `entityId`.
- `afterState`: `{ type, format, rows, usersCreated, enrollmentsCreated, linksCreated, userIds }`. Solo ids y conteos: nunca correos, nombres, filas ni el nombre del archivo.
- La vista previa y los commits rechazados (409, 422) no se registran.
- Se escribe después del commit (pendiente de Dev 1, D-019). Si falla, se registra en el log sin revertir la importación.
- No emite eventos de dominio: los eventos de D-034 no aplican a altas.

### Datos de menores y memoria

- El archivo se procesa en memoria: no va a disco, a Redis, a MinIO ni a ningún log. Al terminar, también si hay error, el buffer se pone a cero.
- El archivo no se guarda, así que no pasa por ClamAV (D-035). Si algún día se guardara, pasaría por ClamAV (RF-40).
- Limitación aceptada: las cadenas de JavaScript no se pueden borrar de memoria. Nombres y correos pueden seguir en el montón hasta que el recolector los libere (D-035).

## API de clonación y promoción de años (Dev 2, F6: RF-15, RF-16; RN-15)

> **Estado: PROPUESTA** (29/10/2026). Implementado en `apps/api/src/modules/academic/` (clonación) y `apps/api/src/modules/users/promotion/` (promoción), rama `features/adolfo`, sin commit ni PR al equipo. Revisado por `seguridad-cumplimiento` (INFORMES 4, 9 y 13) y `ux-accesibilidad` (INFORMES 5, 8 y 14). Depende de la aceptación del dueño de Dev 2 y de D-038. Sin cambios de esquema. Esta sección sigue el código.

### Convenciones

- Prefijo `/api/v1`. Los 3 endpoints son solo para ADMIN (`@Roles('ADMIN')` y `ActiveActorGuard`). Sin sesión, 401; sin rol ADMIN o con cuenta no ACTIVE, 403.
- `:id` es siempre el **año destino**.
- Entrada estricta: un campo de más responde 400.
- Errores con el formato común. Los mensajes son fijos y nunca incluyen nombres ni correos.

### Endpoints

| Método y ruta | Entrada | Respuesta | Errores |
| --- | --- | --- | --- |
| `POST /academic-years/:id/clone-structure` | Cuerpo `{ sourceYearId, copyTeachers? }` | 201 `CloneStructureResult` | 400; 401; 403; 404; 409; 422 |
| `GET /academic-years/:id/promotion-proposal?sourceYearId=` | Query `sourceYearId` (UUID) | 200 `PromotionProposal` | 400; 401; 403; 404; 409; 422 |
| `POST /academic-years/:id/promotion` | Cuerpo `{ sourceYearId, fingerprint, decisions }` | 201 `PromotionResult` | 400; 401; 403; 404; 409; 422 |

### Clonar la estructura (RF-15)

Cuerpo: `sourceYearId` (UUID, año origen) y `copyTeachers` (booleano, por defecto `false`).

```json
{
  "targetYear": { "id": "uuid", "year": 2027, "isActive": false, "closedAt": null, "readOnly": false },
  "sourceYearId": "uuid",
  "created": { "sections": 6, "courseSections": 30, "teachersAssigned": 0 },
  "skipped": { "inactiveSections": 0, "inactiveCourseSections": 0, "inactiveCourses": 0, "teachersNotActive": 0 }
}
```

- 400: campos de más, `sourceYearId` que no es UUID o `copyTeachers` que no es booleano.
- 404: "El año académico no existe" (destino) o "El año de origen no existe".
- 409: "El año académico está cerrado"; "El año académico es de solo lectura"; "El año de destino ya tiene secciones" (un segundo clon también responde esto, sin escribir); "El registro cambió o está en uso; vuelve a intentarlo" (concurrencia o deadlock).
- 422: "El año de origen y el de destino deben ser distintos"; "El año de origen debe ser anterior al año de destino"; "El año de origen no tiene secciones activas".

Reglas:

- Se copian solo las secciones activas y, de cada una, los curso-sección activos con curso activo. No se copian períodos (el destino ya los tiene, RF-09), matrículas, vínculos ni contenidos.
- `teacherId` queda `null` salvo con `copyTeachers: true`: entonces se conserva solo si el docente sigue con rol TEACHER y estado ACTIVE. Si no, queda `null` y se cuenta en `skipped.teachersNotActive`.
- Una sola transacción. Bloqueos: docentes (si se copian), año origen y año destino, de menor a mayor.
- Bitácora `academic.year.clone_structure` sobre el año destino, después del commit: `sourceYearId`, `copyTeachers` y conteos. Sin nombres. No emite eventos.

### Propuesta de promoción (RF-16)

`GET` sin estado y sin bitácora: la propuesta se recalcula en cada lectura.

```json
{
  "sourceYear": { "id": "uuid", "year": 2026 },
  "targetYear": { "id": "uuid", "year": 2027 },
  "fingerprint": "64 caracteres hexadecimales",
  "targetSections": [{ "id": "uuid", "gradeLevel": 1, "code": "A" }],
  "items": [{
    "enrollmentId": "uuid", "studentId": "uuid", "fullName": "Nombre", "status": "ACTIVE",
    "from": { "sectionId": "uuid", "gradeLevel": 2, "code": "A" },
    "proposed": { "action": "PROMOTE", "sectionId": "uuid" },
    "flags": []
  }],
  "summary": { "promote": 0, "repeat": 0, "graduate": 0, "exclude": 0, "withoutSection": 0 },
  "canConfirm": true
}
```

- Entran las matrículas vigentes del año origen. Un retirado con matrícula ya cerrada, o un estudiante sin matrícula vigente, no aparece.
- Acción propuesta: grados 1 a 4, `PROMOTE` al grado siguiente; grado 5, `GRADUATE`; retirado (`WITHDRAWN`) o ya matriculado en el destino, `EXCLUDE`; inactivo, `PROMOTE` con la marca `INACTIVE`.
- Sección propuesta: la del mismo código si existe y está activa; si no, la única activa de ese grado; si no, `null` con la marca `NO_TARGET_SECTION`.
- Marcas (`flags`): `INACTIVE`, `WITHDRAWN`, `NO_TARGET_SECTION`, `ALREADY_ENROLLED`. Las filas se ordenan por grado, código y nombre.
- `canConfirm` es `false` si alguna fila `PROMOTE` o `REPEAT` no tiene sección elegida.
- `fingerprint`: SHA-256 de las matrículas vigentes del origen, las secciones activas del destino y las matrículas ya existentes en el destino. Se calcula en el servidor.
- 400; 404 (como en la clonación); 409 "El año de destino está cerrado" o "El año de destino es de solo lectura"; 422: "El año de origen y el de destino deben ser distintos", "El año de destino debe ser el siguiente al año de origen", "Cierra todos los períodos del año de origen antes de promover" (origen con algún período abierto) y "El año de destino no tiene secciones activas".

### Confirmar la promoción (RF-16, RN-15, D-038)

Cuerpo:

```json
{
  "sourceYearId": "uuid",
  "fingerprint": "64 caracteres hexadecimales en minúsculas",
  "decisions": [{ "enrollmentId": "uuid", "action": "PROMOTE", "sectionId": "uuid" }]
}
```

- `action`: `PROMOTE`, `REPEAT`, `GRADUATE` o `EXCLUDE`. `sectionId` es obligatorio en `PROMOTE` y `REPEAT` (sección activa del año destino) y no se admite en `GRADUATE` ni en `EXCLUDE`.
- Entre 1 y 2000 decisiones, sin matrículas repetidas. Las decisiones deben cubrir **todas** las filas de la propuesta.
- Correcciones permitidas: `PROMOTE` (grados 1 a 4), `REPEAT` (cualquier grado), `GRADUATE` (solo grado 5) y `EXCLUDE`. Las filas `WITHDRAWN` y `ALREADY_ENROLLED` solo admiten `EXCLUDE`.

Respuesta 201:

```json
{ "promoted": 50, "repeated": 2, "graduated": 9, "excluded": 1, "closedEnrollments": 61, "createdEnrollments": 52 }
```

Errores:

- 400: cuerpo mal formado, campos de más, huella que no es hexadecimal de 64 caracteres o más de 2000 decisiones.
- 404: destino u origen no existen.
- 409: "La propuesta cambió; vuelve a cargarla" (la huella no coincide con el estado actual); "El año de destino está cerrado" o "El año de destino es de solo lectura"; "El registro cambió o está en uso; vuelve a intentarlo" (concurrencia, deadlock o transacción caducada a los 20 s).
- 422 `BUSINESS_RULE_VIOLATION` con `details` `[{ path, message }]`: `path` es `decisions` (faltan filas o sobran) o `decisions.<índice>` (matrícula ajena a la propuesta, acción no permitida, sección que falta, sección de otro grado o no activa, o sección en una acción que no la lleva).

Efecto, todo o nada (si cualquier error, no se escribe nada):

- `PROMOTE`, `REPEAT` y `GRADUATE` cierran la matrícula del origen: `isCurrent` NULL, `endReason` `YEAR_END`, `effectiveTo` = el mayor entre el instante de la confirmación y `effectiveFrom`.
- `PROMOTE` y `REPEAT` crean la matrícula en el destino: `isCurrent` TRUE, `effectiveFrom` = instante de la confirmación.
- `EXCLUDE` deja la matrícula del origen vigente. Así se confirma en tandas: lo que queda para después vuelve a aparecer en la siguiente propuesta.
- No cambia el `status` de ningún usuario. No toca notas, contenidos ni datos de años anteriores.
- Permitido sobre un año origen cerrado o de solo lectura (D-038).
- Bloqueos, en orden: estudiantes, años de menor a mayor y secciones del destino. Después se revalidan la huella, las condiciones y las decisiones.
- Bitácora `users.promotion.commit` sobre el año destino, después del commit: `sourceYearId`, conteos y los ids de matrículas cerradas y creadas. Sin nombres ni correos. No emite eventos.

### Límite del cuerpo JSON y 413 (nota de plataforma, pendiente de Dev 1)

- El cuerpo JSON admite hasta **512 KB** (`JSON_BODY_LIMIT` en `apps/api/src/app.setup.ts`; antes, el 100 KB de Express). Una promoción de 2000 decisiones con `sectionId` ronda 250 KB.
- Un cuerpo mayor responde **413** `PAYLOAD_TOO_LARGE` con el mensaje "El cuerpo de la solicitud supera el tamaño permitido", sin `details` (`apps/api/src/common/errors/api-exception.filter.ts`). Antes respondía 500.
- Cambio autorizado por el usuario el 29/10/2026 y **pendiente de revisión por Dev 1**, dueño de esos dos archivos.
- Pendiente de Dev 1: un JSON mal formado sigue respondiendo 500.

### Pendientes

- El texto literal de RF-15 y RF-16 en la ERS no está confirmado. Las reglas salen del expediente, de RN-15 (`docs/04_REGLAS_ESTADOS.md`) y de D-029 y D-030.
- ¿Los egresados (grado 5, `GRADUATE`) pasan a `INACTIVE`? Por ahora no: conservan `ACTIVE`.

## API de autenticación (Dev 1, RF-68 a RF-88; fases A y B)

> **Estado: PROPUESTA** (05/11/2026). Código en `apps/api/src/modules/auth/` y `apps/api/src/common/`. Decisiones D-058 a D-063; requerimientos en `docs/11_ANEXO_ERS_CODIGO_USUARIO.md`. Prefijo `/api/v1`.

### Sesión y pasos del primer ingreso

- La sesión viaja en la cookie `aula_sid`. `POST /auth/login`, `GET /auth/me` y los cambios de estado devuelven `{ id, role, mustAcceptPolicy, mustChangePassword, mustVerifyEmail }`.
- Mientras `mustChangePassword` sea verdadero, la API responde **403 `PASSWORD_CHANGE_REQUIRED`** a todo salvo `me`, `logout` y `password`. Con `mustVerifyEmail`, responde **403 `EMAIL_VERIFICATION_REQUIRED`** a todo salvo esas rutas, `policy/accept` y `email/*` (RN-18). Orden: contraseña, política, correo.
- Cambiar la contraseña, verificar el correo o recuperar la contraseña cierran todas las sesiones anteriores del usuario (RF-78) y, cuando corresponde, abren una nueva.

### Endpoints

| Método y ruta | Rol | Cuerpo | Respuesta | Límite |
| --- | --- | --- | --- | --- |
| `POST /auth/login` | público | `{ code, password, totp? }` (`code`: 10 dígitos) | 200 con la sesión; 401 genérico (código mal escrito, inexistente, bloqueado o clave errada); 403 cuenta inactiva | 5/min por IP; 5 fallos seguidos por cuenta bloquean 15 min |
| `GET /auth/me` | sesión | — | 200 con la sesión | — |
| `POST /auth/password` | sesión | `{ currentPassword, newPassword }` | 204 y cookie nueva; 400 `INVALID_CURRENT_PASSWORD` o lista de problemas de la política | 5/min |
| `POST /auth/policy/accept` | sesión | `{ privacy: true, terms: true, onBehalfOfWards? }` (el apoderado debe enviar `onBehalfOfWards: true`) | 204; 400 | — |
| `POST /auth/email/start` | sesión | `{ email, guardian? }` | 204; 429 `RESEND_TOO_SOON` o `RESEND_LIMIT`; 503 `MAIL_UNAVAILABLE` | 5/min; 1 código por minuto y 3 por hora |
| `POST /auth/email/verify` | sesión | `{ code }` (6 dígitos) | 204 y cookie nueva; 400 `CODE_INVALID` o `CODE_EXPIRED` | 10/min; 5 intentos por código |
| `POST /auth/recover/request` | público | `{ code }` (código de usuario) | 204 siempre, exista o no el usuario | 3/min |
| `POST /auth/recover/confirm` | público | `{ code, emailCode, newPassword }` | 204; 400 `INVALID_RECOVERY` (mismo error para todo fallo del código) o lista de problemas de la política | 5/min |
| `POST /auth/users/:id/email/manual-verification` | ADMIN | `{ email, reason }` (motivo de 10 a 500 caracteres) | 204; 404 | — |
| `POST /auth/2fa/setup`, `POST /auth/2fa/enable`, `POST /auth/logout` | ver docs/11 | sin cambios | — | — |

### Reglas

- **Código de usuario:** 10 dígitos; `AA` (año de alta, hora de Lima) + 7 aleatorios + dígito de control Luhn. Un código con el dígito de control mal responde igual que uno inexistente y no cuenta como intento.
- **Códigos de un solo uso (correo y recuperación):** 6 dígitos, vigentes 5 minutos, 5 intentos (al quinto fallo el código se invalida), guardados con hash en Redis.
- **Política de contraseñas:** 8 a 128 caracteres; no puede ser común, repetir un carácter ni contener el código de usuario o el DNI; el cambio debe ser distinto de la actual.
- **Bitácora:** `auth.login`, `auth.login_failed`, `auth.account_locked`, `auth.login_blocked`, `auth.password_changed`, `auth.password_change_failed`, `auth.password_recovered`, `auth.recovery_requested`, `auth.email_code_sent`, `auth.email_verified`, `auth.email_verified_manually` y `auth.policy_accepted`. Nunca llevan contraseñas, códigos, correos ni DNI; el motivo de la verificación manual es texto libre y no debe contener datos personales.
- **Variables de entorno nuevas:** `PII_ENCRYPTION_KEY`, `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCK_SECONDS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM`. En producción son obligatorias la clave y las credenciales SMTP.
