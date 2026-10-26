# Manual técnico (RNF-32)

> Para desarrolladores. Cómo levantar, probar y consumir la API. Sin secretos: los valores reales van en el `.env` local, que no se sube al repositorio. Los nombres de variables salen de `apps/api/.env.example`.

## Módulo académico (Dev 2, RF-09..14 y RF-17)

> **Estado: PROPUESTA.** Código en `apps/api/src/modules/academic/`, rama `features/adolfo`, aprobado por `revisor-pr` el 26/10/2026. Pendiente de la aceptación del dueño de Dev 2 y de D-021. Pantallas: fase 5.

**Alcance.** Años, períodos, secciones, cursos, curso-sección y asignación de docentes; cierre y reapertura de períodos con motivo; solo lectura de años (D-030); contexto del curso-sección y cursos del usuario. Fuera de esta fase: usuarios, matrículas y vínculos (F3), importación (F4), pantallas (F5) y clonación y promoción (F6).

**Qué exporta.** `AcademicModule` exporta `AcademicAccessService` (pertenencia y permisos para otros módulos) y `AcademicEventPublisher` (eventos en proceso). El contrato completo está en `docs/03_CONTRATOS.md`, sección "API académica".

### Variables de entorno

Esta fase no añade variables nuevas. El módulo usa `DATABASE_URL`, que ya existe en `apps/api/.env.example`. El seed lee además `NODE_ENV` y `CI` para negarse a correr en producción o en CI.

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
