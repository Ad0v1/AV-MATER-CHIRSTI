# Manual técnico (RNF-32)

> Para desarrolladores. Cómo levantar, probar y consumir la API. Sin secretos: los valores reales van en el `.env` local, que no se sube al repositorio. Los nombres de variables salen de `.env.example (raíz del repositorio)`.

## Módulo académico (Dev 2, RF-09..14 y RF-17)

> **Estado: PROPUESTA.** Código en `apps/api/src/modules/academic/`, rama `features/adolfo`, aprobado por `revisor-pr` el 26/10/2026. Pendiente de la aceptación del dueño de Dev 2 y de D-021. Pantallas: fase 5.

**Alcance.** Años, períodos, secciones, cursos, curso-sección y asignación de docentes; cierre y reapertura de períodos con motivo; solo lectura de años (D-030); contexto del curso-sección y cursos del usuario. Fuera de esta fase: usuarios, matrículas y vínculos (F3), importación (F4), pantallas (F5) y clonación y promoción (F6).

**Qué exporta.** `AcademicModule` exporta `AcademicAccessService` (pertenencia y permisos para otros módulos) y `AcademicEventPublisher` (eventos en proceso). El contrato completo está en `docs/03_CONTRATOS.md`, sección "API académica".

### Variables de entorno

Esta fase no añade variables nuevas. El módulo usa `DATABASE_URL`, que ya existe en `.env.example (raíz del repositorio)`. El seed lee además `NODE_ENV` y `CI` para negarse a correr en producción o en CI.

### Levantar en local (Docker)

1. Copiar `.env.example` a `.env` y ajustar los valores. No subir `.env`.
2. Levantar MySQL: `docker compose up -d mysql`.
3. Generar el cliente de Prisma: `pnpm db:generate`.
4. Aplicar migraciones (solo local): `pnpm db:migrate`.
5. Cargar datos ficticios: `pnpm db:seed`.
6. Arrancar la API: `pnpm --filter api start:dev`. Las rutas cuelgan de `/api/v1` en el puerto `API_PORT`.

**Seed (D-028).** Datos ficticios en `@colegio.example`: 2 años (2026 activo; 2025 inactivo y cerrado), 8 períodos, 7 secciones, 5 cursos, 30 curso-sección, 60 estudiantes (con un traslado, un retiro y un inactivo), 5 docentes, 2 apoderados y 1 admin. Es idempotente. No crea credenciales ni bitácora, así que no hay contraseñas de prueba. Se niega con `NODE_ENV=production`, con `CI=true` y si el host de `DATABASE_URL` no es local (`localhost`, `127.0.0.1`, `::1` o `mysql`).

**Autenticación.** Todas las rutas piden sesión (401 sin ella). Como el seed no crea credenciales, para probar a mano hace falta un usuario con credencial local, según el flujo de autenticación de Dev 1. Los tests e2e crean su propia sesión con `SessionService`.

### Pruebas

| Comando | Qué prueba | Requiere |
| --- | --- | --- |
| `pnpm --filter api test` | Unitarios: reglas puras, servicio de acceso con Prisma simulado, concurrencia simulada, eventos | Nada |
| `pnpm --filter api test:e2e` | API contra MySQL: 401 y 403 por controlador, reglas de negocio, bitácora y eventos | `DATABASE_URL` local con el seed; sin ella se omiten |
| `pnpm --filter api lint` y `pnpm --filter api build` | Lint y compilación | Nada |

> **Aviso.** Los tests e2e modifican datos: crean años 2095..2099 y cursos "QA-F2 ..." y los borran al terminar; cambian el año activo y lo restauran. Ejecutarlos solo sobre la base local con el seed, nunca sobre datos reales.

### Endpoints (resumen)

Todos bajo `/api/v1`. Cuerpos, respuestas y errores completos en `docs/03_CONTRATOS.md`.

| Recurso | Endpoints | Rol |
| --- | --- | --- |
| Años | `GET /academic-years`, `POST /academic-years`, `GET /academic-years/:id`, `PATCH /academic-years/:id`, `POST /academic-years/:id/activate`, `POST /academic-years/:id/close` | ADMIN |
| Períodos | `PATCH /academic-periods/:id`, `POST /academic-periods/:id/close`, `POST /academic-periods/:id/reopen` | ADMIN |
| Secciones | `GET /academic-years/:yearId/sections`, `POST /academic-years/:yearId/sections`, `PATCH /sections/:id` | ADMIN |
| Cursos | `GET /courses`, `POST /courses`, `PATCH /courses/:id` | ADMIN |
| Curso-sección | `GET /sections/:sectionId/course-sections`, `POST /sections/:sectionId/course-sections`, `PATCH /course-sections/:id`, `PUT /course-sections/:id/teacher` | ADMIN |
| Contexto | `GET /course-sections/:id/context` | ADMIN, TEACHER, STUDENT, GUARDIAN (con pertenencia) |
| Mis cursos | `GET /me/course-sections` | TEACHER, STUDENT |

**Errores.** Formato común: `{ error: { code, message, details }, requestId }`. El `code` sale del status (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `BUSINESS_RULE_VIOLATION`). Los códigos propios están pendientes de Dev 1 (D-019).

**Eventos.** `period.closed.v1`, `period.reopened.v1` y `academic-year.closed.v1` se publican en proceso (D-031). Si el proceso cae justo después del commit, el evento se pierde: no hay reintentos todavía.

**Bitácora.** Cada escritura queda en la bitácora con `module: 'academic'` y acción `academic.<entidad>.<verbo>`, después del commit (D-019). Las lecturas no se registran.

## Módulo de usuarios (Dev 2, F3: RF-18, 19, 20, 22, 23, 24, 25; RN-13)

> **Estado: PROPUESTA.** Código en `apps/api/src/modules/users/`, rama `features/adolfo`, aprobado por `revisor-pr` el 26/10/2026. Sin commit ni PR; pendiente de la aceptación del dueño de Dev 2 y de D-021 (D-033). Pantallas: fase 5.

**Alcance.** Altas de estudiante con matrícula, docentes y apoderados; edición de nombre y correo; estados (`ACTIVE`, `INACTIVE`, `WITHDRAWN`) con bitácora; matrícula de estudiante existente, rematrícula y traslado; vínculos apoderado–estudiante revocables; búsqueda paginada. Fuera: importación (F4), pantallas (F5), clonación y promoción (F6) y RF-21.

**Qué exporta.** `UsersModule` no exporta nada. Importa `AcademicModule` para `AcademicAccessService` y los eventos. El cierre de matrículas al retirar y la publicación de `user.status-changed.v1` y `enrollment.transferred.v1` están en el mismo módulo (D-034). `getLinkedStudentIds` (módulo académico) ya excluye a los estudiantes `WITHDRAWN`: no volver a filtrar en otros módulos.

### Variables de entorno

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `INSTITUTION_EMAIL_DOMAIN` | No en local; **debe definirse en producción** (pedido a Dev 1, D-019) | Dominio de los correos de STUDENT, TEACHER y ADMIN (sin `@`). Si falta, no se valida el dominio y el log avisa al arrancar. No está todavía en el `.env.example`. |

La variable se lee en `institution-domain.ts` con `process.env`, no desde `config/env.ts`, porque ese archivo es de Dev 1.

### Cómo se prueba

1. Con MySQL local y el seed cargado (`pnpm db:seed`, ver la sección del módulo académico).
2. Unitarios, sin base de datos: `pnpm --filter api test` (reglas de `users-policy`, DTO, servicios con Prisma simulado y el guard).
3. Integración: `pnpm --filter api test:e2e` con `DATABASE_URL` local. El test fija el dominio con un override, así que no necesita `INSTITUTION_EMAIL_DOMAIN`. Crea usuarios `qa-f3-*@colegio.example`, un año y una sección de prueba, y los borra al final. Ejecutarlo solo sobre la base local con el seed.
4. Probar a mano: el módulo exige sesión de un ADMIN activo. Como el seed no crea credenciales, hace falta un ADMIN con credencial local según el flujo de Dev 1.

### Endpoints (resumen)

Todos bajo `/api/v1`, solo ADMIN activo. Cuerpos, respuestas y errores completos en `docs/03_CONTRATOS.md`, sección "API de usuarios".

| Recurso | Endpoints |
| --- | --- |
| Usuarios | `GET /users` (búsqueda y filtros, `pageSize` máximo 100, `page` máximo 1000), `GET /users/:id`, `PATCH /users/:id`, `PUT /users/:id/status` |
| Estudiantes | `POST /students`, `POST /students/:id/enrollments`, `POST /students/:id/transfer`, `GET /students/:id/enrollments`, `GET /students/:id/guardians` |
| Docentes | `POST /teachers` |
| Apoderados | `POST /guardians`, `GET /guardians/:id/students`, `POST /guardians/:id/students` |
| Vínculos | `POST /guardian-links/:id/revoke` |

**Errores.** Mismo formato que el módulo académico. Un deadlock de MySQL (1213) responde 409 para que el cliente reintente. Los motivos (`reason`) se guardan en la bitácora inmutable: no deben llevar datos personales, de salud ni familiares.

**Bitácora.** `module: 'users'`, acciones `users.user.*`, `users.enrollment.*` y `users.guardian_link.*`, después del commit. Solo ids, estados, motivos y nombres de campos cambiados (sin correos ni nombres). Un fallo de escritura se registra en el log (pendiente de Dev 1: `record(event, tx)`, D-019).

## Importación masiva (Dev 2, RF-21)

> **Estado: PROPUESTA.** Código en `apps/api/src/modules/users/import/`, rama `features/adolfo`, aprobado por `revisor-pr` el 27/10/2026 (INFORME 10). Sin commit ni PR. Pendiente: aceptación del dueño de Dev 2, D-021 y D-035. La pantalla es de la fase 5.

**Alcance.** Importar estudiantes (con matrícula en el año activo), docentes y apoderados (con vínculos) desde CSV o XLSX: plantilla, vista previa y confirmación. Solo ADMIN. Fuera: pantalla (F5) y clonación y promoción (F6). El contrato completo (códigos, mensajes y límites) está en `docs/03_CONTRATOS.md`, sección "Importación masiva (Dev 2, RF-21)".

**Dependencias.** `exceljs` **4.4.0** exacta en `apps/api/package.json` (ERS §6). El CSV no usa dependencias: tiene un parser propio. Las versiones de `multer` y `body-parser` están forzadas en la sección `overrides` de `pnpm-workspace.yaml` (D-036): no quitarlas hasta que `@nestjs/platform-express` las actualice.

### Variables de entorno

Ninguna nueva. La importación usa `INSTITUTION_EMAIL_DOMAIN`, ya descrita en la sección de usuarios: sin ella no se valida el dominio de los correos.

### Cómo usarla (API)

1. Descargar la plantilla: `GET /api/v1/users/import/template?type=students&format=csv`. `type`: `students`, `teachers` o `guardians`. `format`: `xlsx` o `csv`.
2. Vista previa: `POST /api/v1/users/import/preview` como `multipart/form-data`, con los campos `file` y `type`. Revisa `canConfirm` y `errors`. No escribe nada.
3. Confirmación: `POST /api/v1/users/import/commit` con el mismo archivo, el mismo `type` y el `sha256` de la vista previa. 201 si se creó todo; 422 si hay errores (no se escribe nada); 409 si el archivo no es el de la vista previa.

```bash
# Vista previa (sustituye <API_PORT> y la cookie de sesión de un ADMIN)
curl -s -X POST "http://localhost:<API_PORT>/api/v1/users/import/preview" \
  -H "Cookie: <sesión de ADMIN>" \
  -F "type=students" \
  -F "file=@./estudiantes.csv"
```

No subas al repositorio archivos reales con datos de alumnos.

### Límites (resumen)

1 MiB por archivo (413); 1000 filas de datos y 5000 filas físicas (400); 500 caracteres por celda; 500 errores como máximo en la respuesta; en XLSX, ZIP de 100 partes y 8 MiB descomprimidos, con 4 MiB por parte, y solo se lee la primera hoja. Tabla completa en `docs/03_CONTRATOS.md`. Peticiones: 10 por minuto a preview y a commit (429).

### Fricciones conocidas con archivos reales

> **Aviso.** Las pruebas usan archivos generados por código y la plantilla propia. **Todavía no se ha probado con un `.xlsx` guardado por Excel ni por LibreOffice reales.** Lo siguiente sale del código y de las pruebas:

- **CSV con codificación de Windows.** Si Excel guarda como "CSV (delimitado por comas)" (ANSI), la respuesta es 400 "Guarda el archivo como CSV UTF-8". Usar "CSV UTF-8 (delimitado por comas)".
- **Separador `;`.** Excel con configuración regional hispana usa `;`. Se acepta si la primera línea tiene más `;` que `,` fuera de comillas.
- **Ceros a la izquierda.** Excel guarda los números como números: un código de sección `01` se convierte en `1`. Escribe los códigos como texto o usa letras (p. ej. `A`).
- **Fechas y booleanos.** Excel convierte "1-3" o "3/4" en fecha: la celda da `INVALID_CELL`. Da formato de texto a la columna.
- **Fórmulas.** Dan `FORMULA_NOT_ALLOWED`. Pega como valores (Pegado especial, Valores).
- **Hipervínculos.** Excel los crea al escribir correos. Se toma el texto, así que no falla.
- **Formato en columnas o filas completas.** Excel guarda el formato de columna como `<col max="16384">` y cada fila con formato como `<row>`. Formato de columna completa en 4 o más hojas, más de 5000 filas con formato o más de 100 columnas usadas en 5000 filas dan 400. Solución: borra el formato de las filas y columnas vacías, o copia solo los datos a un libro nuevo.
- **Validación de datos sobre columna entera** y **nombres definidos con fórmulas**: 400, por el tope de 50 000 celdas de rango.
- **Varias hojas.** Solo se lee la primera. Las demás cuentan para el límite de 50 hojas.
- **Formatos no admitidos.** `.xls`, `.xlsm`, `.ods` y un Excel con contraseña dan 415. Guárdalo como `.xlsx`, sin macros ni contraseña.
- **Nombres de partes no ASCII** dentro del `.xlsx`: 400 "El archivo está dañado o no es un Excel válido".
- **Más de 500 errores.** La respuesta trae `errorsTruncated: true`: corrige y repite la vista previa.
- **Después de corregir, repite la vista previa.** El SHA-256 cambia con cualquier byte; un commit con el archivo anterior da 409.

### Cómo se prueba

| Comando | Qué prueba | Requiere |
| --- | --- | --- |
| `pnpm --filter api test` | Unitarios: parser CSV, guard y lector XLSX, validador (los 21 códigos), escape CSV, `uuidv7`, plantillas, servicio con Prisma simulado y controlador | Nada |
| `pnpm --filter api test:e2e` | `apps/api/test/users-import.e2e-spec.ts`: 401 y 403, plantillas, preview y commit de los 3 tipos, códigos, límites, archivos hostiles, 422, 409, concurrencia, 429 y bitácora | `DATABASE_URL` local con el seed; sin ella se omite |
| `pnpm --filter api lint` y `pnpm --filter api build` | Lint y compilación | Nada |

> **Aviso.** El e2e crea usuarios `qa-f4-*@colegio.example` en 3A y 3B del año 2026, con una sección de prueba que borra al final, y los elimina al terminar. Ejecútalo solo sobre la base local con el seed, nunca sobre datos reales.

- Los casos de 409 por año inactivo o cerrado están solo en los tests unitarios.
- Tras reiniciar MySQL, las pruebas e2e pueden fallar con `45028` / `ER_CANNOT_RETRIEVE_RSA_KEY`. Ver D-036.

## Pantallas de administración (Dev 2, F5: RF-09..14 y RF-17..25)

> **Estado: PROPUESTA.** Código en `apps/web/app/(app)/admin/`, rama `features/adolfo`. Estructura, usuarios e importación aprobadas por `revisor-pr` (INFORMES 9, 17 y 24). Commits en el repo privado; sin PR al equipo. Decisión: D-037 en `docs/08_DECISIONES.md`.

**Cómo funciona.** La web llama a la API desde el servidor (Server Components y Server Actions) y reenvía solo la cookie `aula_sid`. La web no decide permisos: la API autoriza cada petición. El login real es de Dev 1; hasta entonces, la sesión se crea con un script local.

### Variables de entorno

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `API_INTERNAL_URL` | No; por defecto `http://localhost:4000` | URL con la que el servidor de Next llama a la API, con el puerto. Solo del lado del servidor: no usar el prefijo `NEXT_PUBLIC_`. Pendiente: añadirla a `.env.example` con el visto bueno del usuario. |

### Levantar en local

1. Servicios: `docker compose up -d` (MySQL y Redis). La primera vez: `pnpm db:generate`, `pnpm db:migrate` y `pnpm db:seed`.
2. API: `pnpm --filter api start:dev` (puerto `API_PORT`).
3. Web: `pnpm --filter web dev`, en `http://localhost:3000`.
4. Sesión local, desde la raíz del repositorio:

```bash
pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed/dev-session.ts [--email <correo>]
```

Sin `--email` crea la sesión del ADMIN del seed. El script imprime el token y las instrucciones.

5. Cookie: en DevTools, Application > Cookies > `http://localhost:3000`, crea una cookie con nombre `aula_sid`, valor el token y ruta `/`. Recarga la página.

**Reglas del script.** Es solo para local y temporal: se borra cuando haya login (RF-01..07).

- Se niega con `NODE_ENV=production`, con `CI=true`, y si `DATABASE_URL` o `REDIS_URL` no apuntan a un servicio local (`localhost`, `127.0.0.1`, `::1`, o los servicios `mysql` y `redis` del `docker compose`).
- Solo acepta correos del seed (`@colegio.example`) de usuarios `ACTIVE`.
- El token es una credencial: no lo compartas ni lo subas al repositorio.

### Problemas frecuentes en local

- **`localhost` no llega a Docker (Windows con WSL).** Si `localhost` resuelve a `[::1]` y WSL escucha allí, la API, la web o el script no llegan a MySQL ni a Redis. Compruébalo con `netstat -ano`. Solución: arranca los procesos con `--dns-result-order=ipv4first`, para que `localhost` resuelva a `127.0.0.1`, donde escucha Docker. En PowerShell: `$env:NODE_OPTIONS="--dns-result-order=ipv4first"` antes de cada comando.
- **Error `45028` / `ER_CANNOT_RETRIEVE_RSA_KEY`.** MySQL acaba de arrancar y la caché de `caching_sha2_password` está vacía. Espera unos segundos y repite el comando (la primera conexión la calienta). Si vuelve a pasar, ver D-036.

### Rutas de la web

| Ruta | Pantalla |
| --- | --- |
| `/admin/estructura` | Años |
| `/admin/estructura/anios/nuevo` | Alta de año |
| `/admin/estructura/anios/[anioId]` | Año, períodos y secciones |
| `/admin/estructura/anios/[anioId]/secciones/[seccionId]` | Sección, curso-sección y docente |
| `/admin/estructura/cursos` | Cursos |
| `/admin/usuarios` | Lista, filtros, búsqueda y paginación |
| `/admin/usuarios/nuevo/estudiante`, `/docente`, `/apoderado` | Altas |
| `/admin/usuarios/[id]` | Ficha: edición, estado, matrícula, traslado, apoderados y vínculos |
| `/admin/usuarios/importar` | Importación (plantilla, vista previa y confirmación) |
| `/admin/usuarios/importar/archivo/{plantilla\|preview\|commit}` | Ruta puente hacia la API de importación (D-037) |

Los endpoints que usan estas pantallas están en las secciones de la API académica, de usuarios e importación de este manual y en `docs/03_CONTRATOS.md`.

### Pruebas

| Comando | Qué prueba | Requiere |
| --- | --- | --- |
| `pnpm --filter web test` | Vitest: lógica pura de las pantallas (errores, validaciones, máquina de la importación, guardas de la ruta puente) y `prisma/seed/local-guard` | Nada |
| `pnpm --filter web lint` y `pnpm --filter web build` | Lint y compilación | Nada |

> **Pendiente.** Prueba manual en navegador (360 px, teclado y lector de pantalla) y Playwright con axe. Las pruebas con sesión necesitan la base local con el seed: verificar en local con Docker.

## Clonación y promoción de años (Dev 2, F6: RF-15, RF-16; RN-15)

> **Estado: PROPUESTA.** Código en `apps/api/src/modules/academic/` (clonación) y `apps/api/src/modules/users/promotion/` (promoción); pantallas en `apps/web/app/(app)/admin/estructura/`. Rama `features/adolfo`, sin commit ni PR. Contrato en `docs/03_CONTRATOS.md` (sección "API de clonación y promoción de años"), regla RN-15 en `docs/04_REGLAS_ESTADOS.md` y decisión D-038. Las menciones "fuera de esta fase" de las secciones anteriores de este manual ya no aplican.

**Alcance.** Copiar la estructura (secciones y curso-sección) de un año anterior a un año destino vacío, y promover a los estudiantes al año siguiente con propuesta, corrección y confirmación. No copia períodos, matrículas ni contenidos.

### Variables de entorno

Ninguna nueva.

### Rutas de la web

| Ruta | Pantalla |
| --- | --- |
| `/admin/estructura/anios/[anioId]/clonar` | Copiar la estructura de un año anterior (RF-15) |
| `/admin/estructura/anios/[anioId]/promocion` | Propuesta de promoción, corrección y confirmación (RF-16) |

Los dos enlaces salen de la ficha del año destino (`anios/[anioId]/page.tsx`).

### Precondiciones

- **Clonar.** El año destino se crea antes con RF-09 (con sus cuatro períodos) y debe estar vacío (sin secciones), sin cerrar y sin ser de solo lectura. El origen debe ser anterior y tener al menos una sección activa. El enlace solo aparece si el año no tiene secciones y no es de solo lectura.
- **Promover.** El origen debe tener sus cuatro períodos cerrados (puede estar cerrado). El destino debe ser el año siguiente (`año origen + 1`), sin cerrar, no de solo lectura y con al menos una sección activa. La pantalla toma como origen el año inmediatamente anterior y avisa si no existe.
- Permisos: solo ADMIN activo. La web no decide permisos; la API responde 403.

### Cómo llama la web a la API

- La propuesta se lee en un Server Component (`getPromotionProposal` en `estructura/_lib/data.ts`). La confirmación es la Server Action `promotionCommitAction` (`estructura/_lib/actions.ts`), con 30 s de tiempo máximo (`PROMOTION_TIMEOUT_MS`), porque la transacción de la API puede tardar hasta 25 s. La copia usa `cloneStructureAction`.
- `apps/web/lib/api/server.ts` admite `timeoutMs` por petición (solo en `post`): 15 s por defecto y 60 s como máximo (`resolveTimeoutMs`). Ver D-037.

### Límite del cuerpo y 413 (nota de plataforma)

- El límite del cuerpo JSON sube de 100 KB a **512 KB** (`JSON_BODY_LIMIT` en `apps/api/src/app.setup.ts`). Un cuerpo mayor responde **413** `PAYLOAD_TOO_LARGE` (filtro `apps/api/src/common/errors/api-exception.filter.ts`) en vez de 500.
- **Archivos de Dev 1 cambiados con autorización del usuario (29/10/2026):** `apps/api/src/app.setup.ts` y `apps/api/src/common/errors/api-exception.filter.ts`. **Pendientes de revisión de Dev 1 (David).** Sus comentarios lo indican.
- Pendiente de Dev 1: un JSON mal formado sigue respondiendo 500.

### Endpoints (resumen)

Todos bajo `/api/v1`, solo ADMIN activo (`ActiveActorGuard`). `:id` es el año destino. Cuerpos, respuestas y errores completos en `docs/03_CONTRATOS.md`.

| Método y ruta | Uso |
| --- | --- |
| `POST /academic-years/:id/clone-structure` | Copiar la estructura desde `sourceYearId` (RF-15) |
| `GET /academic-years/:id/promotion-proposal?sourceYearId=` | Propuesta de promoción, sin estado ni bitácora (RF-16) |
| `POST /academic-years/:id/promotion` | Confirmar la promoción, todo o nada, con la huella (RF-16, RN-15) |

### Pruebas

| Comando | Qué prueba | Requiere |
| --- | --- | --- |
| `pnpm --filter api test:e2e` (`academic-clone.e2e-spec.ts`, `users-promotion.e2e-spec.ts`) | Clonación, propuesta, confirmación, tandas, huella 409, confirmaciones en paralelo, bitácora sin nombres | `DATABASE_URL` local con el seed; sin ella se omiten |
| `pnpm --filter web test` (`clone.test.ts`, `promotion-machine.test.ts`, `promotion-a11y.test.ts`, `timeout.test.ts`) | Lógica pura de las pantallas y del timeout | Nada |

> **Aviso.** Los e2e crean y borran datos de prueba: ejecutarlos solo sobre la base local con el seed. Si MySQL acaba de arrancar, ver "Problemas frecuentes en local".

**Pendiente.** Prueba manual en navegador y verificar los e2e en local con Docker.
