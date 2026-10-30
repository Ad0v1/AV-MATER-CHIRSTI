# Reporte — Dev 3: contenidos, entregas y almacenamiento (RF-26..31, RF-33..40, RNF-03/18)

## Pedido

- **Usuario:** "avanza con lo del dev 3" (29/10/2026) y, tras una pausa ("deten todo, hasta el momento") para las capturas del informe RSU, "continua de lo que faltaba hacer el Dev 3" (30/10/2026).
- **Durante la tarea:** merge del storage de luchito ("Merge de su rama (Recomendado)"); aprobación de las reglas del plan ("Sí, todas") y de los archivos compartidos ("Sí, autorizo"); pantallas de materiales para el Anexo 07; contraseña de prueba del admin ("mejor crea credenciales de prueba para los distintos roles").
- **Flujo:** completo · **Vueltas de corrección:** 1/2 · **Rama:** `features/adolfo` · **Commits:** `9f2a99d` (merge luchito), `ee749b6` (merge develop), `0f16ae8` (Dev 3 parcial) y el commit final de esta tarea (subido solo a `mio`).
- **Aviso:** Dev 3 es de Christian. Una versión limpia (sin `.claude/`) ya se subió al equipo como `features/adolfo` (`035d57e`) por pedido del usuario.

## Resultado

- **Esquema** (`contents.prisma`): StoredFile, Material, Assignment, Submission y SubmissionVersion (historial inmutable con triggers), 7 CHECK.
- **Archivos:** subida directa a MinIO con URL firmada, cuarentena `incoming/` contra TOCTOU, validación de PDF real, tamaño, **ClamAV** (hasta 64 MB), descarga firmada de 60 s solo para miembros.
- **Tareas, materiales (papelera de 30 días) y entregas** (reentregas, tardías, constancia, lista del docente) con permisos por pertenencia, bitácora sin datos personales y eventos para Dev 5.
- **Contrato para Dev 4:** `SubmissionsReadService` y `computeDisplayStatus`.
- **Pantallas:** `/curso/[id]/clases`, `/lecturas` y `/tareas` (docente y estudiante), accesibles desde 360 px.
- **Tests:** API 571 unitarios y 398 e2e; web 297.
- **Documentación:** docs/02, 03, 08 (D-039..D-047), 10, manual técnico y manuales de administrador, docente, estudiante y apoderado.

## Agentes que participaron

| Agente                     | Modelo | Qué hizo                                                         | Estado           |
| -------------------------- | ------ | ---------------------------------------------------------------- | ---------------- |
| arquitecto-integrador      | Opus   | Plan en 6 fases (3a..3f)                                         | LISTO            |
| modelador-bd               | Opus   | Esquema, migración con CHECK y triggers                          | LISTO            |
| dev3-contenidos (3b)       | Opus   | Archivos, antivirus, cuarentena; luego correcciones de seguridad | LISTO            |
| dev3-contenidos (3c/3e/3d) | Opus   | Tareas, materiales, entregas (se detuvo por el usuario)          | LISTO / detenido |
| dev3-contenidos (nuevo)    | Opus   | Cierre de la 3d, 3f pantallas, seguridad y vuelta de UX          | LISTO            |
| qa-tester ×4               | Sonnet | 3c+3e, 3b, 3d                                                    | LISTO            |
| seguridad-cumplimiento ×3  | Sonnet | 3c+3e, 3b, 3d                                                    | APROBADO         |
| ux-accesibilidad ×2        | Sonnet | Pantallas (CAMBIOS_PEDIDOS) y verificación                       | APROBADO         |
| revisor-pr                 | Sonnet | Revisión final                                                   | APROBADO         |
| documentador               | Sonnet | Documentación de Dev 3                                           | LISTO            |

## Prompts usados

Extraídos literalmente del registro de la sesión, en orden.

### 1. arquitecto-integrador — Plan de Dev 3

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (lee el Contexto).

Encargo: plan concreto y ACOTADO de Dev 3 (RF-26..31, RF-33..40, RNF-03/18: materiales, tareas, entregas PDF, reentregas, entregas tardías, MinIO con URLs firmadas, ClamAV). Sé rápido: lee solo lo necesario (docs/00, 02, 03, 04, 05, 08 y 10 en lo que toque a Dev 3; .claude/agents/dev3-contenidos.md; prisma/schema/academic.prisma; apps/api/src/modules/academic/ para AcademicAccessService). El código del PR #3 de luchito no está en esta rama; asume su interfaz por su README si aparece en docs, o por esto: módulo `apps/api/src/modules/storage/` con StorageService (URLs firmadas de subida/descarga, claves de objeto, config S3_*).

Entrega en el INFORME del protocolo:
1. Lista de RF de Dev 3 con lo que pide cada uno (de la ERS o los docs).
2. Modelo de datos: Material, Assignment, Submission, SubmissionVersion, StoredFile (campos, FKs a CourseSection/User/AcademicPeriod, marcadores TRUE/NULL, CHECK, índices) según las convenciones del proyecto; si hace falta modelador-bd.
3. Fases de Dev 3 (3a, 3b, …) con alcance, endpoints, pantallas, tests y criterio de terminado, tamaño S/M/L, y cuáles pueden ir en paralelo (por ejemplo, API de una fase mientras se revisa la anterior). Recomienda empezar por lo que destraba a Dev 4 (entregas para calificar) y a Dev 5 (eventos).
4. Cómo integrar el storage de luchito (traer su rama/PR a features/adolfo vs. reimplementar) y archivos compartidos que hará falta tocar (package.json, lockfile, app.module, docker-compose, .env.example) con autorización.
5. Eventos que Dev 3 debe emitir para Dev 5 (node:events, D-031) y contrato que Dev 4 consumirá para calificar.
6. Decisiones que el usuario debe tomar (máximo 4, con recomendación) y lo que queda fuera de v1.

Conciso: tablas y listas. Para: el siguiente agente.
```

### 2. arquitecto-integrador — Plan de Dev 3

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (lee el Contexto).

Encargo: plan concreto y ACOTADO de Dev 3 (RF-26..31, RF-33..40, RNF-03/18: materiales, tareas, entregas PDF, reentregas, entregas tardías, MinIO con URLs firmadas, ClamAV). Sé rápido: lee solo lo necesario (docs/00, 02, 03, 04, 05, 08 y 10 en lo que toque a Dev 3; .claude/agents/dev3-contenidos.md; prisma/schema/academic.prisma; apps/api/src/modules/academic/ para AcademicAccessService). El código del PR #3 de luchito no está en esta rama; asume su interfaz por su README si aparece en docs, o por esto: módulo `apps/api/src/modules/storage/` con StorageService (URLs firmadas de subida/descarga, claves de objeto, config S3_*).

Entrega en el INFORME del protocolo:
1. Lista de RF de Dev 3 con lo que pide cada uno (de la ERS o los docs).
2. Modelo de datos: Material, Assignment, Submission, SubmissionVersion, StoredFile (campos, FKs a CourseSection/User/AcademicPeriod, marcadores TRUE/NULL, CHECK, índices) según las convenciones del proyecto; si hace falta modelador-bd.
3. Fases de Dev 3 (3a, 3b, …) con alcance, endpoints, pantallas, tests y criterio de terminado, tamaño S/M/L, y cuáles pueden ir en paralelo (por ejemplo, API de una fase mientras se revisa la anterior). Recomienda empezar por lo que destraba a Dev 4 (entregas para calificar) y a Dev 5 (eventos).
4. Cómo integrar el storage de luchito (traer su rama/PR a features/adolfo vs. reimplementar) y archivos compartidos que hará falta tocar (package.json, lockfile, app.module, docker-compose, .env.example) con autorización.
5. Eventos que Dev 3 debe emitir para Dev 5 (node:events, D-031) y contrato que Dev 4 consumirá para calificar.
6. Decisiones que el usuario debe tomar (máximo 4, con recomendación) y lo que queda fuera de v1.

Conciso: tablas y listas. Para: el siguiente agente.
```

### 3. modelador-bd — Esquema de contenidos (fase 3a)

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (lee el INFORME 1, sección "Decisiones" 2, y las Decisiones del orquestador 1 y 2).

Encargo (fase 3a de Dev 3): crea `prisma/schema/contents.prisma` con los enums y las entidades StoredFile, Material, Assignment, Submission y SubmissionVersion exactamente según el INFORME 1 (Decisión 2), con las convenciones del proyecto (PK uuid(7) Char(36), FK Char(36) Restrict, sin borrado físico; ver academic.prisma como referencia). El usuario aprobó MiB: `Assignment.maxSizeBytes @default(20971520)` y topes de 52428800. Añade solo los campos de relación inversa en `prisma/schema/auth.prisma` (User) y `academic.prisma` (CourseSection, AcademicPeriod, Enrollment); autorizado por el usuario, marca con un comentario "relación inversa de Dev 3, autorizado por el usuario el 29/10/2026".

Una sola migración (`pnpm db:migrate` o el comando que use el proyecto, con nombre tipo `contents_base`) que incluya en SQL manual los CHECK (StoredFile_size_chk, StoredFile_clean_chk, StoredFile_purpose_chk, Material_deleted_chk, Assignment_maxSize_chk, Assignment_neGrade_chk; recuerda que en MySQL un CHECK con rama condicional debe usar `IS NOT NULL AND ...` en la rama TRUE como en docs/04) y los triggers BEFORE UPDATE / BEFORE DELETE de SubmissionVersion con SIGNAL SQLSTATE '45000' (mira cómo se hizo con AuditLog en las migraciones existentes). Comprueba con un ROLLBACK manual en MySQL que cada CHECK y trigger rechaza lo que debe.

Entorno: comandos que conecten a MySQL con NODE_OPTIONS=--dns-result-order=ipv4first; calienta MySQL antes con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'. No leas .env. No registres módulos ni toques código de la API (eso es de dev3-contenidos). No hagas commit.

Verificación: migración aplicada, `prisma migrate status` al día, `prisma generate` ok, `pnpm --filter api build` y `pnpm --filter api test` en verde, `pnpm db:seed` ok. Devuelve el INFORME del protocolo con el SQL de CHECK y triggers resumido.
```

### 4. modelador-bd — Esquema de contenidos (fase 3a)

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (lee el INFORME 1, sección "Decisiones" 2, y las Decisiones del orquestador 1 y 2).

Encargo (fase 3a de Dev 3): crea `prisma/schema/contents.prisma` con los enums y las entidades StoredFile, Material, Assignment, Submission y SubmissionVersion exactamente según el INFORME 1 (Decisión 2), con las convenciones del proyecto (PK uuid(7) Char(36), FK Char(36) Restrict, sin borrado físico; ver academic.prisma como referencia). El usuario aprobó MiB: `Assignment.maxSizeBytes @default(20971520)` y topes de 52428800. Añade solo los campos de relación inversa en `prisma/schema/auth.prisma` (User) y `academic.prisma` (CourseSection, AcademicPeriod, Enrollment); autorizado por el usuario, marca con un comentario "relación inversa de Dev 3, autorizado por el usuario el 29/10/2026".

Una sola migración (`pnpm db:migrate` o el comando que use el proyecto, con nombre tipo `contents_base`) que incluya en SQL manual los CHECK (StoredFile_size_chk, StoredFile_clean_chk, StoredFile_purpose_chk, Material_deleted_chk, Assignment_maxSize_chk, Assignment_neGrade_chk; recuerda que en MySQL un CHECK con rama condicional debe usar `IS NOT NULL AND ...` en la rama TRUE como en docs/04) y los triggers BEFORE UPDATE / BEFORE DELETE de SubmissionVersion con SIGNAL SQLSTATE '45000' (mira cómo se hizo con AuditLog en las migraciones existentes). Comprueba con un ROLLBACK manual en MySQL que cada CHECK y trigger rechaza lo que debe.

Entorno: comandos que conecten a MySQL con NODE_OPTIONS=--dns-result-order=ipv4first; calienta MySQL antes con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'. No leas .env. No registres módulos ni toques código de la API (eso es de dev3-contenidos). No hagas commit.

Verificación: migración aplicada, `prisma migrate status` al día, `prisma generate` ok, `pnpm --filter api build` y `pnpm --filter api test` en verde, `pnpm db:seed` ok. Devuelve el INFORME del protocolo con el SQL de CHECK y triggers resumido.
```

### 5. dev3-contenidos — Dev3 fase 3b: subida de archivos

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (lee el Contexto, el INFORME 1, sección (3) fase 3b y los contratos, las Decisiones del orquestador 1–3 y el INFORME 2 del esquema).

Encargo: fase 3b de Dev 3 (RF-33..35, RF-40, RNF-03/18; D-006/D-009 aprobadas por el usuario: receivedAt al confirmar la subida, escaneo síncrono detrás de una interfaz FileScanner, MiB, TTL de 5 min para subir y 60 s para descargar). Trabaja SOLO en apps/api/src/modules/files/ (módulo ya registrado y vacío) y, lo mínimo, en apps/api/src/modules/storage/ (código de luchito: revisa primero su API, si firma PUT o POST, su TTL, su formato de clave y sus variables S3_*, y cámbialo lo menos posible).
- `POST /files/upload-intents`, `POST /files/:id/complete` y `POST /files/:id/download-url`, con los contratos del INFORME 1.
- Permisos con AcademicAccessService:
  - MATERIAL y ASSIGNMENT_ATTACHMENT: el docente asignado o ADMIN;
  - SUBMISSION: un estudiante con matrícula vigente en la sección de la tarea, con la tarea no vencida salvo allowLate y el período abierto;
  - descarga solo de archivos CLEAN y por miembros. El apoderado no descarga.
- Validación en complete:
  - HEAD con tamaño ≤ maxBytes;
  - magic `%PDF-`, `%%EOF` y sin `/Encrypt`;
  - sha256 en stream;
  - ClamAV INSTREAM por node:net, sin dependencia nueva;
  - si se rechaza, se borra el objeto y el archivo queda INVALID o INFECTED;
  - si clamd está caído, 503 y se puede reintentar.
- originalName saneado y nunca en la bitácora ni en los logs.
- Bitácora `files.*` sin datos personales. Evento `submission.rejected.v1` (node:events, D-031) cuando se rechaza un archivo de entrega, emitido desde un publisher en files/.
- Variables S3_* y CLAMAV_HOST/CLAMAV_PORT/CLAMAV_TIMEOUT_MS en .env.example (autorizado; marca "Dev 3, pendiente de revisión por Dev 1") y CORS de MinIO en docker-compose.yml solo si hace falta para la subida directa desde http://localhost:3000.
- Tests: unit con S3 y clamd simulados. e2e en apps/api/test/files.e2e-spec.ts con MinIO y ClamAV reales de Docker: QA-005 (no PDF), QA-006 (tamaño), QA-011 (EICAR), QA-012 (URL firmada solo tras permisos). Usa `createDbTestApp` de test/helpers.ts.

En paralelo, otro agente hace la fase 3c en apps/api/src/modules/contents/: no toques esa carpeta ni app.module.ts. No hagas commit. Entorno: NODE_OPTIONS=--dns-result-order=ipv4first en todo lo que conecte a MySQL/Redis/MinIO; calienta MySQL antes (docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'). No leas .env.

Verificación: api lint, test y build, el e2e nuevo y prettier. Deja la BD con pnpm db:seed. Devuelve el INFORME del protocolo y conserva el contexto, porque después te pediré la 3d.
```

### 6. dev3-contenidos — Dev3 fase 3c: tareas

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (lee el Contexto, el INFORME 1, sección (3) fase 3c y (5) eventos, las Decisiones del orquestador 1–3 y el INFORME 2 del esquema).

Encargo: fase 3c de Dev 3, las tareas (RF-28, RF-29; RN-05, RN-08, RN-10, RN-12, RN-14; D-007 en MiB). Trabaja SOLO en apps/api/src/modules/contents/ (módulo ya registrado y vacío).

Endpoints:
- `POST /course-sections/:id/assignments` y `GET /course-sections/:id/assignments`
- `GET /assignments/:id`, `PATCH /assignments/:id` y `DELETE /assignments/:id`. El DELETE es borrado lógico con deletedAt, y responde 409 si la tarea ya tiene entregas (SubmissionVersion).

Permisos y reglas:
- Crean y editan el docente asignado al CourseSection o ADMIN. Leen los miembros: docente, estudiante con matrícula vigente y ADMIN. El apoderado no. Usa AcademicAccessService de academic.
- El período debe estar abierto y ser del mismo año que la CourseSection (RN-10, invariante 3 de docs/02; mira assertCourseSectionWritable o equivalente en academic/).
- maxSizeBytes va entre 1 y 52428800, con 20971520 por defecto. noSubmissionGrade va entre 0 y 20 con 2 decimales, 0 por defecto (RN-05). Valida con Zod estricto.
- attachmentFileId opcional. Si llega, debe ser un StoredFile CLEAN con purpose ASSIGNMENT_ATTACHMENT, de la misma CourseSection y no usado ya.
- Bitácora `contents.assignment.created`, `updated` y `deleted` después del commit, sin textos libres.
- `ContentsEventPublisher` (node:events, D-031) con `assignment.created.v1` y `assignment.updated.v1` (payloads del INFORME 1, sin datos personales). Debe quedar exportado para que la 3e lo reutilice con `material.published.v1`.

Tests:
- Unit de la lógica pura.
- e2e en apps/api/test/contents-assignments.e2e-spec.ts con MySQL, usando `createDbTestApp`. Casos: QA-003/004, período cerrado → 409, docente ajeno → 403, estudiante lee pero no crea, apoderado → 403, DELETE con entregas → 409.

Otro agente hace en paralelo la fase 3b en apps/api/src/modules/files/ y storage/. No toques esas carpetas, app.module.ts, .env.example ni docker-compose.yml. No hagas commit.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado antes con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'. No leas .env.

Verificación: api lint, test y build; el e2e nuevo; prettier. Deja la BD con pnpm db:seed. Devuelve el INFORME del protocolo y conserva el contexto: después te pediré la 3e (materiales).
```

### 7. dev3-contenidos — Dev3 fase 3b: subida de archivos

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (lee el Contexto, el INFORME 1, sección (3) fase 3b y los contratos, las Decisiones del orquestador 1–3 y el INFORME 2 del esquema).

Encargo: fase 3b de Dev 3 (RF-33..35, RF-40, RNF-03/18; D-006/D-009 aprobadas por el usuario: receivedAt al confirmar la subida, escaneo síncrono detrás de una interfaz FileScanner, MiB, TTL de 5 min para subir y 60 s para descargar). Trabaja SOLO en apps/api/src/modules/files/ (módulo ya registrado y vacío) y, lo mínimo, en apps/api/src/modules/storage/ (código de luchito: revisa primero su API, si firma PUT o POST, su TTL, su formato de clave y sus variables S3_*, y cámbialo lo menos posible).
- `POST /files/upload-intents`, `POST /files/:id/complete` y `POST /files/:id/download-url`, con los contratos del INFORME 1.
- Permisos con AcademicAccessService:
  - MATERIAL y ASSIGNMENT_ATTACHMENT: el docente asignado o ADMIN;
  - SUBMISSION: un estudiante con matrícula vigente en la sección de la tarea, con la tarea no vencida salvo allowLate y el período abierto;
  - descarga solo de archivos CLEAN y por miembros. El apoderado no descarga.
- Validación en complete:
  - HEAD con tamaño ≤ maxBytes;
  - magic `%PDF-`, `%%EOF` y sin `/Encrypt`;
  - sha256 en stream;
  - ClamAV INSTREAM por node:net, sin dependencia nueva;
  - si se rechaza, se borra el objeto y el archivo queda INVALID o INFECTED;
  - si clamd está caído, 503 y se puede reintentar.
- originalName saneado y nunca en la bitácora ni en los logs.
- Bitácora `files.*` sin datos personales. Evento `submission.rejected.v1` (node:events, D-031) cuando se rechaza un archivo de entrega, emitido desde un publisher en files/.
- Variables S3_* y CLAMAV_HOST/CLAMAV_PORT/CLAMAV_TIMEOUT_MS en .env.example (autorizado; marca "Dev 3, pendiente de revisión por Dev 1") y CORS de MinIO en docker-compose.yml solo si hace falta para la subida directa desde http://localhost:3000.
- Tests: unit con S3 y clamd simulados. e2e en apps/api/test/files.e2e-spec.ts con MinIO y ClamAV reales de Docker: QA-005 (no PDF), QA-006 (tamaño), QA-011 (EICAR), QA-012 (URL firmada solo tras permisos). Usa `createDbTestApp` de test/helpers.ts.

En paralelo, otro agente hace la fase 3c en apps/api/src/modules/contents/: no toques esa carpeta ni app.module.ts. No hagas commit. Entorno: NODE_OPTIONS=--dns-result-order=ipv4first en todo lo que conecte a MySQL/Redis/MinIO; calienta MySQL antes (docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'). No leas .env.

Verificación: api lint, test y build, el e2e nuevo y prettier. Deja la BD con pnpm db:seed. Devuelve el INFORME del protocolo y conserva el contexto, porque después te pediré la 3d.
```

### 8. dev3-contenidos — Dev3 fase 3c: tareas

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (lee el Contexto, el INFORME 1, sección (3) fase 3c y (5) eventos, las Decisiones del orquestador 1–3 y el INFORME 2 del esquema).

Encargo: fase 3c de Dev 3, las tareas (RF-28, RF-29; RN-05, RN-08, RN-10, RN-12, RN-14; D-007 en MiB). Trabaja SOLO en apps/api/src/modules/contents/ (módulo ya registrado y vacío).

Endpoints:
- `POST /course-sections/:id/assignments` y `GET /course-sections/:id/assignments`
- `GET /assignments/:id`, `PATCH /assignments/:id` y `DELETE /assignments/:id`. El DELETE es borrado lógico con deletedAt, y responde 409 si la tarea ya tiene entregas (SubmissionVersion).

Permisos y reglas:
- Crean y editan el docente asignado al CourseSection o ADMIN. Leen los miembros: docente, estudiante con matrícula vigente y ADMIN. El apoderado no. Usa AcademicAccessService de academic.
- El período debe estar abierto y ser del mismo año que la CourseSection (RN-10, invariante 3 de docs/02; mira assertCourseSectionWritable o equivalente en academic/).
- maxSizeBytes va entre 1 y 52428800, con 20971520 por defecto. noSubmissionGrade va entre 0 y 20 con 2 decimales, 0 por defecto (RN-05). Valida con Zod estricto.
- attachmentFileId opcional. Si llega, debe ser un StoredFile CLEAN con purpose ASSIGNMENT_ATTACHMENT, de la misma CourseSection y no usado ya.
- Bitácora `contents.assignment.created`, `updated` y `deleted` después del commit, sin textos libres.
- `ContentsEventPublisher` (node:events, D-031) con `assignment.created.v1` y `assignment.updated.v1` (payloads del INFORME 1, sin datos personales). Debe quedar exportado para que la 3e lo reutilice con `material.published.v1`.

Tests:
- Unit de la lógica pura.
- e2e en apps/api/test/contents-assignments.e2e-spec.ts con MySQL, usando `createDbTestApp`. Casos: QA-003/004, período cerrado → 409, docente ajeno → 403, estudiante lee pero no crea, apoderado → 403, DELETE con entregas → 409.

Otro agente hace en paralelo la fase 3b en apps/api/src/modules/files/ y storage/. No toques esas carpetas, app.module.ts, .env.example ni docker-compose.yml. No hagas commit.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado antes con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'. No leas .env.

Verificación: api lint, test y build; el e2e nuevo; prettier. Deja la BD con pnpm db:seed. Devuelve el INFORME del protocolo y conserva el contexto: después te pediré la 3e (materiales).
```

### 9. SendMessage al agente en curso — Fase 3e: materiales

```
3c recibida (INFORME 3). Sigue con la fase 3e de Dev 3 en la misma carpeta apps/api/src/modules/contents/: los materiales (RF-26, RF-27, RF-29, RF-30, RF-31; RN-10, RN-14; D-010 aprobada: periodId opcional; el apoderado no ve materiales).

Rutas:
- `GET /course-sections/:id/materials` y `POST /course-sections/:id/materials`. El POST recibe `{ kind CLASS|READING, title, description?, fileId, periodId?, isReusable? }`. fileId debe ser un StoredFile CLEAN con purpose MATERIAL, de la misma CourseSection y sin usar.
- `PATCH /materials/:id`, `DELETE /materials/:id` (papelera: deletedAt y deletedById juntos) y `POST /materials/:id/restore` (409 si pasaron más de 30 días).

Reglas:
- Las lecturas (READING) incluyen el aviso de copyright en el DTO y la marca isReusable.
- Escriben el docente asignado o ADMIN, y solo con el período abierto si hay periodId (RN-10). Leen los miembros. La papelera solo la ve el docente o ADMIN, con `?includeDeleted=true`.
- Bitácora `contents.material.*` con recordContents.
- Evento `material.published.v1` al publicar.
- La descarga sigue en `POST /files/:id/download-url` (3b): aquí solo devuelve fileId.

Tests:
- unit;
- e2e en apps/api/test/contents-materials.e2e-spec.ts con QA-001, QA-002 y QA-015, alumno de otra sección → 403 y restore después de 30 días → 409.

Igual que antes: no toques files/, storage/, app.module.ts, .env.example ni docker-compose.yml; el agente de la 3b sigue trabajando en paralelo. No hagas commit. Mismo entorno.

Verificación: api lint, test y build, tu e2e y prettier. Deja la BD con el seed. Devuelve el INFORME del protocolo.
```

### 10. SendMessage al agente en curso — Fase 3e: materiales

```
3c recibida (INFORME 3). Sigue con la fase 3e de Dev 3 en la misma carpeta apps/api/src/modules/contents/: los materiales (RF-26, RF-27, RF-29, RF-30, RF-31; RN-10, RN-14; D-010 aprobada: periodId opcional; el apoderado no ve materiales).

Rutas:
- `GET /course-sections/:id/materials` y `POST /course-sections/:id/materials`. El POST recibe `{ kind CLASS|READING, title, description?, fileId, periodId?, isReusable? }`. fileId debe ser un StoredFile CLEAN con purpose MATERIAL, de la misma CourseSection y sin usar.
- `PATCH /materials/:id`, `DELETE /materials/:id` (papelera: deletedAt y deletedById juntos) y `POST /materials/:id/restore` (409 si pasaron más de 30 días).

Reglas:
- Las lecturas (READING) incluyen el aviso de copyright en el DTO y la marca isReusable.
- Escriben el docente asignado o ADMIN, y solo con el período abierto si hay periodId (RN-10). Leen los miembros. La papelera solo la ve el docente o ADMIN, con `?includeDeleted=true`.
- Bitácora `contents.material.*` con recordContents.
- Evento `material.published.v1` al publicar.
- La descarga sigue en `POST /files/:id/download-url` (3b): aquí solo devuelve fileId.

Tests:
- unit;
- e2e en apps/api/test/contents-materials.e2e-spec.ts con QA-001, QA-002 y QA-015, alumno de otra sección → 403 y restore después de 30 días → 409.

Igual que antes: no toques files/, storage/, app.module.ts, .env.example ni docker-compose.yml; el agente de la 3b sigue trabajando en paralelo. No hagas commit. Mismo entorno.

Verificación: api lint, test y build, tu e2e y prettier. Deja la BD con el seed. Devuelve el INFORME del protocolo.
```

### 11. SendMessage al agente en curso — Fase 3d: entregas

```
3e recibida (INFORME 4). Sigue con la fase 3d de Dev 3 en apps/api/src/modules/submissions/. El módulo ya está registrado y vacío. Mira la Decisión del orquestador 5, y en el INFORME 1 la Decisión 3 (fase 3d), los contratos y la sección 5 (contrato para Dev 4).

Requisitos: RF-33, RF-36, RF-37, RF-38 (parcial), RF-39; RN-06, RN-09, RN-10, RN-14; D-006 (receivedAt es la hora en que se confirmó la subida, StoredFile.completedAt).

Endpoints:
- `POST /assignments/:id/submissions` con `{ fileId }`:
  - el fileId debe ser un StoredFile CLEAN, con purpose SUBMISSION, de esa tarea y subido por el mismo estudiante;
  - el estudiante debe tener matrícula vigente en la sección de la tarea, la tarea no puede estar borrada y el período debe estar abierto;
  - vencida y sin allowLate → 409; vencida con allowLate → isLate true, sin descuento;
  - crea la Submission si no existe y una SubmissionVersion nueva con versionNumber + 1;
  - el mismo fileId otra vez → 200 con la misma versión (idempotente);
  - una carrera en versionNumber → reintento o 409.
- `GET /assignments/:id/submissions/me` y `GET /submissions/:id/versions` (alumno dueño, docente o ADMIN), con la constancia RF-39 calculada.
- `GET /assignments/:id/submissions`, la lista del docente o ADMIN, según el contrato del INFORME 1.

Más requisitos:
- Usa lockOpenPeriod y assertCanWriteCourseSection de contents/contents-guards.ts y el orden de bloqueos del módulo: período FOR SHARE → Assignment FOR SHARE/UPDATE con deletedAt IS NULL → StoredFile. Importa ContentsModule y AcademicModule; no dupliques guardas.
- Bitácora `submissions.version.created` sin nombres ni originalName.
- Evento `submission.accepted.v1`, con los datos del INFORME 1 y sin datos personales.
- Exporta `SubmissionsReadService` (getAssignmentForGrading, listSubmissionSummaries) y la función pura `computeDisplayStatus` en submissions/display-status.ts, para Dev 4.

Tests: unit y un e2e en apps/api/test/submissions.e2e-spec.ts con QA-007/008/009/010, idempotencia, concurrencia, estudiante trasladado y apoderado 403. Para crear StoredFile CLEAN en los tests, inserta filas directamente. Para limpiar, usa el mismo patrón del trigger que en tu e2e de 3c.

La 3b sigue en paralelo en files/ y storage/: no toques esas carpetas, ni app.module.ts, .env.example o docker-compose.yml. Tampoco toques los tests de contents/, porque qa-tester los está ampliando ahora. No hagas commit. Mismo entorno.

Verificación: api lint, test y build, tu e2e, contents-* y prettier. Deja la BD con el seed. Devuelve el INFORME del protocolo.
```

### 12. qa-tester — QA de tareas y materiales

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 1, INFORMES 3 y 4 de las fases 3c y 3e).

Encargo acotado: QA de las fases 3c (tareas) y 3e (materiales) de Dev 3. Solo archivos de test en apps/api/src/modules/contents/*.spec.ts y apps/api/test/contents-*.e2e-spec.ts. Busca huecos y no repitas lo que ya está. Ideas:
- PATCH de tarea ajena;
- maxSizeBytes en 52428800 y en 52428801;
- noSubmissionGrade "20.001";
- adjunto de otra sección;
- restore en el día 30 y en el 31 (con fechas controladas);
- includeDeleted de un docente ajeno;
- material con periodId de otro año;
- eventos sin datos personales;
- bitácora sin títulos.

Ejecuta pnpm --filter api test y los e2e contents-assignments y contents-materials (NODE_OPTIONS=--dns-result-order=ipv4first; antes calienta MySQL con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'). En paralelo trabajan otros agentes:
- uno en files/ y storage/ (3b);
- otro en submissions/ (3d).
Comparten la base de datos, así que si un fallo parece intermitente, repítelo antes de reportarlo. No toques su código. Deja la BD con pnpm db:seed. No leas .env.

Devuelve un INFORME breve del protocolo (LISTO o CAMBIOS_PEDIDOS con archivo:línea).
```

### 13. seguridad-cumplimiento — Seguridad de tareas y materiales

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 1, INFORMES 3 y 4).

Encargo acotado y breve: audita la seguridad de las fases 3c (tareas) y 3e (materiales) de Dev 3. Solo lectura, sobre apps/api/src/modules/contents/ (controllers, services, dto, policy, contents-guards, contents-events, contents-audit). Requisitos: RNF-09..13, RN-10, RN-12, RN-14 y docs/05.

Revisa:
- Permisos por rol y por pertenencia: docente asignado o ADMIN para escribir; miembros para leer; apoderado 403; papelera solo para el docente y ADMIN.
- Zod estricto.
- Bloqueos y carreras.
- Que no se pueda reutilizar un StoredFile ajeno ni uno no CLEAN.
- Bitácora y eventos sin datos personales ni textos libres.
- La redacción del aviso de copyright.
- El hallazgo MEDIO del INFORME 3: el e2e quita y repone el trigger de inmutabilidad de SubmissionVersion para limpiar sus filas. ¿Es aceptable en la BD local de desarrollo? ¿Hay riesgo de que corra contra otra BD? Revisa test/contents-assignments.e2e-spec.ts y si hay una guarda de BD local. Propón alternativa si hace falta.

Si en 10 minutos no lo cubres todo, entrega con lo revisado. Devuelve el INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 14. SendMessage al agente en curso — Fase 3d: entregas

```
3e recibida (INFORME 4). Sigue con la fase 3d de Dev 3 en apps/api/src/modules/submissions/. El módulo ya está registrado y vacío. Mira la Decisión del orquestador 5, y en el INFORME 1 la Decisión 3 (fase 3d), los contratos y la sección 5 (contrato para Dev 4).

Requisitos: RF-33, RF-36, RF-37, RF-38 (parcial), RF-39; RN-06, RN-09, RN-10, RN-14; D-006 (receivedAt es la hora en que se confirmó la subida, StoredFile.completedAt).

Endpoints:
- `POST /assignments/:id/submissions` con `{ fileId }`:
  - el fileId debe ser un StoredFile CLEAN, con purpose SUBMISSION, de esa tarea y subido por el mismo estudiante;
  - el estudiante debe tener matrícula vigente en la sección de la tarea, la tarea no puede estar borrada y el período debe estar abierto;
  - vencida y sin allowLate → 409; vencida con allowLate → isLate true, sin descuento;
  - crea la Submission si no existe y una SubmissionVersion nueva con versionNumber + 1;
  - el mismo fileId otra vez → 200 con la misma versión (idempotente);
  - una carrera en versionNumber → reintento o 409.
- `GET /assignments/:id/submissions/me` y `GET /submissions/:id/versions` (alumno dueño, docente o ADMIN), con la constancia RF-39 calculada.
- `GET /assignments/:id/submissions`, la lista del docente o ADMIN, según el contrato del INFORME 1.

Más requisitos:
- Usa lockOpenPeriod y assertCanWriteCourseSection de contents/contents-guards.ts y el orden de bloqueos del módulo: período FOR SHARE → Assignment FOR SHARE/UPDATE con deletedAt IS NULL → StoredFile. Importa ContentsModule y AcademicModule; no dupliques guardas.
- Bitácora `submissions.version.created` sin nombres ni originalName.
- Evento `submission.accepted.v1`, con los datos del INFORME 1 y sin datos personales.
- Exporta `SubmissionsReadService` (getAssignmentForGrading, listSubmissionSummaries) y la función pura `computeDisplayStatus` en submissions/display-status.ts, para Dev 4.

Tests: unit y un e2e en apps/api/test/submissions.e2e-spec.ts con QA-007/008/009/010, idempotencia, concurrencia, estudiante trasladado y apoderado 403. Para crear StoredFile CLEAN en los tests, inserta filas directamente. Para limpiar, usa el mismo patrón del trigger que en tu e2e de 3c.

La 3b sigue en paralelo en files/ y storage/: no toques esas carpetas, ni app.module.ts, .env.example o docker-compose.yml. Tampoco toques los tests de contents/, porque qa-tester los está ampliando ahora. No hagas commit. Mismo entorno.

Verificación: api lint, test y build, tu e2e, contents-* y prettier. Deja la BD con el seed. Devuelve el INFORME del protocolo.
```

### 15. qa-tester — QA de tareas y materiales

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 1, INFORMES 3 y 4 de las fases 3c y 3e).

Encargo acotado: QA de las fases 3c (tareas) y 3e (materiales) de Dev 3. Solo archivos de test en apps/api/src/modules/contents/*.spec.ts y apps/api/test/contents-*.e2e-spec.ts. Busca huecos y no repitas lo que ya está. Ideas:
- PATCH de tarea ajena;
- maxSizeBytes en 52428800 y en 52428801;
- noSubmissionGrade "20.001";
- adjunto de otra sección;
- restore en el día 30 y en el 31 (con fechas controladas);
- includeDeleted de un docente ajeno;
- material con periodId de otro año;
- eventos sin datos personales;
- bitácora sin títulos.

Ejecuta pnpm --filter api test y los e2e contents-assignments y contents-materials (NODE_OPTIONS=--dns-result-order=ipv4first; antes calienta MySQL con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'). En paralelo trabajan otros agentes:
- uno en files/ y storage/ (3b);
- otro en submissions/ (3d).
Comparten la base de datos, así que si un fallo parece intermitente, repítelo antes de reportarlo. No toques su código. Deja la BD con pnpm db:seed. No leas .env.

Devuelve un INFORME breve del protocolo (LISTO o CAMBIOS_PEDIDOS con archivo:línea).
```

### 16. seguridad-cumplimiento — Seguridad de tareas y materiales

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 1, INFORMES 3 y 4).

Encargo acotado y breve: audita la seguridad de las fases 3c (tareas) y 3e (materiales) de Dev 3. Solo lectura, sobre apps/api/src/modules/contents/ (controllers, services, dto, policy, contents-guards, contents-events, contents-audit). Requisitos: RNF-09..13, RN-10, RN-12, RN-14 y docs/05.

Revisa:
- Permisos por rol y por pertenencia: docente asignado o ADMIN para escribir; miembros para leer; apoderado 403; papelera solo para el docente y ADMIN.
- Zod estricto.
- Bloqueos y carreras.
- Que no se pueda reutilizar un StoredFile ajeno ni uno no CLEAN.
- Bitácora y eventos sin datos personales ni textos libres.
- La redacción del aviso de copyright.
- El hallazgo MEDIO del INFORME 3: el e2e quita y repone el trigger de inmutabilidad de SubmissionVersion para limpiar sus filas. ¿Es aceptable en la BD local de desarrollo? ¿Hay riesgo de que corra contra otra BD? Revisa test/contents-assignments.e2e-spec.ts y si hay una guarda de BD local. Propón alternativa si hace falta.

Si en 10 minutos no lo cubres todo, entrega con lo revisado. Devuelve el INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 17. SendMessage al agente en curso — Datos de la 3b para la 3d

```
Dato para la 3d: la 3b ya está lista (INFORME 5 del expediente).
- La hora de entrega (receivedAt) es `StoredFile.completedAt`, que es la hora del servidor al empezar el complete.
- Acepta solo StoredFile con purpose SUBMISSION, CLEAN, sin purgedAt, del mismo uploadedById (el estudiante) y del mismo assignmentId.
- FilesModule reexporta StorageModule y FileScanner por si los necesitas, pero la 3d no debería tocar files/.
Sigue con lo que estabas haciendo.
```

### 18. qa-tester — QA de la subida de archivos

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 1 y el INFORME 5 de la fase 3b).

Encargo acotado: QA de la fase 3b de Dev 3, la subida y descarga de archivos con antivirus. Solo archivos de test: apps/api/src/modules/files/*.spec.ts, apps/api/src/modules/storage/*.spec.ts y apps/api/test/files.e2e-spec.ts. Busca huecos que no estén cubiertos. Ideas:
- PDF con `/Encrypt` y PDF sin `%%EOF`;
- tamaño justo en maxBytes y un byte más;
- re-PUT después de complete (OBJECT_CHANGED);
- complete de otro usuario (404);
- intent con la tarea vencida y allowLate en false o true;
- complete repetido (idempotente) y complete tras un rechazo;
- clamd caído (503 y luego reintento);
- download-url de un archivo INFECTED, de otra sección, de un apoderado o de un material en la papelera;
- objeto en `incoming/` que se borra tras CLEAN.

Ejecuta pnpm --filter api test y el e2e files (antepón NODE_OPTIONS=--dns-result-order=ipv4first; usa MinIO y ClamAV de Docker; antes calienta MySQL con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"').

En paralelo trabajan otros agentes en submissions/ (3d) y en los tests de contents/. No toques su código y, si un fallo parece intermitente, repítelo antes de reportarlo. Deja la BD con pnpm db:seed. No leas .env.

Devuelve un INFORME breve del protocolo (LISTO o CAMBIOS_PEDIDOS con archivo:línea).
```

### 19. seguridad-cumplimiento — Seguridad de la subida de archivos

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 1 y el INFORME 5 de la fase 3b).

Encargo acotado y breve: auditoría de seguridad de la fase 3b de Dev 3 (archivos; RF-34, RF-35, RF-40, RNF-03, RNF-18, RNF-09..13). Solo lectura, sobre apps/api/src/modules/files/ y los cambios en apps/api/src/modules/storage/. Revisa:
- Permisos de intent, complete y download-url por propósito y rol; que el apoderado no pueda descargar.
- La cuarentena `incoming/` con If-Match y CopySourceIfMatch contra TOCTOU.
- La validación del PDF: magic, %%EOF, /Encrypt y si basta frente a PDF malformados o políglotas.
- El cliente de ClamAV por node:net: timeouts, tamaño de chunks y respuesta INSTREAM size limit.
- Claves de objeto sin nombre original.
- originalName saneado y fuera de la bitácora y los logs.
- TTL de las URL firmadas.
- El límite de 20 intents por minuto.
- Las variables nuevas de .env.example, sin secretos reales.
- La bitácora y el evento `submission.rejected.v1` sin datos personales: lleva studentId; ¿es aceptable según D-034?

Si en 10 minutos no lo cubres todo, entrega con lo revisado. Devuelve el INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 20. SendMessage al agente en curso — Datos de la 3b para la 3d

```
Dato para la 3d: la 3b ya está lista (INFORME 5 del expediente).
- La hora de entrega (receivedAt) es `StoredFile.completedAt`, que es la hora del servidor al empezar el complete.
- Acepta solo StoredFile con purpose SUBMISSION, CLEAN, sin purgedAt, del mismo uploadedById (el estudiante) y del mismo assignmentId.
- FilesModule reexporta StorageModule y FileScanner por si los necesitas, pero la 3d no debería tocar files/.
Sigue con lo que estabas haciendo.
```

### 21. qa-tester — QA de la subida de archivos

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 1 y el INFORME 5 de la fase 3b).

Encargo acotado: QA de la fase 3b de Dev 3, la subida y descarga de archivos con antivirus. Solo archivos de test: apps/api/src/modules/files/*.spec.ts, apps/api/src/modules/storage/*.spec.ts y apps/api/test/files.e2e-spec.ts. Busca huecos que no estén cubiertos. Ideas:
- PDF con `/Encrypt` y PDF sin `%%EOF`;
- tamaño justo en maxBytes y un byte más;
- re-PUT después de complete (OBJECT_CHANGED);
- complete de otro usuario (404);
- intent con la tarea vencida y allowLate en false o true;
- complete repetido (idempotente) y complete tras un rechazo;
- clamd caído (503 y luego reintento);
- download-url de un archivo INFECTED, de otra sección, de un apoderado o de un material en la papelera;
- objeto en `incoming/` que se borra tras CLEAN.

Ejecuta pnpm --filter api test y el e2e files (antepón NODE_OPTIONS=--dns-result-order=ipv4first; usa MinIO y ClamAV de Docker; antes calienta MySQL con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"').

En paralelo trabajan otros agentes en submissions/ (3d) y en los tests de contents/. No toques su código y, si un fallo parece intermitente, repítelo antes de reportarlo. Deja la BD con pnpm db:seed. No leas .env.

Devuelve un INFORME breve del protocolo (LISTO o CAMBIOS_PEDIDOS con archivo:línea).
```

### 22. seguridad-cumplimiento — Seguridad de la subida de archivos

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 1 y el INFORME 5 de la fase 3b).

Encargo acotado y breve: auditoría de seguridad de la fase 3b de Dev 3 (archivos; RF-34, RF-35, RF-40, RNF-03, RNF-18, RNF-09..13). Solo lectura, sobre apps/api/src/modules/files/ y los cambios en apps/api/src/modules/storage/. Revisa:
- Permisos de intent, complete y download-url por propósito y rol; que el apoderado no pueda descargar.
- La cuarentena `incoming/` con If-Match y CopySourceIfMatch contra TOCTOU.
- La validación del PDF: magic, %%EOF, /Encrypt y si basta frente a PDF malformados o políglotas.
- El cliente de ClamAV por node:net: timeouts, tamaño de chunks y respuesta INSTREAM size limit.
- Claves de objeto sin nombre original.
- originalName saneado y fuera de la bitácora y los logs.
- TTL de las URL firmadas.
- El límite de 20 intents por minuto.
- Las variables nuevas de .env.example, sin secretos reales.
- La bitácora y el evento `submission.rejected.v1` sin datos personales: lleva studentId; ¿es aceptable según D-034?

Si en 10 minutos no lo cubres todo, entrega con lo revisado. Devuelve el INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 23. SendMessage al agente en curso — Guarda para el DDL del trigger en e2e

```
Cambio pedido por seguridad (INFORME 6, MEDIO 1). Aplícalo ya, también en tu e2e de la 3d: el e2e no puede hacer DROP o CREATE TRIGGER sin una guarda de BD.

Crea un helper compartido en apps/api/test/, por ejemplo `db-test-guard.ts` con `assertLocalTestDb()` y `withoutSubmissionVersionTrigger(fn)`, y úsalo en contents-assignments.e2e-spec.ts, contents-materials.e2e-spec.ts (si toca el trigger) y submissions.e2e-spec.ts. Antes de cualquier DDL debe lanzar un error salvo que se cumplan las cuatro condiciones:
- el host de DATABASE_URL es localhost, 127.0.0.1, ::1 o mysql;
- `SELECT DATABASE()` devuelve la BD esperada;
- NODE_ENV no es production;
- CI no está activo.

Reutiliza la lógica de prisma/seed/local-guard.ts si te sirve; puedes importarla. Anota en el expediente la decisión y no cambies nada más de contents/. Esto entra en tu INFORME de la 3d.
```

### 24. SendMessage al agente en curso — Guarda para el DDL del trigger en e2e

```
Cambio pedido por seguridad (INFORME 6, MEDIO 1). Aplícalo ya, también en tu e2e de la 3d: el e2e no puede hacer DROP o CREATE TRIGGER sin una guarda de BD.

Crea un helper compartido en apps/api/test/, por ejemplo `db-test-guard.ts` con `assertLocalTestDb()` y `withoutSubmissionVersionTrigger(fn)`, y úsalo en contents-assignments.e2e-spec.ts, contents-materials.e2e-spec.ts (si toca el trigger) y submissions.e2e-spec.ts. Antes de cualquier DDL debe lanzar un error salvo que se cumplan las cuatro condiciones:
- el host de DATABASE_URL es localhost, 127.0.0.1, ::1 o mysql;
- `SELECT DATABASE()` devuelve la BD esperada;
- NODE_ENV no es production;
- CI no está activo.

Reutiliza la lógica de prisma/seed/local-guard.ts si te sirve; puedes importarla. Anota en el expediente la decisión y no cambies nada más de contents/. Esto entra en tu INFORME de la 3d.
```

### 25. SendMessage al agente en curso — Correcciones de seguridad de la 3b

```
Seguridad aprobó la 3b. Está en el expediente como INFORME 7 y Decisión 7. Aplica estas correcciones en una sola pasada, solo en files/, storage/ y docker-compose.yml:
1. (MEDIO) clamd StreamMaxLength:
   - En docker-compose.yml, configura el contenedor ClamAV para aceptar 50 MiB o más (StreamMaxLength y lo que haga falta, por ejemplo con variables o un clamd.conf montado). Ponle el comentario "Dev 3, autorizado por el usuario; pendiente de revisión por Dev 1".
   - Además, en clamav.scanner.ts distingue "INSTREAM size limit exceeded" y respóndelo como 413 FILE_TOO_LARGE, no como 503.
2. (MEDIO) Throttle por usuario autenticado en lugar de por IP para upload-intents: 20/min por usuario, con un tracker propio solo en files/ (sin tocar el ThrottlerGuard global).
3. (MEDIO) @Throttle moderado en complete: 30/min por usuario.
4. (BAJO) Si el HEAD no devuelve ETag, responde 503 STORAGE_UNAVAILABLE en vez de seguir sin If-Match.

Otro QA está ampliando los tests de files/ ahora. No modifiques sus archivos .spec ni files.e2e-spec.ts; si necesitas tests nuevos, ponlos en archivos aparte. Si cambias docker-compose, reinicia solo el contenedor clamav y espera a que esté healthy.

Verificación: api lint, test y build; el e2e de files con NODE_OPTIONS=--dns-result-order=ipv4first; prettier. Prueba con un PDF de unos 30 MB que antes daba 503. Devuelve un INFORME breve con archivo:línea.
```

### 26. SendMessage al agente en curso — Correcciones de seguridad de la 3b

```
Seguridad aprobó la 3b. Está en el expediente como INFORME 7 y Decisión 7. Aplica estas correcciones en una sola pasada, solo en files/, storage/ y docker-compose.yml:
1. (MEDIO) clamd StreamMaxLength:
   - En docker-compose.yml, configura el contenedor ClamAV para aceptar 50 MiB o más (StreamMaxLength y lo que haga falta, por ejemplo con variables o un clamd.conf montado). Ponle el comentario "Dev 3, autorizado por el usuario; pendiente de revisión por Dev 1".
   - Además, en clamav.scanner.ts distingue "INSTREAM size limit exceeded" y respóndelo como 413 FILE_TOO_LARGE, no como 503.
2. (MEDIO) Throttle por usuario autenticado en lugar de por IP para upload-intents: 20/min por usuario, con un tracker propio solo en files/ (sin tocar el ThrottlerGuard global).
3. (MEDIO) @Throttle moderado en complete: 30/min por usuario.
4. (BAJO) Si el HEAD no devuelve ETag, responde 503 STORAGE_UNAVAILABLE en vez de seguir sin If-Match.

Otro QA está ampliando los tests de files/ ahora. No modifiques sus archivos .spec ni files.e2e-spec.ts; si necesitas tests nuevos, ponlos en archivos aparte. Si cambias docker-compose, reinicia solo el contenedor clamav y espera a que esté healthy.

Verificación: api lint, test y build; el e2e de files con NODE_OPTIONS=--dns-result-order=ipv4first; prettier. Prueba con un PDF de unos 30 MB que antes daba 503. Devuelve un INFORME breve con archivo:línea.
```

### 27. SendMessage al agente en curso — Ajusta clamav.scanner.spec.ts:119

```
Aviso: la 3b ya aplicó las correcciones de seguridad (INFORME 9 en el expediente). Ahora "INSTREAM size limit exceeded" devuelve `{ status: 'TOO_LARGE' }` y responde 413, no ScannerUnavailableError. También hay nuevos throttles por usuario en upload-intents (20/min) y complete (30/min), y un 503 si falta el ETag.

Ajusta apps/api/src/modules/files/clamav.scanner.spec.ts:119 para que espere `{ status: 'TOO_LARGE' }`. Revisa también que tus tests de files.e2e-spec.ts no superen los nuevos límites por usuario. Después vuelve a correr pnpm --filter api test y el e2e de files, e inclúyelo en tu INFORME.
```

### 28. SendMessage al agente en curso — Ajusta clamav.scanner.spec.ts:119

```
Aviso: la 3b ya aplicó las correcciones de seguridad (INFORME 9 en el expediente). Ahora "INSTREAM size limit exceeded" devuelve `{ status: 'TOO_LARGE' }` y responde 413, no ScannerUnavailableError. También hay nuevos throttles por usuario en upload-intents (20/min) y complete (30/min), y un 503 si falta el ETag.

Ajusta apps/api/src/modules/files/clamav.scanner.spec.ts:119 para que espere `{ status: 'TOO_LARGE' }`. Revisa también que tus tests de files.e2e-spec.ts no superen los nuevos límites por usuario. Después vuelve a correr pnpm --filter api test y el e2e de files, e inclúyelo en tu INFORME.
```

### 29. SendMessage al agente en curso — Retomar y terminar la fase 3d

```
El usuario detuvo el trabajo a mitad de la 3d y ahora pide continuar. Lee en el expediente .claude/tareas/20261029-dev3-contenidos.md la Decisión del orquestador 8.

Estado actual:
- Lo que dejaste de la 3d ya está commiteado, parcial, en `0f16ae8` (features/adolfo): submissions/ con su controller, service, dto, policy, read service, types y display-status.ts, más test/submissions.e2e-spec.ts, test/db-test-guard.ts y db-test-guard.e2e-spec.ts. Desde entonces se mezcló develop, con el login de David.
- La 3b ya aplicó sus correcciones (INFORME 9): throttle por usuario y ClamAV TOO_LARGE.

Termina la 3d con el encargo original:
- POST /assignments/:id/submissions, GET /assignments/:id/submissions/me, GET /submissions/:id/versions y GET /assignments/:id/submissions;
- idempotencia y concurrencia;
- bitácora submissions.version.created;
- evento submission.accepted.v1;
- SubmissionsReadService y computeDisplayStatus para Dev 4.
Aplica también la guarda de BD (INFORME 6, MEDIO 1) en todos los e2e que hacen DROP o CREATE TRIGGER: contents-assignments, contents-materials si lo hace, y submissions.

Primero revisa qué falta o está roto: build, unit y el e2e de submissions. No rehagas lo que ya funciona.

No toques files/, storage/, app.module.ts, la web ni prisma/seed/credentials.ts. No hagas commit.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado. La API puede estar corriendo en :4000; no la detengas, usa createDbTestApp. No leas .env.

Verificación: api lint, test y build; e2e submissions, contents-* y files; prettier. Deja la BD con pnpm db:seed (mismo NODE_OPTIONS). Devuelve el INFORME del protocolo.
```

### 30. SendMessage al agente en curso — Retomar y terminar la fase 3d

```
El usuario detuvo el trabajo a mitad de la 3d y ahora pide continuar. Lee en el expediente .claude/tareas/20261029-dev3-contenidos.md la Decisión del orquestador 8.

Estado actual:
- Lo que dejaste de la 3d ya está commiteado, parcial, en `0f16ae8` (features/adolfo): submissions/ con su controller, service, dto, policy, read service, types y display-status.ts, más test/submissions.e2e-spec.ts, test/db-test-guard.ts y db-test-guard.e2e-spec.ts. Desde entonces se mezcló develop, con el login de David.
- La 3b ya aplicó sus correcciones (INFORME 9): throttle por usuario y ClamAV TOO_LARGE.

Termina la 3d con el encargo original:
- POST /assignments/:id/submissions, GET /assignments/:id/submissions/me, GET /submissions/:id/versions y GET /assignments/:id/submissions;
- idempotencia y concurrencia;
- bitácora submissions.version.created;
- evento submission.accepted.v1;
- SubmissionsReadService y computeDisplayStatus para Dev 4.
Aplica también la guarda de BD (INFORME 6, MEDIO 1) en todos los e2e que hacen DROP o CREATE TRIGGER: contents-assignments, contents-materials si lo hace, y submissions.

Primero revisa qué falta o está roto: build, unit y el e2e de submissions. No rehagas lo que ya funciona.

No toques files/, storage/, app.module.ts, la web ni prisma/seed/credentials.ts. No hagas commit.

Entorno: NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado. La API puede estar corriendo en :4000; no la detengas, usa createDbTestApp. No leas .env.

Verificación: api lint, test y build; e2e submissions, contents-* y files; prettier. Deja la BD con pnpm db:seed (mismo NODE_OPTIONS). Devuelve el INFORME del protocolo.
```

### 31. dev3-contenidos — Dev3: terminar la fase 3d

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md. Lee el INFORME 1, sobre todo la fase 3d, sus contratos y la sección 5 (contrato para Dev 4). Lee también los INFORMES 3, 4, 5 y 6 y las Decisiones del orquestador 5 y 8.

Encargo: terminar la fase 3d de Dev 3, las entregas. Requisitos: RF-33, RF-36, RF-37, RF-38 (parcial), RF-39; RN-06, RN-09, RN-10, RN-14; D-006. Un agente anterior la dejó a medias y se detuvo; su trabajo está commiteado parcial en `0f16ae8`. Incluye:
- apps/api/src/modules/submissions/: controller, service, dto, policy, read service, types y display-status.ts;
- apps/api/test/submissions.e2e-spec.ts;
- apps/api/test/db-test-guard.ts y db-test-guard.e2e-spec.ts.

Primero diagnostica qué falta o está roto: build, unit y el e2e de submissions. No rehagas lo que ya funciona.

Qué debe quedar:
- `POST /assignments/:id/submissions` con `{ fileId }`:
  - Solo un StoredFile SUBMISSION CLEAN, no purgado, del mismo estudiante y de esa tarea.
  - El estudiante debe tener matrícula vigente en la sección de la tarea.
  - Tarea no borrada y período abierto.
  - receivedAt = StoredFile.completedAt.
  - Vencida sin allowLate → 409. Vencida con allowLate → isLate true.
  - Crea la Submission si no existe y una SubmissionVersion con versionNumber + 1.
  - El mismo fileId otra vez → 200 con la misma versión.
  - Carrera en versionNumber → reintento o 409.
- `GET /assignments/:id/submissions/me` y `GET /submissions/:id/versions`, para el alumno dueño, el docente o ADMIN, con la constancia RF-39.
- `GET /assignments/:id/submissions`, lista del docente o ADMIN según el contrato.
- Bloqueos con lockOpenPeriod y assertCanWriteCourseSection de contents/contents-guards.ts, en el orden del módulo: período FOR SHARE → Assignment con deletedAt IS NULL → StoredFile.
- Bitácora `submissions.version.created` sin nombres ni originalName.
- Evento `submission.accepted.v1` sin datos personales.
- `SubmissionsReadService` exportado (getAssignmentForGrading y listSubmissionSummaries) y `computeDisplayStatus` puro, para Dev 4.
- Guarda de BD (INFORME 6, MEDIO 1): ningún e2e puede hacer DROP o CREATE TRIGGER sin pasar por la guarda de test/db-test-guard.ts. Se exige host local, que `SELECT DATABASE()` sea la esperada, NODE_ENV distinto de production y sin CI. Aplícala en contents-assignments.e2e-spec.ts, contents-materials.e2e-spec.ts (si toca el trigger) y submissions.e2e-spec.ts.
- e2e de submissions con QA-007, 008, 009 y 010, idempotencia, concurrencia, estudiante trasladado y apoderado 403.

No toques files/, storage/, app.module.ts, la web, prisma/schema ni prisma/seed/credentials.ts. No hagas commit.

Entorno:
- NODE_OPTIONS=--dns-result-order=ipv4first en todo lo que conecte a MySQL o Redis.
- Antes, calienta MySQL con: docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'.
- La API puede estar corriendo en :4000; no la detengas. Usa createDbTestApp de test/helpers.ts.
- No leas .env.

Verificación: api lint, test y build; e2e de submissions, contents-* y files; prettier sobre lo tocado. Deja la BD con pnpm db:seed (con el mismo NODE_OPTIONS). Devuelve el INFORME del protocolo y conserva el contexto: después te pediré la 3f.
```

### 32. SendMessage al agente en curso — Fase 3f: pantallas de tareas y entregas

```
3d recibida (INFORME 11). Sigue con la fase 3f de Dev 3, solo en la web. Requisitos: RF-28, RF-33, RF-36, RF-37, RF-38 (parcial) y RF-39; RNF-24..27. No toques la API, porque QA y seguridad la están revisando ahora.

Patrón a reutilizar: ya hay pantallas iniciales de materiales en apps/web/app/(app)/curso/[id]/_materials/, con actions.ts ('use server'), materials-panel.tsx (client) y materials-page.tsx. Usan el BFF de lib/api (D-037) y `refresh()` de next/cache. Usa el mismo estilo, sencillo, y reutiliza `startUpload` y `finishUpload` con purpose SUBMISSION y assignmentId.

Pantalla a hacer: apps/web/app/(app)/curso/[id]/tareas/page.tsx, que hoy es un PlaceholderPage.
- Docente y ADMIN:
  - lista de tareas (GET /course-sections/:id/assignments);
  - formulario para crear una tarea: título, instrucciones, plazo, nota NE por defecto 0, tamaño máximo en MiB y si permite tardías;
  - por cada tarea, enlace o sección con la lista de entregas (GET /assignments/:id/submissions) con su displayStatus.
- Estudiante:
  - lista de tareas con su estado (GET /assignments/:id/submissions/me);
  - formulario para entregar el PDF: intent con purpose SUBMISSION → PUT a MinIO → complete → POST /assignments/:id/submissions;
  - historial de versiones y constancia (fecha y hora, archivo, tardía).
- Para decidir qué vista mostrar, usa el rol de la sesión (getSession o lo que use la web tras el merge de develop; revisa apps/web/lib). No uses dev-role.
- Accesible y desde 360 px, con labels, role="status" y mensajes de error en español con toUserMessage.

No toques _materials salvo para extraer helpers comunes. Tampoco toques nav, layouts ni la API. No hagas commit.

Verificación:
- pnpm --filter web lint, test y build, y tsc;
- prettier;
- humo con la sesión local: en el seed, docente01 es docente de Matemática 3.º A (courseSection 01a17953-1c63-7091-a5c5-ef1ae3d44596). Crea una tarea y entrega como un estudiante de 3.º A por API o pantalla, con NODE_OPTIONS=--dns-result-order=ipv4first.
La web ya corre en :3000 y la API en :4000; no las detengas. Al terminar deja la BD con pnpm db:seed. No leas .env.

Devuelve el INFORME del protocolo.
```

### 33. qa-tester — QA de entregas (3d)

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 11, fase 3d de entregas).

Encargo acotado: QA de la 3d. Solo archivos de test en apps/api/src/modules/submissions/*.spec.ts y apps/api/test/submissions.e2e-spec.ts. Busca huecos, sin repetir lo que ya está. Ideas:
- entrega exactamente en dueAt y en dueAt + 1 ms;
- reentrega tras el plazo con allowLate;
- fileId de otro alumno o de otra tarea (422);
- archivo INFECTED o PENDING (422);
- estudiante trasladado que ve su historial pero no puede entregar en la sección vieja;
- docente ajeno (403) y apoderado (403);
- lista del docente con matrículas sin entrega (PENDING);
- computeDisplayStatus con cada gradeState y su precedencia;
- evento y bitácora sin nombres ni originalName.

Comandos:
- pnpm --filter api test.
- El e2e de submissions con NODE_OPTIONS=--dns-result-order=ipv4first. Antes, calienta MySQL con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'.
- Si limpias versiones tocando el trigger, usa la guarda de test/db-test-guard.ts.

En paralelo:
- otro agente trabaja en la web (curso/[id]/tareas);
- otro audita la seguridad.
No toques su código. La API corre en :4000: no la detengas. Deja la BD con pnpm db:seed (mismo NODE_OPTIONS). No leas .env.

Devuelve un INFORME breve del protocolo (LISTO o CAMBIOS_PEDIDOS con archivo:línea).
```

### 34. seguridad-cumplimiento — Seguridad de entregas (3d)

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 11, fase 3d de entregas; INFORME 6 para la guarda de BD).

Encargo acotado y breve: auditoría de seguridad de la 3d. Solo lectura sobre apps/api/src/modules/submissions/ y apps/api/test/db-test-guard.ts (y su uso en contents-assignments.e2e-spec.ts y submissions.e2e-spec.ts). Requisitos: RNF-09..13, RN-09, RN-10, RN-14; docs/05.

Revisa:
- Permisos por rol y por pertenencia:
  - solo el estudiante con matrícula vigente entrega;
  - el historial lo ven el dueño, el docente asignado y ADMIN;
  - el apoderado recibe 403;
  - la lista es solo del docente asignado o ADMIN.
- Validación del fileId: propósito SUBMISSION, la misma tarea, el mismo alumno, CLEAN y no purgado.
- El orden de bloqueos período → Assignment → Enrollment FOR UPDATE → StoredFile frente al resto del proyecto, y el riesgo de deadlock.
- La idempotencia antes de RN-10.
- La inmutabilidad de SubmissionVersion.
- originalName solo en la constancia.
- Bitácora y evento sin datos personales.
- Que la guarda de BD impida de verdad DROP/CREATE TRIGGER fuera de una BD local de tests.

Si en 10 minutos no lo cubres todo, entrega con lo revisado. Devuelve el INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 35. SendMessage al agente en curso — Fase 3f: pantallas de tareas y entregas

```
3d recibida (INFORME 11). Sigue con la fase 3f de Dev 3, solo en la web. Requisitos: RF-28, RF-33, RF-36, RF-37, RF-38 (parcial) y RF-39; RNF-24..27. No toques la API, porque QA y seguridad la están revisando ahora.

Patrón a reutilizar: ya hay pantallas iniciales de materiales en apps/web/app/(app)/curso/[id]/_materials/, con actions.ts ('use server'), materials-panel.tsx (client) y materials-page.tsx. Usan el BFF de lib/api (D-037) y `refresh()` de next/cache. Usa el mismo estilo, sencillo, y reutiliza `startUpload` y `finishUpload` con purpose SUBMISSION y assignmentId.

Pantalla a hacer: apps/web/app/(app)/curso/[id]/tareas/page.tsx, que hoy es un PlaceholderPage.
- Docente y ADMIN:
  - lista de tareas (GET /course-sections/:id/assignments);
  - formulario para crear una tarea: título, instrucciones, plazo, nota NE por defecto 0, tamaño máximo en MiB y si permite tardías;
  - por cada tarea, enlace o sección con la lista de entregas (GET /assignments/:id/submissions) con su displayStatus.
- Estudiante:
  - lista de tareas con su estado (GET /assignments/:id/submissions/me);
  - formulario para entregar el PDF: intent con purpose SUBMISSION → PUT a MinIO → complete → POST /assignments/:id/submissions;
  - historial de versiones y constancia (fecha y hora, archivo, tardía).
- Para decidir qué vista mostrar, usa el rol de la sesión (getSession o lo que use la web tras el merge de develop; revisa apps/web/lib). No uses dev-role.
- Accesible y desde 360 px, con labels, role="status" y mensajes de error en español con toUserMessage.

No toques _materials salvo para extraer helpers comunes. Tampoco toques nav, layouts ni la API. No hagas commit.

Verificación:
- pnpm --filter web lint, test y build, y tsc;
- prettier;
- humo con la sesión local: en el seed, docente01 es docente de Matemática 3.º A (courseSection 01a17953-1c63-7091-a5c5-ef1ae3d44596). Crea una tarea y entrega como un estudiante de 3.º A por API o pantalla, con NODE_OPTIONS=--dns-result-order=ipv4first.
La web ya corre en :3000 y la API en :4000; no las detengas. Al terminar deja la BD con pnpm db:seed. No leas .env.

Devuelve el INFORME del protocolo.
```

### 36. qa-tester — QA de entregas (3d)

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 11, fase 3d de entregas).

Encargo acotado: QA de la 3d. Solo archivos de test en apps/api/src/modules/submissions/*.spec.ts y apps/api/test/submissions.e2e-spec.ts. Busca huecos, sin repetir lo que ya está. Ideas:
- entrega exactamente en dueAt y en dueAt + 1 ms;
- reentrega tras el plazo con allowLate;
- fileId de otro alumno o de otra tarea (422);
- archivo INFECTED o PENDING (422);
- estudiante trasladado que ve su historial pero no puede entregar en la sección vieja;
- docente ajeno (403) y apoderado (403);
- lista del docente con matrículas sin entrega (PENDING);
- computeDisplayStatus con cada gradeState y su precedencia;
- evento y bitácora sin nombres ni originalName.

Comandos:
- pnpm --filter api test.
- El e2e de submissions con NODE_OPTIONS=--dns-result-order=ipv4first. Antes, calienta MySQL con docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"'.
- Si limpias versiones tocando el trigger, usa la guarda de test/db-test-guard.ts.

En paralelo:
- otro agente trabaja en la web (curso/[id]/tareas);
- otro audita la seguridad.
No toques su código. La API corre en :4000: no la detengas. Deja la BD con pnpm db:seed (mismo NODE_OPTIONS). No leas .env.

Devuelve un INFORME breve del protocolo (LISTO o CAMBIOS_PEDIDOS con archivo:línea).
```

### 37. seguridad-cumplimiento — Seguridad de entregas (3d)

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 11, fase 3d de entregas; INFORME 6 para la guarda de BD).

Encargo acotado y breve: auditoría de seguridad de la 3d. Solo lectura sobre apps/api/src/modules/submissions/ y apps/api/test/db-test-guard.ts (y su uso en contents-assignments.e2e-spec.ts y submissions.e2e-spec.ts). Requisitos: RNF-09..13, RN-09, RN-10, RN-14; docs/05.

Revisa:
- Permisos por rol y por pertenencia:
  - solo el estudiante con matrícula vigente entrega;
  - el historial lo ven el dueño, el docente asignado y ADMIN;
  - el apoderado recibe 403;
  - la lista es solo del docente asignado o ADMIN.
- Validación del fileId: propósito SUBMISSION, la misma tarea, el mismo alumno, CLEAN y no purgado.
- El orden de bloqueos período → Assignment → Enrollment FOR UPDATE → StoredFile frente al resto del proyecto, y el riesgo de deadlock.
- La idempotencia antes de RN-10.
- La inmutabilidad de SubmissionVersion.
- originalName solo en la constancia.
- Bitácora y evento sin datos personales.
- Que la guarda de BD impida de verdad DROP/CREATE TRIGGER fuera de una BD local de tests.

Si en 10 minutos no lo cubres todo, entrega con lo revisado. Devuelve el INFORME del protocolo con severidad, APROBADO o CAMBIOS_PEDIDOS y archivo:línea.
```

### 38. SendMessage al agente en curso — Correcciones de seguridad de la 3d

```
3f recibida (INFORME 14). Ahora aplica en una sola pasada las correcciones de seguridad de la 3d (INFORME 12 y Decisión del orquestador 10). Solo en apps/api/test/db-test-guard.ts y apps/api/src/modules/submissions/:
1. (MEDIO) La guarda de BD exige, además de lo que ya pide, `E2E_ALLOW_DDL=1` antes de cualquier DROP o CREATE TRIGGER. Ajusta los e2e para que la definan; también vale ponerla en el arranque del propio e2e si se ejecuta en local. Opcional: verificar @@port.
2. (BAJO) Si fallan `fn` y la reposición del trigger, no ocultes el error original: lanza un error que incluya los dos.
3. (BAJO) Un fileId que ya entregó otro alumno debe responder el mismo 422 `invalidFile`, no 409. Actualiza el e2e si hace falta.
4. (BAJO) Comprueba si cerrar el año cierra sus períodos. Si no los cierra, vuelve a comprobar dentro de la transacción que el año sigue escribible; si los cierra, solo anótalo.

No toques la web, porque ux-accesibilidad la está revisando. Tampoco hagas commit. Además, no aceptes la política por más usuarios: el usuario solo había autorizado hacerlo por el admin. Si necesitas una sesión, usa la de admin.

Verificación: api lint, test y build; e2e de submissions, contents-* y db-test-guard; prettier. Deja la BD con pnpm db:seed. Devuelve un INFORME breve con archivo:línea.
```

### 39. ux-accesibilidad — UX de pantallas de Dev 3

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 14 de la fase 3f y la Decisión 8, sobre las pantallas de materiales).

Encargo acotado y breve: revisa la interfaz de las dos pantallas web de Dev 3. Requisitos: RF-26..28, RF-33, RF-36..39; RNF-24..27. Solo lectura, sobre:
- apps/web/app/(app)/curso/[id]/tareas/ (page.tsx, create-assignment-form.tsx, submit-form.tsx, assignment-format.ts)
- apps/web/app/(app)/curso/[id]/_materials/ (materials-page.tsx, materials-panel.tsx)

Revisa:
- 360 px: tabla de entregas con scroll y caption, formularios en columna.
- Labels y aria-describedby de pistas y errores.
- Objetivos de 44 px.
- Estados de carga y anuncios en role="status" o "alert" al subir, validar, publicar y entregar.
- Foco después de publicar o entregar con éxito y después de un error.
- El rechazo en el cliente de archivos que no son PDF o pasan de 20 MiB: ¿se anuncia?
- Los campos de plazo (datetime-local), nota NE y tamaño en MiB: ¿se explican?
- La constancia: claridad y lectura con lector de pantalla.
- Textos en español claros.
- Coherencia con apps/web/app/(app)/admin/_shared (ActionFeedback, useAnnounce, FOCUS_HEADING) cuando aplique.

Solo lectura. Si en 10 minutos no lo cubres todo, entrega con lo revisado. Devuelve el INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, separando lo que bloquea.
```

### 40. SendMessage al agente en curso — Correcciones de seguridad de la 3d

```
3f recibida (INFORME 14). Ahora aplica en una sola pasada las correcciones de seguridad de la 3d (INFORME 12 y Decisión del orquestador 10). Solo en apps/api/test/db-test-guard.ts y apps/api/src/modules/submissions/:
1. (MEDIO) La guarda de BD exige, además de lo que ya pide, `E2E_ALLOW_DDL=1` antes de cualquier DROP o CREATE TRIGGER. Ajusta los e2e para que la definan; también vale ponerla en el arranque del propio e2e si se ejecuta en local. Opcional: verificar @@port.
2. (BAJO) Si fallan `fn` y la reposición del trigger, no ocultes el error original: lanza un error que incluya los dos.
3. (BAJO) Un fileId que ya entregó otro alumno debe responder el mismo 422 `invalidFile`, no 409. Actualiza el e2e si hace falta.
4. (BAJO) Comprueba si cerrar el año cierra sus períodos. Si no los cierra, vuelve a comprobar dentro de la transacción que el año sigue escribible; si los cierra, solo anótalo.

No toques la web, porque ux-accesibilidad la está revisando. Tampoco hagas commit. Además, no aceptes la política por más usuarios: el usuario solo había autorizado hacerlo por el admin. Si necesitas una sesión, usa la de admin.

Verificación: api lint, test y build; e2e de submissions, contents-* y db-test-guard; prettier. Deja la BD con pnpm db:seed. Devuelve un INFORME breve con archivo:línea.
```

### 41. ux-accesibilidad — UX de pantallas de Dev 3

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 14 de la fase 3f y la Decisión 8, sobre las pantallas de materiales).

Encargo acotado y breve: revisa la interfaz de las dos pantallas web de Dev 3. Requisitos: RF-26..28, RF-33, RF-36..39; RNF-24..27. Solo lectura, sobre:
- apps/web/app/(app)/curso/[id]/tareas/ (page.tsx, create-assignment-form.tsx, submit-form.tsx, assignment-format.ts)
- apps/web/app/(app)/curso/[id]/_materials/ (materials-page.tsx, materials-panel.tsx)

Revisa:
- 360 px: tabla de entregas con scroll y caption, formularios en columna.
- Labels y aria-describedby de pistas y errores.
- Objetivos de 44 px.
- Estados de carga y anuncios en role="status" o "alert" al subir, validar, publicar y entregar.
- Foco después de publicar o entregar con éxito y después de un error.
- El rechazo en el cliente de archivos que no son PDF o pasan de 20 MiB: ¿se anuncia?
- Los campos de plazo (datetime-local), nota NE y tamaño en MiB: ¿se explican?
- La constancia: claridad y lectura con lector de pantalla.
- Textos en español claros.
- Coherencia con apps/web/app/(app)/admin/_shared (ActionFeedback, useAnnounce, FOCUS_HEADING) cuando aplique.

Solo lectura. Si en 10 minutos no lo cubres todo, entrega con lo revisado. Devuelve el INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, separando lo que bloquea.
```

### 42. SendMessage al agente en curso — Vuelta 1/2: accesibilidad de las pantallas

```
Cuando termines las correcciones de seguridad, haz la vuelta de corrección 1/2 de las pantallas web. Lee en el expediente el INFORME 15 (ux-accesibilidad) y la Decisión 12. Solo toca apps/web/app/(app)/curso/[id]/tareas/ y _materials/.

ALTO:
1. Separa los mensajes: los errores van en role="alert" y el éxito en role="status". Valida campo por campo, con aria-invalid y aria-describedby (error + pista), y lleva el foco al primer campo inválido. Aplica esto en create-assignment-form, submit-form y materials-panel.
2. Después de un éxito, limpia el input de archivo con una ref (en materials-panel no se limpia) y mueve el foco al mensaje de resultado (tabIndex=-1).
3. Constancia:
   - anúnciala en frases cortas;
   - pon el código de referencia en un elemento con aria-label para que no se deletree;
   - muéstrala como bloque visible después del éxito, también en el Receipt de page.tsx.

MEDIO:
- pista del plazo (fecha y hora futura);
- grid de una columna por debajo de 400 px;
- explicar "NE = no entregó";
- usar aria-disabled en lugar de disabled mientras se envía;
- reutilizar checkPdf en materials-panel, con mensajes separados para tipo y tamaño;
- cambiar el mensaje "Error" por uno con guía;
- hacer enfocable el contenedor con scroll de la tabla (tabIndex=0, role="region" y aria-label).

BAJO: usar formatSize en "Máx.".

Si extraes lógica, añade tests puros. No hagas commit.

Verificación: web lint, test y build; tsc; prettier. Devuelve un INFORME breve con archivo:línea, sumando lo de seguridad si aún no lo entregaste.
```

### 43. SendMessage al agente en curso — Vuelta 1/2: accesibilidad de las pantallas

```
Cuando termines las correcciones de seguridad, haz la vuelta de corrección 1/2 de las pantallas web. Lee en el expediente el INFORME 15 (ux-accesibilidad) y la Decisión 12. Solo toca apps/web/app/(app)/curso/[id]/tareas/ y _materials/.

ALTO:
1. Separa los mensajes: los errores van en role="alert" y el éxito en role="status". Valida campo por campo, con aria-invalid y aria-describedby (error + pista), y lleva el foco al primer campo inválido. Aplica esto en create-assignment-form, submit-form y materials-panel.
2. Después de un éxito, limpia el input de archivo con una ref (en materials-panel no se limpia) y mueve el foco al mensaje de resultado (tabIndex=-1).
3. Constancia:
   - anúnciala en frases cortas;
   - pon el código de referencia en un elemento con aria-label para que no se deletree;
   - muéstrala como bloque visible después del éxito, también en el Receipt de page.tsx.

MEDIO:
- pista del plazo (fecha y hora futura);
- grid de una columna por debajo de 400 px;
- explicar "NE = no entregó";
- usar aria-disabled en lugar de disabled mientras se envía;
- reutilizar checkPdf en materials-panel, con mensajes separados para tipo y tamaño;
- cambiar el mensaje "Error" por uno con guía;
- hacer enfocable el contenedor con scroll de la tabla (tabIndex=0, role="region" y aria-label).

BAJO: usar formatSize en "Máx.".

Si extraes lógica, añade tests puros. No hagas commit.

Verificación: web lint, test y build; tsc; prettier. Devuelve un INFORME breve con archivo:línea, sumando lo de seguridad si aún no lo entregaste.
```

### 44. ux-accesibilidad — UX: verificar corrección de Dev 3

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (tu INFORME 15 y el INFORME 16 del dev).

Encargo breve: verifica en el código que se resolvieron tus 3 ALTO, tus MEDIO y el BAJO, solo en apps/web/app/(app)/curso/[id]/tareas/ y _materials/ (form-feedback.tsx, pdf-check.ts, receipt-view.tsx, materials-panel.tsx, create-assignment-form.tsx, submit-form.tsx, page.tsx). Busca regresiones.

Solo lectura y máximo 10 minutos. Devuelve un INFORME breve del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea. Es la vuelta 1 de 2: marca solo como bloqueante lo que lo sea de verdad.
```

### 45. revisor-pr — Revisión final de Dev 3

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md. Lee los INFORMES 1, 11 a 16 y las Decisiones del orquestador 8 a 13.

Encargo: revisión final de Dev 3 sobre todo lo que hay sin commit desde 0f16ae8 (commit parcial de Dev 3). Hazla en una sola pasada.

1. Definición de terminado (docs/06_GIT_CALIDAD.md).
2. Alcance permitido:
   - apps/api/src/modules/submissions/
   - apps/api/test/ (submissions, db-test-guard, contents-*)
   - apps/web/app/(app)/curso/[id]/ (tareas/ y _materials/)
   - prisma/seed/credentials.ts y prisma/seed/index.ts: contraseña de prueba del admin, pedida por el usuario y documentada
   - el expediente
   No debe haber cambios en package.json, el lockfile, app.module, prisma/schema, nav, layouts ni módulos de otros devs. .agents/ y skills-lock.json no entran. Indica cualquier otro archivo modificado.
3. Opina sobre la Decisión 13: los e2e definen E2E_ALLOW_DDL ellos mismos. ¿Es aceptable?
4. Comprueba que pasan:
   - pnpm --filter api lint, test y build;
   - los e2e submissions, db-test-guard, contents-assignments, contents-materials y files, con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado (docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"');
   - pnpm --filter web lint, test y build;
   - prettier --check sobre los archivos tocados.
   La API y la web corren en :4000 y :3000: no las detengas. Deja la BD con pnpm db:seed (con el mismo NODE_OPTIONS).

No modifiques archivos. Devuelve el INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, y la lista de archivos para el commit.
```

### 46. documentador — Documentar Dev 3

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 1 y los informes de cada fase: 2 del esquema, 3 de tareas, 4 de materiales, 5 y 9 de archivos, 11 de entregas, 14 y 16 de pantallas). Lee el código si dudas.

Encargo: documentar Dev 3 (contenidos, entregas y almacenamiento; RF-26..31, RF-33..40, RNF-03/18). Solo docs/. Sé conciso, solo añade y no reescribas secciones ajenas. Estado: PROPUESTA, aprobada por los agentes de revisión, implementada con agentes en features/adolfo.

1. docs/03_CONTRATOS.md: endpoints de archivos, tareas, materiales y entregas, y eventos (assignment.created/updated.v1, material.published.v1, submission.accepted.v1, submission.rejected.v1), tal como quedaron, con los códigos de error. Incluye también el contrato para Dev 4 (SubmissionsReadService y computeDisplayStatus).
2. docs/02_MODELO_ENTIDADES.md: corregir `neGrade` → `noSubmissionGrade` (hallazgo del INFORME 1) y una nota breve de las 5 entidades de contents.prisma.
3. docs/08_DECISIONES.md: las decisiones aprobadas por el usuario (receivedAt = completedAt al confirmar la subida; escaneo síncrono detrás de FileScanner; MiB, 20 por defecto y 50 de tope; Material.periodId opcional; TTL de 5 min y 60 s; el apoderado no ve materiales), la cuarentena incoming/ contra TOCTOU y la bitácora posterior al commit como decisión pendiente de Dev 1. Usa el siguiente número libre.
4. docs/10_TRAZABILIDAD.md: estado de RF-26..31 y RF-33..40.
5. docs/manuales/tecnico.md: sección de Dev 3. Incluye las variables S3_* y CLAMAV_* de .env.example, ClamAV con StreamMaxLength 64M, la guarda de los e2e (E2E_ALLOW_DDL) y las rutas web /curso/[id]/clases, /lecturas y /tareas. Añade también la contraseña de prueba del admin del seed: di que está en prisma/seed/credentials.ts y que solo vale en local, sin copiar el valor.
6. docs/manuales/administrador.md: si aplica, unas líneas sobre tareas y materiales.

Pendientes a anotar:
- texto legal del aviso de copyright;
- ciclo de vida de incoming/ y CORS de R2 (Dev 1);
- barrido de intents vencidos (Dev 5);
- descarga del PDF y edición o borrado de tareas en pantalla;
- rótulos de nota de Dev 4.

Devuelve el INFORME del protocolo con los archivos.
```

### 47. ux-accesibilidad — UX: verificar corrección de Dev 3

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (tu INFORME 15 y el INFORME 16 del dev).

Encargo breve: verifica en el código que se resolvieron tus 3 ALTO, tus MEDIO y el BAJO, solo en apps/web/app/(app)/curso/[id]/tareas/ y _materials/ (form-feedback.tsx, pdf-check.ts, receipt-view.tsx, materials-panel.tsx, create-assignment-form.tsx, submit-form.tsx, page.tsx). Busca regresiones.

Solo lectura y máximo 10 minutos. Devuelve un INFORME breve del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea. Es la vuelta 1 de 2: marca solo como bloqueante lo que lo sea de verdad.
```

### 48. revisor-pr — Revisión final de Dev 3

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md. Lee los INFORMES 1, 11 a 16 y las Decisiones del orquestador 8 a 13.

Encargo: revisión final de Dev 3 sobre todo lo que hay sin commit desde 0f16ae8 (commit parcial de Dev 3). Hazla en una sola pasada.

1. Definición de terminado (docs/06_GIT_CALIDAD.md).
2. Alcance permitido:
   - apps/api/src/modules/submissions/
   - apps/api/test/ (submissions, db-test-guard, contents-*)
   - apps/web/app/(app)/curso/[id]/ (tareas/ y _materials/)
   - prisma/seed/credentials.ts y prisma/seed/index.ts: contraseña de prueba del admin, pedida por el usuario y documentada
   - el expediente
   No debe haber cambios en package.json, el lockfile, app.module, prisma/schema, nav, layouts ni módulos de otros devs. .agents/ y skills-lock.json no entran. Indica cualquier otro archivo modificado.
3. Opina sobre la Decisión 13: los e2e definen E2E_ALLOW_DDL ellos mismos. ¿Es aceptable?
4. Comprueba que pasan:
   - pnpm --filter api lint, test y build;
   - los e2e submissions, db-test-guard, contents-assignments, contents-materials y files, con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado (docker compose exec -T mysql sh -c 'mysql --protocol=TCP -h127.0.0.1 -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "SELECT 1"');
   - pnpm --filter web lint, test y build;
   - prettier --check sobre los archivos tocados.
   La API y la web corren en :4000 y :3000: no las detengas. Deja la BD con pnpm db:seed (con el mismo NODE_OPTIONS).

No modifiques archivos. Devuelve el INFORME del protocolo: APROBADO o CAMBIOS_PEDIDOS con archivo:línea, y la lista de archivos para el commit.
```

### 49. documentador — Documentar Dev 3

```
Expediente: .claude/tareas/20261029-dev3-contenidos.md (INFORME 1 y los informes de cada fase: 2 del esquema, 3 de tareas, 4 de materiales, 5 y 9 de archivos, 11 de entregas, 14 y 16 de pantallas). Lee el código si dudas.

Encargo: documentar Dev 3 (contenidos, entregas y almacenamiento; RF-26..31, RF-33..40, RNF-03/18). Solo docs/. Sé conciso, solo añade y no reescribas secciones ajenas. Estado: PROPUESTA, aprobada por los agentes de revisión, implementada con agentes en features/adolfo.

1. docs/03_CONTRATOS.md: endpoints de archivos, tareas, materiales y entregas, y eventos (assignment.created/updated.v1, material.published.v1, submission.accepted.v1, submission.rejected.v1), tal como quedaron, con los códigos de error. Incluye también el contrato para Dev 4 (SubmissionsReadService y computeDisplayStatus).
2. docs/02_MODELO_ENTIDADES.md: corregir `neGrade` → `noSubmissionGrade` (hallazgo del INFORME 1) y una nota breve de las 5 entidades de contents.prisma.
3. docs/08_DECISIONES.md: las decisiones aprobadas por el usuario (receivedAt = completedAt al confirmar la subida; escaneo síncrono detrás de FileScanner; MiB, 20 por defecto y 50 de tope; Material.periodId opcional; TTL de 5 min y 60 s; el apoderado no ve materiales), la cuarentena incoming/ contra TOCTOU y la bitácora posterior al commit como decisión pendiente de Dev 1. Usa el siguiente número libre.
4. docs/10_TRAZABILIDAD.md: estado de RF-26..31 y RF-33..40.
5. docs/manuales/tecnico.md: sección de Dev 3. Incluye las variables S3_* y CLAMAV_* de .env.example, ClamAV con StreamMaxLength 64M, la guarda de los e2e (E2E_ALLOW_DDL) y las rutas web /curso/[id]/clases, /lecturas y /tareas. Añade también la contraseña de prueba del admin del seed: di que está en prisma/seed/credentials.ts y que solo vale en local, sin copiar el valor.
6. docs/manuales/administrador.md: si aplica, unas líneas sobre tareas y materiales.

Pendientes a anotar:
- texto legal del aviso de copyright;
- ciclo de vida de incoming/ y CORS de R2 (Dev 1);
- barrido de intents vencidos (Dev 5);
- descarga del PDF y edición o borrado de tareas en pantalla;
- rótulos de nota de Dev 4.

Devuelve el INFORME del protocolo con los archivos.
```

## Decisiones del orquestador

1. Merge de `origin/features/luchito` y `origin/develop` (con permiso del usuario); conflictos resueltos conservando ambos lados; SDK de S3 alineado; helper `createDbTestApp` para los e2e con MySQL.
2. Módulos vacíos `files`, `contents` y `submissions` registrados en `app.module.ts` para trabajar en paralelo (autorizado).
3. Paralelismo: 3b ∥ 3c, luego 3e y 3d con el mismo agente mientras QA y seguridad revisaban; correcciones en un solo mensaje por agente.
4. Fallo del orquestador: un plan no se guardó al primer intento (heredoc); se corrigió con Write + cat.
5. La bitácora después del commit queda como decisión (D-047), pendiente de `record(event, tx)` de Dev 1.
6. Se aceptó que los e2e definan `E2E_ALLOW_DDL` (Decisión 13), respaldado por el revisor.
7. Incidente: un agente aceptó la política por docente01 y estudiante01 sin autorización; se revirtió (queda el registro en la bitácora inmutable) y se informó al usuario.
8. El orquestador corrigió a mano tres textos desfasados de docs (tecnico.md seed y autenticación, administrador.md estado, D-006/D-007/D-010 resueltas).

## Archivos

Ver los INFORMES del expediente y `git show --stat` de los commits `0f16ae8` y el de esta tarea. Principales: `prisma/schema/contents.prisma` y su migración; `apps/api/src/modules/{files,storage,contents,submissions}/`; `apps/api/test/{files,contents-*,submissions,db-test-guard}*`; `apps/web/app/(app)/curso/[id]/{_materials,tareas,clases,lecturas}/`; `prisma/seed/credentials.ts`; `docker-compose.yml`, `.env.example`; docs/.

## Verificación

API lint 0 · test 47/571 · build ok · e2e 14/398 · web lint ok · test 14/297 · build ok · prettier ok · `pnpm db:seed` ok.

## Pendientes y decisiones abiertas

- Prueba en navegador real (subida a MinIO, 360 px, lector de pantalla).
- Descarga del PDF y edición/borrado de tareas en pantalla.
- Texto legal del aviso de copyright.
- Dev 1: ciclo de vida de `incoming/`, CORS de R2, revisión de `app.setup.ts`, filtro de errores, `docker-compose.yml`, `.env.example`, `app.module.ts`; `record(event, tx)`.
- Dev 5: barrido de intents vencidos. Dev 4: estados GRADED/NE/EXEMPT.
- Guarda de BD con `@@port` y ventana D-030 en la entrega.

## Expediente

[.claude/tareas/20261029-dev3-contenidos.md](../tareas/20261029-dev3-contenidos.md)
