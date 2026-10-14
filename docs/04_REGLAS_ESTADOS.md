# 04 — Reglas de negocio, estados y escenarios límite

## Reglas textuales de la ERS (§4)

| Regla | Criterio que se debe preservar | Módulo principal |
|---|---|---|
| RN-01 | Nota numérica 0..20 | Dev 4 |
| RN-02 | Promedio simple, ninguna ponderación | Dev 4 |
| RN-03 | Redondear **una sola vez**, .5 hacia arriba, cálculo decimal exacto | Dev 4 |
| RN-04 | Tabla configurable; por defecto AD 18..20, A 14..17, B 11..13, C 0..10 | Dev 4/5 |
| RN-05 | Nota NE por tarea, 0..20, predeterminada 0; cuenta en promedio | Dev 4, configuración Dev 3 |
| RN-06 | Tardía solo si tarea permite; sin descuento automático | Dev 3 y Dev 4 |
| RN-07 | Exoneración no cuenta en promedio | Dev 4 |
| RN-08 | Solo PDF; 20 MB predeterminado, máximo 50 MB | **Dev 3** |
| RN-09 | Reentrega antes del plazo; última versión oficial | **Dev 3** |
| RN-10 | Con período cerrado no crear/editar/calificar actividades | Dev 2, **Dev 3**, Dev 4 |
| RN-11 | Un año lectivo activo; otros solo lectura | Dev 2 y todos |
| RN-12 | Pertenencia de docente, estudiante, apoderado y admin | Dev 1 y todos |
| RN-13 | Baja lógica del usuario | Dev 2/1 |
| RN-14 | Notas, promedios, bitácora conservados; PDF purgados según regla | Dev 4/1/5 y Dev 3 |
| RN-15 | Promoción confirmada manualmente por admin | Dev 2 |

## Los seis estados **visibles** que exige RF-38

1. **Pendiente**; 2. **Entregada**; 3. **Entregada con retraso**; 4. **No entregada (NE)**; 5. **Calificada**; 6. **Exonerada**.

**Propuesta de implementación:** mantener por separado (a) validación del archivo/versión, (b) puntualidad `isLate`, y (c) evaluación `Grade.state` (`GRADED`/`NE`/`EXEMPT`). Construir `displayStatus` al consultar, con precedencia acordada. Esto evita perder que una entrega fue tardía luego de calificarla. Los seis rótulos de RF-38 se conservan en UI, sin asumir que la ERS exige una sola columna enum.

| Situación | Propuesta de `displayStatus` |
|---|---|
| No hay versión aprobada y no venció | Pendiente |
| No hay versión aprobada y Dev 4 registró NE | No entregada (NE) |
| Dev 4 marcó exoneración | Exonerada |
| Dev 4 registró nota | Calificada (mostrar distintivo 'con retraso' si corresponde) |
| Hay versión limpia aceptada a tiempo, sin nota | Entregada |
| Hay versión limpia aceptada tarde, sin nota | Entregada con retraso |

## Línea de tiempo de subida propuesta (necesita decisión de equipo)

```mermaid
flowchart TD
 A[Iniciar upload con autorización] --> B[Objeto temporal en MinIO/R2]
 B --> C[Validación MIME + firma PDF + tamaño]
 C -->|falla| X[Rechazar y limpiar objeto]
 C -->|correcto| D[ClamAV analiza]
 D -->|infectado| X
 D -->|limpio| E[Confirmar version y constancia]
 E --> F[Notificar estado a Dev 4 y Dev 5]
```

**No afirmar entrega exitosa antes de tener archivo íntegro y seguro.** Considerar recibo de intento de subida pendiente (separado de constancia de entrega válida) cuando un escaneo se demora. El instante determinante de entrega en un proceso asincrónico está **PENDIENTE DE APROBACIÓN**.

## Escenarios que el equipo debe resolver

- **A:** PDF de 20 MB exactos, PDF de 20 MB +1 byte y tarea con límite 50 MB.
- **B:** usuario `.pdf` que contiene binario no PDF; `.exe` renombrado PDF; PDF corrupto o protegido.
- **C:** subido 23:58, antivirus termina 00:02; si había fecha límite 23:59, ¿qué marca de tiempo fija puntualidad?
- **D:** tarea permite tardías; hay NE asignada; llega PDF válido. RF-45 pide sustitución de NE por nota que asigne docente. Dev 3 NO modifica unilateralmente `Grade`.
- **E:** tarea NO permite tardías; se bloquea la subida después de vencimiento (RF-37).
- **F:** período académico cerrado; bloquear creación, edición y calificación, y precisar comportamiento de descargas y entregas tardías asociadas al período (a acordar).
- **G:** estudiante cambia de sección después de entregar; se conserva historial (RF-24).
- **H:** libro reutilizable sobrevive a purga; material común no reutilizable sigue regla de retención RF-66.
- **I:** mismo request duplicado por reintentos de red: idempotencia sin crear dos versiones.

## Alcance excluido (ERS §7)

No implementar asistencia, exámenes/cuestionarios, SIAGIE, integración Google Drive/Classroom, detección automática de entregas duplicadas ni ponderación de actividades.
