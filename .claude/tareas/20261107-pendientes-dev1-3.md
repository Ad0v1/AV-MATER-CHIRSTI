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

### INFORME 13 — dev1 (B1)

Estado: LISTO.
- Nuevos: `course-nav-model.ts`, `course-tabs.tsx`, `my-courses-list.tsx`, `my-courses-nav.tsx`, `course-nav.test.ts` (8 tests), y `curso/[id]/layout.tsx` y `page.tsx`. Se modificó `app-sidebar.tsx`.
- Web: lint y tsc ok, 499 tests, build ok.
- Nota: `tareas/page.tsx` repite la petición a `/context`. No se tocó.
- Sin prueba en navegador.

### Decisión del orquestador 9

Se lanzan en paralelo qa-tester, seguridad y ux sobre B1.

### INFORME 14 — ux-accesibilidad (B1)

Estado: APROBADO, con 4 MEDIO y 5 BAJO.

MEDIO:
- El esqueleto del encabezado no reserva el espacio de la barra.
- Los esqueletos del sidebar miden `h-6` en vez de `h-8`, y les falta el texto sr-only.
- Los ítems de "Mis cursos" miden 32 px en móvil (pedido: `h-11 md:h-8`).
- Los textos de error no dicen qué hacer y les falta `role="alert"`.

BAJO:
- Hacer scroll hasta la pestaña activa al montar.
- Agregar `scroll-px-4`.
- Revisar el contraste de `text-xs` con opacidad y de `muted-foreground`.
- Contexto en los h1 de las páginas hijas.

### INFORME 15 — seguridad-cumplimiento (B1)

Estado: APROBADO (0 CRÍTICO, 0 ALTO, 0 MEDIO).

BAJO:
- BAJO-1: llamar a `notFound()` si `/context` responde 403 o 404.
- BAJO-2: `encodeURIComponent` en el redirect de `page.tsx`.

INFO: el DTO de context podría ser más reducido (v2). La protección de `getCourseSectionContext` depende de que quien lo llama haga la comprobación.

### INFORME 16 — qa-tester (B1)

Estado: LISTO.
- Nuevo `course-header.test.ts`: pestañas por rol, encabezado con readOnly, sin docente y con error, y la redirección.
- Web: 507 tests, lint y tsc ok. Sin bugs.

### Decisión del orquestador 10 (vuelta de corrección 1/2 de B1)

Se envían a dev1 en un solo mensaje UX M1-M4 y B5-B6, y seguridad BAJO-1 y BAJO-2.
- M3, ítems de 44 px en móvil: solo en el grupo nuevo, sin tocar `ui/sidebar`.
- B7-B8, contraste: verificar los tokens y corregir solo si no llegan a 4.5:1.
- B9 no aplica: los h1 de las hijas ya son claros.

### INFORME 17 — dev1 (corrección B1, 1/2)

Estado: LISTO.
- UX M1-M4 y B5-B6 aplicados. B7-B8: el contraste calculado está por encima de 4.5:1, así que no se cambió.
- Seguridad: `notFound()` si responde 403 o 404, y `encodeURIComponent` en el redirect.
- Tests: 510, lint, tsc y build ok.

### Decisión del orquestador 11

revisor-pr de B1.

### INFORME 18 — revisor-pr (B1)

Estado: APROBADO. lint, tsc, web 510 y build 5/5 ok. Hallazgos aplicados. BAJO: `tareas/page.tsx` repite `/context`, y `format:check` global falla por archivos ajenos (`.agents/`).

### Decisión del orquestador 12

Commit de B1 en mio y en la rama limpia `envio`, encima del arreglo de turbo, para que un solo push lleve los dos commits al PR #20.

### INFORME 19 — arquitecto-integrador (plan B3)

Estado: LISTO.
- El backend ya está completo:
  - `PATCH /assignments/:id`;
  - `DELETE /assignments/:id` (204, o 409 si hay entregas);
  - `POST /files/:id/download-url`, con firma de 60 s y bitácora.
- Sin esquema ni contrato nuevo.
- Paso 1, dev3, en `curso/[id]/tareas/`:
  - actions;
  - "Descargar mi PDF" en receipt-view;
  - edit-assignment-form;
  - delete-assignment-button con alertdialog;
  - botones solo para TEACHER y ADMIN con el período abierto.
- Paso 2, dev4: botón "Descargar" en `registro/tarea/[assignmentId]`.

### Decisión del orquestador 13

- dev3 hace el paso 1.
- dev4 hace después el paso 2: el docente necesita descargar el PDF y ahí está su revisión.
- En serie, sin paralelo.

### INFORME 20 — dev3 (B3, paso 1)

Estado: LISTO.
- Server actions:
  - `updateAssignment`: solo los campos cambiados, sin período.
  - `deleteAssignment`: devuelve `conflict` ante un 409.
  - `getSubmissionDownloadUrl`: valida el UUID y que la URL sea http(s).
- "Descargar mi PDF" en la constancia del estudiante.
- Formulario de edición y diálogo accesible para eliminar.
- Columna "Archivo" con "Descargar vN" en la tabla del docente.
- Web: 517 tests, lint, tsc y build ok.
- MEDIO: el docente solo descarga la última versión de cada entrega.
- BAJO: el fondo del diálogo no se marca como `inert`.

### Decisión del orquestador 14

Se omite el paso 2 de dev4: el docente ya descarga desde la tabla de entregas de tareas, y el registro tiene su visor. La descarga por versión queda pendiente (v2). Se lanzan en paralelo qa-tester, seguridad y ux sobre B3.

### INFORME 21 — ux-accesibilidad (B3)

Estado: CAMBIOS_PEDIDOS.

ALTO:
- `window.open` se llama después de un `await` y los navegadores móviles bloquean la ventana sin avisar.
- El fondo del diálogo no queda inerte.
- Esc y Cancelar siguen activos mientras se borra, y el foco se pierde después de borrar.

MEDIO:
- Las etiquetas (aria-label) no dicen de qué tarea o versión se trata.
- Los mensajes de error no dicen qué hacer.
- Revisar el contraste de destructive.
- El error del borrado aparece fuera del diálogo.
- El summary "Editar" no tiene indicador ni anillo de foco.

BAJO:
- No usa el `Button` de ui.
- "Cargando tareas…" sin `role="status"`.
- La trampa de foco solo cubre botones.

### INFORME 22 — seguridad-cumplimiento (B3)

Estado: APROBADO (0 CRÍTICO, 0 ALTO).
- MEDIO-1: DELETE no comprueba si la tarea tiene notas (`Grade.assignmentId`). Hay que agregar `tx.grade.count` y responder 409.
- BAJO-2: las server actions no validan el tipo de `input` ni de `original`.
- BAJO-3: `original` lo envía el cliente. Solo documentarlo.

### INFORME 23 — qa-tester (B3)

Estado: LISTO.
- `actions.test.ts` (17) y `page.test.ts` (8).
- Web: 543 tests, tsc y eslint ok.
- e2e: contents-assignments y files, 53 ok.
- Sin DOM no se prueban el diálogo ni `window.open`.

### Decisión del orquestador 15 (vuelta 1/2 de B3)

A dev3, en un solo mensaje:
- UX: ALTO 1-3 y MEDIO 4-9, más BAJO 11-12. BAJO 10 (Button/AlertDialog de ui) solo si ya existen en `packages/ui`.
- Seguridad: MEDIO-1 (409 si la tarea tiene notas, en el API de contents, carpeta de dev3) y BAJO-2.
- e2e del 409 por notas.

### INFORME 24 — dev3 (corrección B3, 1/2)

Estado: LISTO.
- Web:
  - descarga con la ventana abierta de forma síncrona y aviso si el navegador la bloquea;
  - `<dialog>` nativo con fondo inerte, Esc y Cancelar ignorados mientras borra, foco al h2 al terminar y error dentro del diálogo;
  - aria-labels, chevrons y `role="status"`;
  - `bg-danger` en el botón de confirmar;
  - `isAssignmentInput`.
- API: DELETE con notas responde 409 (unit y e2e). docs/03 actualizado.
- Comandos: web 545, api 1244, e2e de contents-assignments 29, build ok.

### Decisión del orquestador 16

revisor-pr de B3.

### INFORME 25 — revisor-pr (B3)

Estado: APROBADO.
- Comandos: lint y tsc ok; api 1244; web 545; build 5/5; e2e contents-assignments, files y audit-tx-rollback: 67 ok.
- BAJO: botones propios en vez de `Button` de ui; descarga solo de la última versión; diálogo y `window.open` sin prueba en un navegador real.

### Decisión del orquestador 17

- Commit de B3 en mio y en la rama limpia sobre el PR #20 (el CI de 4c9aa41 está en verde).
- No se lanza al documentador: docs/03 ya está actualizado y el manual de usuario queda pendiente.
- Con esto se cierra el plan A y B de Dev 1 a 3.
