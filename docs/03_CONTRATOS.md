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
| `period.closed.v1` | Dev 2 | Dev 3/4/5 | periodId, closedAt |
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
