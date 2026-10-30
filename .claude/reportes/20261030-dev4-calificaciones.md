# Reporte — Dev 4: calificaciones y apoderados (RF-41..52, RN-01..07, RNF-31)

## Pedido

- **Usuario:** "avanzamos con las tareas del dev 4" (30/10/2026). Aprobaciones durante la tarea: U1–U4 "Sí, todas (Recomendado)"; compartidos "Sí, autorizo (Recomendado)"; `@aula/shared` en la API "Sí, autorizo (Recomendado)".
- **Flujo:** completo · **Vueltas de corrección:** 0/2 · **Rama:** `features/adolfo` · **Commit:** `feat(grading): RF-41..52 …` (solo `mio`; Dev 4 es del usuario y puede ir al equipo en rama limpia).

## Resultado

- **Modelo `Grade`** (`grading.prisma`, migración `grading_base` con 3 CHECK).
- **Motor** (`packages/shared/src/grading`): nota efectiva con NE virtual, elegibilidad, registro auxiliar con promedios, literal, distribución y riesgo, validación de entrada; 100 % de cobertura.
- **API** (`apps/api/src/modules/grading`): calificar (Nota/NE/Exonerar), NE automática guardada, registro auxiliar con dashboard, Mis notas, apoderado; bitácora y `grade.updated.v1` sin textos.
- **Web:** `/curso/[id]/registro` (matriz y dashboard), `/registro/tarea/[assignmentId]` (calificar con visor PDF), `/mis-notas`, `/apoderado`.
- **Tests:** shared 124; API 626 + e2e 75; web 304. RNF-31: motor 100 %; API 92/95/96 % y ramas 81 %.
- **Documentación:** docs/02, 03, 08 (D-048..D-057), 10 y manuales.

## Agentes que participaron

| Agente                 | Modelo | Qué hizo                                         | Estado                       |
| ---------------------- | ------ | ------------------------------------------------ | ---------------------------- |
| arquitecto-integrador  | Opus   | Plan 4a/4b/4c y U1–U4                            | LISTO                        |
| modelador-bd           | Opus   | `Grade` y migración con CHECK                    | LISTO                        |
| dev4-calificaciones    | Opus   | Motor puro, API (tras desbloqueo), web y ajustes | LISTO (1 BLOQUEADO resuelto) |
| qa-tester              | Sonnet | 36 casos nuevos de la API                        | LISTO                        |
| seguridad-cumplimiento | Sonnet | API de notas                                     | APROBADO                     |
| ux-accesibilidad       | Sonnet | Pantallas                                        | APROBADO                     |
| revisor-pr             | Sonnet | Revisión final y cobertura                       | APROBADO                     |
| documentador           | Sonnet | docs y manuales                                  | LISTO                        |

## Prompts usados

Extraídos literalmente del registro de la sesión, en orden.

### 1. arquitecto-integrador — Plan de Dev 4

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (lee el Contexto).

Encargo: plan concreto y ACOTADO de Dev 4 (RF-41..52, RN-01..07, RNF-31: calificar entregas, NE automática, exoneración, registro auxiliar del docente, "Mis notas" del estudiante y vista del apoderado). Sé rápido y conciso. Lee solo lo necesario:
- docs 02, 03, 04, 05, 08 y 10 en lo que toque a Dev 4;
- .claude/agents/dev4-calificaciones.md;
- packages/shared/src/grading/;
- prisma/schema/;
- apps/api/src/modules/submissions/ (contrato de lectura y computeDisplayStatus).

Entrega en el INFORME del protocolo:
1. Lista de RF-41..52 y RN-01..07 con lo que pide cada uno y qué hay ya hecho.
2. Modelo de datos: Grade y lo que haga falta (exoneración, cierre de notas), con campos, FKs, CHECK, índices y marcadores, según las convenciones del proyecto. Indica si hace falta modelador-bd.
3. Fases (4a, 4b, …) con alcance, endpoints, pantallas, tests y criterio de terminado, tamaño S/M/L y qué puede ir en paralelo. Mínimo de fases.
4. Archivos compartidos que habría que tocar, con la autorización que requieren. Recuerda que el trabajo de Dev 4 irá al equipo, así que hay que minimizar los cambios fuera de sus carpetas.
5. Eventos que consume o emite (D-031) y lo que necesita de Dev 5.
6. Decisiones que el usuario debe tomar, máximo 4, con tu recomendación. Lo que queda fuera de v1.

Formato: tablas y listas. Para: el siguiente agente.
```

### 2. arquitecto-integrador — Plan de Dev 4

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (lee el Contexto).

Encargo: plan concreto y ACOTADO de Dev 4 (RF-41..52, RN-01..07, RNF-31: calificar entregas, NE automática, exoneración, registro auxiliar del docente, "Mis notas" del estudiante y vista del apoderado). Sé rápido y conciso. Lee solo lo necesario:
- docs 02, 03, 04, 05, 08 y 10 en lo que toque a Dev 4;
- .claude/agents/dev4-calificaciones.md;
- packages/shared/src/grading/;
- prisma/schema/;
- apps/api/src/modules/submissions/ (contrato de lectura y computeDisplayStatus).

Entrega en el INFORME del protocolo:
1. Lista de RF-41..52 y RN-01..07 con lo que pide cada uno y qué hay ya hecho.
2. Modelo de datos: Grade y lo que haga falta (exoneración, cierre de notas), con campos, FKs, CHECK, índices y marcadores, según las convenciones del proyecto. Indica si hace falta modelador-bd.
3. Fases (4a, 4b, …) con alcance, endpoints, pantallas, tests y criterio de terminado, tamaño S/M/L y qué puede ir en paralelo. Mínimo de fases.
4. Archivos compartidos que habría que tocar, con la autorización que requieren. Recuerda que el trabajo de Dev 4 irá al equipo, así que hay que minimizar los cambios fuera de sus carpetas.
5. Eventos que consume o emite (D-031) y lo que necesita de Dev 5.
6. Decisiones que el usuario debe tomar, máximo 4, con tu recomendación. Lo que queda fuera de v1.

Formato: tablas y listas. Para: el siguiente agente.
```

### 3. modelador-bd — Esquema Grade (fase 4a)

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (INFORME 1, Decisión 2 del modelo, y la Decisión del orquestador 1).

Encargo, fase 4a de Dev 4:
1. Crea `prisma/schema/grading.prisma` con los enums GradeState {GRADED, NE, EXEMPT} y GradeSource {MANUAL, AUTO} y el modelo Grade exactamente según la Decisión 2, con las convenciones del proyecto (mira contents.prisma).
2. Añade solo `grades Grade[]` en Assignment (contents.prisma) y en Enrollment (academic.prisma), con el comentario "relación inversa de Dev 4, autorizado por el usuario el 30/10/2026".
3. Haz una sola migración `grading_base` con SQL manual para los 3 CHECK:
   - Grade_value_chk
   - Grade_state_chk (rama TRUE con `IS NOT NULL` explícito, como en docs/04)
   - Grade_source_chk
   Pruébalos dentro de START TRANSACTION … ROLLBACK: deben rechazar lo indebido y aceptar lo válido.

En paralelo, otro agente trabaja en packages/shared/src/grading. No toques esa carpeta ni la API. No hagas commit.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first. Calienta antes MySQL con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'. La API corre en :4000; si prisma generate falla por un archivo bloqueado, avísalo y no la detengas. No leas .env.

Verificación: migrate status al día, db:generate, pnpm --filter api build y test, pnpm db:seed, prettier. Devuelve un INFORME breve del protocolo con el SQL resumido.
```

### 4. dev4-calificaciones — Dev4 fase 4a: lógica pura

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md. Lee el INFORME 1 completo (fases, endpoints, reglas de lectura y decisiones A1–A6) y la Decisión del orquestador 1 (U1–U4 aprobadas).

Encargo: la parte pura de la fase 4a, SOLO en packages/shared/src/grading/. El motor ya existe: parseGrade, formatGrade, calculateAverage, toLiteral, resolveNoSubmissionGrade, etc. Reutilízalo y no dupliques. Funciones a crear:
1. `resolveEffectiveEntry({grade, hasSubmission, dueAt, now, noSubmissionGrade})`: devuelve GRADED, NE, EXEMPT o sin nota, con la NE virtual si la tarea venció sin entrega (A2).
2. `isNeEligible(enrollment{effectiveFrom, effectiveTo}, dueAt)`.
3. `buildGradebook(...)`, que calcula:
   - el promedio por estudiante y el promedio por actividad, con el redondeo único y el literal del motor;
   - la distribución AD/A/B/C;
   - los conteos a tiempo, tarde y NE;
   - los estudiantes en riesgo (literal C, A5);
   - EXEMPT fuera del promedio (RN-07);
   - el caso sin notas como NO_GRADES (D-026).
4. `gradeInputSchema` (Zod, discriminado por state): GRADED {value, comment?}, NE {value?, comment?}, EXEMPT {exemptionReason 10..500}. Normaliza con formatGrade ("05" → "5.00", A4). El comentario admite hasta 2000 caracteres.

Si zod no está disponible en packages/shared, NO añadas dependencias: avísalo y deja gradeInputSchema para la API.

Tests en Vitest con el ID en el nombre (por ejemplo `RF-44: …`). Cobertura de shared/grading ≥ 90 % (RNF-31).

En paralelo, modelador-bd crea el esquema. No toques prisma/ ni la API. No hagas commit.

Verificación: los tests y el build del paquete shared (mira su package.json), lint y prettier. Devuelve el INFORME del protocolo y conserva el contexto: después te pediré la 4b.
```

### 5. modelador-bd — Esquema Grade (fase 4a)

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (INFORME 1, Decisión 2 del modelo, y la Decisión del orquestador 1).

Encargo, fase 4a de Dev 4:
1. Crea `prisma/schema/grading.prisma` con los enums GradeState {GRADED, NE, EXEMPT} y GradeSource {MANUAL, AUTO} y el modelo Grade exactamente según la Decisión 2, con las convenciones del proyecto (mira contents.prisma).
2. Añade solo `grades Grade[]` en Assignment (contents.prisma) y en Enrollment (academic.prisma), con el comentario "relación inversa de Dev 4, autorizado por el usuario el 30/10/2026".
3. Haz una sola migración `grading_base` con SQL manual para los 3 CHECK:
   - Grade_value_chk
   - Grade_state_chk (rama TRUE con `IS NOT NULL` explícito, como en docs/04)
   - Grade_source_chk
   Pruébalos dentro de START TRANSACTION … ROLLBACK: deben rechazar lo indebido y aceptar lo válido.

En paralelo, otro agente trabaja en packages/shared/src/grading. No toques esa carpeta ni la API. No hagas commit.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first. Calienta antes MySQL con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'. La API corre en :4000; si prisma generate falla por un archivo bloqueado, avísalo y no la detengas. No leas .env.

Verificación: migrate status al día, db:generate, pnpm --filter api build y test, pnpm db:seed, prettier. Devuelve un INFORME breve del protocolo con el SQL resumido.
```

### 6. dev4-calificaciones — Dev4 fase 4a: lógica pura

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md. Lee el INFORME 1 completo (fases, endpoints, reglas de lectura y decisiones A1–A6) y la Decisión del orquestador 1 (U1–U4 aprobadas).

Encargo: la parte pura de la fase 4a, SOLO en packages/shared/src/grading/. El motor ya existe: parseGrade, formatGrade, calculateAverage, toLiteral, resolveNoSubmissionGrade, etc. Reutilízalo y no dupliques. Funciones a crear:
1. `resolveEffectiveEntry({grade, hasSubmission, dueAt, now, noSubmissionGrade})`: devuelve GRADED, NE, EXEMPT o sin nota, con la NE virtual si la tarea venció sin entrega (A2).
2. `isNeEligible(enrollment{effectiveFrom, effectiveTo}, dueAt)`.
3. `buildGradebook(...)`, que calcula:
   - el promedio por estudiante y el promedio por actividad, con el redondeo único y el literal del motor;
   - la distribución AD/A/B/C;
   - los conteos a tiempo, tarde y NE;
   - los estudiantes en riesgo (literal C, A5);
   - EXEMPT fuera del promedio (RN-07);
   - el caso sin notas como NO_GRADES (D-026).
4. `gradeInputSchema` (Zod, discriminado por state): GRADED {value, comment?}, NE {value?, comment?}, EXEMPT {exemptionReason 10..500}. Normaliza con formatGrade ("05" → "5.00", A4). El comentario admite hasta 2000 caracteres.

Si zod no está disponible en packages/shared, NO añadas dependencias: avísalo y deja gradeInputSchema para la API.

Tests en Vitest con el ID en el nombre (por ejemplo `RF-44: …`). Cobertura de shared/grading ≥ 90 % (RNF-31).

En paralelo, modelador-bd crea el esquema. No toques prisma/ ni la API. No hagas commit.

Verificación: los tests y el build del paquete shared (mira su package.json), lint y prettier. Devuelve el INFORME del protocolo y conserva el contexto: después te pediré la 4b.
```

### 7. SendMessage al agente en curso — Fase 4b: API de calificaciones

```
4a recibida (INFORMES 2 y 3; el esquema Grade ya está aplicado). Decisión 2: gradeInputSchema va en la API, envolviendo normalizeGradeInput, y no se añade zod a shared.

Haz la fase 4b en apps/api/src/modules/grading/. El GradingModule ya está registrado y vacío. Sigue el INFORME 1 (sección 3: endpoints y reglas de lectura; decisiones A1–A6) y lo aprobado en U1–U4:
- U1: la NE AUTO se guarda como fila Grade.
- U2: exemptionReason solo lo ven el docente y ADMIN, y nunca va a la bitácora.
- U3: la bitácora guarda {state, value, source} antes y después, y changedFields; nunca el comment ni el motivo.
- U4: no aplica a la API.

Endpoints:
- PUT /grades/:assignmentId/:enrollmentId
- GET /assignments/:id/grade-summary
- GET /course-sections/:id/gradebook?periodId=
- GET /me/grades?academicYearId=
- GET /guardian/students
- GET /guardian/students/:studentId/grades

Piezas del módulo:
- GradesService, con las reglas del PUT, 409 con período o año cerrado (RN-10, RF-50) y los 422 NO_SUBMISSION, HAS_SUBMISSION y NOT_OVERDUE.
- NeMaterializer: al leer el docente y en period.closed.v1; transacción leer→insertar con P2002, sin createMany({skipDuplicates}). Cumple A3.
- GradebookReadService exportado, que usa buildGradebook.
- GradingEventPublisher con grade.updated.v1, solo con ids.

Permisos con AcademicAccessService (assertTeacherOf, getLinkedStudentIds) y SubmissionsReadService.

Reglas generales:
- Importa AcademicModule y SubmissionsModule. No modifiques submissions/ ni academic/; si algo no está exportado, avisa con BLOQUEADO.
- Usa el patrón de bitácora del proyecto (recordX después del commit, sin lanzar).
- Tests: unit del servicio y un e2e en apps/api/test/grading.e2e-spec.ts con createDbTestApp. Casos:
  - calificar;
  - NE manual y AUTO;
  - exonerar;
  - período cerrado 409;
  - docente ajeno, estudiante ajeno y apoderado no vinculado 403;
  - traslado (RN-14);
  - Mis notas sin exemptionReason;
  - apoderado en solo lectura.
  Si tocas el trigger de SubmissionVersion, usa la guarda de test/db-test-guard.ts.
- No toques la web, prisma ni otros módulos. No hagas commit.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado. La API corre en :4000; no la detengas.

Verificación: api lint, test y build; tu e2e y el de submissions; prettier. Deja la BD con pnpm db:seed. Devuelve el INFORME del protocolo y conserva el contexto para la 4c.
```

### 8. SendMessage al agente en curso — Fase 4b: API de calificaciones

```
4a recibida (INFORMES 2 y 3; el esquema Grade ya está aplicado). Decisión 2: gradeInputSchema va en la API, envolviendo normalizeGradeInput, y no se añade zod a shared.

Haz la fase 4b en apps/api/src/modules/grading/. El GradingModule ya está registrado y vacío. Sigue el INFORME 1 (sección 3: endpoints y reglas de lectura; decisiones A1–A6) y lo aprobado en U1–U4:
- U1: la NE AUTO se guarda como fila Grade.
- U2: exemptionReason solo lo ven el docente y ADMIN, y nunca va a la bitácora.
- U3: la bitácora guarda {state, value, source} antes y después, y changedFields; nunca el comment ni el motivo.
- U4: no aplica a la API.

Endpoints:
- PUT /grades/:assignmentId/:enrollmentId
- GET /assignments/:id/grade-summary
- GET /course-sections/:id/gradebook?periodId=
- GET /me/grades?academicYearId=
- GET /guardian/students
- GET /guardian/students/:studentId/grades

Piezas del módulo:
- GradesService, con las reglas del PUT, 409 con período o año cerrado (RN-10, RF-50) y los 422 NO_SUBMISSION, HAS_SUBMISSION y NOT_OVERDUE.
- NeMaterializer: al leer el docente y en period.closed.v1; transacción leer→insertar con P2002, sin createMany({skipDuplicates}). Cumple A3.
- GradebookReadService exportado, que usa buildGradebook.
- GradingEventPublisher con grade.updated.v1, solo con ids.

Permisos con AcademicAccessService (assertTeacherOf, getLinkedStudentIds) y SubmissionsReadService.

Reglas generales:
- Importa AcademicModule y SubmissionsModule. No modifiques submissions/ ni academic/; si algo no está exportado, avisa con BLOQUEADO.
- Usa el patrón de bitácora del proyecto (recordX después del commit, sin lanzar).
- Tests: unit del servicio y un e2e en apps/api/test/grading.e2e-spec.ts con createDbTestApp. Casos:
  - calificar;
  - NE manual y AUTO;
  - exonerar;
  - período cerrado 409;
  - docente ajeno, estudiante ajeno y apoderado no vinculado 403;
  - traslado (RN-14);
  - Mis notas sin exemptionReason;
  - apoderado en solo lectura.
  Si tocas el trigger de SubmissionVersion, usa la guarda de test/db-test-guard.ts.
- No toques la web, prisma ni otros módulos. No hagas commit.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado. La API corre en :4000; no la detengas.

Verificación: api lint, test y build; tu e2e y el de submissions; prettier. Deja la BD con pnpm db:seed. Devuelve el INFORME del protocolo y conserva el contexto para la 4c.
```

### 9. SendMessage al agente en curso — Desbloqueado: @aula/shared añadido

```
Desbloqueado: el usuario autorizó y yo ya añadí `"@aula/shared": "workspace:*"` a apps/api/package.json con pnpm. El lockfile está actualizado. Lee la Decisión del orquestador 3.

Primero verifica que la importación funciona desde la API, tanto en el build como en Vitest. Si no funciona, avisa con BLOQUEADO e indica el motivo exacto.

Si funciona, haz la 4b completa según tu propio diseño del INFORME 4, con el evento grade.updated.v1 que propones.

Mismas reglas que antes: no toques la web, prisma ni otros módulos, y no hagas commit. Verificación: api lint, test y build; e2e de grading y de submissions; prettier. Deja la BD con pnpm db:seed. Devuelve el INFORME del protocolo.
```

### 10. SendMessage al agente en curso — Desbloqueado: @aula/shared añadido

```
Desbloqueado: el usuario autorizó y yo ya añadí `"@aula/shared": "workspace:*"` a apps/api/package.json con pnpm. El lockfile está actualizado. Lee la Decisión del orquestador 3.

Primero verifica que la importación funciona desde la API, tanto en el build como en Vitest. Si no funciona, avisa con BLOQUEADO e indica el motivo exacto.

Si funciona, haz la 4b completa según tu propio diseño del INFORME 4, con el evento grade.updated.v1 que propones.

Mismas reglas que antes: no toques la web, prisma ni otros módulos, y no hagas commit. Verificación: api lint, test y build; e2e de grading y de submissions; prettier. Deja la BD con pnpm db:seed. Devuelve el INFORME del protocolo.
```

### 11. SendMessage al agente en curso — Fase 4c: pantallas de Dev 4

```
4b recibida (INFORME 5). Mientras QA y seguridad revisan la API, haz la 4c, solo en la web. Requisitos: RF-43, RF-45..52; RNF-24..27; U4 (visor PDF por iframe con la URL firmada inline y un enlace de respaldo).

Carpetas, todas de Dev 4:
- apps/web/app/(app)/curso/[id]/registro/ (hoy es un placeholder): matriz del registro con su dashboard, y la subruta registro/tarea/[assignmentId] con la lista de entregas, el visor PDF y el formulario de nota/NE/exoneración. El formulario queda en solo lectura si el período está cerrado.
- apps/web/app/(app)/mis-notas/
- apps/web/app/(app)/apoderado/: selector del estudiante vinculado y vista de solo lectura, con un hueco para los anuncios de Dev 5.

Usa los tipos de grading.types.ts copiados o adaptados en la web; no importes código de la API. Reutiliza:
- el BFF lib/api (D-037);
- requireUser() para el rol;
- los helpers de accesibilidad de app/(app)/curso/[id]/_materials/form-feedback.tsx (FormAlert, SuccessRegion, FieldError, useFocusFirstInvalid), importándolos sin moverlos.
La descarga del PDF va por POST /files/:id/download-url {inline:true} con una Server Action.

Requisitos de interfaz:
- 360 px; la matriz en una región con scroll enfocable y con caption.
- Rótulos de los 6 estados con texto, no solo color.
- Aviso de no escribir datos de salud en el motivo de exoneración.
- Errores 422 traducidos por su code.

No toques la API, nav ni layouts. No hagas commit.

Verificación:
- web lint, test, build y tsc; prettier.
- Humo con la sesión del admin (`prisma/seed/credentials.ts` o dev-session sin --email). No aceptes la política por otros usuarios. Para ver Mis notas y apoderado, revisa el HTML por la API con la sesión de dev-session (--email del estudiante o del apoderado) solo si ya aceptaron la política. Si no la aceptaron, anótalo.
- Al terminar, deja la BD con pnpm db:seed.

Devuelve el INFORME del protocolo.
```

### 12. qa-tester — QA de la API de notas

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (INFORME 1 y el INFORME 5 de la 4b).

Encargo acotado: QA de la API de calificaciones. Solo archivos de test: apps/api/src/modules/grading/*.spec.ts y apps/api/test/grading.e2e-spec.ts. RNF-31 pide e2e de calificar y cobertura. Busca huecos sin repetir lo que ya hay. Ideas:
- nota 20.00 y 20.01; "05" → "5.00";
- NE manual con y sin valor;
- reintento de NE AUTO al cambiar noSubmissionGrade (A3);
- NE AUTO editada que pasa a MANUAL y ya no se resincroniza;
- EXEMPT con motivo de 9 y de 501 caracteres;
- exonerado fuera del promedio;
- needsRegrade tras una entrega tardía;
- traslado a mitad de período (elegibilidad en dueAt);
- apoderado con vínculo revocado → 403;
- Mis notas sin exemptionReason;
- grade.updated.v1 y bitácora sin comment ni exemptionReason;
- sin cambios → no hay bitácora.

Ejecuta pnpm --filter api test y el e2e de grading con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado (docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'). Si limpias SubmissionVersion, usa test/db-test-guard.ts.

En paralelo, otro agente trabaja en la web y otro audita seguridad: no toques su código. La API corre en :4000: no la detengas. Deja la BD con pnpm db:seed. No leas .env.

Devuelve un INFORME breve del protocolo.
```

### 13. seguridad-cumplimiento — Seguridad de la API de notas

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (INFORME 1, U1–U3 y el INFORME 5 de la 4b).

Encargo acotado y breve: auditoría de seguridad de apps/api/src/modules/grading/ (RF-41..52; RNF-09..14; datos de menores). Solo lectura. Revisa:
- Permisos por rol y por pertenencia:
  - solo califica el docente asignado o ADMIN;
  - Mis notas solo para el propio estudiante ACTIVE;
  - el apoderado solo ve a sus vinculados vigentes;
  - matrícula de otra sección → 422.
- Zod estricto, incluido gradeInputSchema sobre normalizeGradeInput.
- Bloqueos, carreras, reintento y 409.
- NeMaterializer:
  - que no escriba con el período cerrado salvo en period.closed.v1;
  - que no use createMany({skipDuplicates}).
- Minimización:
  - exemptionReason nunca en Mis notas, apoderado, bitácora ni eventos;
  - comment fuera de la bitácora y de los eventos;
  - nombres de menores solo donde hace falta.
- La bitácora cumple RNF-14 (valor anterior y nuevo).
- Que la API importe @aula/shared sin exponer nada nuevo.

Si en 10 minutos no lo cubres todo, entrega con lo revisado. Devuelve el INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 14. SendMessage al agente en curso — Fase 4c: pantallas de Dev 4

```
4b recibida (INFORME 5). Mientras QA y seguridad revisan la API, haz la 4c, solo en la web. Requisitos: RF-43, RF-45..52; RNF-24..27; U4 (visor PDF por iframe con la URL firmada inline y un enlace de respaldo).

Carpetas, todas de Dev 4:
- apps/web/app/(app)/curso/[id]/registro/ (hoy es un placeholder): matriz del registro con su dashboard, y la subruta registro/tarea/[assignmentId] con la lista de entregas, el visor PDF y el formulario de nota/NE/exoneración. El formulario queda en solo lectura si el período está cerrado.
- apps/web/app/(app)/mis-notas/
- apps/web/app/(app)/apoderado/: selector del estudiante vinculado y vista de solo lectura, con un hueco para los anuncios de Dev 5.

Usa los tipos de grading.types.ts copiados o adaptados en la web; no importes código de la API. Reutiliza:
- el BFF lib/api (D-037);
- requireUser() para el rol;
- los helpers de accesibilidad de app/(app)/curso/[id]/_materials/form-feedback.tsx (FormAlert, SuccessRegion, FieldError, useFocusFirstInvalid), importándolos sin moverlos.
La descarga del PDF va por POST /files/:id/download-url {inline:true} con una Server Action.

Requisitos de interfaz:
- 360 px; la matriz en una región con scroll enfocable y con caption.
- Rótulos de los 6 estados con texto, no solo color.
- Aviso de no escribir datos de salud en el motivo de exoneración.
- Errores 422 traducidos por su code.

No toques la API, nav ni layouts. No hagas commit.

Verificación:
- web lint, test, build y tsc; prettier.
- Humo con la sesión del admin (`prisma/seed/credentials.ts` o dev-session sin --email). No aceptes la política por otros usuarios. Para ver Mis notas y apoderado, revisa el HTML por la API con la sesión de dev-session (--email del estudiante o del apoderado) solo si ya aceptaron la política. Si no la aceptaron, anótalo.
- Al terminar, deja la BD con pnpm db:seed.

Devuelve el INFORME del protocolo.
```

### 15. qa-tester — QA de la API de notas

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (INFORME 1 y el INFORME 5 de la 4b).

Encargo acotado: QA de la API de calificaciones. Solo archivos de test: apps/api/src/modules/grading/*.spec.ts y apps/api/test/grading.e2e-spec.ts. RNF-31 pide e2e de calificar y cobertura. Busca huecos sin repetir lo que ya hay. Ideas:
- nota 20.00 y 20.01; "05" → "5.00";
- NE manual con y sin valor;
- reintento de NE AUTO al cambiar noSubmissionGrade (A3);
- NE AUTO editada que pasa a MANUAL y ya no se resincroniza;
- EXEMPT con motivo de 9 y de 501 caracteres;
- exonerado fuera del promedio;
- needsRegrade tras una entrega tardía;
- traslado a mitad de período (elegibilidad en dueAt);
- apoderado con vínculo revocado → 403;
- Mis notas sin exemptionReason;
- grade.updated.v1 y bitácora sin comment ni exemptionReason;
- sin cambios → no hay bitácora.

Ejecuta pnpm --filter api test y el e2e de grading con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado (docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'). Si limpias SubmissionVersion, usa test/db-test-guard.ts.

En paralelo, otro agente trabaja en la web y otro audita seguridad: no toques su código. La API corre en :4000: no la detengas. Deja la BD con pnpm db:seed. No leas .env.

Devuelve un INFORME breve del protocolo.
```

### 16. seguridad-cumplimiento — Seguridad de la API de notas

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (INFORME 1, U1–U3 y el INFORME 5 de la 4b).

Encargo acotado y breve: auditoría de seguridad de apps/api/src/modules/grading/ (RF-41..52; RNF-09..14; datos de menores). Solo lectura. Revisa:
- Permisos por rol y por pertenencia:
  - solo califica el docente asignado o ADMIN;
  - Mis notas solo para el propio estudiante ACTIVE;
  - el apoderado solo ve a sus vinculados vigentes;
  - matrícula de otra sección → 422.
- Zod estricto, incluido gradeInputSchema sobre normalizeGradeInput.
- Bloqueos, carreras, reintento y 409.
- NeMaterializer:
  - que no escriba con el período cerrado salvo en period.closed.v1;
  - que no use createMany({skipDuplicates}).
- Minimización:
  - exemptionReason nunca en Mis notas, apoderado, bitácora ni eventos;
  - comment fuera de la bitácora y de los eventos;
  - nombres de menores solo donde hace falta.
- La bitácora cumple RNF-14 (valor anterior y nuevo).
- Que la API importe @aula/shared sin exponer nada nuevo.

Si en 10 minutos no lo cubres todo, entrega con lo revisado. Devuelve el INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 17. SendMessage al agente en curso — Ajustes: layout ADMIN y seguridad 4b

```
4c recibida (INFORME 8). Lee la Decisión del orquestador 6. Ya reinicié la API de :4000 con el código actual. Aplica en una sola pasada:

1. En apps/web/app/(app)/curso/[id]/registro/layout.tsx, que es carpeta de Dev 4 y está autorizado, cambia a allow={['TEACHER', 'ADMIN']}.

2. Seguridad, MEDIO 2 del INFORME 6: en grades.service.ts, vuelve a leer la matrícula (isCurrent y effectiveTo) dentro de putInTx después de lockOpenPeriod, y decide con esos datos.

3. Seguridad, BAJO 5 del INFORME 6: marca materializePeriod como @internal, con un comentario que diga que solo lo llama el listener de period.closed.v1.

4. Humo real con la sesión del admin:
   - registro de un curso con datos;
   - pantalla de calificar de una tarea creada por API;
   - si puedes, el iframe del PDF con una entrega real.
   Limpia los datos de prueba con la guarda.
   No aceptes la política por otros usuarios.

No hagas commit.

Verificación: api lint, test y build; e2e de grading; web lint, test y build; prettier. Deja la BD con pnpm db:seed.

Devuelve un INFORME breve con archivo:línea y el resultado del humo.
```

### 18. ux-accesibilidad — UX de las pantallas de notas

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (INFORME 8 de la 4c).

Encargo acotado y breve: revisión de interfaz de las pantallas de Dev 4 (RF-43, RF-45..52; RNF-24..27). Solo lectura, sobre:
- apps/web/app/(app)/curso/[id]/registro/: page.tsx, _lib, tarea/[assignmentId]/{page.tsx, grade-form.tsx, pdf-viewer.tsx}
- apps/web/app/(app)/mis-notas/
- apps/web/app/(app)/apoderado/page.tsx

Revisa:
- 360 px: matriz con región desplazable y caption, columna fija, tarjetas.
- Rótulos de los 6 estados con texto, no solo color.
- Dashboard: distribución AD/A/B/C y riesgo leídos por un lector de pantalla.
- Formulario Nota/NE/Exonerar: labels, aria-invalid y aria-describedby, foco y anuncios con form-feedback, aviso de datos de salud, contador del motivo.
- Visor PDF: el iframe con title y el enlace de respaldo accesible.
- Solo lectura con el período cerrado.
- Selector de estudiante del apoderado con aria-current.
- Textos claros en español.

Solo lectura y máximo 10 minutos. Devuelve el INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, separando lo que bloquea.
```

### 19. SendMessage al agente en curso — Ajustes: layout ADMIN y seguridad 4b

```
4c recibida (INFORME 8). Lee la Decisión del orquestador 6. Ya reinicié la API de :4000 con el código actual. Aplica en una sola pasada:

1. En apps/web/app/(app)/curso/[id]/registro/layout.tsx, que es carpeta de Dev 4 y está autorizado, cambia a allow={['TEACHER', 'ADMIN']}.

2. Seguridad, MEDIO 2 del INFORME 6: en grades.service.ts, vuelve a leer la matrícula (isCurrent y effectiveTo) dentro de putInTx después de lockOpenPeriod, y decide con esos datos.

3. Seguridad, BAJO 5 del INFORME 6: marca materializePeriod como @internal, con un comentario que diga que solo lo llama el listener de period.closed.v1.

4. Humo real con la sesión del admin:
   - registro de un curso con datos;
   - pantalla de calificar de una tarea creada por API;
   - si puedes, el iframe del PDF con una entrega real.
   Limpia los datos de prueba con la guarda.
   No aceptes la política por otros usuarios.

No hagas commit.

Verificación: api lint, test y build; e2e de grading; web lint, test y build; prettier. Deja la BD con pnpm db:seed.

Devuelve un INFORME breve con archivo:línea y el resultado del humo.
```

### 20. ux-accesibilidad — UX de las pantallas de notas

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (INFORME 8 de la 4c).

Encargo acotado y breve: revisión de interfaz de las pantallas de Dev 4 (RF-43, RF-45..52; RNF-24..27). Solo lectura, sobre:
- apps/web/app/(app)/curso/[id]/registro/: page.tsx, _lib, tarea/[assignmentId]/{page.tsx, grade-form.tsx, pdf-viewer.tsx}
- apps/web/app/(app)/mis-notas/
- apps/web/app/(app)/apoderado/page.tsx

Revisa:
- 360 px: matriz con región desplazable y caption, columna fija, tarjetas.
- Rótulos de los 6 estados con texto, no solo color.
- Dashboard: distribución AD/A/B/C y riesgo leídos por un lector de pantalla.
- Formulario Nota/NE/Exonerar: labels, aria-invalid y aria-describedby, foco y anuncios con form-feedback, aviso de datos de salud, contador del motivo.
- Visor PDF: el iframe con title y el enlace de respaldo accesible.
- Solo lectura con el período cerrado.
- Selector de estudiante del apoderado con aria-current.
- Textos claros en español.

Solo lectura y máximo 10 minutos. Devuelve el INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, separando lo que bloquea.
```

### 21. SendMessage al agente en curso — Añade tres ajustes de UX

```
Añade a tu vuelta actual estos ajustes de UX del INFORME 9:
- grade-form.tsx:151-166: contador visible del motivo de exoneración ("12 de 500"), incluido en aria-describedby.
- registro/page.tsx:139-144: el enlace de la tarea en el encabezado de la matriz con inline-flex min-h-11 items-center.
- pdf-viewer.tsx:24-31: `if (pending) return` en open y un role="status" con "PDF cargado".
Inclúyelos en el mismo INFORME breve.
```

### 22. SendMessage al agente en curso — Añade tres ajustes de UX

```
Añade a tu vuelta actual estos ajustes de UX del INFORME 9:
- grade-form.tsx:151-166: contador visible del motivo de exoneración ("12 de 500"), incluido en aria-describedby.
- registro/page.tsx:139-144: el enlace de la tarea en el encabezado de la matriz con inline-flex min-h-11 items-center.
- pdf-viewer.tsx:24-31: `if (pending) return` en open y un role="status" con "PDF cargado".
Inclúyelos en el mismo INFORME breve.
```

### 23. revisor-pr — Revisión final de Dev 4

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (INFORMES 1–10 y Decisiones del orquestador 1–7).

Encargo: revisión final de Dev 4 (RF-41..52, RN-01..07, RNF-31), sobre todo lo que hay sin commit desde 8a0f578. Una sola pasada. Este trabajo SÍ irá al repo del equipo, así que cuida el alcance.

1. Definición de terminado (docs/06_GIT_CALIDAD.md).
2. Alcance permitido:
   - packages/shared/src/grading/
   - apps/api/src/modules/grading/
   - apps/api/test/grading.e2e-spec.ts
   - apps/web/app/(app)/curso/[id]/registro/, mis-notas/ y apoderado/
   - prisma/schema/grading.prisma y la migración grading_base
   - +1 línea en contents.prisma y en academic.prisma (autorizadas)
   - app.module.ts: registro de GradingModule (autorizado)
   - apps/api/package.json: `@aula/shared: workspace:*` (autorizado), y pnpm-lock.yaml
   - el expediente
   Indica cualquier otro archivo modificado. .agents/ y skills-lock.json no entran.
3. RNF-31: cobertura ≥ 90 % del módulo de notas. Mide la cobertura de packages/shared/src/grading y, si puedes, la combinada unit + e2e de apps/api/src/modules/grading. Di si se cumple.
4. Comprueba que pasan:
   - pnpm --filter shared test y build
   - pnpm --filter api lint, test y build
   - e2e grading, submissions y contents-assignments, con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado: docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'
   - pnpm --filter web lint, test y build
   - prettier sobre lo tocado
   La API y la web corren en :4000 y :3000: no las detengas. Deja la BD con pnpm db:seed.

No modifiques archivos. Devuelve el INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, y la lista de archivos para el commit.
```

### 24. documentador — Documentar Dev 4

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md: el INFORME 1 (plan, U1–U4 y A1–A6) y los INFORMES 3, 5, 8 y 10. Si dudas, lee el código.

Encargo: documenta Dev 4 (RF-41..52, RN-01..07, RNF-31) solo en docs/. Sé conciso y no reescribas secciones ajenas. Este trabajo irá al equipo.

1. docs/03_CONTRATOS.md:
   - API de calificaciones con sus 6 endpoints, las vistas, los códigos 422 (NO_SUBMISSION, HAS_SUBMISSION, NOT_OVERDUE, ENROLLMENT_NOT_ELIGIBLE, ENROLLMENT_OUT_OF_SECTION) y el 409 por período cerrado.
   - El evento grade.updated.v1 con su payload real.
   - Las funciones nuevas del motor: resolveEffectiveEntry, isNeEligible, buildGradebook y normalizeGradeInput.
2. docs/02_MODELO_ENTIDADES.md: la fila de Grade, con state, value, comment, exemptionReason, source y gradedAt, y sus CHECK.
3. docs/08_DECISIONES.md: U1–U4 como ACORDADA (aprobadas por el usuario el 30/10/2026) y A1–A6 como PROPUESTA, con el siguiente número libre. Anota que la bitácora después del commit sigue a D-047.
4. docs/10_TRAZABILIDAD.md: estado de RF-41..52 y RNF-31.
5. docs/manuales/:
   - docente.md: registro auxiliar, calificar, NE y exonerar.
   - estudiante.md: Mis notas.
   - apoderado.md: su vista de solo lectura.
   - tecnico.md: la sección de Dev 4 (@aula/shared en la API, el NeMaterializer y period.closed.v1).
   Describe solo lo que existe hoy.

Pendientes a anotar:
- Dev 5: notificación RF-53, job de NE, tabla literal RF-61, anuncios y reportes.
- Dev 3: integrar gradeState en sus pantallas.
- D-014: promedio anual.
- Prueba en navegador real.

prettier no aplica a docs/. Devuelve el INFORME del protocolo con los archivos.
```

### 25. revisor-pr — Revisión final de Dev 4

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md (INFORMES 1–10 y Decisiones del orquestador 1–7).

Encargo: revisión final de Dev 4 (RF-41..52, RN-01..07, RNF-31), sobre todo lo que hay sin commit desde 8a0f578. Una sola pasada. Este trabajo SÍ irá al repo del equipo, así que cuida el alcance.

1. Definición de terminado (docs/06_GIT_CALIDAD.md).
2. Alcance permitido:
   - packages/shared/src/grading/
   - apps/api/src/modules/grading/
   - apps/api/test/grading.e2e-spec.ts
   - apps/web/app/(app)/curso/[id]/registro/, mis-notas/ y apoderado/
   - prisma/schema/grading.prisma y la migración grading_base
   - +1 línea en contents.prisma y en academic.prisma (autorizadas)
   - app.module.ts: registro de GradingModule (autorizado)
   - apps/api/package.json: `@aula/shared: workspace:*` (autorizado), y pnpm-lock.yaml
   - el expediente
   Indica cualquier otro archivo modificado. .agents/ y skills-lock.json no entran.
3. RNF-31: cobertura ≥ 90 % del módulo de notas. Mide la cobertura de packages/shared/src/grading y, si puedes, la combinada unit + e2e de apps/api/src/modules/grading. Di si se cumple.
4. Comprueba que pasan:
   - pnpm --filter shared test y build
   - pnpm --filter api lint, test y build
   - e2e grading, submissions y contents-assignments, con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado: docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'
   - pnpm --filter web lint, test y build
   - prettier sobre lo tocado
   La API y la web corren en :4000 y :3000: no las detengas. Deja la BD con pnpm db:seed.

No modifiques archivos. Devuelve el INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, y la lista de archivos para el commit.
```

### 26. documentador — Documentar Dev 4

```
Expediente: .claude/tareas/20261030-dev4-calificaciones.md: el INFORME 1 (plan, U1–U4 y A1–A6) y los INFORMES 3, 5, 8 y 10. Si dudas, lee el código.

Encargo: documenta Dev 4 (RF-41..52, RN-01..07, RNF-31) solo en docs/. Sé conciso y no reescribas secciones ajenas. Este trabajo irá al equipo.

1. docs/03_CONTRATOS.md:
   - API de calificaciones con sus 6 endpoints, las vistas, los códigos 422 (NO_SUBMISSION, HAS_SUBMISSION, NOT_OVERDUE, ENROLLMENT_NOT_ELIGIBLE, ENROLLMENT_OUT_OF_SECTION) y el 409 por período cerrado.
   - El evento grade.updated.v1 con su payload real.
   - Las funciones nuevas del motor: resolveEffectiveEntry, isNeEligible, buildGradebook y normalizeGradeInput.
2. docs/02_MODELO_ENTIDADES.md: la fila de Grade, con state, value, comment, exemptionReason, source y gradedAt, y sus CHECK.
3. docs/08_DECISIONES.md: U1–U4 como ACORDADA (aprobadas por el usuario el 30/10/2026) y A1–A6 como PROPUESTA, con el siguiente número libre. Anota que la bitácora después del commit sigue a D-047.
4. docs/10_TRAZABILIDAD.md: estado de RF-41..52 y RNF-31.
5. docs/manuales/:
   - docente.md: registro auxiliar, calificar, NE y exonerar.
   - estudiante.md: Mis notas.
   - apoderado.md: su vista de solo lectura.
   - tecnico.md: la sección de Dev 4 (@aula/shared en la API, el NeMaterializer y period.closed.v1).
   Describe solo lo que existe hoy.

Pendientes a anotar:
- Dev 5: notificación RF-53, job de NE, tabla literal RF-61, anuncios y reportes.
- Dev 3: integrar gradeState en sus pantallas.
- D-014: promedio anual.
- Prueba en navegador real.

prettier no aplica a docs/. Devuelve el INFORME del protocolo con los archivos.
```

## Decisiones del orquestador

1. Registro vacío de `GradingModule` en `app.module.ts` (autorizado) para trabajar en paralelo; modelador-bd y la parte pura del dev a la vez.
2. `gradeInputSchema` en la API envolviendo `normalizeGradeInput`, sin añadir zod a `shared`.
3. Desbloqueo: `@aula/shared: workspace:*` en `apps/api/package.json` con autorización del usuario.
4. QA, seguridad y la 4c en paralelo; correcciones pequeñas encoladas al mismo agente.
5. Bitácora después del commit, como D-047, hasta `record(event, tx)` de Dev 1.
6. Reinicio de la API de :4000 para el humo; `registro/layout.tsx` (carpeta de Dev 4) abierto a ADMIN.
7. Nota de RNF-31 actualizada en docs/10 con la cobertura medida por el revisor.

## Verificación

shared test 124 y build ok · api lint ok, test 626, build ok · e2e 75 · web lint ok, test 304, build ok · prettier ok · `pnpm db:seed` ok · humo real con admin (calificar, NE automática, registro, visor).

## Pendientes y decisiones abiertas

- Probar el iframe del PDF en un navegador real; humo de Mis notas, apoderado y docente cuando el usuario acepte la política con esas cuentas.
- RNF-31: ramas de la API al 81 % (tests de eventos y errores del materializador).
- Dev 1: `record(event, tx)`; enlace del registro en el menú para ADMIN (`nav.ts`).
- Dev 3: `gradeState` en sus listados. Dev 5: RF-53, job de NE, RF-61, anuncios y reportes.
- D-014: promedio anual.

## Expediente

[.claude/tareas/20261030-dev4-calificaciones.md](../tareas/20261030-dev4-calificaciones.md)
