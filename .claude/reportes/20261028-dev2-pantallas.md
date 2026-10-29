# Reporte — Dev 2, Fase 5: pantallas de administración (entregas 5a, 5b y 5c)

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

---

# Entrega 5b: pantallas de usuarios (RF-18..20, RF-22..25)

## Pedido (5b)

- **Usuario:** "Seguir con 5b" (tras "Commit y subir" de la 5a, commit `49fa112`).
- **Durante la tarea:** "Inténtalo de nuevo" (dos agentes se cortaron por inactividad) y "revisa si se ejecuto lo ultimo que se estaba realizando, porque parece que se detuvo por la falta de creditos" (el revisor se interrumpió al cerrarse la sesión).
- **Fecha:** 28–29/10/2026 · **Flujo:** completo · **Vueltas de corrección de 5b:** 1/2 · **Rama:** `features/adolfo` · **Commit:** `94363f9` (subido solo a `mio`)

## Resultado (5b)

- **Lista de usuarios** (`/admin/usuarios`): filtros de rol, estado, grado y sección en la URL, paginación, y búsqueda por nombre o correo que viaja solo en el cuerpo de un POST: **no queda en la URL, el historial ni los registros**.
- **Altas:** estudiante (con sección del año activo), docente y apoderado (con 1 a 10 estudiantes elegidos con un buscador). Tras el alta, la ficha muestra "Cuenta creada", que se anuncia y recibe el foco.
- **Ficha** (`/admin/usuarios/[id]`): editar nombre y correo (el rol no se edita, D-012), cambiar estado (avisa que Retirado cierra las matrículas), historial de matrículas, matricular, trasladar (solo a secciones activas del mismo año y grado), ver apoderados o estudiantes con los revocados, vincular y revocar. Todos los motivos llevan el aviso de no escribir datos de menores.
- **Piezas comunes** de 5a movidas a `app/(app)/admin/_shared/` sin cambiar su conducta.
- **Arreglos que venían de la 5a:** el aviso verde se puede cerrar y se pausa con el puntero o el foco; "Cerrar año" lee su aviso; los errores ya no se leen dos veces.
- **Tests:** 168 de la web (antes 79) y los 314 de la API.

## Agentes que participaron (5b)

| #   | Agente                   | Modelo | Qué hizo                                                                                                  | Estado          |
| --- | ------------------------ | ------ | --------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `dev2-estructura`        | Opus   | Pantallas de usuarios, `_shared`, arreglos de 5a; acciones probadas con la API real                       | LISTO           |
| 2   | `qa-tester`              | Sonnet | 159 tests; humo con ADMIN, docente y sin sesión; logs limpios                                             | LISTO           |
| 3   | `seguridad-cumplimiento` | Sonnet | Sin CRÍTICO ni ALTO; `q` solo por POST aceptado; minimización de datos de menores (se cortó y se reanudó) | APROBADO        |
| 4   | `ux-accesibilidad`       | Sonnet | 1 ALTO ("Cuenta creada" no se anunciaba) y 3 MEDIO (se cortó y se reanudó)                                | CAMBIOS_PEDIDOS |
| 5   | `dev2-estructura`        | Opus   | Corrección 1/2: CreatedNotice, reinicio de la búsqueda, errores del buscador de estudiantes               | LISTO           |
| 6   | `ux-accesibilidad`       | Sonnet | Verificación de la corrección                                                                             | APROBADO        |
| 7   | `qa-tester`              | Sonnet | Repetición: 168 tests; humo del alta y la búsqueda                                                        | LISTO           |
| 8   | `revisor-pr`             | Sonnet | Revisión final (se interrumpió y se reanudó)                                                              | APROBADO        |

## Prompts usados (5b)

### 1. dev2-estructura (entrega 5b)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md. Léelo completo: INFORME 1 (plan del arquitecto, sobre todo Decisión 2 → 5b), los INFORMES 2–9 de la entrega 5a y la sección "Entrega 5b" al final. La 5a ya está en el commit 49fa112.

Encargo: implementa la entrega 5b de la Fase 5 (pantallas de usuarios, RF-18, RF-19, RF-20, RF-22, RF-23, RF-24, RF-25; RN-13; RNF-24..27) sobre la API de F3 (contratos en docs/03_CONTRATOS.md; código en apps/api/src/modules/users/):
- /admin/usuarios: lista con GET /users, filtros role, status y, solo con STUDENT, gradeLevel/sectionId; paginación; botones a altas e importar (el enlace de importar puede llevar a una página aún no hecha, 5c). Sustituye el PlaceholderPage. Búsqueda `q`: según la decisión de seguridad (INFORME 4, Decisión 3), que el texto buscado no quede en la URL ni en logs: búsqueda por Server Action POST con resultados en el cliente, o alternativa equivalente que justifiques.
- /admin/usuarios/nuevo/estudiante (POST /students, secciones activas del año activo), /nuevo/docente (POST /teachers), /nuevo/apoderado (POST /guardians con 1..10 estudiantes elegidos con un buscador por Server Action).
- /admin/usuarios/[id]: editar nombre/correo (PATCH /users/:id; el rol no se edita, D-012); cambiar estado (PUT /users/:id/status, motivo con aviso; avisar que WITHDRAWN cierra matrículas); si es STUDENT: historial de matrículas, matricular si no tiene vigente, trasladar (solo secciones activas del mismo año y grado distintas a la actual, motivo con aviso), apoderados con includeRevoked y revocar (motivo 10..500 con aviso); si es GUARDIAN: estudiantes vinculados, vincular y revocar.

Reutiliza lo de 5a: apps/web/lib/api/ (server.ts, errors.ts, request-guards.ts), components/ui, y los patrones de app/(app)/admin/estructura/_components y _lib (ActionFeedback, ConfirmAction/InlineAction con focusId, PAGE_TITLE_ID, FOCUS_HEADING, pickFocusTarget, useFormRefs, REASON_NOTICE, isUuid, isStrictBoolean). Si necesitas compartirlos entre estructura y usuarios, muévelos a una carpeta común dentro de app/(app)/admin/ (p. ej. app/(app)/admin/_shared/) en lugar de duplicarlos, ajustando los imports de 5a sin cambiar su conducta.

Arreglos arrastrados de 5a (INFORME 7):
- [MEDIO] action-feedback.tsx: la caja visible de 10 s debe poder cerrarse (botón "Cerrar" de 44 px con nombre accesible) y no tapar contenido a 360 px.
- [BAJO] year-panels.tsx:63: aria-describedby del aviso de períodos abiertos en el botón "Cerrar año".
- [BAJO] form-bits.tsx:70-77: evitar la doble lectura del error (role="alert" + foco por código): elige uno y justifícalo.

Mismas reglas que en 5a: Next 16.4.2 con cacheComponents (lo dinámico en Suspense), lee apps/web/AGENTS.md y las guías de node_modules/next/dist/docs/ que necesites; 360 px y WCAG 2.1 AA; ningún dato personal en logs; la web no decide permisos ni usa dev-role. No toques lib/nav.ts, lib/routes.ts, layouts, next.config.ts, packages/ui, apps/api/src, package.json ni el lockfile. No hagas commit.

Tests Vitest de la lógica pura nueva (armado de filtros de usuarios, secciones válidas para traslado, límites de motivos, selección de 1..10 estudiantes, etc.).

Verificación: pnpm --filter web lint, test y build; prettier --check sobre lo tocado. Con Docker healthy: dev-session (pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed/dev-session.ts), API :4000, web con next start :3000; prueba con curl las páginas y con el protocolo de Server Actions las acciones principales (alta de los 3 roles, cambio de estado, matrícula, traslado, vínculo y revocación), con éxito y con errores 400/409/422/403. Deja la BD con pnpm db:seed y los servidores detenidos. No leas .env. Error 45028 de MySQL: calentar con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'.

Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md.
```

### 2. qa-tester (5b)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee la sección "Entrega 5b" y el INFORME 10 de dev2-estructura; para contexto, el INFORME 1).

Encargo: pruebas de la entrega 5b de la Fase 5 (pantallas de usuarios, RF-18..20, 22..25; RN-13; RNF-24..27) según docs/09_QA_BASE.md. Solo archivos de test.
1. Amplía apps/web/app/(app)/admin/usuarios/_lib/users.test.ts con casos límite de parseUserFilters (q en la URL ignorado, grado/sección sin rol STUDENT, página no numérica o negativa), buildUserListQuery, listHref, normalizeSearch (1/2/100/101 caracteres tras trim, comodines), normalizeFullName, normalizeEmail, transferTargets (otro año, otro grado, inactiva, la actual), studentPlan (retirado, con matrícula vigente), addToSelection (tope 10, tope 1 al vincular, repetidos, retirados) y parseStudentIds (manipulados, no UUID, duplicados, más de 10). Si las piezas movidas a app/(app)/admin/_shared/lib/ necesitan tests propios, añádelos ahí; comprueba que los tests de 5a siguen pasando.
2. Ejecuta pnpm --filter web test, lint y build, y pnpm --filter api test.
3. Si Docker está healthy: humo con la API real (dev-session con --tsconfig apps/api/tsconfig.json, API :4000, web con next start :3000): curl a /admin/usuarios (con filtros), una ficha de estudiante, una de apoderado, /nuevo/{estudiante,docente,apoderado} y un id no UUID; 401 sin cookie y 403 con docente; un solo <main>, un h1#titulo-pagina, región role="status"; comprueba que el texto buscado no aparece en la URL ni en los logs. Puedes reutilizar el script de Server Actions del dev en C:\Users\Laptop\AppData\Local\Temp\claude\C--Proyectos-AV-MATER-CHIRSTI\d111556e-64dd-44a4-b5f2-177ecf4c5a23\scratchpad\act.mjs (MSYS_NO_PATHCONV=1 en Git Bash) para una búsqueda y un alta. Deja la BD con pnpm db:seed (si creas usuarios, anota cómo los limpiaste) y los servidores detenidos. No leas .env.

Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md (LISTO o CAMBIOS_PEDIDOS con Para:).
```

### 3. seguridad-cumplimiento (5b)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee el INFORME 4, tu revisión de 5a, la sección "Entrega 5b" y los INFORMES 10 y 11).

Encargo: auditoría de seguridad de la entrega 5b de la Fase 5 (pantallas de usuarios, RF-18..20, 22..25; RN-13; RNF-02, RNF-09..13; D-012; D-037 propuesta). Revisa OWASP, permisos, Ley 29733 y protección de menores en:
- apps/web/app/(app)/admin/usuarios/_lib/actions.ts y data.ts: validación en servidor de cada Server Action (UUID, estados, studentIds 1..10 y sin repetidos, motivos, correo y nombre con protección contra fórmulas), que la autorización siga en la API, que no se registren nombres, correos, motivos ni el texto buscado, y que el rol no se pueda editar (D-012).
- La decisión sobre `q` (solo en el cuerpo del POST, nunca en la URL ni en logs) y el hallazgo de QA de que `?q=` escrito a mano vuelve en el payload RSC.
- Exposición de datos de menores: qué campos llegan al cliente en la lista, la ficha, el buscador de estudiantes y el selector de apoderados (minimización); que los apoderados revocados y las matrículas cerradas no filtren más de lo necesario.
- El traslado, el cambio de estado (WITHDRAWN cierra matrículas) y la revocación: que el motivo lleve REASON_NOTICE y no se registre fuera de la API.
- El movimiento de piezas a app/(app)/admin/_shared/: que no cambió la conducta de seguridad de 5a.
- Hallazgo de QA: `setDevRole` (apps/web/components/layout/actions.ts, de Dev 1) aparece en el manifiesto de Server Actions. Confirma si en producción es inofensivo (retorna sin hacer nada) o si hay riesgo.
- Que la limpieza de datos de prueba que hicieron los agentes (borrado por id en la BD local) no está en ningún código entregado.

Solo lectura. Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md con severidad, APROBADO o CAMBIOS_PEDIDOS y Para:.
```

Reanudación tras cortarse por inactividad (SendMessage):

```
Tu ejecución se cortó por inactividad. Retoma la auditoría de seguridad de la entrega 5b desde donde ibas (mismo encargo) y devuelve el INFORME completo con el formato de .claude/PROTOCOLO_AGENTES.md. Si ya revisaste lo esencial, prioriza entregar el INFORME.
```

### 4. ux-accesibilidad (5b)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee tus INFORMES 5 y 7 de 5a, la sección "Entrega 5b" y los INFORMES 10 y 11).

Encargo: revisión de interfaz de la entrega 5b de la Fase 5 (pantallas de usuarios en apps/web/app/(app)/admin/usuarios/ y piezas comunes en apps/web/app/(app)/admin/_shared/; RF-18..20, 22..25; RNF-24..27). Revisa:
- Coherencia con shadcn/ui y con los patrones de 5a; diseño desde 360 px (lista de usuarios como tarjetas bajo sm, filtros, paginación, ficha con varias secciones, formularios de alta).
- WCAG 2.1 AA: labels, aria-invalid/aria-describedby, foco en el primer error, foco tras éxito a `<sectionId>-titulo` y `vinculo-<id>`, redirección tras alta con la nota "Cuenta creada" (¿se anuncia y dónde cae el foco?), región de estado, objetivos de 44 px, contraste.
- El buscador de estudiantes dentro del formulario del apoderado (student-picker.tsx): Enter busca sin enviar, cómo se anuncian los resultados y la selección, tope de 10, quitar elegidos con teclado.
- La búsqueda de usuarios por Server Action (user-search.tsx) que reemplaza la lista: anuncio de resultados, estado de carga, cómo volver a la lista.
- Los arreglos arrastrados de 5a: caja de aviso con botón "Cerrar aviso" (action-feedback.tsx), aria-describedby en "Cerrar año" (year-panels.tsx) y FormMessage sin role="alert" con foco y role="group" (form-bits.tsx).
- Textos en español claros, aviso de motivos con contador y el aviso de que Retirado cierra las matrículas.

Solo lectura. Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, distinguiendo lo que bloquea de lo que puede quedar pendiente.
```

Reanudación tras cortarse por inactividad (SendMessage):

```
Tu ejecución se cortó por inactividad. Retoma la revisión de interfaz y accesibilidad de la entrega 5b desde donde ibas (mismo encargo) y devuelve el INFORME completo con el formato de .claude/PROTOCOLO_AGENTES.md. Si ya revisaste lo esencial, prioriza entregar el INFORME.
```

### 5. dev2-estructura (corrección 1/2 de 5b, por SendMessage al mismo agente)

```
Vuelta de corrección 1/2 de la entrega 5b. Lee en .claude/tareas/20261028-dev2-pantallas.md los INFORMES 11 (QA), 12 (seguridad, APROBADO), 13 (ux-accesibilidad, CAMBIOS_PEDIDOS) y la Decisión del orquestador 5.

Corrige:
1. [ALTO] usuarios/[id]/page.tsx:116-126 — "Cuenta creada": componente cliente (p. ej. CreatedNotice) que al montarse anuncie con useAnnounce, nota visible con id="cuenta-creada" y tabIndex=-1 que reciba el foco, y quitar ?alta=1 de la URL con router.replace sin perder el anuncio.
2. [MEDIO] user-search.tsx + user-filters.tsx — reiniciar la búsqueda al aplicar filtros (key en UserSearch con la cadena de filtros) o avisar que sigue activa; elige y justifica.
3. [MEDIO] student-picker.tsx:79-81,138-142 — anunciar el error del tope de 10 y dejar el foco en el buscador o el botón; opcional deshabilitar "Agregar" con explicación.
4. [MEDIO] student-picker.tsx:98-102 + form-bits.tsx:27-31 — el error de grupo "Elige al menos un estudiante" con aria-invalid (y tabIndex=-1 en el fieldset o foco al buscador) para que useFocusOnError lo alcance y se anuncie.
5. BAJO de UX baratos: mensaje "Escribe al menos 2 caracteres" con el campo vacío (user-search.tsx:98-104), anunciar "Volviste a la lista de usuarios" al limpiar (54-69), y en la pista del rol decir que Estudiante muestra grado y sección (user-filters.tsx). Comprueba también que el diálogo de estado muestre el aviso de que Retirado cierra las matrículas.

No toques lib/session.ts (es de Dev 1), nav, routes, layouts, next.config.ts, packages/ui, apps/api/src, package.json ni el lockfile. No hagas commit. Añade tests puros si extraes lógica.

Verificación: pnpm --filter web lint, test y build; prettier --check sobre lo tocado. Con Docker healthy, humo rápido: el alta redirige a la ficha y la nota está en el HTML con su id; filtros + búsqueda. Si creas usuarios de prueba, límpialos como antes y deja la BD con pnpm db:seed y los servidores detenidos. Devuelve el INFORME del protocolo indicando qué hallazgo resolvió cada cambio (archivo:línea).
```

### 6. qa-tester (repetición 5b)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee los INFORMES 13 y 14: corrección 1/2 de la entrega 5b).

Encargo: repite QA de la entrega 5b tras la corrección, acotado a lo cambiado (RF-18, 19, 22, 23, 25; RNF-24..27). Solo archivos de test.
1. Amplía apps/web/app/(app)/admin/usuarios/_lib/users.test.ts para los helpers nuevos: searchRequest (q vacío, solo espacios, intent=limpiar, 1/2/100/101 caracteres), searchResetKey (cambia con rol, grado, sección y estado; no con grado sin rol Estudiante; no con la página si así está diseñado — documenta lo que encuentres), createdDetail/createdNoticeText y withoutCreatedFlag (URL con otros parámetros, con alta=1 repetido, sin alta, con hash).
2. Ejecuta pnpm --filter web test, lint y build, y pnpm --filter api test.
3. Si Docker está healthy: humo con la API real (dev-session con --tsconfig apps/api/tsconfig.json, API :4000, web next start :3000) del alta de un estudiante (redirige con ?alta=1 y el HTML trae id="cuenta-creada" con tabindex="-1"), de la búsqueda (vacía → error de campo; intent=limpiar → estado inicial) y de /admin/usuarios?role=STUDENT&gradeLevel=3. Puedes usar el script act.mjs del scratchpad (C:\Users\Laptop\AppData\Local\Temp\claude\C--Proyectos-AV-MATER-CHIRSTI\d111556e-64dd-44a4-b5f2-177ecf4c5a23\scratchpad\act.mjs, MSYS_NO_PATHCONV=1). Limpia el usuario de prueba como en INFORMES anteriores, deja la BD con pnpm db:seed y los servidores detenidos. No leas .env.

Devuelve el INFORME del protocolo (LISTO o CAMBIOS_PEDIDOS con Para:).
```

### 7. ux-accesibilidad (verificación de la corrección 5b)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee tu INFORME 13 y el INFORME 14 de dev2-estructura, corrección 1/2 de la entrega 5b).

Encargo: verifica en el código, acotado a apps/web/app/(app)/admin/usuarios/[id]/page.tsx, _components/created-notice.tsx, _components/user-search.tsx, _components/user-filters.tsx, _components/student-picker.tsx, page.tsx y _lib/users.ts, que se resolvieron tu ALTO, tus 3 MEDIO y los BAJO elegidos, según tus Decisiones 1 y 2. Revisa en especial: que CreatedNotice anuncie una sola vez y reciba el foco (y opina sobre la posible doble lectura anuncio + foco que señala el dev), el uso de history.replaceState en vez de router.replace, el reinicio de la búsqueda con key al cambiar filtros, el aria-invalid del error de grupo puesto en el campo de búsqueda (en lugar del fieldset) y el anuncio y foco del error de tope. Busca regresiones.

Solo lectura y sé breve: si en 10 minutos no puedes cubrirlo todo, entrega el INFORME con lo revisado. Formato de .claude/PROTOCOLO_AGENTES.md: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, distinguiendo lo que bloquea (es la vuelta 1 de 2 de 5b).
```

### 8. revisor-pr (5b)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee la sección "Entrega 5b": INFORMES 10–16 y Decisiones del orquestador 5 y 6; para el alcance permitido, la Decisión 1).

Encargo: revisión final de la entrega 5b de la Fase 5 de Dev 2 (pantallas de usuarios, RF-18..20, 22..25; RN-13; RNF-24..27; D-012) antes de darla por terminada. La 5a ya está en el commit 49fa112; revisa solo lo que hay sin commit desde entonces. Comprueba:
1. Definición de terminado (docs/06_GIT_CALIDAD.md).
2. Alcance: solo apps/web/app/(app)/admin/usuarios/, apps/web/app/(app)/admin/_shared/ (nueva carpeta común), los cambios de imports y re-exports en apps/web/app/(app)/admin/estructura/ (más aria-describedby en year-panels.tsx) y los renombres con git mv desde estructura/_components a _shared/components. Nada en nav, routes, layouts, next.config.ts, packages/ui, lib/session.ts, apps/api/src, package.json ni el lockfile. .agents/ y skills-lock.json no deben entrar. Si apps/web/AGENTS.md o next-env.d.ts cambiaron, indícalo.
3. Que mover piezas a _shared no cambió la conducta de 5a (tests de estructura siguen pasando).
4. Que pasan: pnpm --filter web lint, test y build; pnpm --filter api lint y test; prettier --check sobre todos los archivos tocados (incluido el expediente).

No modifiques archivos. Devuelve el INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, y la lista exacta de archivos para el commit (además del reporte, que lo crea el orquestador).
```

Reanudación tras la interrupción de la sesión (SendMessage):

```
Tu ejecución se interrumpió antes de terminar (se cerró la sesión anterior). Retoma la revisión final de la entrega 5b con el mismo encargo, vuelve a correr los comandos que no alcanzaste a completar, y devuelve el INFORME completo del protocolo (APROBADO o CAMBIOS_PEDIDOS, y la lista exacta de archivos para el commit).
```

## Decisiones del orquestador (5b)

1. **Sin nuevo plan del arquitecto:** el INFORME 1 ya cubría la 5b; se pasó directo al dev con los pendientes que venían de la 5a.
2. **Agentes cortados:** seguridad y UX se cortaron por inactividad (600 s) y el revisor por el cierre de la sesión. En los tres casos se reanudó al mismo agente con SendMessage, sin relanzar desde cero.
3. **Vuelta 1/2 de 5b** por el ALTO de UX; se sumaron los BAJO baratos para no abrir otra vuelta. El BAJO de seguridad sobre `getCurrentRole` (`lib/session.ts`) es de Dev 1 y no se tocó.
4. **No repetir seguridad tras la corrección:** no tocó permisos ni la API.
5. **Reinicio de la búsqueda al cambiar de página** de la lista (hallazgo de diseño de QA): aceptado, porque con una búsqueda activa la lista no se muestra.
6. **Limpieza de datos de prueba:** dev y QA borraron por id, solo en la BD local, los usuarios de prueba que crearon y volvieron a correr el seed. La bitácora no se tocó y conserva esas altas. No queda en ningún código entregado (lo comprobó seguridad).

## Archivos (5b)

Todos bajo `apps/web/app/(app)/admin/`:

- **Movidos a `_shared/components/`** (desde `estructura/_components/`): `action-feedback.tsx`, `confirm-action.tsx`, `form-bits.tsx`, `page-bits.tsx`, `styles.ts`
- **Nuevos en `_shared/lib/`:** `action-state.ts`, `focus.ts`, `format.ts`, `shared.test.ts`, `validation.ts`
- **Modificados en `estructura/`** (imports y re-exports): `_components/{course-panels,course-section-panels,new-year-form,section-panels,year-panels}.tsx`, `_lib/{focus,format,types,validation}.ts` y las 5 páginas
- **Usuarios:** `usuarios/page.tsx` (modificado); nuevos `usuarios/[id]/page.tsx`, `usuarios/nuevo/{estudiante,docente,apoderado}/page.tsx`, `usuarios/_components/{created-notice,new-user-forms,student-picker,user-filters,user-list,user-panels,user-search}.tsx`, `usuarios/_lib/{actions,data,types,users,users.test}.ts`
- Expediente y este reporte. **No se incluyen:** `.agents/`, `skills-lock.json`.

## Verificación (5b)

| Comando                                       | Resultado                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm --filter web lint`                      | ok (aviso informativo de jsx-ast-utils)                                                     |
| `pnpm --filter web test`                      | ok, 7 archivos, **168 tests**                                                               |
| `pnpm --filter web build`                     | ok (Partial Prerender)                                                                      |
| `pnpm --filter api lint` / `test`             | ok, 28 archivos, 314 tests                                                                  |
| `prettier --check` (42 archivos + expediente) | ok                                                                                          |
| Docker + API real                             | altas de los 3 roles, estado, matrícula, traslado, vínculo y revocación con éxito y errores |
| Logs                                          | sin nombres, correos, texto buscado ni token                                                |
| BD                                            | `pnpm db:seed` al final: 68 usuarios, 62 matrículas                                         |

## Pendientes (5b)

- **Entrega 5c** (importación) y documentador al final de la 5c. Luego la F6.
- **Prueba manual:** NVDA/VoiceOver (posible doble lectura de "Cuenta creada"), 360 y 640–768 px, modo oscuro. Playwright + axe.
- **Para David (Dev 1):** límite de peticiones por IP detrás de la web (MEDIO); `getCurrentRole` devuelve admin sin cookie (BAJO).
- **docs/03 o la API:** `POST /guardians` con un estudiante que no existe responde 404 y el contrato dice 422.

---

# Entrega 5c: importación masiva (RF-21) y documentación de la Fase 5

## Pedido (5c)

- **Usuario:** "Seguir con 5c" (tras "Commit y subir" de la 5b, commit `94363f9`).
- **Durante la tarea:** "cual me recomiendas, apar WSL o usar la otra opcion, ademas quiero saber que es lo que se esta realizando en 5C" y luego "VA, utiliza 127.0.0.1, ademas quiero que seas mas eficiente con los agentes, tambien indicame cuanto te falta para completar las actividades del dev 2".
- **Fecha:** 29/10/2026 · **Flujo:** completo · **Vueltas de corrección de 5c:** 0/2 · **Rama:** `features/adolfo` · **Commit:** `feat(web): RF-21 pantalla de importacion masiva …` (subido solo a `mio`)

## Resultado (5c)

- **Pantalla `/admin/usuarios/importar`:** elegir tipo (estudiantes, docentes, apoderados), descargar la plantilla en Excel o CSV, subir y validar (vista previa con errores por fila y columna, **sin mostrar el contenido de las celdas**), y confirmar con el mismo archivo. Avisa que el archivo no se guarda. Se anuncia cada paso y el foco acompaña al usuario.
- **Ruta puente** `usuarios/importar/archivo/[accion]` en el servidor de la web: exige que la petición venga de la propia web, corta en 1 MiB (por la cabecera y contando los bytes), solo deja pasar `multipart/form-data`, reenvía solo la cookie de sesión y no registra el archivo ni su nombre.
- **Probado con la API real:** las 6 plantillas, vista previa válida y con errores, confirmación (201), archivo distinto (409), repetido (422), demasiado grande (413) y docente (403).
- **Documentación de toda la F5:** D-037 en `docs/08`, ruta puente y discrepancia de `/guardians` en `docs/03`, trazabilidad en `docs/10` y sección de pantallas en el manual técnico.
- **Tests:** 224 de la web (antes 168) y los 314 de la API.

## Agentes que participaron (5c)

| #   | Agente                   | Modelo | Qué hizo                                                                      | Estado    |
| --- | ------------------------ | ------ | ----------------------------------------------------------------------------- | --------- |
| 1   | `dev2-estructura`        | Opus   | Ruta puente, pantalla, máquina de estados y 40 tests; pruebas sin sesión      | BLOQUEADO |
| —   | orquestador              | Opus   | Desbloqueo con `NODE_OPTIONS=--dns-result-order=ipv4first` (sin tocar `.env`) | —         |
| 2   | `qa-tester`              | Sonnet | 15 casos nuevos y todas las pruebas con sesión pendientes                     | LISTO     |
| 3   | `seguridad-cumplimiento` | Sonnet | En paralelo: sin CRÍTICO ni ALTO; aprueba D-037                               | APROBADO  |
| 4   | `ux-accesibilidad`       | Sonnet | En paralelo: sin CRÍTICO ni ALTO; 3 MEDIO                                     | APROBADO  |
| 5   | `dev2-estructura`        | Opus   | Ajustes cortos de UX (anuncios y foco), reanudado con su contexto             | LISTO     |
| 6   | `documentador`           | Sonnet | En paralelo con el ajuste: D-037, docs/03, docs/10 y manual técnico           | LISTO     |
| 7   | `revisor-pr`             | Sonnet | Revisión final de 5c y de la documentación                                    | APROBADO  |

## Prompts usados (5c)

### 1. dev2-estructura (entrega 5c)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md. Lee el INFORME 1 (Decisiones 1, 2 y 4 sobre la importación), los INFORMES 4 y 12 (seguridad), la sección "Entrega 5c" al final y, de forma rápida, lo que se hizo en 5a y 5b (commits 49fa112 y 94363f9). El contrato de la importación está en docs/03_CONTRATOS.md y el código de la API en apps/api/src/modules/users/import/ (F4: plantilla GET, preview POST y commit POST multipart; tope de 1 MiB; 10 intentos por minuto; ImportReport con totales, summary, errores por fila/columna/código/mensaje, errorsTruncated, canConfirm y sha256; commit todo o nada que exige el mismo sha256).

Encargo: implementa la entrega 5c de la Fase 5 (pantalla de importación masiva, RF-21; RNF-09..13, RNF-24..27):
1. Route Handler app/(app)/admin/usuarios/importar/archivo/[accion]/route.ts con accion ∈ {plantilla (GET), preview (POST), commit (POST)}; cualquier otra → 404. Comprueba que Origin sea el mismo host (los Route Handlers no tienen la protección de las Server Actions); rechaza con 413 local un Content-Length ausente o mayor que 1 MiB + 64 KiB; reenvía el cuerpo como stream (duplex: 'half') con su Content-Type, solo la cookie aula_sid validada y sin seguir redirecciones; en la plantilla, lista blanca de type y format y copia Content-Disposition con Cache-Control: no-store; devuelve status y JSON de la API sin registrar el cuerpo ni el nombre del archivo. Pon la lógica pura (Origin, tamaño, lista blanca, acción) en un módulo sin server-only para poder probarla; reutiliza lib/api/request-guards.ts.
2. Pantalla /admin/usuarios/importar (componente de cliente dentro de una página con PageShell y PageHeader de _shared): elegir tipo (estudiantes, docentes, apoderados), descargar la plantilla xlsx o csv, elegir archivo (accept=".xlsx,.csv", rechazo en el cliente si pasa de 1 MiB), "Validar" (preview) y mostrar el reporte: totales, summary, tabla de errores solo con fila, columna y mensaje (tarjetas bajo sm), aviso si errorsTruncated. "Confirmar importación" solo con canConfirm, reenviando el mismo File y el sha256; un 409 por SHA distinto vuelve a la vista previa; un 422 muestra details en la misma tabla; tras éxito anuncia el resultado con useAnnounce y deja el foco en un encabezado. Si el usuario cambia el archivo o el tipo, se descarta el reporte. Aviso visible: "El archivo no se guarda; los motivos no muestran datos de las celdas". El cliente nunca lee ni muestra el contenido del archivo. Mensajes de error por status con toUserMessage (413 → "El archivo supera 1 MiB", 429 → "Demasiados intentos; espera un minuto").
3. Pon la máquina de estados (idle → validando → reporte → confirmable → confirmando → hecho; 409 vuelve a reporte; archivo > 1 MiB rechazado) en lógica pura con tests.
4. El enlace "Importar desde Excel" de /admin/usuarios ya apunta a /admin/usuarios/importar.

Mismas reglas que en 5a y 5b: Next 16.4.2 con cacheComponents (lee apps/web/AGENTS.md y las guías de node_modules/next/dist/docs/ sobre route handlers y request bodies), 360 px y WCAG 2.1 AA, patrones de app/(app)/admin/_shared, ningún dato personal en logs, la web no decide permisos. No toques lib/nav.ts, lib/routes.ts, lib/session.ts, layouts, next.config.ts, packages/ui, apps/api/src, package.json ni el lockfile. No hagas commit.

Verificación: pnpm --filter web lint, test y build; prettier --check sobre lo tocado. Con Docker healthy: dev-session (pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed/dev-session.ts), API :4000, web next start :3000; prueba con curl el Route Handler: plantilla de los 3 tipos en xlsx y csv; preview de un CSV válido y de uno con errores; commit con el mismo sha256 y con otro (409); Origin ajeno (403); sin Content-Length o mayor que el tope (413); acción desconocida (404); sin cookie (401) y con docente (403). Si el commit crea usuarios de prueba, usa correos con un sufijo propio (p. ej. *.5c@colegio.example), límpialos por id en la BD local como en 5b, deja la BD con pnpm db:seed y los servidores detenidos. Usa archivos de prueba en el scratchpad (C:\Users\Laptop\AppData\Local\Temp\claude\C--Proyectos-AV-MATER-CHIRSTI\d111556e-64dd-44a4-b5f2-177ecf4c5a23\scratchpad\). No leas .env.

Devuelve el INFORME con el formato de .claude/PROTOCOLO_AGENTES.md.
```

### 2. qa-tester (5c, con sesión)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee la sección "Entrega 5c": INFORME 18 y Decisiones del orquestador 7 y 8).

Encargo: QA de la entrega 5c (importación masiva, RF-21; RNF-09..13, 24..27). Solo archivos de test. Sé eficiente: no repitas lo que el dev ya probó sin sesión.
1. Revisa y amplía donde falten casos límite: apps/web/app/(app)/admin/usuarios/importar/_lib/import-guards.test.ts e import-machine.test.ts.
2. pnpm --filter web test, lint y build; pnpm --filter api test.
3. Pruebas con sesión pendientes del INFORME 18 (es lo principal). En esta máquina `localhost` IPv6 lo intercepta WSL: antepon NODE_OPTIONS=--dns-result-order=ipv4first a todos los comandos de Node (seed, dev-session, API, web) y antes calienta MySQL con: docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'. Sesión: pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed/dev-session.ts (y --email docente01@colegio.example para el docente). API con node apps/api/dist/main (tras pnpm --filter api build) en :4000 y web con next start en :3000. Con curl contra http://localhost:3000/admin/usuarios/importar/archivo/<accion> (con Origin: http://localhost:3000 en los POST):
   - plantilla de students, teachers y guardians en xlsx y csv: status, Content-Type y Content-Disposition;
   - preview de un CSV válido (200, canConfirm true, sha256) y de uno con errores (200, errores con fila/columna/mensaje y sin contenido de celdas);
   - commit con el mismo sha256 (201) y con otro sha256 (409);
   - preview con sesión de docente01 (403).
   Usa correos *.5c@colegio.example; hay archivos de prueba en el scratchpad C:\Users\Laptop\AppData\Local\Temp\claude\C--Proyectos-AV-MATER-CHIRSTI\d111556e-64dd-44a4-b5f2-177ecf4c5a23\scratchpad\ (ok.csv, big.csv). Al terminar borra por id los usuarios *.5c creados (como en 5b), corre pnpm db:seed (con el mismo NODE_OPTIONS) y deja detenidos los servidores. Comprueba que los logs no tengan el nombre del archivo ni correos. No leas .env.

Devuelve el INFORME del protocolo (LISTO o CAMBIOS_PEDIDOS con Para: dev2-estructura y archivo:línea).
```

### 3. seguridad-cumplimiento (5c)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee el INFORME 1, Decisión 1 sobre la importación, tu INFORME 12 y el INFORME 18 de la entrega 5c).

Encargo acotado y breve: auditoría de seguridad de la entrega 5c (importación masiva, RF-21; RNF-09..13; D-037 propuesta), solo sobre apps/web/app/(app)/admin/usuarios/importar/ (archivo/[accion]/route.ts, _lib/import-guards.ts, _lib/import-machine.ts, _components/import-screen.tsx, page.tsx). Revisa: CSRF del Route Handler (Origin y Sec-Fetch-Site en POST; GET de plantilla sin Origin), tope de tamaño (Content-Length y conteo del stream), lista blanca de Content-Type, type/format y Content-Disposition, que solo reenvía aula_sid validada, redirect manual y timeouts, que no registra el cuerpo, el nombre del archivo ni correos, que la respuesta lleva no-store y nosniff, que el cliente no lee ni muestra el contenido del archivo y que el reporte de errores no expone datos de celdas. No hace falta revisar la API (F4 ya auditada).

Solo lectura. Si en 10 minutos no lo cubres todo, entrega con lo revisado. INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 4. ux-accesibilidad (5c)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee el INFORME 18, Decisiones 6 y 7, y tus decisiones de 5a/5b en los INFORMES 5, 7, 13 y 15).

Encargo acotado y breve: revisión de interfaz de la entrega 5c (importación masiva, RF-21; RNF-24..27), solo sobre apps/web/app/(app)/admin/usuarios/importar/page.tsx y _components/import-screen.tsx. Revisa: 360 px (tabla de errores como tarjetas bajo sm), labels del tipo y del archivo, aria-describedby de pistas y errores, rechazo en cliente de archivos > 1 MiB o de otra extensión (¿se anuncia y lleva el foco?), estados de carga (Validando…, Importando…, aria-busy), foco y anuncio tras validar, tras error y tras importar, el botón Confirmar desactivado sin canConfirm (¿se explica por qué?), aviso de errorsTruncated, aviso de privacidad visible, descarga de la plantilla con errores 401/403 como mensaje, coherencia con los patrones de _shared y textos en español claros.

Solo lectura. Si en 10 minutos no lo cubres todo, entrega con lo revisado. INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, separando lo que bloquea.
```

### 5. dev2-estructura (ajustes cortos de UX, por SendMessage al mismo agente)

```
El bloqueo de entorno se resolvió y QA (INFORME 21), seguridad (INFORME 20) y UX (INFORME 19) aprobaron la 5c. Lee en .claude/tareas/20261028-dev2-pantallas.md el INFORME 19 y la Decisión del orquestador 9.

Encargo corto, solo en apps/web/app/(app)/admin/usuarios/importar/_components/import-screen.tsx (y su lógica pura si hace falta):
1. 292-303: anunciar con announce el error de archivo rechazado en cliente (> 1 MiB o extensión).
2. 400 y 214-219: tras "Importar otro archivo", llevar el foco al h2 "1. Elige el tipo y el archivo" (o al campo de tipo).
3. 311-314 y 365-368: announce('Validando el archivo…') y announce('Importando…') al empezar cada paso.
4. 236-239 (BAJO): al cambiar el tipo con un reporte presente, anunciar que hay que volver a validar.

No toques nada más. Verificación: pnpm --filter web lint, test y build, y prettier --check sobre lo tocado. No hace falta Docker. Devuelve un INFORME breve del protocolo con archivo:línea de cada cambio.
```

### 6. documentador (Fase 5)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (lee el INFORME 1 y, de forma rápida, los INFORMES de 5a, 5b y 5c; los INFORMES 4, 12 y 20 de seguridad y las Decisiones del orquestador 7 y 8). Reporte de 5a/5b: .claude/reportes/20261028-dev2-pantallas.md.

Encargo: documenta la Fase 5 de Dev 2 (pantallas de administración en apps/web: estructura académica, usuarios e importación; RF-09..14, 17..25; D-037). Solo modifica docs/. Sé conciso y no reescribas secciones ajenas.
1. docs/08_DECISIONES.md: añade D-037 "Cómo llama la web a la API" (BFF: Server Components y Server Actions con cliente server-only que reenvía solo aula_sid, sin 'use cache' con sesión; importación por Route Handler puente con Origin, tope doble, lista blanca y sin registrar el archivo; la web no decide permisos; temporal hasta el cliente y login de Dev 1). Anota también, sin número nuevo si no corresponde, la decisión abierta de usar formularios nativos con Server Actions en lugar de React Hook Form/TanStack.
2. docs/03_CONTRATOS.md: nota breve sobre la ruta puente de la web `/admin/usuarios/importar/archivo/{plantilla|preview|commit}` y la discrepancia anotada: POST /guardians con un studentId inexistente responde 404 y el contrato dice 422 (márcalo como pendiente de decidir, no lo resuelvas).
3. docs/manuales/tecnico.md: cómo levantar las pantallas en local: docker compose, API, web, `pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed/dev-session.ts [--email]` y crear la cookie aula_sid en DevTools; que el script es solo local (rechaza producción, CI y hosts remotos); la variable API_INTERNAL_URL (por defecto http://localhost:4000); la solución si `localhost` IPv6 está ocupado por WSL (`NODE_OPTIONS=--dns-result-order=ipv4first`) y el calentamiento de MySQL por el error 45028; los tests de la web (`pnpm --filter web test`, Vitest).
4. Si existe un manual del administrador en docs/manuales/, añade una sección corta de uso: estructura (años, períodos, secciones, cursos, docentes), usuarios (lista, búsqueda, altas, ficha, estados, matrícula, traslado, apoderados) e importación (plantilla, validar, confirmar; el archivo no se guarda). Si no existe, no lo crees y dilo.
5. docs/10_TRAZABILIDAD.md: marca la interfaz de RF-09..14, 17..25 como hecha en F5 con las rutas.
No toques .env.example (es de Dev 1; menciona API_INTERNAL_URL solo en el manual técnico y deja anotado como pendiente añadirla a .env.example con visto bueno del usuario). Ejecuta prettier --check sobre lo que toques si puedes; si no, dilo. Devuelve el INFORME del protocolo con la lista de archivos.
```

### 7. revisor-pr (5c y documentación)

```
Expediente: .claude/tareas/20261028-dev2-pantallas.md (sección "Entrega 5c": INFORMES 18–23 y Decisiones del orquestador 7–9; para el alcance, la Decisión 1).

Encargo: revisión final de la entrega 5c de la Fase 5 de Dev 2 (importación masiva, RF-21; RNF-09..13, 24..27; D-037) y de la documentación de la Fase 5. Revisa solo lo que hay sin commit desde 94363f9. Sé eficiente: una pasada.
1. Definición de terminado (docs/06_GIT_CALIDAD.md).
2. Alcance: solo apps/web/app/(app)/admin/usuarios/importar/ (page.tsx, _components/import-screen.tsx, _lib/import-guards.ts + test, _lib/import-machine.ts + test, archivo/[accion]/route.ts), docs/08_DECISIONES.md, docs/03_CONTRATOS.md, docs/10_TRAZABILIDAD.md, docs/manuales/tecnico.md y el expediente. Nada en nav, routes, lib/session.ts, lib/api, layouts, next.config.ts, packages/ui, components/ui, apps/api/src, package.json, lockfile ni .env.example. .agents/ y skills-lock.json no entran.
3. Los ajustes cortos de UX del INFORME 22 (import-screen.tsx :170, :194, :221, :232-236, :247-251, :306-313; import-machine.ts :343-360) no rompen la conducta aprobada por seguridad (INFORME 20) ni la máquina de estados.
4. Que la documentación no contradiga el código (D-037, ruta puente, comando de dev-session con --tsconfig, NODE_OPTIONS=--dns-result-order=ipv4first, API_INTERNAL_URL) ni reescriba secciones ajenas.
5. Pasan: pnpm --filter web lint, test y build; pnpm --filter api lint y test; prettier --check sobre los archivos de código tocados y el expediente.

No modifiques archivos. INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, y la lista exacta de archivos para el commit (más el reporte, que crea el orquestador).
```

## Decisiones del orquestador (5c)

1. **Bloqueo de entorno:** el dev quedó BLOQUEADO porque `wslrelay.exe` ocupa `[::1]:3306`, `[::1]:6379` y `[::1]:9000` (comprobado con `netstat`). Se preguntó al usuario; recomendé usar `127.0.0.1` en vez de apagar WSL (apagarlo tumba Docker Desktop y el problema vuelve). El usuario dijo "VA, utiliza 127.0.0.1".
2. **Sin tocar `.env`:** no puedo leerlo ni editarlo, así que apliqué 127.0.0.1 con `NODE_OPTIONS=--dns-result-order=ipv4first`, que hace que Node resuelva `localhost` a IPv4. Comprobado: tras calentar MySQL (error 45028), el script de sesión conecta.
3. **Eficiencia (pedido del usuario):** las pruebas con sesión pendientes no volvieron al dev, las hizo `qa-tester` en su pasada; QA, seguridad y UX corrieron en paralelo con encargos acotados y un tope de 10 minutos; los 3 MEDIO de UX se resolvieron reanudando al mismo dev (con su contexto) sin repetir QA ni UX, y el `documentador` trabajó en paralelo. El revisor final verificó código y documentación en una sola pasada.
4. **Notas de estado en docs:** tras el APROBADO del revisor, el orquestador cambió "pendiente de la revisión final" por "aprobada por `revisor-pr`, INFORME 24" en `docs/10_TRAZABILIDAD.md:56` y `docs/manuales/tecnico.md:164` (solo texto).
5. **No se tocó `.env.example`** (archivo de Dev 1) ni se creó el manual del administrador, que no existe: quedan para decisión del usuario.

## Archivos (5c)

- **Nuevos** en `apps/web/app/(app)/admin/usuarios/importar/`: `page.tsx`, `_components/import-screen.tsx`, `_lib/import-guards.ts`, `_lib/import-guards.test.ts`, `_lib/import-machine.ts`, `_lib/import-machine.test.ts`, `archivo/[accion]/route.ts`
- **Documentación:** `docs/08_DECISIONES.md`, `docs/03_CONTRATOS.md`, `docs/10_TRAZABILIDAD.md`, `docs/manuales/tecnico.md`
- Expediente y este reporte. **No se incluyen:** `.agents/`, `skills-lock.json`.

## Verificación (5c)

| Comando                                          | Resultado                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `pnpm --filter web lint`                         | ok (aviso informativo de jsx-ast-utils)                                 |
| `pnpm --filter web test`                         | ok, 9 archivos, **224 tests**                                           |
| `pnpm --filter web build`                        | ok (importar como Partial Prerender; la ruta puente dinámica)           |
| `pnpm --filter api lint` / `test`                | ok, 28 archivos, 314 tests                                              |
| `prettier --check` (importar/, expediente, docs) | ok                                                                      |
| Docker + API real (con `NODE_OPTIONS`)           | plantillas 200; preview 200; commit 201; 409; 422; 413; 403 con docente |
| Logs                                             | sin nombres de archivo, correos ni contenido de celdas                  |
| BD                                               | usuario de prueba borrado por id y `pnpm db:seed` al final              |

## Pendientes (5c y F5)

- **Fase 6 de Dev 2:** clonar la estructura al año siguiente y promoción en bloque (RF-15, RF-16, RN-15).
- **Prueba manual en navegador** de toda la F5 (360 px, teclado, NVDA/VoiceOver, modo oscuro) y Playwright + axe. Importación con `.xlsx` reales y vista previa con sesión de estudiantes y apoderados.
- **Decisiones del usuario:** crear o no `docs/manuales/administrador.md`; añadir `API_INTERNAL_URL` a `.env.example` (Dev 1); POST `/guardians` con un estudiante que no existe (404 en la API, 422 en el contrato).
- **Para David (Dev 1):** límite de peticiones por IP, `getCurrentRole` sin cookie, fijar `X-Forwarded-Host` en el proxy de despliegue, y reemplazar el script de sesión por el login real.
- BAJO de UX sin tocar: botón de plantilla que pierde el foco al descargar, 44 px del campo de archivo y contraste del anillo de foco.

## Expediente

[.claude/tareas/20261028-dev2-pantallas.md](../tareas/20261028-dev2-pantallas.md)
