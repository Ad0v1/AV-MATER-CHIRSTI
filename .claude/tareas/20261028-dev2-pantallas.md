# Dev 2, Fase 5: pantallas de administración (estructura, usuarios e importación)

Pedido por el usuario: "vamos a la fase 5"
Flujo: completo
Vueltas de corrección: 1/2
Entorno: local con Docker, rama `features/adolfo` en `a43bf19`; se sube solo a `mio`.

## Contexto

- Fases previas de Dev 2 (expedientes en `.claude/tareas/`): F1 esquema y seed (`20261026-dev2-estructura.md`), F2 API académica (`20261026-dev2-api-academica.md`), F3 usuarios, matrículas, traslados y apoderados (`20261026-dev2-usuarios-matriculas.md`), F4 importación masiva (`20261027-dev2-importacion.md`, probada con Excel real).
- Los contratos de la API de F2–F4 están en `docs/03_CONTRATOS.md`; las decisiones D-021..D-036 en `docs/08_DECISIONES.md`.
- Estado de `apps/web` (Next.js 16.4.2, React 19.3, `cacheComponents: true`, shadcn/ui sobre `@base-ui/react`, Tailwind 4): layout con menú lateral por rol (`components/layout/app-sidebar.tsx`, `lib/nav.ts`, `lib/routes.ts`), páginas vacías con `PlaceholderPage`, entre ellas `app/(app)/admin/estructura/page.tsx` y `app/(app)/admin/usuarios/page.tsx`.
- **No hay login real en la web.** `lib/session.ts` simula el rol con la cookie `dev-role` ("TEMPORAL ... nunca usarlo para decidir permisos"). El login, la sesión y el layout son de Dev 1 (David), que está en su rama. La API exige sesión real con sus guards.
- `apps/web/AGENTS.md`: esta versión de Next.js tiene cambios incompatibles; leer `node_modules/next/dist/docs/` antes de escribir código.
- Las Fases de Dev 2 son trabajo de un compañero: quedan en el repo privado y **no van al equipo** sin acuerdo.

## Alcance

F5: interfaz de RF-09..14, 17..25 (estructura académica, usuarios, matrículas, traslados, apoderados, importación con vista previa y aviso de motivos sin datos personales). Fuera: clonación y promoción (F6, RF-15/16), login real (Dev 1).

---

## Informes

### INFORME 1 — arquitecto-integrador

Estado: LISTO
Requisitos: RF-09..14, RF-17..25; RN-10..13; RNF-24..27 (360 px, WCAG 2.1 AA), RNF-02, RNF-09/11. Todo dentro del alcance v1.
Resumen: F5 es solo interfaz sobre la API de F2–F4 (35 endpoints de docs/03); sin cambio de esquema ni de contrato. La API autentica solo con la cookie `aula_sid` (token opaco; Redis `session:<sha256>` → `{id, role}`); no hay endpoint de login (solo `GET /auth/me` y `POST /auth/logout`); los e2e crean sesión con `SessionService.create`. Propuesta: (a) la web llama a la API desde el servidor (BFF) reenviando solo `aula_sid`; (b) script solo-local `prisma/seed/dev-session.ts` que crea una sesión de ADMIN del seed con el `SessionService` de Dev 1 sin modificarlo. Partir en 3 entregas: 5a estructura, 5b usuarios, 5c importación.
Archivos: ninguno (solo lectura)
Comandos: ninguno (lectura de código y de docs de Next 16.4.2 en node_modules)

Hallazgos:

- [MEDIO] apps/api/src/app.module.ts:19-32 — ThrottlerGuard global por `req.ip` sin `trust proxy`: detrás del BFF todos comparten la IP del servidor Next (100/min global, 10/min importación). → Para Dev 1: `trust proxy` + `X-Forwarded-For` o cuota por usuario. No bloquea F5.
- [BAJO] contrato de importación — 413 trae "File too large" (multer) y 429 el código `ERROR`. → La web traduce por status.
- [BAJO] roles.guard.ts:29 y auth.controller.ts:31 — 401/403 sin tildes. → La web usa textos propios para 401, 403, 5xx y red.
- [BAJO] `GET /auth/me` no devuelve status ni nombre. → No se necesita en F5.
- [BAJO] `q` de `GET /users` en la URL deja nombres/correos de menores en historial y logs. → Lo revisa seguridad-cumplimiento; alternativa: Server Action por POST.

Decisiones:

1. Vía de llamada (propuesta D-037): lecturas en Server Components y escrituras en Server Actions con un cliente `server-only` que lee `aula_sid` y llama a `${API_INTERNAL_URL ?? 'http://localhost:4000'}/api/v1/...` con `cache: 'no-store'`; nunca reenvía otras cookies ni usa `'use cache'` con datos de sesión; `dev-role` no se usa. Con cacheComponents, lo dinámico va en `<Suspense>` con Skeleton; tras mutar, `refresh()`/`revalidatePath()`. La importación va por Route Handler `app/(app)/admin/usuarios/importar/archivo/[accion]/route.ts` (plantilla GET, preview POST, commit POST): comprueba `Origin`, rechaza Content-Length > 1 MiB + 64 KiB, reenvía el stream (`duplex: 'half'`) solo con `aula_sid`, lista blanca de `type`/`format` en la plantilla, sin registrar el cuerpo. No se toca `next.config.ts`. Sesión local: `prisma/seed/dev-session.ts` (`pnpm exec tsx prisma/seed/dev-session.ts [--email]`), moviendo `assertLocalDatabase` a `prisma/seed/local-guard.ts`; rechaza producción, CI y hosts no locales (también `REDIS_URL`); solo correos del seed y usuarios ACTIVE; usa `SessionService` como import de solo lectura (plan B: escribir la clave con el mismo formato); imprime solo el token y cómo crear la cookie. Ante 401 en desarrollo se muestra ese comando; en producción, "Inicia sesión".
2. Rutas: 5a `/admin/estructura` (años), `/anios/nuevo`, `/anios/[anioId]` (año, períodos, secciones), `/anios/[anioId]/secciones/[seccionId]` (curso-sección y docente), `/cursos`. 5b `/admin/usuarios` (lista con filtros y paginación), `/nuevo/{estudiante,docente,apoderado}`, `/[id]` (editar, estado, matrículas, traslado, apoderados/estudiantes y revocación). 5c `/admin/usuarios/importar` (cliente: tipo, plantilla, archivo ≤ 1 MiB, preview, reporte con fila/columna/mensaje, confirmar con el mismo archivo y sha256; aviso de que el archivo no se guarda y los motivos no muestran celdas). Orden 5a → 5b → 5c, cada una con su vuelta de QA, seguridad, UX y revisor.
3. shadcn/ui faltantes: label, textarea, native-select, table, card, badge, alert, dialog, alert-dialog, field, pagination (`pnpm dlx shadcn@latest add`, sin cambiar package.json ni lockfile). Sin sonner, RHF ni TanStack: formularios nativos con Server Actions y `useActionState` (se aparta de 01_ARQUITECTURA, queda como decisión). Autorizaciones necesarias: A1 componentes nuevos en `apps/web/components/ui/`; A2 `apps/web/lib/api/` (server.ts, errors.ts; TEMPORAL hasta el cliente de Dev 1); A3 vitest en devDependencies de `apps/web/package.json` + script test + `vitest.config.ts` (toca package.json y lockfile). No se tocan nav, routes, layouts, next.config ni packages/ui. Si se niega A1/A2, se copian dentro de las carpetas de Dev 2.
4. UX: mobile-first desde 360 px (tablas → tarjetas bajo `sm` o scroll con caption); labels, `aria-invalid`/`aria-describedby`, foco en el primer error, foco visible, diálogos con foco atrapado, contraste AA, 44 px, Skeleton + `aria-busy`; fechas `YYYY-MM-DD`, instantes con `es-PE`/`America/Lima`; `toUserMessage` por status; aviso fijo junto a cada motivo con contador y límites.
5. Tests: sin esquema ni contrato nuevo (solo D-037 y nota en docs/03). Vitest de lógica pura (errores, query de usuarios, secciones de traslado, límites de motivos, máquina de estados de importación, Origin/tamaño/lista blanca, local-guard). Playwright no en F5. Verificación: lint, build, test de web, format:check y prueba manual con Docker.
6. Nada excede la ERS §7.
7. Dueño: dev2-estructura. ux-accesibilidad y seguridad-cumplimiento SÍ; documentador SÍ al final de 5c (D-037, sesión local, ruta proxy, `API_INTERNAL_URL` en `.env.example` con visto bueno del usuario).

Pendientes: autorización A1/A2/A3; D-037; para Dev 1 (throttle detrás del BFF, `API_INTERNAL_URL`, reemplazar el script por el login); verificar con Docker; decisión sobre `q` en la URL.

Para: dev2-estructura — tras la autorización A1/A2/A3, entrega 5a (local-guard, dev-session, lib/api, componentes ui y pantallas de estructura). Criterio de terminado de 5a: crear/activar/cerrar año, editar/cerrar/reabrir períodos, crear/editar secciones y cursos, asignar docente con la sesión del script; 401/403 en español; 360 px; lint, build y test en verde; package.json y lockfile solo según A3.

### Decisión del orquestador 1 — autorizaciones

El usuario respondió a la pregunta de A1/A2/A3: "segun tu recomendacion toca o modifica cualquier carpeta, utiliza el criterio de los agentes". Se autorizan A1 (componentes nuevos en `apps/web/components/ui/`), A2 (`apps/web/lib/api/`) y A3 (vitest en `apps/web/package.json`, script `test`, `vitest.config.ts` y lockfile). Se mantiene lo que el plan dejó fuera: nav, routes, layouts, `next.config.ts`, `packages/ui` y los módulos de Dev 1 en la API. Se sigue en el orden 5a → 5b → 5c.

### INFORME 2 — dev2-estructura (entrega 5a)

Estado: LISTO
Requisitos: RF-09..14, RF-17; RN-10, RN-11; RNF-24..27; D-029, D-030, D-037 (propuesta)
Resumen: 5a terminada y probada contra la API real con Docker: infraestructura común (local-guard, dev-session con el SessionService de Dev 1 sin modificar, lib/api/server.ts y errors.ts), 11 componentes shadcn, Vitest (A3), 5 pantallas de estructura (Server Components en Suspense; Server Actions + useActionState + refresh()) y 35 tests de lógica pura. 16 Server Actions probadas de punta a punta (éxito, 400/409/422, 401, 403); BD restaurada con re-seed.

Archivos:

- prisma/seed/local-guard.ts, local-guard.test.ts, dev-session.ts (nuevos); prisma/seed/index.ts (importa assertLocalDatabase de local-guard, mismos mensajes)
- apps/web/lib/api/server.ts, errors.ts, errors.test.ts
- apps/web/vitest.config.ts; apps/web/package.json (script test, vitest ^4.1.2); pnpm-lock.yaml (vitest/vite de web)
- apps/web/components/ui/: alert, alert-dialog, badge, card, dialog, field, label, native-select, pagination, table, textarea (nuevos; button y separator no se sobrescribieron)
- apps/web/app/(app)/admin/estructura/: page.tsx, anios/nuevo/page.tsx, anios/[anioId]/page.tsx, anios/[anioId]/secciones/[seccionId]/page.tsx, cursos/page.tsx; _lib/ (types, data, actions, validation, format, validation.test); _components/ (styles, page-bits, form-bits, confirm-action, new-year-form, year-panels, section-panels, course-section-panels, course-panels)

Comandos:

- shadcn add (11): ok; package.json sin cambios de dependencias
- pnpm --filter web add -D vitest: dejado en ^4.1.2 (resuelve 4.1.12)
- pnpm --filter web lint: ok (aviso preexistente jsx-ast-utils en app/(app)/layout.tsx:8)
- pnpm --filter web test: ok, 3 archivos, 35 tests
- pnpm --filter web build: ok, 5 rutas nuevas Partial Prerender
- pnpm --filter api lint: ok; pnpm --filter api test: ok, 28 archivos, 314 tests
- prettier --check sobre lo tocado: ok (format:check falla solo por .agents/ y por el expediente)
- dev-session: requiere `pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed/dev-session.ts`; rechaza correo fuera del seed, usuario no ACTIVE, NODE_ENV=production y REDIS_URL remoto
- curl con aula_sid: lista de años, detalle 2026 y 2025 (solo lectura), sección, cursos, nuevo año → 200; id no UUID → "El año académico no existe"; sin cookie → 401 en español; TEACHER → "No tienes permiso..."
- pnpm db:seed: ok (68 usuarios, 2 años, 8 períodos...); servidores detenidos

Hallazgos:

- [MEDIO] _components/confirm-action.tsx — tras éxito y refresh() el botón que abrió el diálogo puede desaparecer y el foco cae en <body> (el resultado sí se anuncia con role="status"). → ux-accesibilidad decide dónde mover el foco.
- [BAJO] apps/web/vitest.config.ts — aviso de Vite "ESM syntax in a file loaded as CommonJS". → Renombrar a .mts si se quiere.
- [BAJO] dev-session.ts necesita `--tsconfig apps/api/tsconfig.json`; ya está en el comentario, en DEV_SESSION_COMMAND y en el mensaje 401 de desarrollo.
- [BAJO] No hay GET /sections/:id; la página de sección la busca en la lista del año (comprueba pertenencia).
- [BAJO] 401/403 de la API sin tildes; la web usa textos propios.

Decisiones:

1. lib/api/server.ts: server-only; reenvía solo aula_sid si cumple ^[A-Za-z0-9_-]{20,128}$; no-store, redirect manual, timeout 15 s; solo rutas relativas sin ".."; no registra cuerpos; ningún 'use cache'.
2. toUserMessage: textos propios para 401, 403, 413, 429, 5xx y red; mensaje de la API para 400/404/409/422; en 401 de desarrollo muestra el comando de dev-session; detailMessages traduce periods.N a "II Bimestre: ...".
3. ActionState = { status, message, fieldErrors, details, values }; ids con .bind validados como UUID en servidor.
4. Tests de local-guard corren en el Vitest de web (include prisma/seed/**/*.test.ts).
5. REDIS_URL solo localhost, 127.0.0.1, ::1 o redis.
6. Motivos con los límites de la API (cerrar 1..500 opcional, reabrir 10..500), REASON_NOTICE fijo, contador y aria-describedby.
7. Objetivos táctiles de 44 px (TOUCH = 'min-h-11 px-4', h-11 md:h-9); no se tocó button.tsx ni input.tsx.

Pendientes: verificación visual a 360 px, teclado y lector de pantalla; documentador al final de 5c (D-037, comando con --tsconfig, API_INTERNAL_URL); card/dialog/field/pagination sin uso hasta 5b/5c; para Dev 1 throttle tras BFF y login real. No se tocó nav, routes, layouts, next.config, packages/ui ni apps/api/src. Sin commit.

Para: qa-tester

### INFORME 3 — qa-tester (entrega 5a)

Estado: LISTO
Resumen: todos los tests pasan, sin bugs; prueba de humo con la API real correcta. 3 hallazgos menores para el dev y 1 pendiente (Playwright).
Archivos (solo tests): apps/web/lib/api/errors.test.ts, apps/web/app/(app)/admin/estructura/_lib/validation.test.ts, prisma/seed/local-guard.test.ts
Cobertura nueva: parseo del sobre de error con tipos erróneos y longitudes límite; toUserMessage para 400/401/403/404/409/413/422/429/500/502/504/418/302, red, null y undefined; 401 en producción y desarrollo; 403/413/429/5xx no filtran texto del servidor; detailMessages; motivos en bordes 9/10 y 500/501 tras trim; isUuid con valores manipulados; isDateOnly (bisiestos, mes 13, 31 de abril); orden, solape y fin fuera del año de períodos; local-guard con producción, CI, hosts engañosos (localhost.evil.com, 127.0.0.2, 0.0.0.0, localhost.), credenciales en URL, URLs vacías y Redis remoto sin exponer la clave.
Comandos:

- pnpm --filter web test: 3 archivos, 65 tests ok
- pnpm --filter web lint: ok (aviso informativo jsx-ast-utils)
- pnpm --filter api test: 28 archivos, 314 tests ok
- pnpm --filter web build: ok
- Humo (API :4000, web :3000 con next start, sesiones con dev-session): /admin/estructura, /cursos y /anios/<id> → datos con ADMIN, "No tienes permiso..." con TEACHER (docente01), mensaje 401 sin cookie; en producción el 401 no muestra el comando dev-session; el token no aparece en el HTML. Servidores detenidos; pnpm db:seed → 68 usuarios, 2 años, 30 curso-sección.
  Hallazgos (para dev2-estructura, no bloquean):

1. lib/api/server.ts no exporta assertApiPath ni TOKEN_PATTERN (importa server-only) → moverlos a un módulo puro y probarlos.
2. La validación de booleanos manipulados vive en _lib/actions.ts → extraer un validador puro a validation.ts.
3. Con Partial Prerender las listas responden HTTP 200 aunque el contenido sea el error 401/403 (comportamiento de Next) → que seguridad-cumplimiento diga si exige status real.
4. Informativo: vitest.config.ts cargado como CommonJS → renombrar a .mts.
   Pendientes: Playwright cuando se instale; la humo de QA no probó mutaciones (sí las probó el dev en el INFORME 2).
   Para: seguridad-cumplimiento y ux-accesibilidad

### INFORME 4 — seguridad-cumplimiento (entrega 5a)

Estado: APROBADO
Requisitos: RF-09..14, RF-17; RNF-02, RNF-09..13; D-037 (propuesta)
Resumen: sin CRÍTICO ni ALTO. Autorización completa en la API (la web no usa dev-role); el BFF reenvía solo aula_sid validada; las Server Actions validan UUID, booleanos y límites de motivos en servidor; dev-session y local-guard no pueden correr en producción, CI ni con BD/Redis remotos y no entran al build de la API ni al bundle de la web. 1 MEDIO (throttle, conocido) y 4 BAJO.
Archivos: ninguno (solo lectura). Comandos: lectura y Grep; no reverificó las salidas de QA.
Verificado: server.ts (server-only; solo `Cookie: aula_sid` si cumple el patrón; assertApiPath; ids con isUuid + encodeURIComponent; sin SSRF; no-store, redirect manual, 15 s; sin logs ni 'use cache'); errors.ts (textos propios en 401/403/413/429/5xx/red; 400/404/409/422 recortado a 300 caracteres y 20 details; comando dev-session solo fuera de producción); actions.ts/data.ts (validaciones en servidor; sin console.*; 0 dangerouslySetInnerHTML; CSRF de Server Actions por Origin/Host sin allowedOrigins; docentes solo id y nombre); dev-session/local-guard (comprobaciones antes de conectar; solo usuarios del seed ACTIVE; solo imprime token, rol, horas e instrucciones); REASON_NOTICE en form-bits.tsx:217 con contador y límites idénticos a la API.
Hallazgos:

- [MEDIO] apps/api/src/app.module.ts:19-32 — throttle por req.ip sin trust proxy detrás del BFF: un usuario agota la cuota de todos; con login real anula el límite contra fuerza bruta. → Dev 1, antes de exponer el BFF en producción: trust proxy + X-Forwarded-For, o clave por usuario de sesión.
- [BAJO] Hallazgo 3 de QA (HTTP 200 con error 401/403 en streaming) — aceptable, sin fuga. → Mantener no-store; status real con middleware/proxy de Dev 1 si se quiere.
- [BAJO] prisma/seed/local-guard.ts:8-21 — `mysql`/`redis` aceptados como hosts; en un compose de producción solo frenarían NODE_ENV/CI. → Opcional: exigir ALLOW_DEV_SESSION=1 o NODE_ENV development/test; documentar en D-037.
- [BAJO] prisma/seed/dev-session.ts:64-73 — token en consola e historial. → Añadir advertencia "no lo compartas ni lo subas" y borrar el script cuando exista el login.
- [BAJO] estructura/_lib/actions.ts — `values` devuelve el motivo al cliente para repoblar. → Aceptable; no incluirlo en logs ni analítica.
  Decisiones: (1) el hallazgo 3 de QA no exige status real; (2) throttle MEDIO para Dev 1, no bloquea 5a; (3) en 5b/5c, `q` por Server Action POST o sin registrar la URL; la importación mantiene lista blanca, tope de tamaño, Origin y no registrar el cuerpo.
  Pendientes: revisar proxy de importación y `q` en 5b/5c; comprobar en local que la respuesta dinámica no lleve Cache-Control público.
  Para: orquestador — ux-accesibilidad y luego revisor-pr; sin vuelta al dev por seguridad.

### INFORME 5 — ux-accesibilidad (entrega 5a)

Estado: CAMBIOS_PEDIDOS
Requisitos: RF-09..14, RF-17; RNF-24..27
Resumen: revisión solo de código. Base buena (shadcn, tablas → tarjetas bajo sm, 44 px, labels, aria-invalid/aria-describedby, foco en primer error, español claro, fechas, aviso de motivos). Se sube el hallazgo del dev a ALTO: tras una acción exitosa se pierde el foco y tampoco se anuncia el resultado.
Archivos: ninguno. Comandos: ninguno.
Hallazgos:

- [ALTO] confirm-action.tsx:46-52, 88-92; year-panels.tsx:123,142; section-panels.tsx:81-96; course-section-panels.tsx:98-113; course-panels.tsx:44-59 — tras refresh() el ConfirmAction/InlineAction se desmonta con su <p role="status">; no se oye el resultado y el foco cae en <body> (4.1.3, 2.4.3).
- [ALTO] form-bits.tsx:66-73 — role="status" creado ya con texto; muchos lectores no lo anuncian. → contenedor role="status" aria-live="polite" aria-atomic="true" siempre montado.
- [MEDIO] page-bits.tsx:13 — PageShell pone <main> dentro del <main> de SidebarInset. → <div>, sin tocar el layout.
- [MEDIO] confirm-action.tsx:44-63,77-86 — al reabrir tras error se ve el Alert y el motivo anterior. → resetear al abrir (key por apertura o reset + estado local).
- [MEDIO] page-bits.tsx:55; anios/[anioId]/page.tsx:36-40; secciones/[seccionId]/page.tsx:55 — "no UUID"/"no existe" sin <h1>. → PageHeader siempre; <h1 id="titulo-pagina" tabIndex={-1}>.
- [BAJO] form-bits.tsx:75 — Alert con foco por código sin indicador visible.
- [BAJO] form-bits.tsx:209-211 — falta espacio antes de "(opcional)".
- [BAJO] year-panels.tsx:49-53 — "Cerrar año" pulsable con períodos abiertos (opcional).
- [BAJO] page-bits.tsx:126-136 — aria-busy en el contenedor que se reemplaza (aceptable).
  Decisiones (foco y anuncio):

1. Tras éxito el foco va al encabezado del elemento afectado (tabIndex=-1, id estable, scroll-mt-4), no al botón ni a <body>.
2. Destinos: período <h3 id="periodo-<id>">, sección <h3 id="seccion-<id>">, curso id="curso-<id>", curso en sección id="curso-seccion-<id>", acciones del año → <h1 id="titulo-pagina">; con outline-none focus-visible:ring-3 focus-visible:ring-ring.
3. ConfirmAction/InlineAction reciben `focusId`; en el diálogo con `finalFocus` de AlertDialogContent (éxito → encabezado, cancelar → trigger); en InlineAction con efecto/requestAnimationFrame; respaldo #titulo-pagina.
4. ActionFeedback: región role="status" siempre montada alimentada por contexto (`announce(message)`), y el mensaje también visible un rato.
5. Si PageShell pasa a <div>, el contexto envuelve el contenido.
6. Formularios in-page no mueven el foco; solo usan el contenedor de estado siempre montado.
   Pendientes: prueba manual a 360 px, teclado, NVDA/VoiceOver, contraste en modo oscuro; Playwright + axe cuando se instale.
   Para: dev2-estructura — vuelta 1 de 2.

### Decisión del orquestador 2 — vuelta de corrección 1/2

CAMBIOS_PEDIDOS de ux-accesibilidad → vuelve a dev2-estructura (mismo agente, con su contexto). Se le pasan los 2 ALTO, 3 MEDIO y los BAJO de UX, y además los hallazgos no bloqueantes de QA (1: exportar la lógica pura de server.ts; 2: validador puro de booleanos; 4: vitest.config.mts) y el BAJO de seguridad sobre dev-session (advertencia de no compartir el token). Después se repite desde QA.

### INFORME 6 — dev2-estructura (vuelta de corrección 1/2)

Estado: LISTO
Requisitos: RF-09..14, RF-17; RN-10, RN-11; RNF-24..27 (2.4.3, 4.1.3, 2.4.7, 1.3.1); D-037
Resumen: corregidos los 2 ALTO y 3 MEDIO de UX según sus Decisiones 1–6, 3 BAJO de UX (aria-busy aceptado), QA 1, 2 y 4 y el BAJO de seguridad. Lint, test (77) y build ok; prueba con la API real: 6 páginas con un solo <main>, un h1#titulo-pagina, región de estado montada desde el inicio e ids de encabezados. BD con el seed y servidores detenidos.
Archivos (apps/web/ salvo indicación):

- Nuevos: app/(app)/admin/estructura/_components/action-feedback.tsx; _lib/focus.ts; _lib/focus.test.ts; lib/api/request-guards.ts; lib/api/request-guards.test.ts; vitest.config.mts (renombrado de vitest.config.ts, no estaba en git)
- Modificados: estructura/_components/{confirm-action,form-bits,page-bits,year-panels,section-panels,course-section-panels,course-panels}.tsx; anios/[anioId]/page.tsx; anios/[anioId]/secciones/[seccionId]/page.tsx; cursos/page.tsx; _lib/validation.ts, actions.ts; lib/api/server.ts; prisma/seed/dev-session.ts; prisma/seed/local-guard.test.ts (comentario)
- Sin tocar: nav, routes, layouts, next.config.ts, packages/ui, apps/api/src, package.json, lockfile
  Comandos: web test 5 archivos/77 ok (sin aviso ESM); web lint ok; web build ok (Partial Prerender); prettier --check ok; curl a 6 páginas (1 main, 1 h1#titulo-pagina, 1 región status; periodo-×4, seccion-×6, curso-seccion-×5, curso-×5; "no UUID" con encabezado); Server Actions reabrir/cerrar ok, booleano "false" en texto rechazado; pnpm db:seed ok.
  Hallazgos resueltos:
- [ALTO] foco tras éxito: confirm-action.tsx con focusId y finalFocus (l.90-94, respaldo #titulo-pagina, cancelar → botón; refocusIfLost l.30); InlineAction con requestAnimationFrame (l.181); ids y FOCUS_HEADING en _lib/focus.ts; pickFocusTarget probado; encabezados con tabIndex=-1 en año, sección, cursos y page-bits.tsx:62.
- [ALTO] región de estado: action-feedback.tsx (ActionFeedbackProvider, useAnnounce, región siempre montada l.57, mensaje visible 10 s, re-anuncia textos repetidos); FormMessage solo pinta errores; los formularios anuncian desde useFormRefs (form-bits.tsx:254).
- [MEDIO] <main> anidado: PageShell como <div> con ActionFeedbackProvider (page-bits.tsx:18).
- [MEDIO] diálogo con restos: <ConfirmForm key={opening}> (confirm-action.tsx:98).
- [MEDIO] caminos sin <h1>: PageHeader en anios/[anioId]/page.tsx:39 y secciones/[seccionId]/page.tsx:59 y 95.
- [BAJO] foco del Alert: form-bits.tsx:77 (`focus:` porque el foco llega por código).
- [BAJO] "(opcional)": form-bits.tsx:214.
- [BAJO] "Cerrar año": se deja pulsable con aviso fijo "primero cierra sus N períodos abiertos" (year-panels.tsx:64).
- QA 1: lógica pura en lib/api/request-guards.ts (sin server-only) con tests (CRLF, ;, =, 19/20/128/129, URL absoluta, //, .., espacios).
- QA 2: isStrictBoolean en _lib/validation.ts:36, usado en actions.ts:230, 268, 326.
- QA 4: vitest.config.mts.
- Seguridad BAJO: dev-session.ts:66-68 advierte que el token es una credencial y no se comparte.
  Hallazgos nuevos: ninguno.
  Decisiones: (1) "Cerrar año" pulsable con aviso; (2) useFormRefs anuncia por defecto, ConfirmAction/InlineAction anuncian ellos; (3) 5b/5c reutilizan PAGE_TITLE_ID, FOCUS_HEADING y pickFocusTarget; (4) SESSION_COOKIE y validaciones del token en request-guards.ts.
  Pendientes: prueba manual en navegador (360 px, teclado, NVDA/VoiceOver); Playwright + axe; throttle (Dev 1); D-037 al final de 5c.
  Para: qa-tester (repetir desde QA) y ux-accesibilidad.

### INFORME 7 — ux-accesibilidad (revisión de la vuelta 1/2)

Estado: APROBADO
Requisitos: RF-09..14, RF-17; RNF-24..27 (2.4.3, 4.1.3, 2.4.7, 1.3.1, 2.4.6)
Resumen: revisión solo de código; los 2 ALTO, 3 MEDIO y los BAJO resueltos según las Decisiones 1–6. Sin CRÍTICO ni ALTO nuevos; 3 observaciones nuevas que no bloquean.
Verificado: finalFocus (confirm-action.tsx:90-94), refocusIfLost (29-35), InlineAction (178-182), pickFocusTarget con respaldo #titulo-pagina, ids y tabIndex=-1 en anios/[anioId]/page.tsx:112-114,150-152, cursos/page.tsx:57-59, secciones/[seccionId]/page.tsx:156-158, h1 en page-bits.tsx:61-65; focusId coherentes; región status siempre montada fuera de Suspense (action-feedback.tsx:54-65) con re-anuncio (36-39) y limpieza de timers; sin anuncio doble; PageShell <div> (page-bits.tsx:15-21); <ConfirmForm key={opening}> (confirm-action.tsx:76-79, 97-98); PageHeader en caminos sin datos; BAJO resueltos.
Hallazgos nuevos:

- [MEDIO, no bloquea] action-feedback.tsx:54-65 — la caja visible de 10 s no se puede cerrar y a 360 px puede tapar los últimos botones (pointer-events-auto, z-40); roza WCAG 2.2.1. → botón "Cerrar" de 44 px, pointer-events-none o menos tiempo.
- [BAJO] form-bits.tsx:70-77 — Alert con role="alert" y foco por código puede leerse dos veces.
- [BAJO] year-panels.tsx:63 — aviso de períodos abiertos sin aria-describedby en el botón.
  Pendientes: prueba manual a 360 px, teclado, NVDA/VoiceOver, contraste de la caja verde en modo oscuro, anillo de foco tras acción con ratón; Playwright + axe.
  Para: orquestador — revisor-pr; sin vuelta 2 por UX.

### INFORME 8 — qa-tester (repetición tras la vuelta 1/2)

Estado: LISTO
Requisitos: RF-09..14, RF-17; RNF-24..27; RN-10, RN-11
Resumen: tests nuevos ampliados con casos límite; humo con Docker y la API real confirma la estructura accesible en 8 páginas y los 401/403. BD con pnpm db:seed y servidores detenidos.
Archivos: apps/web/lib/api/request-guards.test.ts (token con "\n", espacio inicial, no ASCII, objeto, vacío, CRLF; rutas con tab, "/..", "https://"); apps/web/app/(app)/admin/estructura/_lib/focus.test.ts (sin candidatos con y sin título, prioridad de candidatos)
Comandos: web test 5 archivos/79 ok; web lint ok; web build ok; api test 28/314 ok; humo con curl (ADMIN, 8 páginas: HTTP 200, 1 main, 1 h1#titulo-pagina, 1 región status; ids periodo-×4, seccion-×6/×1, curso-seccion-×5, curso-×5); sin cookie y con docente la web da 200 con el alert en el cuerpo y la API directa 401/403; db:seed ok.
Hallazgos:

- [BAJO] action-feedback.tsx sin lógica pura exportable → cubrir con Playwright + axe.
- [BAJO] 401/403 de la web en HTTP 200 por streaming → los E2E deben comprobar el contenido, no el status.
  Pendientes: Playwright + axe; prueba manual a 360 px, teclado y lector; Vitest sin DOM; D-037 al final de 5c.
  Para: orquestador — QA verde; sigue revisor-pr.

### Decisión del orquestador 3

QA (INFORME 8) y UX (INFORME 7) en verde; seguridad aprobó en el INFORME 4 y la corrección solo movió la lógica pura de server.ts a request-guards.ts sin cambiar su conducta, así que no se repite seguridad (lo verifica revisor-pr). El MEDIO nuevo de UX (caja de 10 s sin cerrar) y los dos BAJO se dejan para la entrega 5b, que vuelve a tocar esos archivos. Sigue revisor-pr.

### INFORME 9 — revisor-pr (entrega 5a)

Estado: CAMBIOS_PEDIDOS (menor: solo formato)
Requisitos: RF-09..14, RF-17; RNF-24..27; D-037 (propuesta)
Comandos: web lint ok; web test 5/79 ok; web build ok (5 rutas Partial Prerender); api lint ok; api test 28/314 ok; prettier --check falla en _lib/focus.test.ts, lib/api/request-guards.test.ts y este expediente.
Hallazgos:

- [MEDIO] focus.test.ts y request-guards.test.ts sin formato (format:check es parte de la definición de terminado) → prettier --write y volver a comprobar.
- [BAJO] el expediente sin formato → lo formatea el orquestador.
- [INFO] siguen abiertos los 5 hallazgos no críticos de seguridad (INFORME 4) y el MEDIO y 2 BAJO de UX (INFORME 7), que pasan a 5b. Ningún CRÍTICO ni ALTO sin resolver.
  Verificado: alcance dentro de la Decisión 1 (modificados: estructura/page.tsx, apps/web/package.json —solo script test y vitest—, pnpm-lock.yaml —solo líneas añadidas de vitest, vite y @vitest/mocker—, prisma/seed/index.ts —solo el import de local-guard—; el resto nuevo; button.tsx y separator.tsx intactos; nada en nav, routes, layouts, next.config.ts, packages/ui ni apps/api/src; AGENTS.md y next-env.d.ts sin cambios); server.ts conserva su conducta de seguridad (server-only, no-store, redirect manual, 15 s, solo aula_sid con el patrón, assertApiPath, sin logs, sin 'use cache', sin dev-role) y request-guards.ts tiene las mismas reglas; definición de terminado cumplida salvo el formato; criterio de 5a cumplido.
  Archivos del commit: los 4 modificados; estructura/_components (10), _lib (8), anios/ (3 páginas), cursos/page.tsx; components/ui (11 nuevos); lib/api (5); apps/web/vitest.config.mts; prisma/seed/local-guard.ts, local-guard.test.ts, dev-session.ts; el expediente y el reporte. NO: .agents/, skills-lock.json.
  Pendientes: prueba manual a 360 px, teclado y lector; Playwright + axe; documentador al final de 5c; para Dev 1, throttle y login real.
  Siguiente: formatear los 3 archivos; con prettier --check en verde queda APROBADO sin otra revisión.

### Decisión del orquestador 4 — formato

El pedido de revisor-pr es un `prettier --write` mecánico sin cambio de lógica, así que lo aplica el orquestador directamente sobre los 3 archivos (no cuenta como vuelta de corrección) y repite `prettier --check` y `pnpm --filter web test`. El documentador se deja para el final de 5c, como dijo el plan.
