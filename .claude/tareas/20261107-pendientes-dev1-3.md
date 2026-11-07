# Pendientes de Dev 1, Dev 2 y Dev 3 (fases A, B y C)

Pedido por el usuario: "lo que puedes ir realizando es la del Dev 1 en adelante, planifica lo que harras para revisar" → "todo lo que se avanza debe de llegar tanto para la repo del grupo (santxxxs) y mi repo privada" → "Sí, empieza"
Flujo: completo
Vueltas de corrección: 0/2

Rama: features/adolfo (f361103, incluye main con el PR #19). El envío va a mio y al equipo (memoria envio-equipo-todo).

## Plan del orquestador (aprobado por el usuario)

- **A1 (sola, primero):** `AuditService.record(event, tx)`. Migrar a esa firma las escrituras de bitácora que hoy van después del commit (D-047): contenidos, entregas, calificaciones, anuncios y configuración.
- **A2:** CSP `img-src` para el logo. Logo y nombre del colegio en la cabecera.
- **A3:** regla de ciclo de vida para `incoming/` en MinIO. CORS de R2 documentado.
- **A4:** turbo, para que el `dev` del worker no compile la API.
- **A5:** tipos de `journeys.e2e-spec.ts`.
- **B1:** lista de "Mis cursos" en el menú y barra de pestañas del curso.
- **B2:** `gradeState` en las entregas.
- **B3:** descargar el PDF y editar o borrar tareas en pantalla.
- **B4:** `complete()` con el intent vencido; `StorageService` acepta claves que no son PDF.
- **C:** QA, seguridad, UX y revisor.

### INFORME 1 — dev1-plataforma (A1)

Estado: LISTO

- `AuditService.record(event, tx?)`: si recibe `tx`, la bitácora entra en la transacción y un fallo revierte la acción.
- Migradas:
  - contents: assignments y materials;
  - submissions: version.created;
  - grading: grade.create, grade.update y auto_ne;
  - settings: update y logo.
- Sin migrar, porque no usan `$transaction`: announcements y files.
- D-047 queda RESUELTA en docs/08.
- Comandos: lint ok; tests 1130; build ok.
  - tsc: solo el error de journeys, que ya existía.
  - e2e: el resultado quedó recortado. `jobs.e2e` falló por Redis: Docker se cayó durante la corrida.

### Decisión del orquestador 1

- Se revirtió `storage/README.md`: el cambio era solo de formato y no venía del agente.
- Docker se apagó. Se relanza antes de QA.

### INFORME 2 — qa-tester (A1)

Estado: LISTO. No hay bugs de producción.

- Tests nuevos:
  - `audit-tx-rollback.e2e` (13): si falla la bitácora, se revierte la acción en tareas, materiales, entrega, nota, NE, settings y logo (el objeto se borra);
  - `audit-tx.spec` (10).
- `helpers.ts`: `createDbTestApp` copia al sink los eventos escritos con tx.
- A5 hecho: `journeys` `[cookie].flat()`.
- Comandos: API 97 archivos / 1140 tests; e2e completo 34 archivos / 698 tests; tsc limpio.

### Decisión del orquestador 2

Sin pantallas ni endpoints nuevos. Seguridad pasa a hacerse por el revisor. revisor-pr de A1 y A5.

### INFORME 3 — revisor-pr (A1 + A5)

Estado: APROBADO.

- install, lint, tsc y build: ok.
- API: 1140 tests.
- Web: 465 tests.
- e2e completo: 34 archivos / 698 tests.
- Seguridad ligera: ok.
- Hallazgos BAJO: docstrings "Nunca lanza" (los corrigió el orquestador) y una nota sobre el wrapper de `helpers.ts`.
