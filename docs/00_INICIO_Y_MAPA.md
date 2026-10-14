# 00 — Inicio rápido: mapa de responsabilidades

**Fuente normativa del proyecto:** ERS v1.0, 13/10/2026 (todavía borrador institucional). **Fuente de planificación:** Plan de Trabajo 13/10/2026. **Carácter de este documento:** propuesta operativa del Sprint 0, sujeta a revisión.

## Objetivo

Que los cinco desarrolladores sepan dónde empezar, cuáles son las entidades compartidas y qué espera cada módulo de los otros. Las carpetas que siguen son estructura **objetivo**, no carpetas existentes confirmadas.

| Desarrollador | Responsabilidad según plan | Identificadores | Interfaces que debe acordar |
|---|---|---|---|
| Dev 1 | Plataforma, autenticación, seguridad e integración | RF-01..08, RNF transversales | usuario autenticado, guard de rol y pertenencia, auditoría, configuración, CI |
| Dev 2 | Estructura académica y usuarios | RF-09..25 | `User`, `AcademicYear`, `AcademicPeriod`, `Section`, `CourseSection`, `Enrollment` |
| **Dev 3 (Christian)** | **Contenidos, entregas y almacenamiento** | **RF-26..31, RF-33..40, RNF-03/18** | `Material`, `Assignment`, `Submission`, `SubmissionVersion`, `StoredFile`, API de subida |
| Dev 4 | Calificaciones y apoderados | RF-41..52, RN-01..07, RNF-31 | `Grade`, cálculo de NE, exoneración, vista PDF, consulta por estudiante |
| Dev 5 | Anuncios, notificaciones, reportes, ciclo de vida | RF-32, RF-53..67 | eventos tarea/entrega/nota, worker y colas, purga, exportaciones |

Los 14 RF del Dev 3 se cuentan como RF-26..31 (6) + RF-33..40 (8). RF-32 pertenece a Dev 5 en el plan aunque esté en la sección de contenidos de la ERS.

## Cinco principios del Sprint 0

1. **Una identidad de datos:** claves UUID y nombres unívocos; ningún módulo inventa otra tabla de tareas o alumnos.
2. **Una fuente de verdad por agregado:** Dev 2 controla matrícula y cursos; Dev 3 controla tareas y entregas; Dev 4 controla notas y NE.
3. **Contratos antes de integraciones:** definición explícita de endpoints, eventos y errores antes de consumir APIs ajenas.
4. **Aislamiento seguro:** el frontend nunca sustituye la autorización del backend. PDF privado, no URL pública permanente.
5. **PRs pequeños:** cambios trazables a RF/RN/RNF, validación automatizada y aprobación cruzada.

## Regla para iniciar un módulo

Lee su ERS; identifica dueño de cada entidad; acuerda DTO y permisos; usa seed ficticio; construye un flujo vertical (backend + frontend + tests); abre PR a `develop`. Si algo todavía no está disponible, usa fixtures/mocks contra el contrato versionado, **sin copiar ni inventar el modelo del vecino**.

## Primera revisión grupal requerida

Aprobar: nombre de los responsables Dev 1/2/4/5, IDs comunes, modelo académico, ownership del estado NE, operación de uploads y worker antivirus, registro de eventos, y permisos de usuario. Registrar todo en `08_DECISIONES.md`.
