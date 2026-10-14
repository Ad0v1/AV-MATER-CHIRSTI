# 05 — Autorización, archivos y privacidad

## Basado en ERS

- 4 perfiles: Estudiante, Docente, Administrador, Apoderado (ERS §1.4).
- Acceso con cuenta Workspace institucional y lista blanca (RF-02/03), cuenta de respaldo de admin con TOTP (RF-04), usuarios inactivos bloqueados (RF-08).
- Verificar rol **y pertenencia en backend** por cada petición (RNF-02, RN-12).
- Archivos **no públicos**, nombres UUID y descargas mediante URL firmada de corta duración tras autorización (RNF-03).
- PDFs enviados directamente al S3 mediante URL firmada (RNF-18), con escaneo ClamAV (RF-40).
- Bitácora (RNF-14/15); privacidad de menores, control legal y conservación (RNF-09..13, RN-14).

## Matriz de permisos mínima (propuesta derivada de los RF)

| Operación | Estudiante | Docente | Admin | Apoderado |
|---|---|---|---|---|
| Ver materiales | Solo sus cursos | Solo cursos asignados | Todos | No, salvo decisión posterior |
| Publicar/editar clases o lecturas | No | Solo sus cursos y período abierto | Sí en modo soporte auditado | No |
| Crear/editar tareas | No | Solo sus cursos y período abierto | Sí en modo soporte auditado | No |
| Subir/reentregar PDF | Solo propia matrícula + tarea válida | No | No de forma ordinaria | No |
| Ver versión propia | Sí | Sí, de cursos asignados | Sí | Solo estado visible, no archivo privado sin autorización explícita |
| Ver entregas de estudiantes | No | Solo sus cursos | Sí | Solo estados de vinculados (RF-52) |
| Calificar/exonerar | No | Solo sus cursos | Sí en modo soporte auditado | No |
| Ver mis notas | Propias | Registro de sus cursos | Todas | Notas de vinculados, lectura |
| Ver bitácora y exportaciones | No | No | Sí | No |

**No hay un permiso general 'admin puede cualquier cosa sin auditoría'**: modo soporte queda registrado (RF-56, RNF-14). La matriz requiere revisión con Dev 1.

## Protección de cargas

1. Back verifica pertenencia y tarea antes de emitir URL de subida.
2. La URL firmada debe tener vencimiento corto, objeto UUID y restricciones de operación. **Valor exacto de TTL: decisión por tomar.**
3. El objeto se crea en espacio privado y se considera en **cuarentena** hasta análisis aprobado.
4. Verificar en servidor extensión, MIME y **contenido real** (RF-34), tamaño y PDF válido; MIME del navegador es insuficiente.
5. No permitir descarga de objeto no aprobado.
6. Registrar operación crítica y error; usar logs sin datos sensibles/secretos.
7. Aplicar proceso de purga de RF-66 sin borrar notas, promedios y bitácora.

## Datos que nunca deben subirse a Git

Credenciales OAuth, `DATABASE_URL`, claves MinIO/R2, secretos de sesiones, secretos TOTP, datos reales de menores, archivos PDF de alumnos y `.env` personales. Publicar solo `.env.example` sin secretos y semillas ficticias.

## Legal

La ERS refiere la Ley 29733 y su reglamento, protección de menores y copyright. Este documento no certifica cumplimiento legal; Dev 1 y la institución deberán validar políticas, responsables y procesos con quienes corresponda. **No asumir que una decisión técnica reemplaza la aprobación legal.**
