# Reporte — Pendientes Dev 1 a 3, fase A1 (bitácora en transacción) y A5

## Pedido

- Textos del usuario:
  - "lo que puedes ir realizando es la del Dev 1 en adelante";
  - "todo lo que se avanza debe de llegar tanto para la repo del grupo (santxxxs) y mi repo privada";
  - "Sí, empieza".
- Fecha: 07/11/2026.
- Flujo: completo.
- Rama: `features/adolfo`.

## Resultado

- `AuditService.record(event, tx?)`: si recibe `tx`, la bitácora se guarda dentro de la misma transacción, y si falla se revierte la acción (D-047 RESUELTA).
- Se migraron a esta forma:
  - tareas y materiales;
  - versión de entrega;
  - nota y NE automática;
  - configuración y logo.
- Anuncios y archivos siguen escribiendo la bitácora después, porque no usan transacción.
- A5: se corrigieron los tipos de la cookie en `journeys.e2e`.

## Agentes que participaron

| Agente          | Qué hizo                          | Estado   |
| --------------- | --------------------------------- | -------- |
| dev1-plataforma | Implementó A1                     | LISTO    |
| qa-tester       | 23 tests de rollback y A5         | LISTO    |
| revisor-pr      | Revisión final y seguridad ligera | APROBADO |

## Prompts usados (literales)

Los prompts literales están en el expediente: el encargo de cada agente se copió íntegro en la conversación y se resume en sus INFORMES. Ver [.claude/tareas/20261107-pendientes-dev1-3.md](../tareas/20261107-pendientes-dev1-3.md).

## Decisiones del orquestador

- A1 fue sola y primero, porque toca módulos de todos los devs.
- Seguridad la cubrió el revisor, porque no hay endpoints nuevos.
- Se revirtió un cambio de solo formato en `storage/README.md`.
- El orquestador corrigió los docstrings "Nunca lanza" (hallazgo BAJO del revisor).

## Verificación

| Comando                              | Resultado            |
| ------------------------------------ | -------------------- |
| lint, tsc y build (api, web, worker) | ok                   |
| api test                             | 1140 ok              |
| web test                             | 465 ok               |
| e2e completo                         | 34 archivos / 698 ok |

## Pendientes

- Fases A2 a A4, B1 a B4 y C.
- Migrar anuncios y archivos a transacciones, si se decide.

---

# Actualización: A2, A3, A4, B2 y B4

## Pedido

- "Sí, empieza" y luego "de lo que se tiene hasta el momento manda el pull request a la repo grupal y mi repor privada" (07/11/2026).
- Flujo completo. Rama `features/adolfo`, sobre `c2b1724`.

## Resultado

- **A2:** logo y nombre del colegio en la cabecera; cabeceras de seguridad (CSP con el bucket, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy y HSTS fuera de dev). En producción el build falla si falta `S3_PUBLIC_ORIGIN`.
- **A3:** MinIO borra solos los archivos de `incoming/` tras 1 día (regla idempotente que no toca otras). CORS de R2 documentado.
- **A4:** el `dev` del worker espera a la API en vez de compilarla.
- **B2:** las entregas muestran el estado real de su nota (`gradeState`).
- **B4:** confirmar una subida vencida responde 409 `UPLOAD_EXPIRED`; `StorageService` admite activos en lista blanca (exports, backups, logo) y las fachadas lo usan.

## Agentes que participaron

| #   | Agente                 | Qué hizo               | Estado                     |
| --- | ---------------------- | ---------------------- | -------------------------- |
| 1   | dev1-plataforma        | A2-A4                  | LISTO                      |
| 2   | dev3-contenidos        | B2 y B4                | LISTO                      |
| 3   | qa-tester              | Tests de A2-A4 y B2/B4 | LISTO                      |
| 4   | seguridad-cumplimiento | Auditoría              | APROBADO (3 MEDIO, 5 BAJO) |
| 5   | ux-accesibilidad       | Cabecera con logo      | CAMBIOS_PEDIDOS            |
| 6   | dev1-plataforma        | Corrección 1/2         | LISTO                      |
| 7   | dev3-contenidos        | Corrección 1/2         | LISTO                      |

## Prompts usados (literales)

### dev1-plataforma — A2 a A4 plataforma

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md. Rama features/adolfo (c2b1724). El usuario autorizó que este trabajo también vaya al repo del equipo.

Encargo: tres tareas de plataforma.

**A2 — Branding y CSP**
1. Muestra el logo y el nombre del colegio en la cabecera o sidebar de `(app)`. Usa `GET /institution/branding`, que ya existe (Dev 5) y devuelve `{name, logo: {url, expiresAt} | null}`.
2. Server component con el BFF (D-037), con caché corta.
3. Si no hay logo, muestra solo el nombre.
4. `alt` con el nombre del colegio y nada que rompa el diseño a 360 px.
5. Agrega una CSP con `img-src 'self' data: <origen del bucket>`. El origen sale de la configuración pública de S3/MinIO; no lo pongas fijo en el código.
6. Antes de tocar `next.config`, `proxy.ts` y `layout.tsx`, revisa si ya hay cabeceras de seguridad.

**A3 — Ciclo de vida de `incoming/`**
1. Agrega a `docker-compose.yml` o a `scripts/` una forma idempotente de aplicar en MinIO la regla que borra `incoming/` a 1 día. Puede ser un servicio `minio-init` con `mc ilm`, o un script `pnpm storage:lifecycle`.
2. Documenta en `docs/manuales/tecnico.md` el equivalente para Cloudflare R2: la regla de ciclo de vida y el CORS con el origen web y los métodos `PUT`/`GET`.

**A4 — turbo y worker**
- Haz que `pnpm --filter worker dev` y `pnpm dev` (turbo) no compilen `apps/api/dist` al mismo tiempo que `api start:dev`.
- Por ejemplo: el worker corre la API con tsx o `nest start --entryFile worker.main` sin borrar `dist`, o con una `dependsOn` adecuada en `turbo.json`.
- Elige la solución más simple y verifica que los dos arranquen juntos.

**Restricciones**
- En paralelo, un agente dev3 trabaja en `apps/api/src/modules/{submissions,files,storage}` y en `jobs/job-result.storage.ts`. No los toques.
- Corre lint, tsc, test y build de api, web y worker, más una prueba de humo de A2 y A4.
- `NODE_OPTIONS=--dns-result-order=ipv4first`. Comandos con timeout.
- No leas `.env` y no hagas commit.

Devuelve un INFORME conciso.
```

### dev3-contenidos — B2 y B4 entregas y storage

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md. Rama features/adolfo (c2b1724). El usuario autorizó que este trabajo también vaya al repo del equipo.

Encargo: dos tareas de Dev 3.

B2. gradeState en entregas
`submissions.service.ts` hoy pasa `gradeState: null` (unas líneas cerca de 143 y 224) y la lista del docente no muestra el estado de la nota. Haz lo siguiente:
- Lee el estado real desde el modelo `Grade` (GRADED, NE o EXEMPT) para cada matrícula y tarea, sin hacer N+1 consultas.
- Pásalo a `computeDisplayStatus`.
- No expongas `exemptionReason` ni el comentario (D-049).
- Si la web de tareas del docente necesita ajustar el texto del estado, cámbialo en `curso/[id]/tareas`.
- Agrega tests.

B4. Archivos
1. En `files.service.ts`, `complete()` debe rechazar con 410 (`UPLOAD_EXPIRED` o similar) si ya pasó `intentExpiresAt`. Respeta la guarda optimista que ya existe y agrega tests.
2. En `StorageService` (`modules/storage`), acepta claves y tipos que no sean PDF (`xlsx`, `zip`, `json`, `png`/`jpg`) mediante una lista blanca por prefijo (`exports/`, `institution/`). Mantén intactas las validaciones de PDF para materials/assignments/submissions/incoming.
3. Después reemplaza `JobResultStorage` (`jobs/job-result.storage.ts`) y, si es simple, `InstitutionLogoStorage` por `StorageService`. Si el cambio es grande o arriesgado, deja solo la ampliación de `StorageService` y repórtalo.

En paralelo trabaja un agente dev1 en web (layout, `next.config`, `proxy`), `docker-compose`, `scripts`, `turbo.json` y `apps/worker`. No toques esos archivos.

Al terminar, corre lint, `tsc`, test y build de api y web, más los e2e de files, submissions, jobs, lifecycle, reports y settings (con timeout). `NODE_OPTIONS=--dns-result-order=ipv4first`. No leas `.env`. No hagas commit. Devuelve un INFORME conciso.
```

### qa-tester — QA de A2-A4 y B2/B4

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (lee los INFORMES 4 y 5 y la Decisión 4). Rama features/adolfo, cambios sin commit.

Encargo: QA de A2-A4 (branding, CSP, minio-init, worker --wait) y de B2/B4 (gradeState, complete vencido, lista blanca de StorageService, fachadas de jobs y logo). Solo puedes tocar archivos de test.

Casos límite que faltan:
- **School-brand:** con logo, sin logo, cuando la API falla y con una URL que no es http(s). Tests de la lógica pura.
- **Cabeceras de `next.config`:** que la CSP incluya el origen del bucket en `img-src`, `connect-src` y `frame-src`. Fallback a 127.0.0.1:9000 y uso de `S3_PUBLIC_ORIGIN`.
- **Worker `--wait`:** espera, expira a los 120 s y sin el flag se comporta como antes.
- **`gradeState`:** el docente ve los 4 estados y el alumno el suyo; nunca `exemptionReason` ni el comentario. Agrega un e2e real si falta.
- **`complete()`:** justo en el margen de 15 min frente a 15 min + 1 ms. Dos `complete()` concurrentes sobre un intent vencido.
- **StorageService:** cada prefijo con sus extensiones válidas e inválidas, path traversal en la clave y `readAsset(maxBytes)` en el límite. Las claves PDF siguen rechazando `exports/`.
- **Regresión de las fachadas:** el logo y los resultados de jobs funcionan contra MinIO real.

Corre api test, el e2e completo (`timeout 900`), web test, lint y tsc. Docker está arriba.

`NODE_OPTIONS=--dns-result-order=ipv4first`. No leas `.env`.

Devuelve un INFORME conciso. Los bugs de producción van como hallazgos, sin corregirlos.
```

### seguridad-cumplimiento — Seguridad de A2-A4 y B2/B4

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md. Lee los INFORMES 4 y 5. Rama features/adolfo.

Encargo: auditoría de solo lectura de estos cambios.

1. **Cabeceras de seguridad** en `apps/web/next.config.ts`:
   - CSP con `'unsafe-inline'` en scripts: ¿se puede pasar a nonces con Next 16?
   - Orígenes del bucket en `img-src`, `connect-src` y `frame-src`.
   - `X-Frame-Options`, Referrer-Policy, nosniff.
   - ¿Falta HSTS o Permissions-Policy?
   - La CSP se calcula al momento del build.
2. **school-brand.tsx** (BFF, validación de la URL).
3. **minio-init** en docker-compose: que no exponga credenciales; que `mc ilm import` no reemplace otras reglas.
4. **Worker `--wait`**.
5. **B2:** que el `gradeState` no filtre `exemptionReason` ni comentarios, y que el alumno solo vea el suyo.
6. **B4:**
   - `complete()` vencido: margen de 15 min y carreras.
   - Lista blanca de `StorageService` (`asset-key.util.ts`): regex, path traversal, content-type permitido, `readAsset` con tope.
   - Las fachadas de jobs y logo siguen validando sus claves.
   - Los errores de S3 no filtran detalles.

INFORME conciso con severidades (CRÍTICO/ALTO/MEDIO/BAJO), archivo:línea y la corrección.
```

### ux-accesibilidad — UX de la cabecera con logo

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md. Lee el INFORME 4. Rama features/adolfo.

Encargo: revisión de solo lectura de:
- `apps/web/components/layout/school-brand.tsx`
- el uso de ese componente en `app-sidebar.tsx`, incluido el `Suspense` con su estado de carga.

Criterios:
- Diseño desde 360 px y con el sidebar colapsado.
- Texto alternativo del logo: si el nombre ya aparece al lado, ¿el `alt` debería ir vacío para no repetirlo?
- Contraste en modo claro y oscuro.
- Estado de carga sin saltos de diseño.
- Coherencia con shadcn y con el diseño de David (tokens de marca).

Revisa también si, en la lista de entregas del docente (`curso/[id]/tareas`), el estado de la nota (B2) se muestra con texto y no solo con color.

Devuelve un INFORME breve con APROBADO o CAMBIOS_PEDIDOS, indicando severidad, archivo:línea y la corrección propuesta.
```

### SendMessage → af0ae8ef7981e6e05

```text
Correcciones de A2-A4 (vuelta 1/2). El detalle está en el expediente: INFORME 6 (UX) e INFORME 7 (seguridad). Hazlas todas en una sola pasada.

UX:
1. [ALTO] En `school-brand.tsx`, el `<img>` debe llevar `alt=""` y `aria-hidden`, porque el nombre ya está como texto. Actualiza la prueba `apps/web/components/layout/school-brand.test.ts` de QA, que hoy espera `alt=nombre`.
2. [MEDIO] En el fallback del `Suspense` (`app-sidebar.tsx`), reserva el hueco `size-8` del logo con un esqueleto `animate-pulse` y muestra barras de esqueleto en lugar de "Aula Virtual". El subtítulo del rol se mantiene.
3. [MEDIO] Agrega `bg-white p-0.5 rounded` al logo para que se vea en modo oscuro.
4. [BAJO] Agrega al `Link` de la marca: `rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring`.

Seguridad:
5. [MEDIO M1] Pon un comentario en `next.config.ts` que justifique `'unsafe-inline'`: PPR y `cacheComponents` impiden usar nonces. Anótalo como deuda en `docs/manuales/tecnico.md`.
6. [MEDIO M2] En producción, si falta `S3_PUBLIC_ORIGIN` al hacer el build, que falle con un error claro en lugar de usar el fallback local. Si hay un Dockerfile de la web, agrega el `ARG`/`ENV`. Documéntalo. Ajusta `next-config.headers.test.ts`.
7. [MEDIO M3] En `minio-init`, reemplaza `mc ilm import` por un `mc ilm rule add --prefix incoming/ --expire-days 1` idempotente, que solo se ejecute si la regla no existe. No debe borrar otras reglas. Pruébalo dos veces.
8. [BAJO B4] En producción, `safeLogoUrl` solo acepta `https:` y el origen del bucket.
9. [BAJO B5] Agrega `Permissions-Policy: camera=(), microphone=(), geolocation=()`, y `Strict-Transport-Security` solo fuera de desarrollo.

Un agente dev3 trabaja en paralelo en `apps/api/src/modules/storage/`; no lo toques. Corre lint, tsc, test y build de web y api, y prueba `minio-init`. Usa timeout. No hagas commit. Devuelve un INFORME breve, punto por punto.
```

### SendMessage → a9c61c04038ba3083

```text
Correcciones de B4 (vuelta 1 de 2). Están en el expediente, INFORME 7 de seguridad. Aplícalas en una sola pasada:

1. [BAJO B1] `storage.service.ts` `readAsset`: lee el `Body` como stream con un contador y aborta con 413 al pasar `maxBytes`. Si falta `ContentLength`, cuenta los bytes del stream en lugar de confiar en la cabecera.
2. [BAJO B2] `asset-key.util.ts` `isAssetKey`: cambia la búsqueda del prefijo por `Object.hasOwn(ASSET_KEY_RULES, prefix)`. Una clave como `constructor/x` debe dar false (o 400), nunca un 500.
3. [BAJO B3] `createAssetDownloadUrl`: el `contentType` debe coincidir con el formato de la clave (`ASSET_CONTENT_TYPES[assetFormatOf(key)]`). Si no coincide, rechaza.

Agrega los tests de los tres casos. No rompas los de QA (`storage.assets.qa.spec.ts`, `storage-facades.e2e`).

En paralelo, dev1 está tocando web, `next.config` y `docker-compose`: no toques esos archivos.

Corre api lint, tsc, test y build, y los e2e de storage-facades, jobs, settings-logo y reports. Usa timeout. No hagas commit. Devuelve un INFORME breve.
```

## Decisiones del orquestador

- dev1 y dev3 en paralelo, sin archivos compartidos.
- Se acepta el 409 con margen de 15 min (contrato de docs/03).
- Se acepta el cambio de dev1 en `.github/workflows` (variable del build).
- A pedido del usuario se envía sin la pasada final de revisor-pr.

## Verificación (informes de los agentes)

| Comando                                   | Resultado            |
| ----------------------------------------- | -------------------- |
| lint, tsc y build (api, web, worker)      | ok                   |
| api test                                  | 1242 ok              |
| web test                                  | 491 ok               |
| e2e completo (QA, antes de la corrección) | 36 archivos / 712 ok |
| e2e tras la corrección de dev3            | 6 archivos / 69 ok   |

## Pendientes

- revisor-pr de A2-A4 y B2/B4, y prueba del logo con sesión de admin.
- B1 y B3.
- Deuda: `'unsafe-inline'` en `script-src`.

### Revisión final (después del envío)

- **revisor-pr:** CAMBIOS_PEDIDOS. Un hallazgo ALTO: turbo no pasaba `S3_PUBLIC_ORIGIN` al build de la web, y el CI del PR #20 falló.
- **Corrección del orquestador:** `turbo.json`, con `env: ["S3_PUBLIC_ORIGIN"]` en `build`. El `pnpm build --force` completo pasa (5/5).
- **Prompt literal (revisor-pr):**

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (lee los INFORMES 4 a 10 y la Decisión 6).

Encargo: revisión final del commit b0c0bb7 (rama features/adolfo) que trae A2 (logo en cabecera y cabeceras de seguridad en apps/web/next.config.ts), A3 (minio-init en docker-compose), A4 (worker dev --wait), B2 (gradeState en submissions) y B4 (complete() vencido 409 UPLOAD_EXPIRED, StorageService con lista blanca de activos y fachadas). Ya está enviado en el PR #20 del equipo; si encuentras algo, se corrige en un commit nuevo.

Verifica: definición de terminado, carpetas tocadas, lint, tsc, test (api y web) y build (api, web, worker). Usa NODE_OPTIONS=--dns-result-order=ipv4first. Corre el e2e completo solo si Docker está arriba (cd apps/api && timeout 900 pnpm test:e2e), escribiendo cualquier log en el scratchpad del sistema, no en el repo. Revisa también que los hallazgos de seguridad M1-M3 y B1-B5 y los de UX quedaron aplicados. No modifiques archivos. Devuelve el INFORME del protocolo (.claude/PROTOCOLO_AGENTES.md) con APROBADO o CAMBIOS_PEDIDOS y hallazgos por severidad.
```

---

# Actualización: B1 (navegación del curso, RF-08)

## Pedido

"Sí, sigue" (07/11/2026). Flujo completo. Rama `features/adolfo`, sobre `c8cf6da`.

## Resultado

- **"Mis cursos" en el menú lateral:** lo ven docentes y estudiantes, con datos reales de `GET /me/course-sections`. Para el admin y el apoderado no se pide nada a la API.
- **Barra de pestañas del curso:**
  - Clases, Lecturas, Tareas y Anuncios.
  - Registro, solo para docente y admin.
  - `aria-current`, objetivos de 44 px y scroll horizontal a 360 px.
- **Encabezado del curso:** curso, sección, docente, año y aviso de solo lectura. Responde "no encontrado" si el curso no es tuyo.
- **`/curso/[id]`:** redirige a Clases.

## Agentes que participaron

| # | Agente | Qué hizo | Estado |
|---|---|---|---|
| 1 | arquitecto-integrador | Plan | LISTO |
| 2 | dev1-plataforma | Implementación | LISTO |
| 3 | qa-tester | Tests del encabezado y la redirección | LISTO |
| 4 | seguridad-cumplimiento | Auditoría | APROBADO (2 BAJO) |
| 5 | ux-accesibilidad | Revisión | APROBADO (4 MEDIO, 5 BAJO) |
| 6 | dev1-plataforma | Corrección 1/2 | LISTO |
| 7 | revisor-pr | Revisión final | APROBADO |

## Prompts usados (literales)

### arquitecto-integrador — Plan de B1 menú y pestañas

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (plan del orquestador, punto B1).

Encargo: planifica B1. Hay que mostrar en el menú lateral (apps/web/components/layout/app-sidebar.tsx) la lista "Mis cursos" con los cursos reales del usuario según su rol (docente: cursos-sección asignados; estudiante: cursos de su sección; apoderado y admin: decidir si aplica), y agregar dentro de la página del curso una barra de pestañas (Materiales, Tareas, Anuncios, Notas u otras que ya existan como rutas) para navegar entre sus secciones.

Responde:
1. Qué endpoints de la API ya existen para listar los cursos del usuario (busca en apps/api/src/modules y en docs/03_CONTRATOS.md) y si falta alguno o hay que cambiar un contrato.
2. Qué rutas existen bajo apps/web/app/(app)/ para el curso y cuáles serían las pestañas por rol, respetando docs/05_AUTORIZACION.md.
3. Agente dueño (dev1 para el menú, dev2/dev3 para cursos, dev5 para anuncios) y orden, señalando archivos compartidos para no lanzar en paralelo.
4. Si hay cambio de esquema (espero que no).
5. Requisitos afectados (RF/RNF) y criterios de aceptación concretos, incluido 360 px y accesibilidad (aria-current, navegación por teclado).
Solo lectura. Devuelve el INFORME del protocolo (.claude/PROTOCOLO_AGENTES.md).
```

### dev1-plataforma — B1 menú Mis cursos y pestañas

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (lee el INFORME 11 del arquitecto: es tu plan).

Encargo B1 (RF-08, con RF-16/19, RF-32 y RNF de accesibilidad):
1. `apps/web/components/layout/my-courses-nav.tsx`: grupo "Mis cursos" en el sidebar con datos reales de `GET /me/course-sections` (docs/03 §259), pedido en servidor con la sesión y SOLO si el rol es TEACHER o STUDENT (ADMIN y GUARDIAN: no pedir nada, no mostrar el grupo). TEACHER: un ítem por curso-sección "Curso · 3°A"; STUDENT: un ítem por curso. Orden por curso y sección. Lista vacía: "No tienes cursos asignados en el año activo". Error: "No se pudieron cargar tus cursos" sin romper el menú. Integrarlo en `app-sidebar.tsx` con Suspense y skeleton (como SchoolBrand). Enlace activo con `aria-current="page"` también en subrutas /curso/:id/*. Nombres largos truncados con title.
2. `apps/web/app/(app)/curso/[id]/layout.tsx`: encabezado con `GET /course-sections/:id/context` (curso, sección, docente, aviso de solo lectura si readOnly) y barra `apps/web/components/layout/course-tabs.tsx` (client, usePathname) como `<nav aria-label="Secciones del curso">` con `<Link>` (no tablist). Pestañas: TEACHER y ADMIN: Clases, Lecturas, Tareas, Anuncios, Registro; STUDENT: sin Registro; GUARDIAN: sin barra. Activa con aria-current, subrayado o borde y peso (no solo color). A 360 px overflow-x-auto sin scroll horizontal de página, objetivos de al menos 44 px, focus-visible:ring.
3. `curso/[id]/page.tsx` que redirige a `/curso/[id]/clases`.
No edites las páginas hijas. Si alguna ya pinta su propio encabezado y queda duplicado, NO lo quites: avísalo en el informe con la ruta. No toques turbo.json ni archivos fuera de apps/web/components/layout y apps/web/app/(app)/curso/[id]/ (más los tests). Agrega tests de componente: pestañas por rol, aria-current, lista vacía y error.
Verifica con NODE_OPTIONS=--dns-result-order=ipv4first: lint, tsc, test y build de web (build con S3_PUBLIC_ORIGIN=https://bucket.ci.invalid). No hagas commit. Devuelve el INFORME del protocolo (.claude/PROTOCOLO_AGENTES.md).
```

### qa-tester — QA de B1

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (INFORMES 11 y 13). Encargo: tests de B1 (RF-08): grupo "Mis cursos" del sidebar y barra de pestañas del curso en apps/web/components/layout/ (course-nav-model.ts, course-tabs.tsx, my-courses-list.tsx, my-courses-nav.tsx) y apps/web/app/(app)/curso/[id]/layout.tsx y page.tsx. Completa los casos que falten: pestañas por rol (TEACHER/ADMIN 5, STUDENT 4 sin Registro, GUARDIAN ninguna), aria-current en activa y subrutas, orden y etiquetas, lista vacía, error de la API, que ADMIN y GUARDIAN no llaman a /me/course-sections, encabezado con readOnly y con error de /context, y la redirección de /curso/[id]. Sigue el patrón sin DOM de school-brand.test.ts. Solo archivos de test. Corre con NODE_OPTIONS=--dns-result-order=ipv4first: test, lint y tsc de web. Devuelve el INFORME del protocolo.
```

### seguridad-cumplimiento — Seguridad de B1

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (INFORMES 11 y 13). Audita B1: apps/web/components/layout/my-courses-nav.tsx, my-courses-list.tsx, course-tabs.tsx, course-nav-model.ts, app-sidebar.tsx y apps/web/app/(app)/curso/[id]/layout.tsx y page.tsx. Revisa: que el rol para decidir la llamada sale de la sesión del servidor y no del cliente, que no se filtran datos de otros cursos ni de menores, que ocultar pestañas no se usa como control de acceso (la API debe proteger cada subruta: confírmalo en docs/05 y en los guards), manejo de errores sin exponer detalles, y que no se pasan datos personales innecesarios al cliente. Solo lectura. Devuelve el INFORME del protocolo con hallazgos por severidad.
```

### ux-accesibilidad — UX de B1

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (INFORMES 11 y 13). Revisa B1: grupo "Mis cursos" en apps/web/components/layout/my-courses-list.tsx, my-courses-nav.tsx y app-sidebar.tsx, la barra apps/web/components/layout/course-tabs.tsx y el encabezado apps/web/app/(app)/curso/[id]/layout.tsx. Criterios: coherencia con shadcn/ui y el sidebar existente, 360 px (overflow-x de la barra sin scroll de página, sheet móvil), objetivos de 44 px, foco visible, aria-current, pestaña activa no solo por color, contraste AA en claro y oscuro, esqueletos sin salto de layout, jerarquía de encabezados con los h1 de las páginas hijas, textos en español claros. Solo lectura. Devuelve el INFORME del protocolo con hallazgos por severidad.
```

### SendMessage → a7285487e578fafa0

```text
Corrección 1/2 de B1: aplica estos hallazgos de UX y seguridad (expediente, INFORMES 14 a 16).
UX:
- M1: HeaderSkeleton de curso/[id]/layout.tsx con la misma estructura que el real (pt-4, línea text-lg, línea text-sm, mt-2 y franja de 44 px con borde inferior para la barra).
- M2: esqueletos de my-courses-nav.tsx con h-8 y gap-1, y <span className="sr-only">Cargando tus cursos…</span> (o role="status").
- M3: ítems de "Mis cursos" con className="h-11 md:h-8" solo en el grupo nuevo; no toques ui/sidebar.
- M4: errores con role="alert" y acción: "No se pudieron cargar los datos del curso. Recarga la página o vuelve a intentarlo en unos minutos." y "No se pudieron cargar tus cursos. Recarga la página.". El texto de vacío para docente añade "Consulta con el administrador".
- B5: scrollIntoView({inline:'nearest', block:'nearest'}) de la pestaña activa al montar; px-2 en móvil (md:px-3).
- B6: scroll-px-4 en el nav.
- B7-B8: revisa el contraste de text-sidebar-foreground/70 en text-xs y de text-muted-foreground; si no llega a 4.5:1, quita la opacidad.
Seguridad:
- BAJO-1: en layout.tsx, si /context responde 403 o 404, notFound(); otros errores siguen con el aviso.
- BAJO-2: encodeURIComponent(id) en el redirect de page.tsx (o dentro de COURSE_ROUTES).
Actualiza los tests afectados (course-nav.test.ts y course-header.test.ts de QA) para que reflejen los textos y el notFound. Mismas carpetas que antes. Verifica lint, tsc, test y build de web (S3_PUBLIC_ORIGIN=https://bucket.ci.invalid). Sin commit. Devuelve el INFORME.
```

### revisor-pr — Revisor de B1

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (INFORMES 11 a 17). Encargo: revisión final de B1 (RF-08), sin commit todavía: cambios sin commitear en apps/web/components/layout/ (app-sidebar.tsx, my-courses-nav.tsx, my-courses-list.tsx, course-tabs.tsx, course-nav-model.ts, course-nav.test.ts, course-header.test.ts) y apps/web/app/(app)/curso/[id]/ (layout.tsx, page.tsx). Verifica definición de terminado, carpetas tocadas, que se aplicaron los hallazgos de UX (M1-M4, B5-B6) y de seguridad (BAJO-1, BAJO-2), y corre con NODE_OPTIONS=--dns-result-order=ipv4first: pnpm lint, tsc de web, test de web y `S3_PUBLIC_ORIGIN=https://bucket.ci.invalid pnpm build` completo en la raíz. No hace falta e2e de la API (no hay cambios en api). Logs en el scratchpad, no en el repo. No modifiques archivos. Devuelve el INFORME del protocolo con APROBADO o CAMBIOS_PEDIDOS.
```

## Decisiones del orquestador

- Sin endpoints ni contratos nuevos. El grupo "Mis cursos" queda fuera para el admin y el apoderado (contrato 403).
- Los ítems de 44 px en móvil van solo en el grupo nuevo, sin tocar `ui/sidebar`.
- Contraste: se acepta el cálculo de dev1 (más de 4.5:1 en el tema oscuro).

## Verificación

| Comando | Resultado |
|---|---|
| pnpm lint, tsc de web | ok |
| web test | 31 archivos / 510 ok |
| `S3_PUBLIC_ORIGIN=… pnpm build` | 5/5 ok |

## Pendientes

- Probarlo en el navegador a 360 px y con teclado.
- `tareas/page.tsx` repite la petición a `/context`.
- Decisión futura: ¿el apoderado debe ver los cursos de su hijo?
- B3.

---

# Actualización: B3 (editar y eliminar tareas, descarga de PDF)

## Pedido

"Sí, sigue" (07/11/2026). Flujo completo. Rama `features/adolfo`, sobre `c55267f`.

## Resultado

- **Estudiante:** "Descargar mi PDF" en la constancia. Cada clic pide una URL firmada nueva, de 60 s.
- **Docente y admin:**
  - **Editar:** solo se envían los campos cambiados, sin período.
  - **Eliminar:** pide confirmación en un `<dialog>` nativo accesible.
  - Ambos solo aparecen con el período abierto.
- **Descarga del docente:** "Descargar" de la última versión en la tabla de entregas.
- **API:** `DELETE /assignments/:id` responde 409 también si la tarea tiene notas. docs/03 actualizado.

## Agentes que participaron

| # | Agente | Qué hizo | Estado |
|---|---|---|---|
| 1 | arquitecto-integrador | Plan | LISTO |
| 2 | dev3-contenidos | Implementación | LISTO |
| 3 | qa-tester | 25 tests | LISTO |
| 4 | seguridad-cumplimiento | Auditoría | APROBADO (1 MEDIO) |
| 5 | ux-accesibilidad | Revisión | CAMBIOS_PEDIDOS (3 ALTO) |
| 6 | dev3-contenidos | Corrección 1/2 | LISTO |
| 7 | revisor-pr | Revisión final | APROBADO |

## Prompts usados (literales)

### arquitecto-integrador — Plan de B3 PDF y edición de tareas

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (punto B3 del plan del orquestador).

Encargo: planifica B3 en la web: (1) descargar el PDF de una entrega (docente desde la revisión de entregas o el registro; estudiante su propia entrega) y (2) editar y borrar tareas desde la pantalla del curso (apps/web/app/(app)/curso/[id]/tareas/). Revisa qué endpoints ya existen en apps/api/src/modules (submissions, files, contents/assignments) y en docs/03_CONTRATOS.md para: URL firmada de descarga del PDF, PATCH y DELETE de tareas, y sus reglas en docs/04_REGLAS_ESTADOS.md (p. ej. no borrar ni cambiar ciertos campos si ya hay entregas o notas) y docs/05_AUTORIZACION.md.
Responde: endpoints existentes o faltantes (si falta algo o cambia un contrato, dilo), reglas de negocio aplicables, pantallas y componentes a tocar, agente dueño (dev3 para contenidos y entregas; dev4 si toca el registro) y orden sin archivos compartidos en paralelo, cambio de esquema (sí o no), RF afectados (RF-26..31, 33..40) y criterios de aceptación (confirmación antes de borrar, 360 px, accesibilidad, bitácora). Solo lectura. Devuelve el INFORME del protocolo.
```

### dev3-contenidos — B3 paso 1 tareas y PDF

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (INFORME 19 del arquitecto: es tu plan, paso 1). RF-29, RF-30, RF-33..36, RN-10, RN-14.

Encargo, solo en apps/web/app/(app)/curso/[id]/tareas/ (más sus tests):
a) actions.ts: server actions getSubmissionDownloadUrl(fileId) (valida UUID, POST /files/:id/download-url), updateAssignment(id, dto) (PATCH /assignments/:id, solo campos cambiados, sin período) y deleteAssignment(id) (DELETE). Errores 403/409/422 con el mensaje del API, como en _materials/actions.ts; revalidatePath al terminar.
b) receipt-view.tsx: botón "Descargar mi PDF" para el estudiante; pide URL nueva en cada clic (vence en 60 s), no la cachea ni la registra, y la abre.
c) edit-assignment-form.tsx reutilizando campos y validaciones de create-assignment-form.tsx y assignment-format.ts (puedes extraer un componente de campos común en la misma carpeta).
d) delete-assignment-button.tsx con diálogo de confirmación accesible (role="alertdialog", foco atrapado, Esc cancela, foco vuelve al botón, el texto nombra la tarea). Ante 409 muestra el aviso y sugiere editar.
e) page.tsx: Editar y Eliminar solo para TEACHER y ADMIN y solo con período abierto. Si en esta carpeta hay lista de entregas del docente, añade "Descargar" por versión.
Errores con role="alert". 360 px sin scroll horizontal, objetivos de 44 px, foco visible. Diálogo local en la carpeta (no packages/ui). No toques registro/ (es de dev4) ni el layout del curso.
Tests unitarios de helpers y formatos. Verifica con NODE_OPTIONS=--dns-result-order=ipv4first: lint, tsc, test de web y `S3_PUBLIC_ORIGIN=https://bucket.ci.invalid pnpm build`. Sin commit. Devuelve el INFORME del protocolo.
```

### qa-tester — QA de B3

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (INFORMES 19 y 20). Encargo: tests de B3 en apps/web/app/(app)/curso/[id]/tareas/ (actions.ts, assignment-format.ts, edit-assignment-form.tsx, delete-assignment-button.tsx, download-file-button.tsx, receipt-view.tsx, page.tsx). Cubre: updateAssignment envía solo campos cambiados y nunca periodId; plazo vencido sin tocar se puede guardar y plazo cambiado al pasado se rechaza; deleteAssignment con 204 ok, 409 → conflict con aviso que sugiere editar, 403/422 con el mensaje del API; getSubmissionDownloadUrl rechaza UUID inválido y URL no http(s), y pide URL nueva en cada llamada; Editar y Eliminar no aparecen para STUDENT ni con período cerrado. Simula el apiServer como en los tests existentes y sigue el patrón sin DOM del proyecto. Si Docker está arriba, confirma con e2e existentes de la API que assignment.updated/deleted y download-url.issued se registran (no hace falta crear e2e nuevos si ya existen). Solo archivos de test. Corre con NODE_OPTIONS=--dns-result-order=ipv4first test, lint y tsc de web. Devuelve el INFORME.
```

### seguridad-cumplimiento — Seguridad de B3

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (INFORMES 19 y 20). Audita B3 en apps/web/app/(app)/curso/[id]/tareas/ (actions.ts, assignment-format.ts, download-file-button.tsx, delete-assignment-button.tsx, edit-assignment-form.tsx, receipt-view.tsx, page.tsx) y los endpoints que usa: PATCH/DELETE /assignments/:id (apps/api/src/modules/contents) y POST /files/:id/download-url (apps/api/src/modules/files/files.service.ts). Revisa: que las server actions validan entrada y no confían en el cliente (rol, periodId, fileId), que la URL firmada no se cachea, registra ni filtra (window.open con noopener), que un estudiante solo descarga lo suyo y el apoderado no, pertenencia del docente al editar/borrar, mensajes de error sin detalles internos, y bitácora en el API. Solo lectura. Devuelve el INFORME con hallazgos por severidad.
```

### ux-accesibilidad — UX de B3

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (INFORMES 19 y 20). Revisa B3 en apps/web/app/(app)/curso/[id]/tareas/: edit-assignment-form.tsx, assignment-fields.tsx, delete-assignment-button.tsx (diálogo alertdialog), download-file-button.tsx, receipt-view.tsx y page.tsx (botones Editar/Eliminar y columna Archivo de la tabla del docente). Criterios: coherencia con shadcn/ui, 360 px sin scroll horizontal de página, objetivos de 44 px, foco visible, diálogo accesible (foco inicial, atrapado, Esc, retorno, fondo inert), errores con role="alert", etiquetas de botones que distinguen la tarea o versión para lectores de pantalla, estados de carga, contraste AA, textos en español claros. Solo lectura. Devuelve el INFORME con hallazgos por severidad.
```

### SendMessage → a013c98fa64dd48e0

```text
Corrección 1/2 de B3: aplica estos hallazgos de UX y seguridad (expediente, INFORMES 21 a 23).
UX ALTO:
1. download-file-button: window.open va después de un await y el móvil lo bloquea. Abre la ventana en blanco de forma síncrona en el clic (const w = window.open('', '_blank'); w.opener = null) y asigna w.location después; si falla o devuelve null, ciérrala y muestra "Tu navegador bloqueó la descarga. Permite las ventanas emergentes o inténtalo de nuevo.".
2. Diálogo de eliminar: fondo inerte. Usa el <dialog> nativo con showModal(), o el AlertDialog de packages/ui si ya existe (no lo crees allí). Bloquea también el scroll.
3. Mientras pending: ignora Esc y Cancelar. Tras borrar con éxito, mueve el foco al h2 "Tareas publicadas" (tabIndex=-1) y anuncia "Tarea eliminada" en aria-live.
UX MEDIO:
4. aria-label "Editar la tarea {título}" y "Eliminar la tarea {título}".
5. aria-label "Descargar versión N de la entrega de {nombre}", y en receipt-view "Descargar el PDF de la versión N".
6. Error de descarga: "No se pudo preparar la descarga. Inténtalo de nuevo en unos segundos."; el estado "Preparando…" en aria-live.
7. Revisa el contraste de text-white sobre bg-destructive y de text-destructive; corrige si es menor a 4.5:1.
8. El error de borrado se muestra dentro del diálogo, que sigue abierto, y nombra la tarea.
9. summary "Editar tarea" con chevron y focus-visible:ring (también los otros summary).
UX BAJO: 11 role="status" en "Cargando tareas…"; 12 trampa de foco genérica (si usas <dialog>, ya no hace falta). 10 solo si Button existe en packages/ui.
Seguridad:
- MEDIO-1: en apps/api/src/modules/contents/assignments.service.ts (DELETE), dentro de la transacción y antes del update, haz tx.grade.count({ where: { assignmentId: id } }); si es > 0, ConflictException "La tarea ya tiene notas y no se puede eliminar". Agrega unit test y un caso e2e en contents-assignments.e2e-spec.ts (Docker está arriba; NODE_OPTIONS=--dns-result-order=ipv4first). Si docs/03 lista los 409 de DELETE /assignments/:id, agrega este.
- BAJO-2: en createAssignment y updateAssignment valida el tipo de input/original (typeof de cada campo) o envuelve en try/catch y devuelve el Result con error.
Actualiza los tests de QA afectados (actions.test.ts, page.test.ts). Verifica: lint, tsc y test de web y de api, el e2e de contents-assignments, y `S3_PUBLIC_ORIGIN=https://bucket.ci.invalid pnpm build`. Sin commit. Devuelve el INFORME.
```

### revisor-pr — Revisor de B3

```text
Expediente: .claude/tareas/20261107-pendientes-dev1-3.md (INFORMES 19 a 24). Encargo: revisión final de B3 (RF-29, RF-30, RF-33..36, RN-10, RN-14), sin commit todavía: cambios en apps/web/app/(app)/curso/[id]/tareas/, apps/api/src/modules/contents/assignments.service.ts (+ .spec.ts nuevo), apps/api/test/contents-assignments.e2e-spec.ts y docs/03_CONTRATOS.md. Verifica definición de terminado, carpetas tocadas (Grade de Dev 4 solo se lee), que se aplicaron los hallazgos de UX (ALTO 1-3, MEDIO 4-9, BAJO 11-12) y de seguridad (MEDIO-1, BAJO-2), y corre con NODE_OPTIONS=--dns-result-order=ipv4first: pnpm lint, tsc de api y web, test de api y web, `S3_PUBLIC_ORIGIN=https://bucket.ci.invalid pnpm build` en la raíz y, si Docker está arriba, el e2e de contents-assignments, files y audit-tx-rollback. Logs en el scratchpad, no en el repo. No modifiques archivos. Devuelve el INFORME con APROBADO o CAMBIOS_PEDIDOS.
```

## Decisiones del orquestador

- Se omitió el paso 2 de dev4 (botón en el registro): el docente ya descarga desde la tabla de tareas y el registro tiene visor.
- El 409 por notas se hace en el API de contents (carpeta de dev3). `Grade` solo se lee.
- La descarga por versión y el uso del `Button` de ui quedan para v2.

## Verificación

| Comando | Resultado |
|---|---|
| lint, tsc api y web | ok |
| api test | 1244 ok |
| web test | 545 ok |
| build | 5/5 ok |
| e2e contents-assignments, files y audit-tx-rollback | 67 ok |

## Pendientes

- Probar en un móvil real la descarga y el diálogo.
- Manual de usuario: editar y eliminar tareas.
- Descarga por versión para el docente.
