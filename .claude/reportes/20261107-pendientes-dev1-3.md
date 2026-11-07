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
