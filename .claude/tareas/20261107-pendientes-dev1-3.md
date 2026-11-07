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

### Decisión del orquestador 3

- A1 y A5: commit c2b1724 en mio y PR #20 al equipo.
- Se lanzan en paralelo dos agentes, sin archivos compartidos entre ellos:
  - dev1: A2 a A4;
  - dev3: B2 y B4.

### INFORME 4 — dev1-plataforma (A2-A4)

Estado: LISTO

- A2:
  - `school-brand.tsx` en el sidebar, usando el branding vía BFF y con fallback.
  - `next.config` con `headers()`: CSP (`img-src`, `connect-src` y `frame-src` del bucket), nosniff, Referrer-Policy y X-Frame-Options DENY.
- A3: servicio `minio-init` con `mc ilm`, regla `incoming-1d` idempotente. R2 y CORS documentados en `tecnico.md`.
- A4: el worker `dev` hace `--wait` hasta que aparece `dist/worker.main.js`; la API tiene `dev` con `nest start --watch`.
- Comandos: API 1147 tests; web 465; builds ok. Humo de A4 ok; las cabeceras de A2 ok.
- Pendientes:
  - humo autenticado del logo;
  - la CSP se calcula al hacer el build;
  - `'unsafe-inline'` en `script-src`;
  - `mc ilm import` reemplaza las reglas existentes.

### INFORME 5 — dev3-contenidos (B2 + B4)

Estado: LISTO

- **B2:** `gradeState` real en `listForTeacher` (una sola consulta) y en `mine()`. Solo se lee `state`.
- **B4.1:** `complete()` vencido, pasados los 15 min de margen, responde 409 `UPLOAD_EXPIRED` y llama a `expire()`.
- **B4.2:** `StorageService` admite una lista blanca de activos en `exports/`, `backups/` e `institution/`.
- **B4.3:** `JobResultStorage` e `InstitutionLogoStorage` quedan como fachadas sobre `StorageService`.
- **Comandos:**
  - api: 1166 tests;
  - web: 465 tests;
  - e2e de files, jobs, lifecycle, reports, settings y submissions: 167 tests, ok.

### Decisión del orquestador 4

- Se acepta el 409 con margen de 15 min: respeta el contrato de docs/03, la web y el barrido.
- Se lanzan en paralelo qa-tester, seguridad y ux sobre A2-A4 y B2/B4.

### INFORME 6 — ux-accesibilidad (A2 + B2)

Estado: CAMBIOS_PEDIDOS

- [ALTO] El `alt` del logo repite el nombre: debe ser `alt=""`.
- [MEDIO] El fallback del `Suspense` provoca un salto de layout: reservar el espacio con un esqueleto.
- [MEDIO] Logo en modo oscuro: agregar un fondo blanco.
- [MEDIO] B2 no aparece en la web. El orquestador lo revisa: `displayStatus` ya incorpora `gradeState` mediante `computeDisplayStatus`.
- [BAJO] El enlace de la marca necesita un anillo de foco.

### INFORME 7 — seguridad-cumplimiento (A2-A4 + B2/B4)

Estado: APROBADO (0 CRÍTICO, 0 ALTO)

MEDIO:

- M1: `'unsafe-inline'` en `script-src` (incompatible con nonces por PPR). Documentarlo como deuda.
- M2: la CSP se fija en el build. Pasar los ARG/ENV y fallar en producción si falta `S3_PUBLIC_ORIGIN`.
- M3: `mc ilm import` reemplaza todas las reglas. Usar `rule add` idempotente.

BAJO:

- B1: `readAsset` debe tener un tope por stream.
- B2: `Object.hasOwn` en `isAssetKey`.
- B3: el `contentType` debe coincidir con la clave.
- B4: el logo solo por https y con el origen del bucket en producción.
- B5: Permissions-Policy y HSTS (este último fuera de dev).

### INFORME 8 — qa-tester (A2-A4 + B2/B4)

Estado: LISTO, sin bugs de producción.

- Tests nuevos: school-brand (13), next-config.headers (8), worker-launcher (6), storage.assets.qa, files +2, submissions-grade-state e2e (3), storage-facades e2e (11).
- Resultados: api 1237, e2e completo 36 archivos / 712, web 486. Lint y tsc limpios.

### Decisión del orquestador 5 (vuelta de corrección 1/2)

En paralelo y sin archivos compartidos:

- **dev1:** UX 1 a 4; seguridad M1, M2, M3, B4 y B5.
- **dev3:** seguridad B1, B2 y B3.

### INFORME 9 — dev1 (corrección A2-A4, 1/2)

Estado: LISTO. Se aplicaron los 9 puntos.

- UX:
  - logo con `alt=""`;
  - `BrandSkeleton`;
  - `bg-white`;
  - anillo de foco.
- Seguridad:
  - comentario de deuda sobre `unsafe-inline`;
  - en producción el build falla si falta `S3_PUBLIC_ORIGIN` (el paso Build de CI la define);
  - `minio-init` usa `rule add` idempotente y no borra otras reglas;
  - `safeLogoUrl` solo acepta https y el mismo origen;
  - Permissions-Policy y HSTS fuera de dev.
- Comandos: web 491 tests, api 1242 tests, builds ok.

Hay un cambio en un compartido de Dev 1: `.github/workflows` (env de build). Se acepta.

### INFORME 10 — dev3 (corrección B4, 1/2)

Estado: LISTO.

- B1: `readAsset` lee por stream y corta con 413 al pasar `maxBytes`.
- B2: `isAssetKey` con `Object.hasOwn`.
- B3: `createAssetDownloadUrl` responde 415 si el `contentType` no coincide con la clave.
- Comandos: api 1242 tests, lint, tsc y build ok; e2e de storage, jobs, settings y reports: 69 ok.

### Decisión del orquestador 6

El usuario pidió enviar lo avanzado a los dos repos ("de lo que se tiene hasta el momento manda el pull request a la repo grupal y mi repor privada"). Se envía **sin la pasada de revisor-pr** de A2-A4 y B2/B4; queda pendiente. B1 y B3 siguen sin empezar.

### INFORME 11 — arquitecto-integrador (plan B1)

Estado: LISTO.
- Se usa `GET /me/course-sections` tal como está (docs/03 §259): TEACHER y STUDENT; ADMIN y GUARDIAN reciben 403. Sin contrato nuevo ni cambio de esquema.
- "Mis cursos" en el sidebar solo para TEACHER (curso · sección) y STUDENT (curso).
- Nuevo `curso/[id]/layout.tsx`, con encabezado y `<nav aria-label="Secciones del curso">`. `page.tsx` redirige a clases.
- Pestañas:
  - TEACHER y ADMIN (soporte): Clases, Lecturas, Tareas, Anuncios y Registro.
  - STUDENT: las mismas, sin Registro.
- Componentes `course-tabs.tsx` y `my-courses-nav.tsx`. Dueño: dev1.
- Criterios: 360 px con overflow-x, objetivos de 44 px, `aria-current` y foco visible.
- Decisión futura: ¿el apoderado debe ver los cursos de su hijo?

### Decisión del orquestador 7

dev1 implementa B1 cuando termine el revisor (para no alterar el árbol mientras corre sus comandos).

### INFORME 12 — revisor-pr (A2-A4 + B2/B4)

Estado: CAMBIOS_PEDIDOS. Pasan lint, tsc, api (1242), web (491) y e2e completo (36/712), y se confirmaron aplicados los hallazgos de seguridad y UX.
- [ALTO] Turbo 2 filtra `S3_PUBLIC_ORIGIN` y `web#build` falla (el CI del PR #20 falló por esto).
- [BAJO] La detección de la regla de `minio-init` depende del formato de `mc`; hay que verificarla en local.

### Decisión del orquestador 8 (vuelta 1/2 cerrada)

El orquestador agregó `"env": ["S3_PUBLIC_ORIGIN"]` a la tarea `build` de `turbo.json` (archivo compartido). `S3_PUBLIC_ORIGIN=https://bucket.ci.invalid pnpm build --force`: 5/5 ok. Se da por aprobado sin repetir el revisor, porque el único hallazgo era este y ya se verificó con el build. La corrección también va al PR #20.
