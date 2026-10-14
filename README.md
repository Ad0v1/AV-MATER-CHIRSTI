# AV-MATER-CHIRSTI — documentación maestra del Sprint 0

> **Estado: propuesta para revisión del equipo (v0.1, 13/10/2026).** No es una implementación ni una ERS aprobada. Este paquete se debe revisar en PR hacia `develop`, especialmente por Dev 1 (integrador), Dev 2 y Dev 4.

Proyecto: **Aula Virtual Institucional (Secundaria)**. Alcance único: `docs/fuentes/ERS_Aula_Virtual_Secundaria.pdf` (v1.0, borrador) y `docs/fuentes/Plan_Trabajo_Aula_Virtual.pdf` (13/10/2026). Las decisiones técnicas adicionales se identifican como **PROPUESTA**, no como requisitos de la institución.

## Si acabas de entrar al proyecto

1. Lee [00 — Inicio y mapa del Sprint 0](docs/00_INICIO_Y_MAPA.md) (5 minutos).
2. Localiza tu responsabilidad en [01 — Arquitectura y límites](docs/01_ARQUITECTURA.md).
3. Revisa [02 — Diccionario de entidades](docs/02_MODELO_ENTIDADES.md) y el [diagrama ER conceptual](docs/diagramas/erd.mmd).
4. Antes de implementar una integración, revisa [03 — Contratos entre módulos](docs/03_CONTRATOS.md) y [04 — Reglas y estados](docs/04_REGLAS_ESTADOS.md).
5. Aplica [05 — Acceso y privacidad](docs/05_AUTORIZACION.md), [06 — Git y calidad](docs/06_GIT_CALIDAD.md) y [07 — Plan Sprint 0](docs/07_PLAN_SPRINT0.md).
6. Registra desacuerdos en [08 — Decisiones pendientes](docs/08_DECISIONES.md). Dev 1 coordina aprobación del contrato y la integración.
7. Usa [09 — Casos QA](docs/09_QA_BASE.md) y [10 — Trazabilidad](docs/10_TRAZABILIDAD.md).

## Qué contiene el paquete

| Carpeta/archivo | Uso |
|---|---|
| `docs/*.md` | Acuerdos técnicos maestros (editables y revisables en Git) |
| `docs/diagramas/erd.mmd` | Relaciones conceptuales, representables con Mermaid |
| `docs/propuestas/schema.propuesto.prisma` | **Borrador** de entidades y relaciones; **no ejecutar migraciones desde aquí** |
| `docs/plantillas/PR.md` | Plantilla para cambios trazables por RF/RN/RNF |
| `docs/fuentes/*.pdf` | Documentos originales de referencia, sin alteraciones |

## Reglas de adopción

- Este paquete **no debe copiarse encima de código existente** ni sustituir el esquema Prisma activo sin revisión.
- Ningún endpoint o nombre de modelo en estos Markdown equivale a aprobación automática.
- Las ramas existentes son `main`, `develop`, `features/juica` y `features/{luchito,david,adolfo,azael}`. No se asignan personas a Dev 1/2/4/5 sin confirmación.
- El flujo aprobado por el plan es `features/*` → PR revisado → `develop` → PR de release → `main`.
- **No hay asistencia, exámenes, cuestionarios, SIAGIE ni Google Classroom en v1**, según sección 7 de la ERS.
- Cuatro períodos oficiales para este diseño: I Bimestre, II Bimestre, III Trimestre, IV Trimestre (ERS §2.2; confirmado por el equipo).

## Entrega deseada del Sprint 0

**Un repositorio arrancable y documentado**, con contratos acordados, entidades iniciales, seeds ficticios, Docker, CI mínima, rutas definidas y un flujo demostrable. Por el momento este paquete es la **propuesta documental** que permite comenzar ese trabajo.
