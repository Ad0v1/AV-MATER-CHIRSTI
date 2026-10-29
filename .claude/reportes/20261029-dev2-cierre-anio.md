# Reporte — Dev 2, Fase 6: clonar la estructura y promoción en bloque (RF-15, RF-16, RN-15)

## Pedido

- **Usuario:** "Empezar F6" (tras el commit `96665a1` de la Fase 5).
- **Durante la tarea:** respuesta a la pregunta sobre el bug de las promociones grandes: "Tocar archivos de Dev 1 (Recomendado)". Sigue vigente el pedido anterior: "quiero que seas mas eficiente con los agentes".
- **Fecha:** 29/10/2026 · **Flujo:** completo · **Vueltas de corrección:** 1/2 · **Rama:** `features/adolfo` · **Commit:** `feat(estructura): RF-15/RF-16 clonar estructura …` (subido solo a `mio`)
- **Aviso:** Dev 2 es de un compañero; no va al equipo sin acuerdo. Dos archivos de Dev 1 cambiaron con autorización del usuario y quedan pendientes de la revisión de David.

## Resultado

- **Clonar la estructura (RF-15):** `POST /academic-years/:id/clone-structure` y la pantalla `/admin/estructura/anios/[anioId]/clonar`. Copia al año nuevo, que debe estar vacío, las secciones activas y sus cursos activos. Por defecto no copia docentes; con la casilla, solo los que siguen activos. No copia períodos, matrículas ni contenidos. No se puede clonar dos veces.
- **Promoción en bloque (RF-16, RN-15):** `GET …/promotion-proposal` y `POST …/promotion`, más la pantalla `/admin/estructura/anios/[anioId]/promocion`.
  - **Propuesta:** de 1.º a 4.º pasan al grado siguiente y los de 5.º egresan. Los retirados y los que ya están matriculados quedan excluidos.
  - **Correcciones del admin:** puede cambiar la sección, hacer repetir o excluir a un estudiante, también en bloque por sección.
  - **Confirmación:** todo o nada, con una huella que detecta si la propuesta cambió mientras tanto. Se puede hacer por tandas.
  - **Efecto:** cierra las matrículas del año anterior con `YEAR_END`.
- **D-038:** la promoción es la única escritura permitida sobre un año cerrado, y solo cierra matrículas.
- **Plataforma:** la API acepta cuerpos JSON de hasta 512 KB y responde 413 (no 500) a uno más grande. Son archivos de Dev 1, cambiados con autorización. El cliente de la web admite un tiempo de espera por petición (30 s para la promoción).
- **Sin cambios de esquema.**
- **Tests:** API 359 unitarios y 244 e2e en 5 archivos; web 275.
- **Documentación:** docs/03, 04, 08 (D-038), 10, manual técnico y un **manual del administrador nuevo**.

## Agentes que participaron

| #   | Agente                   | Modelo | Qué hizo                                                                                    | Estado          |
| --- | ------------------------ | ------ | ------------------------------------------------------------------------------------------- | --------------- |
| 1   | `arquitecto-integrador`  | Opus   | Plan: sin cambio de esquema, 3 endpoints, D-038, dos entregas (6a y 6b)                     | LISTO           |
| 2   | `dev2-estructura`        | Opus   | Se detuvo porque el plan no estaba en el expediente (fallo del orquestador)                 | BLOQUEADO       |
| 3   | `dev2-estructura`        | Opus   | Entrega 6a (clonar): API, e2e y pantalla                                                    | LISTO           |
| 4   | `qa-tester`              | Sonnet | En paralelo: +13 casos de la 6a                                                             | LISTO           |
| 5   | `seguridad-cumplimiento` | Sonnet | En paralelo: 6a sin CRÍTICO ni ALTO; MEDIO del bloqueo de docentes                          | APROBADO        |
| 6   | `ux-accesibilidad`       | Sonnet | En paralelo: 6a sin bloqueos; mejoras BAJO                                                  | APROBADO        |
| 7   | `dev2-estructura`        | Opus   | Entrega 6b (promoción), mientras se revisaba la 6a                                          | LISTO           |
| 8   | `dev2-estructura`        | Opus   | Correcciones de la 6a y timeout del BFF                                                     | LISTO           |
| 9   | `qa-tester`              | Sonnet | En paralelo: +casos de la 6b; encontró el bug de los cuerpos de más de 100 KB (500)         | CAMBIOS_PEDIDOS |
| 10  | `seguridad-cumplimiento` | Sonnet | En paralelo: 6b sin CRÍTICO ni ALTO                                                         | APROBADO        |
| 11  | `ux-accesibilidad`       | Sonnet | En paralelo: 2 ALTO (acciones en bloque sin anuncio; foco tras un 422) y 3 MEDIO            | CAMBIOS_PEDIDOS |
| 12  | `dev2-estructura`        | Opus   | Vuelta 1/2: límite de cuerpo y 413 (archivos de Dev 1 autorizados) y accesibilidad de la 6b | LISTO           |
| 13  | `seguridad-cumplimiento` | Sonnet | En paralelo: revisión acotada del límite de cuerpo y del 413                                | APROBADO        |
| 14  | `ux-accesibilidad`       | Sonnet | En paralelo: verificación de la corrección                                                  | APROBADO        |
| 15  | `revisor-pr`             | Sonnet | En paralelo: revisión final y batería completa                                              | APROBADO        |
| 16  | `documentador`           | Sonnet | En paralelo: docs/03, 04, 08, 10, manual técnico y manual del administrador                 | LISTO           |

## Prompts usados

### 1. arquitecto-integrador

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (léelo primero).

Encargo: planifica la Fase 6 de Dev 2: RF-15 (clonar la estructura de un año académico al siguiente) y RF-16 (promoción en bloque propuesta por el sistema, que el admin corrige y confirma; RN-15). Lee la ERS/docs que definen RF-15, RF-16 y RN-15 (docs/00, 02, 03, 04, 08, 10), el esquema prisma/schema/academic.prisma y el código de apps/api/src/modules/academic/ y users/ (matrículas). Sé conciso y concreto.

Decide:
1. Qué se clona exactamente (períodos con fechas desplazadas o nuevas, secciones, CourseSection con o sin docente según D-029) y precondiciones (año origen, año destino nuevo o existente vacío, estados permitidos, idempotencia, concurrencia y bloqueos en el orden del proyecto).
2. Cómo se propone la promoción: regla de grado siguiente, último grado (egreso), retirados, estudiantes sin matrícula vigente, a qué sección del año destino; qué puede corregir el admin (repite, otra sección, excluir); flujo propuesta → confirmación (sin estado en el servidor o con estado), todo o nada, bitácora sin datos personales, qué pasa con la matrícula del año origen.
3. Si hace falta cambio de esquema (modelador-bd) o basta lo existente; si cambian contratos (endpoints nuevos en docs/03).
4. Pantallas en apps/web/app/(app)/admin/estructura/ (reutilizando _shared y el BFF D-037), y si conviene partir en entregas (p. ej. 6a clonar, 6b promoción).
5. Tests (e2e de API como en F2–F4 con la BD de Docker; Vitest de lógica pura en web) y archivos compartidos que se tocarían (package.json, lockfile, app.module, nav) con su autorización.
6. Qué excede el alcance v1 (ERS §7).

Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md, con Para: el siguiente agente.
```

### 2. dev2-estructura (entrega 6a)

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (lee el Contexto, el INFORME 1 del arquitecto y la Decisión 1).

Encargo: implementa la entrega 6a de la Fase 6 (RF-15, clonar la estructura de un año al siguiente), con las reglas (A), (C) 6a y (F) 6a.1–6a.3 del INFORME 1:
1. API en apps/api/src/modules/academic/: `POST /academic-years/:id/clone-structure` (solo ADMIN con ActiveActorGuard, Zod estricto, mapPrismaError, bloqueos de menor a mayor año, recuento dentro de la transacción, bitácora `academic.year.clone_structure` después del commit y sin nombres). Lógica de "qué se copia" en una función pura con tests unitarios.
2. e2e en apps/api/test/academic-clone.e2e-spec.ts con los casos de (F) 6a.2, al estilo de academic-api.e2e-spec.ts (deja la BD como estaba).
3. Pantalla apps/web/app/(app)/admin/estructura/anios/[anioId]/clonar/page.tsx y su componente en estructura/_components/, reutilizando admin/_shared (ConfirmAction con focusId, useAnnounce, PageShell/PageHeader) y el BFF de lib/api (D-037); enlace desde anios/[anioId]/page.tsx solo si el año no tiene secciones y no es de solo lectura. Lógica pura con Vitest.

No toques archivos compartidos (package.json, lockfile, app.module, nav, routes, layouts, next.config, packages/ui, módulos de otros devs); si los necesitas, BLOQUEADO. No hagas commit.

Entorno: todos los comandos de Node que conecten a MySQL o Redis (e2e, seed, dev-session, API) con NODE_OPTIONS=--dns-result-order=ipv4first; antes calienta MySQL con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'. No leas .env.

Verificación: pnpm --filter api lint, test, build y el e2e nuevo (y que academic-api.e2e-spec.ts siga pasando); pnpm --filter web lint, test, build; prettier --check sobre lo tocado. Prueba de humo breve de la pantalla con curl y dev-session. Deja la BD con pnpm db:seed y los servidores detenidos.

Cuando termines 6a, devuelve el INFORME del protocolo (archivos, comandos con resultado, hallazgos, decisiones). Después te pediré la 6b en esta misma conversación, así que conserva el contexto.
```

Mensajes al mismo agente (SendMessage) por el fallo del guardado del plan:

```
Aviso: al lanzarte, el INFORME 1 del arquitecto y la Decisión 1 todavía no estaban escritos en .claude/tareas/20261029-dev2-cierre-anio.md (falló el guardado). Ya están. Si leíste el expediente sin ellos, vuelve a leer esas dos secciones antes de seguir con la 6a.
```

```
Tu BLOQUEADO era correcto: el guardado del plan falló. Ya está corregido. .claude/tareas/20261029-dev2-cierre-anio.md tiene ahora el INFORME 1 completo (líneas 26–79) y la Decisión del orquestador 1. Ahí están las respuestas a tus 6 preguntas, en (A) 1–5, (C) 6a y (F) 6a.1–6a.3. En resumen:
- el destino debe existir con 0 secciones;
- no se copian períodos;
- se copian secciones activas y CourseSection activos con Course activo, con teacherId null salvo copyTeachers;
- 201 con created/skipped;
- 409 o 422 según (A)1;
- bloqueos: origen FOR SHARE y destino FOR UPDATE, de menor a mayor año;
- bitácora con ids y conteos;
- el enlace solo aparece si el año no tiene secciones y no es de solo lectura (D-030).

Empieza la entrega 6a con el mismo encargo de tu primer mensaje y devuelve el INFORME del protocolo al terminar.
```

### 3. qa-tester (6a)

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (INFORME 1, sección (A) y (F) 6a, e INFORME 3 de la entrega 6a).

Encargo acotado: QA de la entrega 6a (RF-15, clonar estructura). Solo archivos de test. No repitas lo que el dev ya probó; busca huecos.
1. Revisa y amplía apps/api/src/modules/academic/academic-clone-policy.spec.ts, apps/api/test/academic-clone.e2e-spec.ts y apps/web/app/(app)/admin/estructura/_lib/clone.test.ts con casos límite que falten (p. ej. docente que dejó de ser TEACHER, curso inactivo en sección activa, sección activa sin cursos, cuerpo con campos extra o copyTeachers no booleano, id no UUID, destino sin períodos, clones en paralelo → uno 201 y otro 409, bitácora sin nombres y con los conteos).
2. Ejecuta pnpm --filter api test, el e2e academic-clone y academic-api (con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado: docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'), y pnpm --filter web test.
No ejecutes lint/build de web ni API completos salvo que cambies algo que lo requiera: el dev y el revisor los corren. Nota: otro agente trabaja a la vez en apps/api/src/modules/users/promotion/ y en estructura/anios/[anioId]/promocion/; no toques esos archivos y, si un fallo viene de ahí, solo anótalo. Deja la BD con pnpm db:seed (con el mismo NODE_OPTIONS). No leas .env.

Devuelve un INFORME breve del protocolo (LISTO o CAMBIOS_PEDIDOS con archivo:línea).
```

### 4. seguridad-cumplimiento (6a)

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (INFORME 1 (A) e INFORME 3).

Encargo acotado y breve: auditoría de seguridad de la entrega 6a (RF-15, clonar estructura; RNF-09..13; D-029, D-030), solo sobre apps/api/src/modules/academic/{academic-clone-policy.ts, academic-clone.service.ts, academic-years.controller.ts (método clone-structure), academic.dto.ts (cloneStructureSchema), academic-locks.ts (funciones nuevas)} y apps/web/app/(app)/admin/estructura/{_lib/actions.ts (cloneStructureAction), _lib/clone.ts, _components/clone-structure.tsx, anios/[anioId]/clonar/page.tsx}. Revisa: solo ADMIN activo (@Roles a nivel de clase + ActiveActorGuard), Zod estricto, validación de UUID en la Server Action, orden de bloqueos y carreras (sin deadlocks con el orden del proyecto), todo o nada, que no se puedan escribir años cerrados o de solo lectura, que copyTeachers no asigne usuarios que no sean TEACHER activos, y bitácora `academic.year.clone_structure` sin nombres y después del commit.

Solo lectura. Si en 10 minutos no lo cubres todo, entrega con lo revisado. INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 5. ux-accesibilidad (6a)

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (INFORME 1 (C) 6a e INFORME 3, Decisión 6 del dev).

Encargo acotado y breve: revisión de interfaz de la entrega 6a (RF-15; RNF-24..27) solo sobre apps/web/app/(app)/admin/estructura/_components/clone-structure.tsx, anios/[anioId]/clonar/page.tsx y el enlace nuevo en anios/[anioId]/page.tsx. Revisa: 360 px, label del selector de año origen y su ayuda, casilla "copiar docentes" (label, 44 px, explicación), ConfirmAction con texto claro de lo que se copia y lo que no, foco y anuncio tras éxito en #resultado-clonacion (la técnica de ocultar el contenedor con `hidden` manteniendo ConfirmAction montado: ¿el foco y el anuncio funcionan?), mensajes cuando no se puede clonar (año cerrado, ya tiene secciones, sin orígenes), y coherencia con admin/_shared.

Solo lectura. Si en 10 minutos no lo cubres todo, entrega con lo revisado. INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, separando lo que bloquea.
```

### 6. dev2-estructura (entrega 6b, por SendMessage)

```
6a recibida (INFORME 3 en el expediente). Mientras QA, seguridad y UX la revisan en paralelo, empieza la entrega 6b (RF-16/RN-15, promoción en bloque) según el INFORME 1, (B) 1–11, (C) 6b y (F) 6b.1–6b.4:
1. apps/api/src/modules/users/promotion/: promotion-policy.ts puro (proposePromotion, validateDecisions, promotionFingerprint) con tests; servicio y controlador `GET /academic-years/:id/promotion-proposal?sourceYearId=` y `POST /academic-years/:id/promotion` (solo ADMIN + ActiveActorGuard, Zod estricto, bloqueos en el orden de (B)9 con una sola consulta FOR UPDATE para los estudiantes, updateMany con conteo exacto, createMany, 1213/P2034 → 409, bitácora `users.promotion.commit` solo con ids y conteos después del commit). Regístralo en users.module.ts.
2. e2e apps/api/test/users-promotion.e2e-spec.ts con los casos de (F) 6b.3 (incluidas las dos confirmaciones en paralelo: una 201 y la otra 409).
3. Pantalla estructura/anios/[anioId]/promocion/page.tsx con lógica pura en estructura/_lib/promotion-machine.ts (+ test), reutilizando admin/_shared y el BFF; enlace desde la ficha del año destino. 360 px y teclado; acciones en bloque por sección; 409 por huella → "la propuesta cambió, vuelve a cargarla".

No toques los archivos de test de la 6a (los está ampliando qa-tester) ni archivos compartidos; no hagas commit. Mismo entorno (NODE_OPTIONS=--dns-result-order=ipv4first, MySQL calentado, no leer .env). Verificación: api lint/test/build y el e2e nuevo más users-api y academic-clone; web lint/test/build; prettier --check sobre lo tocado; humo breve con curl y dev-session. Deja la BD con pnpm db:seed y los servidores detenidos. Devuelve el INFORME del protocolo.
```

### 7. dev2-estructura (correcciones de 6a y timeout, por SendMessage)

```
6b recibida (INFORME 7). Lee la Decisión del orquestador 4 y los INFORMES 4 y 5 en el expediente. Aplica en una sola pasada:
1. Timeout: en apps/web/lib/api/server.ts (lo creaste en F5 bajo A2), una opción `timeoutMs` por petición con 15 s por defecto; úsala con 30 s solo en el POST de promoción (promotionCommitAction). Añade un test puro si hay lógica nueva.
2. MEDIO 1 de seguridad de 6a (academic-clone.service.ts:109-133): con copyTeachers, bloquea los docentes candidatos FOR SHARE en orden de id y relee su rol y estado ANTES de los bloqueos de año, para seguir el orden del proyecto (User → año). Comprueba que 1213/P2034 siguen dando 409.
3. BAJO 1 y 3 de UX de 6a (clone-structure.tsx): que toda la fila de la casilla de docentes sea clicable (label envolviendo, min-h-11, cursor-pointer) y añadir al diálogo "No se copian períodos, matrículas ni contenidos".
No toques los archivos de test de la 6b ni de la 6a, porque QA los está ampliando ahora. Si necesitas un test nuevo, ponlo en un archivo aparte. Verificación: api lint/test/build, e2e academic-clone y users-promotion (NODE_OPTIONS=--dns-result-order=ipv4first, MySQL calentado), web lint/test/build y prettier sobre lo tocado. Deja la BD con el seed. Devuelve un INFORME breve con archivo:línea.
```

### 8. qa-tester (6b)

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (INFORME 1 (B), (F) 6b.3; INFORME 7 de la entrega 6b).

Encargo acotado: QA de la entrega 6b (RF-16/RN-15, promoción en bloque). Solo archivos de test. Busca huecos; no repitas lo que el dev ya cubrió (lista en el INFORME 7).
1. Amplía apps/api/src/modules/users/promotion/promotion-policy.spec.ts (p. ej. grado 4 sin sección de grado 5 con el mismo código pero con una única activa, varias secciones destino sin coincidencia de código → null y NO_TARGET_SECTION, REPEAT sin sección, GRADUATE con sección, PROMOTE en grado 5, decisiones de filas que solo admiten EXCLUDE, huella estable ante reordenamiento y distinta ante un cambio de estado), apps/api/test/users-promotion.e2e-spec.ts (p. ej. decisiones que faltan o sobran → 422, sectionId de otro año o inactiva → 422, más de 2000 decisiones → 400) y apps/web/app/(app)/admin/estructura/_lib/promotion-machine.test.ts.
2. Ejecuta pnpm --filter api test, el e2e users-promotion (con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado: docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"') y pnpm --filter web test.
Nota: el dev aplica a la vez cambios pequeños en apps/web/lib/api/server.ts, estructura/_lib/actions.ts, academic-clone.service.ts y clone-structure.tsx; no toques esos archivos. Si un fallo intermitente de e2e coincide con su trabajo en la BD, repítelo antes de reportarlo. Deja la BD con pnpm db:seed (mismo NODE_OPTIONS). No leas .env. INFORME breve del protocolo (LISTO o CAMBIOS_PEDIDOS con archivo:línea).
```

### 9. seguridad-cumplimiento (6b)

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (INFORME 1 (B) e INFORME 7).

Encargo acotado y breve: auditoría de seguridad de la entrega 6b (RF-16/RN-15, promoción; RNF-09..13; D-030, D-038), solo sobre apps/api/src/modules/users/promotion/ (policy, dto, service, controller), users-locks.ts (lockUsersForUpdateBulk), users-audit.ts y apps/web/app/(app)/admin/estructura/{_lib/actions.ts (promotionCommitAction, parseCommitInput), _lib/data.ts (getPromotionProposal), _lib/promotion-machine.ts, _components/promotion-screen.tsx}. Revisa: solo ADMIN activo, Zod estricto en query y cuerpo (1..2000 decisiones), $queryRaw parametrizado con IN (...), orden de bloqueos (estudiantes → años → secciones) frente al resto del proyecto y deadlocks → 409, huella recalculada tras los bloqueos, todo o nada, que D-038 solo permita cerrar matrículas vigentes con YEAR_END en el origen cerrado y nada más, minimización de datos de menores en la propuesta (fullName solo para ADMIN, sin correos), bitácora solo con ids y conteos después del commit, y validación en la Server Action.

Solo lectura. Si en 10 minutos no lo cubres todo, entrega con lo revisado. INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 10. ux-accesibilidad (6b)

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (INFORME 1 (C) 6b e INFORME 7, Decisiones 5–7 del dev).

Encargo acotado y breve: revisión de interfaz de la entrega 6b (RF-16; RNF-24..27) solo sobre apps/web/app/(app)/admin/estructura/_components/promotion-screen.tsx, anios/[anioId]/promocion/page.tsx y el enlace nuevo en anios/[anioId]/page.tsx. Revisa: 360 px con ~60 filas (agrupación por sección, fieldset/legend por fila, selector de acción y de sección con labels únicos que incluyan el nombre del estudiante), acciones en bloque por sección (¿se anuncia el efecto?), marcas (inactivo, sin sección destino, ya matriculado) con texto y no solo color, resumen con conteos, botón Confirmar desactivado sin canConfirm con explicación, diálogo "todo o nada", foco y anuncio tras éxito, tras 422 (filas marcadas: ¿foco a la primera?) y tras 409 (aviso con "Volver a cargar la propuesta"), y coherencia con admin/_shared.

Solo lectura. Si en 10 minutos no lo cubres todo, entrega con lo revisado. INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, separando lo que bloquea.
```

### 11. dev2-estructura (vuelta de corrección 1/2, por SendMessage)

```
Vuelta de corrección 1/2 de la F6. Antes de empezar, lee en el expediente los INFORMES 8 (UX 6b), 9 (seguridad 6b) y 10 (QA 6b), y la Decisión del orquestador 5.

1. Límite de cuerpo. El usuario autorizó tocar archivos de Dev 1, y solo esto:
   - subir el límite JSON de la API a 512 KB donde se configure el body-parser (app.setup.ts o main.ts);
   - que apps/api/src/common/errors/api-exception.filter.ts responda 413 con código PAYLOAD_TOO_LARGE y mensaje en español cuando el error traiga status o statusCode 413, en vez de 500.
   Marca ambos cambios con un comentario que diga que la autorización es del usuario y que queda pendiente de revisión por Dev 1. Con eso, el test de QA de más de 2000 decisiones debe pasar con 400 (Zod) o 413. No cambies ese test.
2. UX 6b, en promotion-screen.tsx y promocion/page.tsx:
   - (ALTO 1) anuncia las acciones en bloque con conteos;
   - (ALTO 2) tras un 422, incluye el número de filas en el mensaje, lleva el foco al primer select con error al cerrar el diálogo, anúncialo y añade aria-describedby en las filas con error;
   - (MEDIO 3) etiquetas únicas con el nombre del estudiante y de la sección;
   - (MEDIO 4) texto visible con el motivo cuando Confirmar está desactivado;
   - (MEDIO 5) nota "Solo puede quedar excluido";
   - (BAJO 6) quita "(RN-15)";
   - (BAJO 7) "Descartar mis cambios".
3. Seguridad 6b (BAJO): añade `academicYearId: source.id` al filtro de los updateMany de promotion.service.ts.

No toques los archivos de test de QA. Si necesitas un test nuevo, ponlo en un archivo aparte. No hagas commit.

Verificación:
- api lint, test y build;
- e2e users-promotion (18/18) y academic-clone, con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado;
- otro e2e que dependa del filtro de errores, por ejemplo users-import;
- web lint, test y build;
- prettier.

Deja la BD con el seed y devuelve un INFORME breve con archivo:línea de cada cambio.
```

### 12. ux-accesibilidad (verificación de la corrección)

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (tu INFORME 8 y el INFORME 12 del dev).

Encargo breve: verifica en el código que se resolvieron tus 2 ALTO, 3 MEDIO y 2 BAJO de la 6b, solo en apps/web/app/(app)/admin/estructura/_components/promotion-screen.tsx, anios/[anioId]/promocion/page.tsx y el final de _lib/promotion-machine.ts (rowFieldIds, firstErrorFieldId, invalidRowsMessage, confirmBlockReason, onlyExcludeNote, bulkAnnouncement). Opina sobre el BAJO del dev: en 409/422 el aviso sale con estilo de éxito porque ConfirmAction recibe 'ok' para cerrar el diálogo; di si basta con el aviso persistente #promocion-errores o si hace falta una variante en _shared. Busca regresiones.

Solo lectura. Si en 10 minutos no lo cubres todo, entrega con lo revisado. INFORME breve del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea (es la vuelta 1 de 2; distingue lo que bloquea).
```

### 13. seguridad-cumplimiento (límite de cuerpo y 413)

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (INFORME 10 de QA, Decisión 5 y el INFORME 12 del dev).

Encargo muy acotado: revisa solo el cambio en dos archivos de Dev 1 que el usuario autorizó. Los archivos son apps/api/src/app.setup.ts (límite JSON de 512 KB con useBodyParser) y apps/api/src/common/errors/api-exception.filter.ts (`isPayloadTooLarge` y la respuesta 413 PAYLOAD_TOO_LARGE). Responde a tres preguntas:
- ¿El límite de 512 KB, que ahora es global, abre algún riesgo de DoS frente a los 100 KB anteriores? Ten en cuenta el throttler y que la importación va por multer con 1 MiB.
- ¿El 413 filtra stack o detalles?
- ¿Es correcto que el resto de errores de body-parser (JSON mal formado) siga respondiendo 500? Indica la severidad.
Revisa también promotion.service.ts:161 y :168, donde se añadió academicYearId al filtro.

Solo lectura y sé breve, 5 minutos como máximo. INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS, con severidad y archivo:línea.
```

### 14. revisor-pr

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (INFORMES 1–14 y Decisiones del orquestador 1–7).

Encargo: revisión final de la Fase 6 de Dev 2 (RF-15 clonar y RF-16/RN-15 promoción; D-029, D-030, D-038 propuesta) de todo lo que hay sin commit desde 96665a1. Una sola pasada.
1. Definición de terminado (docs/06_GIT_CALIDAD.md).
2. Alcance: apps/api/src/modules/academic/ (clone), apps/api/src/modules/users/ (promotion/, users-locks.ts, users-audit.ts, users.module.ts), apps/api/test/academic-clone.e2e-spec.ts y users-promotion.e2e-spec.ts, apps/web/app/(app)/admin/estructura/ (clonar, promocion, _lib, _components, ficha del año), apps/web/lib/api/ (server.ts, request-guards.ts y timeout.test.ts; creados por Dev 2 en F5 con la autorización A2), y los dos archivos de Dev 1 autorizados por el usuario (Decisión 5): apps/api/src/app.setup.ts y apps/api/src/common/errors/api-exception.filter.ts más su spec. Comprueba que esos dos cambios llevan el comentario de autorización y no tocan nada más. Nada en package.json, lockfile, prisma/schema, nav, routes, layouts, next.config, packages/ui ni módulos de otros devs. Ignora docs/ (lo está editando el documentador en paralelo; no lo revises). .agents/ y skills-lock.json no entran.
3. Pasan: pnpm --filter api lint, test y build; e2e academic-clone, academic-api, users-promotion, users-api y users-import (con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado: docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'); pnpm --filter web lint, test y build; prettier --check sobre el código tocado y el expediente. Deja la BD con pnpm db:seed (mismo NODE_OPTIONS).

No modifiques archivos. INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, y la lista exacta de archivos de código para el commit.
```

### 15. documentador

```
Expediente: .claude/tareas/20261029-dev2-cierre-anio.md (INFORME 1 del arquitecto, INFORMES 3, 7, 11 y 12 del dev, Decisiones del orquestador 4 y 5).

Encargo: documenta la Fase 6 de Dev 2. Solo docs/, conciso, solo añadidos y sin reescribir secciones ajenas. Estado: PROPUESTA, aprobada por los agentes de revisión, sin PR al equipo.
1. docs/03_CONTRATOS.md: los 3 endpoints con su forma y errores tal como quedaron implementados: `POST /academic-years/:id/clone-structure`, `GET /academic-years/:id/promotion-proposal?sourceYearId=` y `POST /academic-years/:id/promotion`. Usa los INFORMES 3 y 7 (Decisiones del dev) y lee el código si dudas: academic.dto.ts, academic-clone.service.ts, users/promotion/promotion.dto.ts y promotion.service.ts. Añade el límite JSON de 512 KB y la respuesta 413 PAYLOAD_TOO_LARGE como nota de plataforma pendiente de revisión por Dev 1.
2. docs/04_REGLAS_ESTADOS.md: detalle de RN-15 (propuesta, correcciones permitidas, confirmación todo o nada, tandas con EXCLUDE, cierre con YEAR_END y effectiveTo = max(ahora, effectiveFrom), los egresados no cambian de estado).
3. docs/08_DECISIONES.md: D-038 (la promoción es la única escritura permitida sobre un año origen cerrado o de solo lectura, y solo cierra matrículas vigentes con YEAR_END; RN-14) como PROPUESTA del 29/10/2026. Si corresponde, una línea sobre el timeout por petición del BFF (30 s para la promoción) dentro de D-037, sin reescribirla.
4. docs/10_TRAZABILIDAD.md: RF-15 y RF-16 hechos en F6, con API, rutas web y tests.
5. docs/manuales/tecnico.md: sección breve de F6 con las rutas `/admin/estructura/anios/[anioId]/clonar` y `/promocion`, las precondiciones (el destino se crea antes con RF-09; para promover, el origen debe tener los 4 períodos cerrados y el destino ser el año siguiente con secciones activas) y la nota de los dos archivos de Dev 1 cambiados con autorización del usuario (app.setup.ts y api-exception.filter.ts), pendientes de su revisión.
Pendientes que debes anotar donde corresponda: el texto literal de RF-15/16 en la ERS está sin confirmar; ¿los egresados pasan a INACTIVE? (por ahora no); JSON mal formado sigue respondiendo 500 (Dev 1).

prettier no aplica a docs/. Devuelve el INFORME del protocolo con la lista de archivos.
```

## Decisiones del orquestador

1. **Sin `modelador-bd`:** el plan no pedía cambios de esquema.
2. **Fallo propio al guardar el plan:** un heredoc de bash no se cerró y el plan no quedó en el expediente. El dev se detuvo correctamente con BLOQUEADO (no adivinó el contrato). Se escribió el plan con Write + `cat` y se reanudó al mismo agente. Desde entonces los INFORMES largos se guardan así.
3. **Eficiencia (pedido del usuario):**
   - Mientras QA, seguridad y UX revisaban la 6a en paralelo, el mismo dev hacía la 6b. Luego, mientras revisaban la 6b, el dev corregía la 6a.
   - Las correcciones se juntaron en un solo mensaje por vuelta. Siempre se reanudó al mismo agente, que conservaba su contexto.
   - Tras la vuelta 1/2 no se repitió QA, porque el dev corrió toda la batería, incluido el test que estaba en rojo.
   - El revisor y el documentador trabajaron en paralelo.
4. **Timeout del BFF:** `lib/api/server.ts` lo creó Dev 2 en la F5 con la autorización A2, así que se decidió aquí: opción por petición, con 30 s solo para la promoción.
5. **Bug del límite de cuerpo:** arreglarlo tocaba archivos de Dev 1, así que se preguntó al usuario. Respondió "Tocar archivos de Dev 1 (Recomendado)". Solo se cambió lo autorizado, con un comentario que lo deja pendiente de revisión por David.
6. **MEDIO de seguridad sobre la bitácora (6a):** ya estaba resuelto. `recordAcademic` captura el error y no lo relanza (academic-audit.ts:19-40). Se comprobó que la columna `afterState Json?` admite los 4000 ids.
7. **Documentación en el mismo commit:** el revisor la dejó fuera de su alcance porque corría en paralelo, pero va con el trabajo, como pide CLAUDE.md.

## Archivos

**Modificados (17):** `apps/api/src/app.setup.ts`, `apps/api/src/common/errors/api-exception.filter.ts` (los dos de Dev 1, autorizados), `apps/api/src/modules/academic/{academic-locks,academic-years.controller,academic-years.service,academic.dto,academic.errors,academic.module}.ts`, `apps/api/src/modules/users/{users-audit,users-locks,users.module}.ts`, `apps/web/app/(app)/admin/estructura/_lib/{actions,data,focus}.ts`, `apps/web/app/(app)/admin/estructura/anios/[anioId]/page.tsx`, `apps/web/lib/api/{request-guards,server}.ts`.

**Nuevos (23):** `apps/api/src/common/errors/api-exception-413.spec.ts`; `apps/api/src/modules/academic/{academic-clone-locks.spec,academic-clone-policy.spec,academic-clone-policy,academic-clone.service}.ts`; `apps/api/src/modules/users/promotion/{promotion-policy.spec,promotion-policy,promotion.controller,promotion.dto,promotion.errors,promotion.service}.ts`; `apps/api/test/{academic-clone,users-promotion}.e2e-spec.ts`; `apps/web/app/(app)/admin/estructura/_components/{clone-structure,promotion-screen}.tsx`; `apps/web/app/(app)/admin/estructura/_lib/{clone,clone.test,promotion-a11y.test,promotion-machine,promotion-machine.test}.ts`; `apps/web/app/(app)/admin/estructura/anios/[anioId]/{clonar,promocion}/page.tsx`; `apps/web/lib/api/timeout.test.ts`.

**Documentación:** `docs/03_CONTRATOS.md`, `docs/04_REGLAS_ESTADOS.md`, `docs/08_DECISIONES.md`, `docs/10_TRAZABILIDAD.md`, `docs/manuales/tecnico.md` y `docs/manuales/administrador.md` (nuevo).

Expediente y este reporte. **No se incluyen:** `.agents/`, `skills-lock.json`.

## Verificación

| Comando                                                                    | Resultado                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm --filter api lint` / `test` / `build`                                | ok · 32 archivos, **359 tests**                                       |
| e2e academic-clone, academic-api, users-promotion, users-api, users-import | ok · 5 archivos, **244 tests**                                        |
| `pnpm --filter web lint` / `test` / `build`                                | ok · 13 archivos, **275 tests** (aviso preexistente de jsx-ast-utils) |
| `prettier --check` (código y expediente)                                   | ok                                                                    |
| BD                                                                         | `pnpm db:seed` al final: 68 usuarios, 62 matrículas                   |

Los comandos que tocan MySQL corrieron con `NODE_OPTIONS=--dns-result-order=ipv4first` y MySQL calentado (WSL ocupa `[::1]` en los puertos de Docker).

## Pendientes y decisiones abiertas

- **Revisión de David (Dev 1):** `app.setup.ts` (límite de 512 KB, opcional dejarlo solo en la ruta de promoción) y `api-exception.filter.ts` (413). Además, un JSON mal formado sigue respondiendo 500.
- **Por confirmar:** el texto literal de RF-15/16 en la ERS (el PDF no se pudo leer); si los egresados pasan a INACTIVE (por ahora no); la aprobación de D-038.
- **Prueba manual en navegador** de las pantallas de clonar y promover (360 px, teclado, lector de pantalla).
- **Menores:** el aviso temporal con estilo de éxito en 409/422 de la promoción; las menciones "fuera de esta fase (F6)" en secciones anteriores del manual técnico.
- Nada de Dev 2 va al equipo sin acuerdo con su dueño.

## Expediente

[.claude/tareas/20261029-dev2-cierre-anio.md](../tareas/20261029-dev2-cierre-anio.md)
