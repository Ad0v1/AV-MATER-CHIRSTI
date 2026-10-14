# 08 — Registro de decisiones y asuntos abiertos (ADR ligero)

**Tipos:** `CONFIRMADO EN ERS` = explícito en fuente; `CONFIRMADO POR EQUIPO` = confirmado en conversación; `PROPUESTA` = requiere acuerdo; `PENDIENTE INSTITUCIÓN` = ERS no lo resuelve.

| ID | Tema | Estado | Propuesta / constatación | Quién debe aceptar |
|---|---|---|---|---|
| D-001 | Alcance | CONFIRMADO EN ERS | Sin asistencia, exámenes ni SIAGIE en v1 (§7) | Todos |
| D-002 | Períodos | CONFIRMADO POR EQUIPO | I Bimestre, II Bimestre, III Trimestre, IV Trimestre (§2.2) | Todos |
| D-003 | Cuatro perfiles | CONFIRMADO EN ERS | Estudiante, Docente, Admin, Apoderado (§1.4) | Dev 1/2 |
| D-004 | IDs entidades | PROPUESTA | UUID y nombres del diccionario; sin tablas redundantes | Dev 1/2/3/4/5 |
| D-005 | Rutas API | PROPUESTA | `/api/v1`, tipos DTO y errores de `03_CONTRATOS.md` | Dev 1 y dueños |
| D-006 | Timestamp de entrega | **PENDIENTE** | Usar hora de upload completado, no hora de scan, tras confirmar integridad | Dev 1/3/4 |
| D-007 | Unidades MB | **PENDIENTE** | Elegir MB (10^6) o MiB (2^20); ERS no especifica | Dev 3/institución |
| D-008 | Modelo seis estados | PROPUESTA | Estado visible derivado de archivo aprobado + atraso + Grade | Dev 3/4 |
| D-009 | Cola antivirus | **PENDIENTE** | Dev 3 es dueño de validación; Dev 5 de worker infra compartido | Dev 1/3/5 |
| D-010 | Período de material | **PENDIENTE** | `Material.periodId` opcional hasta aclaración ERS | Dev 2/3 |
| D-011 | Traslado y matrícula histórica | **PENDIENTE** | Enrollment con vigencias para mantener historial RF-24 | Dev 2/3/4 |
| D-012 | Rol múltiple | **PENDIENTE** | Empezar con rol simple solo si institución lo avala | Dev 1/2 |
| D-013 | Identidad apoderado | PENDIENTE INSTITUCIÓN | Google institucional vs cuenta local (ERS §8) | Institución/Dev 1 |
| D-014 | Promedio anual | PENDIENTE INSTITUCIÓN | ERS §8 asume promedio simple de cuatro períodos | Institución/Dev 4 |
| D-015 | Plazo purga | PENDIENTE INSTITUCIÓN | Por defecto 60 días después de cerrar año, ERS §8 | Institución/Dev 5 |
| D-016 | Capacidad esperada | PENDIENTE INSTITUCIÓN | Número usuarios + tamaño total de archivos (§8) | Institución/Dev 1/5 |
| D-017 | Nombre institución | PENDIENTE INSTITUCIÓN | Portada ERS tiene marcador sin completar | Institución |
| D-018 | Zona horaria | PROPUESTA | UTC en DB; `America/Lima` en interfaz | Todos |
| D-019 | Propiedad de audit trail | CONFIRMADO EN PLAN | Dev 1 servicio compartido; cada módulo llama a servicio | Todos |
| D-020 | Migraciones | CONFIRMADO EN PLAN | Sincronizar develop y una migración por PR; revisiones cruzadas | Todos |

## Plantilla ADR para nuevas decisiones

```text
ID: D-0XX
Título:
Estado: propuesta | aprobado | rechazado | sustituido
Fuente ERS/RF/RN/RNF:
Problema / opciones:
Decisión y motivo:
Impacta a:
Aprobadores y fecha:
PR de implementación:
```

**Atención:** un equipo no debe cerrar unilateralmente un requerimiento de negocio que la ERS dejó para la institución. Registrar y escalar, no inventar aprobación.
