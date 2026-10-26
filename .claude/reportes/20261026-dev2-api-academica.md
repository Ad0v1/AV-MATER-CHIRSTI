# Reporte — Dev 2, Fase 2: API académica y AcademicAccessService

## Pedido

- **Usuario:** "Sigue con la Fase 2 de Dev 2: API académica y AcademicAccessService, con los agentes."
- **Fecha:** 26/10/2026 · **Flujo:** completo · **Rama:** `features/adolfo` · **Commit:** `feat(academic): RF-09/10/11/12/13/14/17 API academica …` (subido solo a `mio`)
- **Aviso:** Dev 2 es de un compañero. No va al equipo sin acuerdo con el dueño de Dev 2; depende de D-021.

## Resultado

- **Módulo `apps/api/src/modules/academic/`** con 6 controladores y 21 endpoints:
  - Admin: años (crear con sus 4 períodos, listar, editar, activar, cerrar), períodos (editar fechas, cerrar, reabrir con motivo obligatorio), secciones, cursos, curso-sección y asignación de docente.
  - Para todos los perfiles con pertenencia: `GET /course-sections/:id/context`.
  - Docentes y estudiantes: `GET /me/course-sections`.
- **Reglas:** años cerrados o anteriores al activo son de solo lectura; un solo año activo; período cerrado bloquea escrituras; docente debe tener rol TEACHER y estar activo.
- **`AcademicAccessService`** para Dev 3/4/5: contexto del curso, pertenencia, período abierto, curso-sección escribible y listados de matrículas.
- **Bitácora** de todas las acciones críticas y **eventos** `period.closed.v1`, `period.reopened.v1`, `academic-year.closed.v1`.
- **Protección contra peticiones simultáneas** al activar, cerrar y reabrir (bloqueo de la fila del año).
- **Tests:** 102 unitarios y 59 e2e nuevos contra MySQL (85 e2e en total).

## Agentes que participaron

| #   | Agente                   | Modelo | Qué hizo                                                                                           | Estado   |
| --- | ------------------------ | ------ | -------------------------------------------------------------------------------------------------- | -------- |
| 1   | `arquitecto-integrador`  | Opus   | Diseño de endpoints, servicio, bitácora y eventos; detectó que una ruta sin `@Roles` queda abierta | LISTO    |
| 2   | `dev2-estructura`        | Opus   | Implementación del módulo y 79 tests unitarios del módulo                                          | LISTO    |
| 3   | `qa-tester`              | Sonnet | 59 tests e2e contra MySQL                                                                          | LISTO    |
| 4   | `seguridad-cumplimiento` | Sonnet | Auditoría: 3 MEDIO (2 carreras y fallo de bitácora)                                                | APROBADO |
| 5   | `dev2-estructura`        | Opus   | Corrección 1/2: bloqueo de fila, transacciones y bitácora que no se pierde en silencio             | LISTO    |
| 6   | `revisor-pr`             | Sonnet | Revisión final                                                                                     | APROBADO |
| 7   | `documentador`           | Haiku  | docs/03, 08 (D-030, D-031, nota D-019), 10 y manual técnico                                        | LISTO    |

## Prompts usados

### 1. arquitecto-integrador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-api-academica.md (léelo completo, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Lee también el expediente de la Fase 1 (.claude/tareas/20261026-dev2-estructura.md: INFORME 1 Decisión 1 y el INFORME 4 de seguridad). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI (rama features/adolfo).

Tu encargo: planificar la Fase 2 de Dev 2 (RF-09..14, 17; RN-10..12). Lee docs/03 (contratos: endpoints y eventos que Dev 3/4/5 esperan; formato de errores), 04, 05 (matriz de permisos), 06 (definición de terminado), 08 (D-011, D-019, D-021, D-027..D-029), 09 (casos QA de Dev 2) y la ERS (docs/fuentes, PDF) para el texto exacto de RF-09..14 y 17. Revisa el código existente para seguir sus patrones: apps/api/src/main.ts, app.module.ts, app.setup.ts, common/ (auth: roles.guard/roles.decorator/roles.ts, session, audit, errors/api-exception.filter.ts, prisma), config/, modules/auth/auth.controller.ts; apps/api/test/helpers.ts y los e2e; package.json de apps/api (¿hay zod, class-validator, event emitter?). Verifica cómo obtiene un controlador el usuario autenticado (sesión) en develop y qué cambia en origin/features/david (git show / git diff, solo lectura) para no chocar.

Entrega en Decisiones:
1. Estructura de apps/api/src/modules/academic/ (módulo, controladores, servicios, DTOs/validación con lo que ya use el proyecto, AcademicAccessService) y qué exporta el módulo.
2. Endpoints exactos (método, ruta bajo /api/v1, rol requerido según docs/05, cuerpo, respuesta, errores) para: años (crear con sus 4 períodos en una transacción, listar, activar en transacción con marcador TRUE/NULL, cerrar), períodos (editar fechas, cerrar y reabrir con motivo), secciones, cursos, asignación/reasignación de docente; GET /course-sections/:id/context y GET /me/course-sections (forma de docs/03). Solo lectura para años inactivos (RF-17/RN-11) y bloqueo con período cerrado (RN-10).
3. AcademicAccessService: firmas, tipos de retorno y semántica exacta (incluye marcadores TRUE/NULL: cerrar = null; matrículas cerradas = null), y errores que lanza.
4. Validaciones de servicio pendientes de la Fase 1: rol correcto (TEACHER para teacherId), status ACTIVE, isActive de sección/curso-sección, fechas de períodos sin solapes y dentro del año, effectiveTo >= effectiveFrom donde aplique.
5. Bitácora: qué acciones registran AuditEvent (action '<modulo>.<verbo>', entityType, entityId, before/after solo con campos cambiados según D-024/docs/03).
6. Eventos: cómo se emiten hoy en el proyecto (si no hay bus, propone el mínimo sin dependencias nuevas o márcalo pendiente).
7. Archivos compartidos a tocar (app.module.ts, package.json de apps/api si hay que añadir validación, docs/03) con el cambio exacto y mínimo, para que el orquestador los autorice; riesgo frente a features/david.
8. Plan de agentes y criterios de terminado verificables (tests unitarios con Vitest y e2e contra MySQL con el seed; usuarios del seed para probar permisos).
No modifiques archivos. Termina con el INFORME del protocolo.
```

### 2. dev2-estructura (implementación)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-api-academica.md (léelo completo: INFORME 1 con las Decisiones 1–8 y la "Decisión del orquestador"; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo, con Docker/MySQL levantados, migración y seed cargados.

Tu encargo (paso 1 de la Decisión 8): implementar las Decisiones 1–6 en apps/api/src/modules/academic/ y los 2 cambios compartidos autorizados (Decisión 7: registrar AcademicModule en app.module.ts y `fileParallelism: false` en apps/api/vitest.config.e2e.ts). Sigue los patrones del código existente (auth.controller.ts, common/auth roles, common/audit, common/prisma, errors/api-exception.filter.ts). Reglas obligatorias: @Roles a nivel de clase en todos los controladores; marcadores TRUE/NULL (cerrar o desactivar = null, nunca false); transacciones donde se indica; bitácora después del commit y eventos después de la bitácora; solo campos cambiados en before/after; sin dependencias nuevas; no tocar common/, auth/, session/ ni prisma/.
Escribe los tests unitarios indicados en la Decisión 8.1 (.spec.ts junto al código, Vitest, Prisma simulado).
Al terminar: `pnpm --filter api lint`, `pnpm --filter api test`, `pnpm --filter api build`, `pnpm exec prettier --check apps/api/src/modules/academic apps/api/src/app.module.ts apps/api/vitest.config.e2e.ts`, y `pnpm --filter api test:e2e` (los 26 existentes deben seguir pasando). Comprueba que la API arranca y que `GET /api/v1/academic-years` sin sesión responde 401 (puedes hacerlo con un e2e rápido de humo o arrancando la API y usando curl; detén el proceso al terminar). No hagas commit. Termina con el INFORME del protocolo, con la lista de endpoints implementados.
```

### 3. qa-tester

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-api-academica.md (léelo completo: INFORME 1 Decisión 8.2 y el INFORME 2 con el ajuste de apoderado02; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, con Docker/MySQL levantados, migración y seed cargados.

Tu encargo: crear apps/api/test/academic-api.e2e-spec.ts según la Decisión 8.2, con el ajuste del INFORME 2 (apoderado02 → 200 en el context de Matemática 3A y 403 en Matemática 3B). Usa createTestApp() de apps/api/test/helpers.ts, SESSION_COOKIE y SessionService.create({id, role}) con ids del seed buscados por correo, MemoryAuditSink para la bitácora y AcademicEventPublisher.on para los eventos. Datos propios en años 2095..2099 y cursos con prefijo "QA-F2 "; en afterAll limpia todo, reactiva 2026 si cambió y restaura el closedAt del período I-2026 (2026-05-05). Pon los IDs de RF/RN en los nombres de los tests.
Si un test revela un bug de producción, NO lo corrijas: CAMBIOS_PEDIDOS con el caso, esperado y obtenido. Solo archivos de test.
Corre `pnpm --filter api test:e2e` (todo en verde, incluidos los 26 anteriores; corre dos veces para comprobar que la limpieza deja la BD igual), `pnpm --filter api lint`, prettier --check del archivo, y al final `pnpm db:seed` con los mismos conteos. No hagas commit. Termina con el INFORME del protocolo.
```

### 4. seguridad-cumplimiento

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-api-academica.md (léelo completo, INFORMES 1 y 2, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: auditar C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\modules\academic\ (todo) y el registro en app.module.ts (RNF-02, RN-12, RNF-09..15, OWASP). Revisa con el código de common/auth (roles.guard.ts, roles.decorator.ts) y common/session:
- que TODOS los controladores tengan @Roles a nivel de clase (el guard deja abiertas las rutas sin @Roles) y que las sobrescrituras a nivel de método sean correctas;
- IDOR y pertenencia en GET /course-sections/:id/context y /me/course-sections (docente, estudiante, apoderado, usuario no ACTIVE), y en AcademicAccessService;
- que context y /me no expongan correos ni datos de otros estudiantes; qué expone listCurrentEnrollments y a quién (es un servicio interno);
- validación de entrada (Zod), mapeo de errores sin filtrar detalles de Prisma ni stack;
- bitácora: acciones críticas registradas, solo campos cambiados, sin datos personales en reason/before/after; orden commit → bitácora → evento y el riesgo de no registrar si falla;
- eventos en proceso: que no lleven datos personales;
- condiciones de carrera (activar año, cerrar/reabrir período) y marcadores TRUE/NULL.
No modifiques archivos. Termina con el INFORME del protocolo (APROBADO si no hay CRÍTICO ni ALTO; si hay, CAMBIOS_PEDIDOS con archivo:línea y corrección).
```

### 5. dev2-estructura (corrección 1/2)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-api-academica.md (lee el INFORME 3 de seguridad-cumplimiento y la "Decisión del orquestador (vuelta 1/2)" al final; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, con Docker/MySQL levantados.

Tu encargo, solo en apps/api/src/modules/academic/:
1. MEDIO 1 (academic-years.service.ts, activate): dentro de la $transaction, primero `updateMany({ where: { id, closedAt: null }, data: { isActive: true } })` NO — ojo con el UNIQUE del marcador: el orden debe evitar dos TRUE a la vez. Diseña el orden correcto (p. ej. comprobar dentro de la transacción con una lectura bloqueante o un updateMany condicionado que verifique closedAt null, desactivar el anterior, activar el nuevo) de modo que un año cerrado nunca quede activo, el anterior no quede desactivado si falla, y una carrera dé 409. Lanza el 409 dentro de la callback para que haga rollback.
2. MEDIO 2: close de año y reopen de período en $transaction con la condición repetida en el where (reopen: closedAt not null y su año activo y no cerrado; close: contar períodos abiertos dentro de la transacción y cerrar con updateMany condicionado). 409 si count 0.
3. MEDIO 3 (academic-audit.ts, recordAcademic): capturar el fallo de audit.record, Logger.error con action, entityType, entityId y actorId (sin before/after), y continuar sin convertir la respuesta en 500; el evento se publica igual.
4. BAJO 4: JSDoc de advertencia en listCurrentEnrollments y listEnrollmentsOfStudent (el llamador valida permisos antes; nunca devolver la lista a STUDENT ni GUARDIAN).
Añade tests unitarios de 1–3 (Prisma simulado: activate con año cerrado dentro de la transacción → 409 sin desactivar el anterior; reopen con año inactivo → 409; close con período abierto → 422/409; recordAcademic con sink que falla → no lanza y registra). No toques los e2e.
Corre `pnpm --filter api lint`, `pnpm --filter api test`, `pnpm --filter api build`, prettier --check del módulo y `pnpm --filter api test:e2e` (85 en verde). No hagas commit. Termina con el INFORME del protocolo.
```

### 6. revisor-pr

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-api-academica.md (léelo completo, INFORMES 1–5 y las decisiones del orquestador; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo, con Docker levantado.

Tu encargo: revisión final de la Fase 2 de Dev 2. Alcance esperado: apps/api/src/modules/academic/ (código y specs), apps/api/src/app.module.ts (solo el registro de AcademicModule), apps/api/vitest.config.e2e.ts (solo fileParallelism: false), apps/api/test/academic-api.e2e-spec.ts y .claude/tareas/ (orquestador). Nada en common/, auth/, session/ ni prisma/. Ignora .agents/ y skills-lock.json.
Revisa el código contra las Decisiones 1–7 del INFORME 1 y las correcciones del INFORME 5 (en especial: @Roles de clase en todos los controladores, marcadores TRUE/NULL sin false, orden commit → bitácora → evento, transacciones y bloqueo del año, que ningún hallazgo CRÍTICO/ALTO quede abierto).
Corre pnpm lint, pnpm test, pnpm build, pnpm format:check y pnpm --filter api test:e2e. Los fallos de format solo por .agents/ o expedientes no cuentan. El fallo preexistente de `tsc --noEmit` por academic-schema.e2e-spec.ts (Fase 1) anótalo pero no lo cuentes como fallo de esta fase. Este trabajo es de Dev 2 (compañero) y no va al equipo (D-021). Propón el mensaje de commit. Termina con el INFORME del protocolo.
```

### 7. documentador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-api-academica.md (léelo completo, INFORMES 1–6, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). La Fase 2 está aprobada. Verifica rutas, cuerpos y firmas reales leyendo los controladores, academic.dto.ts, academic-access.service.ts y academic-events.ts en C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\modules\academic\ antes de escribir.

Tu encargo, solo en C:\Proyectos\AV-MATER-CHIRSTI\docs\, con el estilo de esos documentos y todo como PROPUESTA (trabajo de Dev 2 en el repo privado, pendiente del dueño de Dev 2 y de D-021):
1. docs/03_CONTRATOS.md: sección "API académica (Dev 2)" con la tabla de endpoints (método, ruta /api/v1, rol, cuerpo, respuesta, errores), la forma de GET /course-sections/:id/context y GET /me/course-sections, el contrato de AcademicAccessService (firmas, semántica, errores, regla de marcadores TRUE/NULL) con la advertencia de que listCurrentEnrollments y listEnrollmentsOfStudent no validan permisos, y los 3 eventos con su payload (actualiza period.closed.v1 si ya estaba, añadiendo academicYearId).
2. docs/08_DECISIONES.md: D-030 (definición de "solo lectura" de años: cerrado o anterior al activo) y D-031 (publicador de eventos en proceso con node:events, hasta BullMQ/outbox), ambas PROPUESTA; en D-019 una nota del pendiente: AuditService.record(event, tx?) para escribir la bitácora en la transacción, y códigos de error propios en el filtro (pedidos a Dev 1). Comprueba que D-030/D-031 estén libres.
3. docs/10_TRAZABILIDAD.md: nota de avance de RF-09..14 y 17 (API y servicio; pantallas pendientes F5) con los tests (unitarios y academic-api.e2e-spec.ts).
4. docs/manuales/tecnico.md (créalo si no existe, RNF-32): sección breve "Módulo académico" con cómo levantarlo, el seed, y la tabla de endpoints resumida. Sin secretos.
No hagas commit. Termina con el INFORME del protocolo.
```

## Decisiones del orquestador

- Como el arquitecto no podía ejecutar git, el orquestador hizo el diff contra `origin/features/david`: David no cambia `AuthenticatedUser`, `req.user` ni `RolesGuard`; en `app.module.ts` solo añade 3 providers.
- Autorizó 2 archivos compartidos: `app.module.ts` (registrar `AcademicModule`) y `vitest.config.e2e.ts` (`fileParallelism: false`).
- Corrigió el plan de QA según el dev: apoderado02 sí ve Matemática 3A (su hijo estudia ahí).
- Lanzó QA y seguridad en paralelo; esperó a que QA terminara antes de que el dev cambiara código.
- Vuelta de corrección 1/2: corrigió los MEDIO 1–3 y el BAJO 4 de seguridad. Para la bitácora eligió "registrar el fallo en el log y no convertir la respuesta en 500", porque el cambio ya está confirmado; la corrección real (bitácora dentro de la transacción) queda pedida a Dev 1.
- Verificó por su cuenta: 91 y luego 102 tests unitarios en verde, y los archivos del alcance.

## Archivos

- `apps/api/src/modules/academic/` (27 archivos: código, specs y `academic-locks.ts`)
- `apps/api/src/app.module.ts` (+2 líneas), `apps/api/vitest.config.e2e.ts` (+2 líneas)
- `apps/api/test/academic-api.e2e-spec.ts` (nuevo)
- `docs/03_CONTRATOS.md`, `docs/08_DECISIONES.md`, `docs/10_TRAZABILIDAD.md`, `docs/manuales/tecnico.md` (nuevo)
- `.claude/tareas/20261026-dev2-api-academica.md`, este reporte

## Verificación

- `pnpm lint` ok · `pnpm test` 102/102 · `pnpm build` 5/5 · `pnpm --filter api test:e2e` 85/85 (dos corridas, misma BD al final) · `pnpm db:seed` con los mismos conteos.
- `format:check`: ok en el alcance (fallan solo `.agents/` y expedientes).
- Preexistente de la Fase 1: `tsc --noEmit` falla porque `academic-schema.e2e-spec.ts` importa `prisma/seed` fuera del rootDir (lint, test y build no se ven afectados).

## Pendientes y decisiones abiertas

- **No va al equipo** hasta revisión del dueño de Dev 2 y aceptación de D-021.
- PROPUESTA: D-030 (solo lectura de años) y D-031 (eventos en proceso).
- Pedidos a Dev 1: `AuditService.record(event, tx?)` y códigos de error propios en el filtro.
- Para Dev 2: `readOnly` del contexto también es true en un año futuro (más amplio que D-030); cerrar un período no exige año activo. Confirmar si es lo deseado.
- Arreglar el `tsc --noEmit` de la Fase 1.
- Aviso en la UI (F5) de no escribir datos personales en el motivo de reapertura.
- Siguientes fases: F3 usuarios, matrículas y apoderados · F4 importación · F5 pantallas · F6 clonación y promoción.

## Expediente

[.claude/tareas/20261026-dev2-api-academica.md](../tareas/20261026-dev2-api-academica.md)
