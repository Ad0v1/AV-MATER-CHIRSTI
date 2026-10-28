# Reporte — Dev 2, Fase 5, entrega 5a: pantallas de estructura académica (RF-09..14, RF-17)

## Pedido

- **Usuario:** "vamos a la fase 5"
- **Autorización durante la tarea** (pregunta A1/A2/A3 sobre archivos fuera de la carpeta de Dev 2): "segun tu recomendacion toca o modifica cualquier carpeta, utiliza el criterio de los agentes"
- **Fecha:** 28/10/2026 · **Flujo:** completo · **Vueltas de corrección:** 1/2 · **Rama:** `features/adolfo` (base `a43bf19`) · **Commit:** `feat(web): RF-09..14/17 pantallas de estructura academica …` (subido solo a `mio`)
- **Aviso:** Dev 2 es de un compañero. No va al equipo sin acuerdo con el dueño de Dev 2.
- **Alcance de este reporte:** la F5 se partió en 3 entregas (5a estructura, 5b usuarios, 5c importación). Este reporte cubre solo la **5a**; 5b y 5c seguirán en el mismo expediente.

## Resultado

- **5 pantallas de administración** en `apps/web/app/(app)/admin/estructura/`:
  - `/admin/estructura`: lista de años con su estado (activo, cerrado, solo lectura).
  - `/admin/estructura/anios/nuevo`: crear un año con sus 4 bimestres.
  - `/admin/estructura/anios/[anioId]`: editar, activar y cerrar el año; editar fechas, cerrar y reabrir períodos (con motivo); crear y editar secciones.
  - `/admin/estructura/anios/[anioId]/secciones/[seccionId]`: cursos de la sección, activar o desactivar y asignar, cambiar o quitar docente.
  - `/admin/estructura/cursos`: catálogo de cursos.
- **Cómo habla la web con la API (propuesta D-037):** desde el servidor de Next (Server Components para leer, Server Actions para escribir). Solo se reenvía la cookie de sesión `aula_sid`, nunca se guarda en caché y la web no decide permisos: la API los aplica.
- **Sesión local sin login:** como el login es de David y aún no existe, el script `prisma/seed/dev-session.ts` crea una sesión de ADMIN del seed **solo en local**. Se niega en producción, en CI y con BD o Redis remotos.
- **Accesibilidad:** diseño desde 360 px, objetivos de 44 px, tras cada acción el foco pasa al título del elemento afectado y el resultado se anuncia en una zona fija para lectores de pantalla. Errores de la API en español.
- **Base común para 5b/5c (y para Dev 4/5):** `apps/web/lib/api/` (cliente y mensajes de error), 11 componentes nuevos de shadcn y Vitest en la web.
- **Tests:** 79 de la web (antes 0) y los 314 de la API sin cambios.

## Agentes que participaron

| #   | Agente                   | Modelo | Qué hizo                                                                                            | Estado          |
| --- | ------------------------ | ------ | --------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `arquitecto-integrador`  | Opus   | Plan: vía BFF, sesión local, rutas, componentes, 3 entregas, autorizaciones A1/A2/A3                | LISTO           |
| 2   | `dev2-estructura`        | Opus   | Entrega 5a: infraestructura, 11 componentes, Vitest, 5 pantallas, 35 tests; probado con la API real | LISTO           |
| 3   | `qa-tester`              | Sonnet | Amplió a 65 tests; humo con ADMIN, docente y sin sesión                                             | LISTO           |
| 4   | `seguridad-cumplimiento` | Sonnet | Sin CRÍTICO ni ALTO; 1 MEDIO (throttle, para Dev 1) y 4 BAJO                                        | APROBADO        |
| 5   | `ux-accesibilidad`       | Sonnet | 2 ALTO: foco perdido y resultado no anunciado tras una acción; 3 MEDIO                              | CAMBIOS_PEDIDOS |
| 6   | `dev2-estructura`        | Opus   | Corrección 1/2: foco al encabezado, región de estado fija, `<main>` único, lógica pura separada     | LISTO           |
| 7   | `ux-accesibilidad`       | Sonnet | Verificación de la corrección; 1 MEDIO y 2 BAJO nuevos que no bloquean                              | APROBADO        |
| 8   | `qa-tester`              | Sonnet | Repetición: 79 tests; humo en 8 páginas                                                             | LISTO           |
| 9   | `revisor-pr`             | Sonnet | Revisión final: todo en verde salvo formato de 3 archivos                                           | CAMBIOS_PEDIDOS |
| —   | orquestador              | Opus   | `prettier --write` de esos 3 archivos (Decisión 4); `prettier --check` y tests en verde → APROBADO  | —               |

`documentador` no participó en 5a: el plan lo deja para el final de 5c (D-037, comando de sesión local, `API_INTERNAL_URL`).

## Prompts usados

### 1. arquitecto-integrador

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (léelo primero, incluido el Contexto).

Encargo: planifica la Fase 5 de Dev 2, las pantallas de administración en apps/web para la estructura académica (RF-09..14, 17), usuarios, matrículas, traslados y apoderados (RF-18..20, 22..25) y la importación masiva (RF-21), sobre la API ya hecha en F2–F4 (contratos en docs/03_CONTRATOS.md; código en apps/api/src/modules/academic/ y apps/api/src/modules/users/).

Decide y deja escrito en tu INFORME:
1. Cómo llama la web a la API sin login real (la sesión de la web es una cookie simulada `dev-role` y el login es de Dev 1). Revisa cómo autentica hoy la API (guards, cookie de sesión, cómo crean sesión los tests e2e) y propone la vía mínima y segura para desarrollo local (p. ej. proxy/rewrites de Next hacia la API reenviando la cookie de sesión real, y una forma de obtener una sesión de admin en local que no exista en producción), sin tocar los módulos de Dev 1 o, si es inevitable, marcándolo como BLOQUEADO para el usuario.
2. Rutas y pantallas concretas bajo app/(app)/admin/estructura y app/(app)/admin/usuarios (subrutas, lista/detalle/formularios), qué endpoint usa cada una, y el orden de construcción si conviene partirlo.
3. Componentes de shadcn/ui que faltan (hay button, input, separator, sheet, sidebar, skeleton, tooltip) y si hace falta tocar archivos compartidos (apps/web/package.json, pnpm-lock.yaml, packages/ui, lib/nav.ts, layout). Recuerda que apps/web/AGENTS.md exige leer node_modules/next/dist/docs/ (Next 16.4.2, cacheComponents activo).
4. Requisitos de UX: diseño desde 360 px, WCAG 2.1 AA (RNF-24..27), mensajes de error de la API en español, aviso de la importación con motivos de fila sin datos personales.
5. Qué tests corresponden (Vitest para lógica de cliente, Playwright si aplica según docs/09_QA_BASE.md) y si hay cambio de esquema o de contrato (se espera que no).
6. Cualquier cosa que exceda el alcance v1 (ERS §7).

Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md.
```

### 2. dev2-estructura (entrega 5a)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (léelo completo: Contexto, INFORME 1 del arquitecto y Decisión del orquestador 1).

Encargo: implementa la entrega 5a de la Fase 5 (pantallas de estructura académica, RF-09..14 y RF-17), siguiendo las Decisiones 1–5 del arquitecto. El usuario autorizó A1 (componentes nuevos de shadcn en apps/web/components/ui/), A2 (apps/web/lib/api/ con server.ts y errors.ts) y A3 (vitest ^4.1.2 en devDependencies de apps/web, script "test": "vitest run" y apps/web/vitest.config.ts; puede tocar pnpm-lock.yaml).

Incluye en 5a:
1. Infraestructura común: prisma/seed/local-guard.ts (mueve assertLocalDatabase desde prisma/seed/index.ts, que debe seguir funcionando igual) y prisma/seed/dev-session.ts (sesión de ADMIN del seed solo en local, sin modificar el código de Dev 1 en apps/api; plan B descrito en el INFORME si tsx no compila decoradores). apps/web/lib/api/server.ts (server-only, solo reenvía aula_sid, cache no-store, nunca 'use cache' con datos de sesión) y errors.ts (ApiError, parseo del sobre de error y toUserMessage en español por status).
2. Componentes ui que falten (pnpm dlx shadcn@latest add desde apps/web; no deben cambiar dependencias en package.json más allá de A3). Sin sonner, RHF ni TanStack.
3. Pantallas: /admin/estructura (lista de años), /admin/estructura/anios/nuevo, /admin/estructura/anios/[anioId] (año, períodos, secciones), /admin/estructura/anios/[anioId]/secciones/[seccionId] (curso-sección y docente) y /admin/estructura/cursos. Sustituye el PlaceholderPage de /admin/estructura. Usa carpetas privadas _components/_lib dentro de app/(app)/admin/estructura.
4. Tests Vitest de lógica pura de 5a (toUserMessage y parseo de errores, límites de motivos, local-guard) — qa-tester ampliará después.

Antes de escribir código lee apps/web/AGENTS.md y las guías de node_modules/next/dist/docs/ que cita el INFORME (Next 16.4.2 con cacheComponents: lo dinámico dentro de Suspense). Diseño desde 360 px y WCAG 2.1 AA; aviso fijo junto a cada campo de motivo; fechas solo-día YYYY-MM-DD; instantes en es-PE/America/Lima.

No toques lib/nav.ts, lib/routes.ts, los layouts, next.config.ts, packages/ui ni apps/api/src. No hagas commit.

Verificación obligatoria antes de devolver: pnpm --filter web lint, pnpm --filter web build, pnpm --filter web test, pnpm format:check (o prettier sobre lo tocado). Si Docker está levantado (docker compose ps), prueba en local: pnpm db:seed si hace falta, API en :4000, el script de sesión, y que al menos GET /admin/estructura cargue con la cookie (puedes verificar con curl enviando la cookie aula_sid a http://localhost:3000). Tras reiniciar MySQL puede aparecer el error 45028; se calienta con: docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'. No leas .env. Al terminar deja detenidos los servidores que levantes.

Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md (archivos, comandos con resultado, hallazgos, pendientes).
```

### 3. qa-tester

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee el INFORME 1 del arquitecto y el INFORME 2 de dev2-estructura, entrega 5a).

Encargo: pruebas de la entrega 5a de la Fase 5 (pantallas de estructura académica, RF-09..14, RF-17; RNF-24..27) según docs/09_QA_BASE.md. Solo crea o modifica archivos de test.

1. Amplía los tests Vitest de lógica pura: apps/web/lib/api/errors.test.ts (parseo del sobre {error:{code,message,details},requestId}, toUserMessage por cada status incluidos 413, 429, 5xx y red, 401 en desarrollo y producción, detailMessages con periods.N y periods.N.campo, mensajes vacíos o "Solicitud invalida"), apps/web/app/(app)/admin/estructura/_lib/validation.test.ts (límites de motivos tras trim, fechas, UUID, booleanos manipulados) y prisma/seed/local-guard.test.ts (producción, CI, host no local, REDIS_URL permitidos y rechazados). Si server.ts tiene lógica pura exportable (validación de la cookie aula_sid, rutas relativas sin ".."), pruébala sin red; si no es exportable, anótalo como hallazgo para el dev en vez de cambiar código.
2. Ejecuta pnpm --filter web test, pnpm --filter web lint y pnpm --filter api test (no deben romperse los 314 de la API).
3. Si Docker está healthy, repite una prueba de humo con la API real: script de sesión (pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed/dev-session.ts), API en :4000 y web en :3000 (build + next start), y curl con la cookie aula_sid a /admin/estructura, /admin/estructura/cursos y el detalle de un año; sin cookie debe salir el 401 en español; con sesión de TEACHER (--email de un docente del seed) el 403. Si modificas datos, deja la BD como estaba (pnpm db:seed). Detén los servidores al terminar. No leas .env. Error 45028 de MySQL: calentar con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'.

Playwright no va en F5 (no está instalado). Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md; si algo falla, CAMBIOS_PEDIDOS con el hallazgo y Para: dev2-estructura.
```

### 4. seguridad-cumplimiento

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee los INFORMES 1, 2 y 3).

Encargo: auditoría de seguridad de la entrega 5a de la Fase 5 (pantallas de estructura académica, RF-09..14, RF-17; RNF-02, RNF-09..13; D-037 propuesta). Revisa OWASP, permisos, Ley 29733 y protección de menores en:
- apps/web/lib/api/server.ts y errors.ts: que solo reenvíe aula_sid, validación del token, rutas sin "..", sin 'use cache' con datos de sesión, que no filtre texto del servidor ni el token al cliente, timeouts, redirect manual.
- apps/web/app/(app)/admin/estructura/_lib/actions.ts y data.ts: que las Server Actions validen en el servidor (UUID, booleanos, límites de motivos), que la autorización siga en la API (la web no decide permisos ni usa la cookie dev-role), CSRF de Server Actions, que no se registren motivos ni datos personales.
- prisma/seed/dev-session.ts y local-guard.ts: que sea imposible en producción, CI o con BD/Redis remotos, que solo use usuarios del seed ACTIVE, que no imprima secretos además del token, y que no se cuele en el build de la API ni en el bundle de la web.
- Hallazgo 3 de QA: las listas responden HTTP 200 con el error 401/403 en el contenido (Partial Prerender). ¿Es aceptable o exige status real?
- Hallazgo MEDIO del arquitecto sobre el throttle por IP detrás del BFF (decisión para Dev 1): confirma severidad.
- Aviso de motivos (REASON_NOTICE) junto a cada campo de motivo.

Solo lectura. Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md, con severidad (CRÍTICO/ALTO/MEDIO/BAJO), APROBADO o CAMBIOS_PEDIDOS y Para:.
```

### 5. ux-accesibilidad

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee los INFORMES 1, 2 y 3).

Encargo: revisión de interfaz de la entrega 5a de la Fase 5 (pantallas de estructura académica en apps/web/app/(app)/admin/estructura/, RF-09..14, RF-17; RNF-24..27). Revisa coherencia con shadcn/ui (componentes nuevos en apps/web/components/ui/), diseño desde 360 px (tablas, botones, formularios, nada esencial oculto), WCAG 2.1 AA: labels asociados, aria-invalid/aria-describedby, foco en el primer error, foco visible, diálogos con foco atrapado, contraste, objetivos de 44 px, Skeleton + aria-busy en Suspense, regiones role="status"/"alert", textos en español claros, fechas YYYY-MM-DD e instantes es-PE/America/Lima, y el aviso fijo de motivos con contador.

Decide el hallazgo MEDIO de dev2: en _components/confirm-action.tsx, tras el éxito y refresh() el botón que abrió el diálogo puede desaparecer y el foco cae en <body>. Indica a dónde debe ir el foco (p. ej. al encabezado de la tarjeta del período o sección con tabIndex=-1) para que el dev lo implemente.

Solo lectura (la prueba es revisando el código). Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md, con APROBADO o CAMBIOS_PEDIDOS y hallazgos concretos con archivo:línea.
```

### 6. dev2-estructura (vuelta de corrección 1/2, por SendMessage al mismo agente)

```
Vuelta de corrección 1/2 de la entrega 5a. Lee en .claude/tareas/20261028-dev2-pantallas.md el INFORME 3 (qa-tester), el INFORME 4 (seguridad-cumplimiento), el INFORME 5 (ux-accesibilidad) y la Decisión del orquestador 2.

Corrige:
1. Los 2 ALTO y 3 MEDIO de ux-accesibilidad, aplicando exactamente sus Decisiones 1–6: foco al encabezado del elemento afectado tras éxito (ids periodo-/seccion-/curso-/curso-seccion-<id> y <h1 id="titulo-pagina" tabIndex={-1}>, prop focusId, finalFocus del AlertDialog, respaldo #titulo-pagina), ActionFeedback con región role="status" aria-live="polite" aria-atomic="true" siempre montada y mensaje también visible, PageShell como <div> (sin tocar el layout), reseteo del diálogo al reabrir y PageHeader en los caminos "no UUID"/"no existe".
2. Los BAJO de UX: indicador de foco en el Alert con tabIndex=-1, espacio antes de "(opcional)"; el de "Cerrar año" con períodos abiertos es opcional (decide tú y anótalo).
3. Hallazgos de QA: mueve la lógica pura de lib/api/server.ts (assertApiPath y la validación del token aula_sid) a un módulo sin server-only y expórtala; extrae un validador puro de booleanos a _lib/validation.ts y úsalo en actions.ts; renombra vitest.config.ts a vitest.config.mts (ajusta lo que lo referencie).
4. BAJO de seguridad: en dev-session.ts añade la advertencia "no lo compartas ni lo subas a ningún sitio" junto al token.

Añade tests puros donde haya lógica nueva (p. ej. la elección del destino de foco si la extraes a una función). No toques nav, routes, layouts, next.config.ts, packages/ui ni apps/api/src. No hagas commit.

Verificación: pnpm --filter web lint, pnpm --filter web test, pnpm --filter web build y prettier --check sobre lo tocado. Si Docker está healthy, repite una prueba rápida con la API (dev-session + curl) de que las páginas cargan, y deja la BD como estaba y los servidores detenidos. Devuelve el INFORME con el formato del protocolo indicando qué hallazgo resolvió cada cambio (archivo:línea).
```

### 7. ux-accesibilidad (verificación de la corrección)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee tu INFORME 5 y el INFORME 6 de dev2-estructura, vuelta de corrección 1/2 de la entrega 5a).

Encargo: verifica en el código que se resolvieron tus 2 ALTO, 3 MEDIO y los BAJO, según tus Decisiones 1–6: focusId y finalFocus en apps/web/app/(app)/admin/estructura/_components/confirm-action.tsx, InlineAction, _lib/focus.ts, ids y tabIndex=-1 en los encabezados de las páginas, _components/action-feedback.tsx (región role="status" siempre montada, mensaje visible, re-anuncio de textos repetidos), PageShell como <div> en page-bits.tsx, reseteo del diálogo con key, PageHeader en los caminos "no UUID"/"no existe", foco visible del Alert, "(opcional)" y la decisión del dev de dejar "Cerrar año" pulsable con aviso fijo (year-panels.tsx:64). Busca también regresiones nuevas (por ejemplo, que la caja visible de 10 s no tape contenido a 360 px ni robe el foco, o que haya dos regiones vivas que anuncien lo mismo dos veces).

Solo lectura. Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md: APROBADO o CAMBIOS_PEDIDOS con archivo:línea. Es la vuelta 1 de 2: si pides cambios, distingue lo que bloquea de lo que puede quedar como pendiente.
```

### 8. qa-tester (repetición)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee el INFORME 5 de ux-accesibilidad y el INFORME 6 de dev2-estructura, vuelta de corrección 1/2 de la entrega 5a).

Encargo: repite QA de la entrega 5a tras la corrección (RF-09..14, RF-17; RNF-24..27). Solo archivos de test.
1. Revisa y amplía los tests nuevos: apps/web/lib/api/request-guards.test.ts (validación del token aula_sid, assertApiPath, sessionCookieHeader) y apps/web/app/(app)/admin/estructura/_lib/focus.test.ts (pickFocusTarget: éxito con encabezado presente, encabezado ausente → #titulo-pagina, cancelar → trigger; isStrictBoolean con "false", 0, null, undefined, objetos). Si action-feedback.tsx tiene lógica pura exportable, pruébala; si no, anótalo.
2. Ejecuta pnpm --filter web test, pnpm --filter web lint, pnpm --filter web build y pnpm --filter api test.
3. Si Docker está healthy: prueba de humo (dev-session con --tsconfig apps/api/tsconfig.json, API :4000, web con next start :3000) comprobando con curl en /admin/estructura, /anios/<id>, /secciones/<id>, /cursos y /anios/no-uuid: un solo <main>, un h1#titulo-pagina, una región role="status" aria-live="polite" siempre presente, los ids periodo-/seccion-/curso-seccion-/curso-; 401 sin cookie y 403 con docente. Deja la BD con pnpm db:seed y los servidores detenidos. No leas .env.

Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md (LISTO o CAMBIOS_PEDIDOS con Para:).
```

### 9. revisor-pr

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee todos los INFORMES 1–8 y las Decisiones del orquestador 1–3).

Encargo: revisión final de la entrega 5a de la Fase 5 de Dev 2 (pantallas de estructura académica, RF-09..14, RF-17; RNF-24..27; D-037 propuesta) antes de darla por terminada. Comprueba:
1. Definición de terminado (docs/06_GIT_CALIDAD.md) y el criterio de terminado de 5a del INFORME 1.
2. Que solo se tocaron las carpetas permitidas por la Decisión 1: apps/web/app/(app)/admin/estructura/, apps/web/components/ui/ (solo archivos nuevos; button.tsx y separator.tsx sin cambios), apps/web/lib/api/, apps/web/vitest.config.mts, apps/web/package.json (solo script test y vitest), pnpm-lock.yaml (solo vitest/vite de web), prisma/seed/ (local-guard, dev-session, index.ts y tests) y .claude/tareas/. Nada en nav, routes, layouts, next.config.ts, packages/ui ni apps/api/src. Usa git status y git diff (hay archivos sin seguimiento; .agents/ y skills-lock.json no son de esta tarea y no deben entrar). Si apps/web/AGENTS.md o next-env.d.ts aparecen cambiados por next dev, indícalo.
3. Que la corrección 1/2 no cambió la conducta de seguridad de lib/api/server.ts (lógica movida a request-guards.ts).
4. Que pasan: pnpm --filter web lint, pnpm --filter web test, pnpm --filter web build, pnpm --filter api lint, pnpm --filter api test, y prettier --check sobre los archivos de la tarea.

No modifiques archivos. Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md: APROBADO o CAMBIOS_PEDIDOS con archivo:línea y la lista exacta de archivos que deben ir en el commit.
```

## Decisiones del orquestador

1. **Autorizaciones A1/A2/A3.** El arquitecto pidió permiso para tocar archivos fuera de la carpeta de Dev 2. Se preguntó al usuario y respondió "segun tu recomendacion toca o modifica cualquier carpeta, utiliza el criterio de los agentes". Se autorizaron A1 (componentes nuevos de shadcn), A2 (`apps/web/lib/api/`) y A3 (Vitest en la web), y **se mantuvo fuera** lo que el plan excluía: menú, rutas, layouts, `next.config.ts`, `packages/ui` y los módulos de Dev 1 en la API.
2. **Partir la F5 en 3 entregas** (5a, 5b, 5c), como recomendó el arquitecto, con su vuelta de QA, seguridad, UX y revisor cada una.
3. **Vuelta de corrección 1/2** por los 2 ALTO de UX. Se reanudó al mismo `dev2-estructura` (con su contexto) y se le sumaron los hallazgos no bloqueantes de QA y el BAJO de seguridad, para no abrir otra vuelta después.
4. **No repetir seguridad tras la corrección:** solo se movió la lógica pura de `server.ts` a `request-guards.ts` sin cambiar su conducta; lo comprobó `revisor-pr`.
5. **El MEDIO nuevo de UX** (la caja de aviso de 10 s no se puede cerrar y a 360 px puede tapar botones) y 2 BAJO quedan para la entrega 5b, que vuelve a tocar esos archivos.
6. **Formato:** el `CAMBIOS_PEDIDOS` final de `revisor-pr` era solo `prettier --write` en 3 archivos (2 tests y el expediente). Lo aplicó el orquestador sin cambiar lógica y no cuenta como vuelta. `prettier --check` y los 79 tests en verde, con lo que queda APROBADO según el propio revisor.
7. **Documentador** se deja para el final de 5c (D-037, comando de sesión local, `API_INTERNAL_URL` en `.env.example`).

## Archivos

**Modificados (4):**

- `apps/web/app/(app)/admin/estructura/page.tsx` (sustituye el placeholder)
- `apps/web/package.json` (script `test` y `vitest ^4.1.2`)
- `pnpm-lock.yaml` (solo añade vitest, vite y @vitest/mocker de la web)
- `prisma/seed/index.ts` (importa `assertLocalDatabase` de `local-guard`)

**Nuevos:**

- `apps/web/app/(app)/admin/estructura/`: `anios/nuevo/page.tsx`, `anios/[anioId]/page.tsx`, `anios/[anioId]/secciones/[seccionId]/page.tsx`, `cursos/page.tsx`
- `apps/web/app/(app)/admin/estructura/_components/`: `action-feedback.tsx`, `confirm-action.tsx`, `course-panels.tsx`, `course-section-panels.tsx`, `form-bits.tsx`, `new-year-form.tsx`, `page-bits.tsx`, `section-panels.tsx`, `styles.ts`, `year-panels.tsx`
- `apps/web/app/(app)/admin/estructura/_lib/`: `actions.ts`, `data.ts`, `focus.ts`, `focus.test.ts`, `format.ts`, `types.ts`, `validation.ts`, `validation.test.ts`
- `apps/web/components/ui/`: `alert.tsx`, `alert-dialog.tsx`, `badge.tsx`, `card.tsx`, `dialog.tsx`, `field.tsx`, `label.tsx`, `native-select.tsx`, `pagination.tsx`, `table.tsx`, `textarea.tsx`
- `apps/web/lib/api/`: `server.ts`, `errors.ts`, `errors.test.ts`, `request-guards.ts`, `request-guards.test.ts`
- `apps/web/vitest.config.mts`
- `prisma/seed/`: `local-guard.ts`, `local-guard.test.ts`, `dev-session.ts`
- `.claude/tareas/20261028-dev2-pantallas.md` y este reporte

**No se incluyen:** `.agents/`, `skills-lock.json`.

## Verificación

| Comando                                   | Resultado                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm --filter web lint`                  | ok (solo un aviso preexistente de jsx-ast-utils en `app/(app)/layout.tsx`)            |
| `pnpm --filter web test`                  | ok, 5 archivos, **79 tests**                                                          |
| `pnpm --filter web build`                 | ok, las 5 rutas nuevas como Partial Prerender                                         |
| `pnpm --filter api lint` / `test`         | ok, 28 archivos, 314 tests                                                            |
| `prettier --check` (archivos de la tarea) | ok tras el formateo del orquestador                                                   |
| Prueba con Docker y la API real           | 8 páginas con ADMIN; 403 con docente; 401 sin sesión; 16 acciones probadas por el dev |
| BD                                        | `pnpm db:seed` al final: 68 usuarios, 2 años, 30 curso-sección (como estaba)          |

**Cómo verlo en local:**

```bash
docker compose up -d
pnpm --filter api start
pnpm --filter web dev
pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed/dev-session.ts
```

Después se crea en el navegador, para `http://localhost:3000`, la cookie `aula_sid` con el token que imprime el script (DevTools → Application → Cookies) y se abre `/admin/estructura`.

## Pendientes y decisiones abiertas

- **Entregas 5b (usuarios) y 5c (importación)** de la F5. Luego la F6 (clonar el año y promoción en bloque).
- **Para 5b:** botón "Cerrar" en la caja de aviso de 10 s (MEDIO de UX); `aria-describedby` en "Cerrar año"; posible doble lectura del error; la búsqueda `q` de usuarios por Server Action POST o sin registrar la URL (seguridad).
- **Prueba manual** en navegador a 360 px, con teclado y con NVDA/VoiceOver; contraste de la caja verde en modo oscuro. Playwright + axe cuando se instale.
- **Para David (Dev 1):** el límite de peticiones por IP detrás del servidor de la web (MEDIO); reemplazar el script de sesión local por el login real; status HTTP real en 401/403 si se quiere (middleware); opcional `ALLOW_DEV_SESSION=1`.
- **Documentador al final de 5c:** D-037 en docs/08, comando de sesión local con `--tsconfig`, ruta proxy de importación, `API_INTERNAL_URL` en `.env.example` (archivo de Dev 1, con visto bueno del usuario).
- **Decisión abierta:** formularios nativos con Server Actions en lugar de React Hook Form/TanStack (se aparta de `docs/01_ARQUITECTURA`).
- Nada de Dev 2 va al equipo sin acuerdo con su dueño.

## Expediente

[.claude/tareas/20261028-dev2-pantallas.md](../tareas/20261028-dev2-pantallas.md)
