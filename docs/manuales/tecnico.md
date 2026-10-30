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

**Seed (D-028).** Datos ficticios en `@colegio.example`: 2 años (2026 activo; 2025 inactivo y cerrado), 8 períodos, 7 secciones, 5 cursos, 30 curso-sección, 60 estudiantes (con un traslado, un retiro y un inactivo), 5 docentes, 2 apoderados y 1 admin. Es idempotente. No crea bitácora. Desde el 30/10/2026 crea una contraseña de prueba solo para el admin del seed (ver `prisma/seed/credentials.ts` y la sección de Dev 3); el resto de usuarios no tiene contraseña. Se niega con `NODE_ENV=production`, con `CI=true` y si el host de `DATABASE_URL` no es local (`localhost`, `127.0.0.1`, `::1` o `mysql`).

**Autenticación.** Todas las rutas piden sesión (401 sin ella). Para probar a mano: el admin del seed entra con su contraseña de prueba (`prisma/seed/credentials.ts`); los demás roles, con la sesión de desarrollo (`prisma/seed/dev-session.ts --email`). Los tests e2e crean su propia sesión con `SessionService`.

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

## Contenidos, archivos y entregas (Dev 3, RF-26..31, RF-33..40; RNF-03/18)

> **Estado: PROPUESTA.** Código en `apps/api/src/modules/{files,contents,submissions,storage}/` y pantallas en `apps/web/app/(app)/curso/[id]/{clases,lecturas,tareas}/`. Rama `features/adolfo`, sin PR al equipo. Contrato en `docs/03_CONTRATOS.md`, sección "API de contenidos, archivos y entregas". Decisiones D-039 a D-047 en `docs/08_DECISIONES.md`.

**Alcance.** Subida de PDF con validación (tamaño, cabecera, fin de archivo, cifrado y antivirus), almacenamiento privado con URL firmadas, tareas con plazo y nota NE, materiales con papelera de 30 días, entregas con versiones y constancia. Fuera: calificación (Dev 4), anuncios, purga y worker de escaneo (Dev 5).

**Qué exporta.** `FilesModule` reexporta `StorageModule` y `FileScanner`. `SubmissionsModule` exporta `SubmissionsReadService` (lectura para Dev 4). `ContentsModule` exporta `ContentsEventPublisher` y `AssignmentsService`.

### Variables de entorno

Solo los nombres. Los valores van en el `.env` local, que no se sube al repositorio. Los nombres salen de `.env.example`.

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `S3_ENDPOINT` | En producción | Endpoint de S3 o R2. En producción debe ser el endpoint público |
| `S3_REGION` | No | Región del bucket (en R2, `auto`) |
| `S3_BUCKET` | No | Bucket privado de archivos |
| `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY` | En producción | Credenciales del bucket. Se aceptan también `S3_ACCESS_KEY` y `S3_SECRET_KEY`. En local, `MINIO_ROOT_USER` y `MINIO_ROOT_PASSWORD` sirven de respaldo |
| `S3_FORCE_PATH_STYLE` | No | Estilo de ruta, necesario en MinIO |
| `S3_UPLOAD_URL_TTL_SECONDS` | No | Vigencia de la URL de subida (D-043) |
| `S3_DOWNLOAD_URL_TTL_SECONDS` | No | Vigencia de la URL de descarga (D-043) |
| `CLAMAV_HOST`, `CLAMAV_PORT` | No | Host y puerto de clamd |
| `CLAMAV_TIMEOUT_MS` | No | Tiempo máximo del escaneo de un archivo |

En producción, si faltan las credenciales de S3, la configuración de almacenamiento falla al cargarse.

### ClamAV en local

- Servicio `clamav` de `docker-compose.yml` (imagen `clamav/clamav:stable`). Espera a que el contenedor esté `healthy` antes de probar la subida: la base de firmas tarda en cargar.
- `CLAMD_CONF_StreamMaxLength: 64M`: por defecto, clamd solo acepta 25 MB por archivo y las entregas llegan a 50 MiB (RN-08). Un archivo que supere el límite de clamd responde 413 `FILE_TOO_LARGE`, no 503. Cambio autorizado por el usuario; pendiente de revisión de Dev 1.
- Medido en local con ClamAV real: un PDF de 30 MiB se escanea en 6,0 s y uno de 50 MiB en 7,1 s.

### Almacenamiento

- Bucket privado. Claves `{scope}/{año}/{mes}/{uuid}.pdf`, con scope `incoming`, `materials`, `assignments` o `submissions`. El nombre original del archivo nunca forma parte de la clave.
- La subida va primero a `incoming/` (cuarentena, D-046). Tras el escaneo, el objeto se copia a su destino solo si el ETag no ha cambiado.
- Pendiente de Dev 1 antes de producción: regla de ciclo de vida de 24 h para `incoming/` (huérfanos) y CORS del bucket en R2. En local no hizo falta CORS.

### Pruebas

| Comando | Qué prueba | Requiere |
| --- | --- | --- |
| `pnpm --filter api test` | Unitarios: reglas, inspección del PDF, escáner, servicio de archivos y de storage | Nada |
| `pnpm --filter api test:e2e` | e2e de archivos (`files.e2e-spec.ts`), tareas, materiales, entregas y la guarda de BD | MySQL con el seed, MinIO y ClamAV locales; sin `DATABASE_URL` se omiten |
| `pnpm --filter web test` | Lógica pura de las pantallas (validación, formato, comprobación del PDF) | Nada |

> **Aviso (guarda de BD).** Los e2e de tareas y entregas quitan el trigger de inmutabilidad de `SubmissionVersion` para borrar sus filas de prueba y lo reponen al terminar. Antes de cualquier DDL, `apps/api/test/db-test-guard.ts` exige `E2E_ALLOW_DDL=1`, la base local (`localhost`, `127.0.0.1`, `::1` o `mysql`), el nombre de base esperado (`aula_virtual` o `E2E_DB_NAME`), `NODE_ENV` distinto de `production` y CI apagado. Los dos e2e que hacen DDL (`contents-assignments` y `submissions`) fijan `E2E_ALLOW_DDL=1` con `??=`, así que esa variable confirma poco: la protección real son las demás condiciones. No ejecutar contra otra base.
>
> **Inmutabilidad (D-022).** El trigger solo protege si el usuario de la aplicación no tiene privilegios `TRIGGER` ni `DROP`.

### Seed y credencial de prueba

El seed (`pnpm db:seed`) usa una contraseña de prueba para el admin. Está en `prisma/seed/credentials.ts`. Solo vale en local: el seed se niega con `NODE_ENV=production` o `CI=true`. No la copies a ningún otro sitio ni la subas al equipo.

### Endpoints (resumen)

Todos bajo `/api/v1`. Cuerpos, respuestas y errores en `docs/03_CONTRATOS.md`.

| Recurso | Endpoints | Rol |
| --- | --- | --- |
| Archivos | `POST /files/upload-intents`, `POST /files/:id/complete`, `POST /files/:id/download-url` | ADMIN, TEACHER, STUDENT (apoderado 403) |
| Materiales | `GET` y `POST /course-sections/:id/materials`, `PATCH` y `DELETE /materials/:id`, `POST /materials/:id/restore` | Lectura: ADMIN, TEACHER, STUDENT. Escritura: ADMIN y docente asignado |
| Tareas | `GET` y `POST /course-sections/:id/assignments`, `GET`, `PATCH` y `DELETE /assignments/:id` | Lectura: ADMIN, TEACHER, STUDENT. Escritura: ADMIN y docente asignado |
| Entregas | `POST /assignments/:id/submissions`, `GET /assignments/:id/submissions/me`, `GET /assignments/:id/submissions`, `GET /submissions/:id/versions` | STUDENT, TEACHER asignado, ADMIN según la ruta |

**Errores.** Mismo formato que el resto de la API. Los códigos propios de archivos (`FILE_TOO_LARGE`, `INVALID_PDF`, `ENCRYPTED_PDF`, `FILE_INFECTED`, `UPLOAD_EXPIRED`, `UPLOAD_NOT_FOUND`, `OBJECT_CHANGED`, `DEADLINE_PASSED`, `ANTIVIRUS_UNAVAILABLE`, `STORAGE_UNAVAILABLE`) están en el contrato.

**Eventos.** `assignment.created.v1`, `assignment.updated.v1`, `material.published.v1`, `submission.accepted.v1` y `submission.rejected.v1` se publican en proceso (D-031), después del commit y de la bitácora. Si el proceso cae justo después del commit, el evento se pierde.

**Bitácora.** Módulos `contents`, `files` y `submissions`, después del commit (D-047). Sin `originalName`, textos ni firma del antivirus.

### Rutas de la web

| Ruta | Pantalla |
| --- | --- |
| `/curso/[id]/clases` | Clases (PDF) |
| `/curso/[id]/lecturas` | Lecturas, con aviso de copyright |
| `/curso/[id]/tareas` | Docente y ADMIN: crear tareas y ver entregas. Estudiante: entregar y ver la constancia. Apoderado: aviso |

La subida desde el navegador va directa a MinIO con la URL firmada. La prueba en un navegador real está pendiente.

### Pendientes

- Dev 1: ciclo de vida de `incoming/` y CORS de R2; revisión de `docker-compose.yml` (StreamMaxLength) y de `.env.example`.
- Dev 1: bitácora dentro de la transacción (D-047).
- Luchito: el README de `apps/api/src/modules/storage/` indica 120 s para la descarga; el código y D-043 usan 60 s.
- Dev 2: el apartado del seed (D-028) dice que no hay contraseñas de prueba; con `prisma/seed/credentials.ts` ya no es así. Revisar ese apartado.
