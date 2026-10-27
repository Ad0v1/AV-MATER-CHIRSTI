# Dev 2, Fase 4: importación masiva de usuarios (RF-21)

Pedido por el usuario: "Sigue con la Fase 4 de Dev 2: importación masiva de usuarios (RF-21), con los agentes."
Flujo: completo
Vueltas de corrección: 2/2
Entorno: local con Docker (MySQL, Redis, MinIO, ClamAV, Mailpit healthy), rama `features/adolfo` en `1769643`; se sube solo a `mio`.

## Contexto

- Fases previas de Dev 2 (expedientes en `.claude/tareas/`): F1 esquema y seed (`20261026-dev2-estructura.md`), F2 API académica (`20261026-dev2-api-academica.md`), F3 usuarios, matrículas y apoderados (`20261026-dev2-usuarios-matriculas.md`).
- Plan por fases (F1, INFORME 1, Decisión 1): **F4 = RF-21**, importación desde Excel/CSV con validación previa y reporte de filas con error (ExcelJS). Archivos compartidos previstos: `apps/api/package.json` y `pnpm-lock.yaml`.
- Reutilizar la lógica de F3 (`apps/api/src/modules/users/`): validaciones de correo y dominio (`INSTITUTION_EMAIL_DOMAIN`, apoderado exento por D-013), rol inmutable, alta de estudiante con matrícula, alta de docente, alta de apoderado con vínculos, bloqueos y bitácora sin datos personales.
- Dependencias actuales de `apps/api`: NestJS, Prisma, zod, helmet, ioredis, cookie-parser. **No hay** librería de Excel ni de subida de archivos (multer va con `@nestjs/platform-express`).
- Dev 3 es dueño del almacenamiento (MinIO) y del antivirus (ClamAV); Dev 1 de `common/`, `config/`, sesión y CI. No tocar sus módulos.
- **No va al equipo** sin acuerdo con el dueño de Dev 2; depende de D-021.

## Alcance

Solo RF-21. Fuera: pantallas (F5), clonación y promoción (F6).

---

## Informes

### INFORME 1 — arquitecto-integrador

Estado: LISTO
Resumen: RF-21 en alcance v1 (ERS §3.3, Alta): "Importar estudiantes, docentes y apoderados desde Excel o CSV, con validación previa y reporte de filas con error". ERS §6 fija ExcelJS. Submódulo `apps/api/src/modules/users/import/` dentro de `UsersModule`; 3 endpoints (plantilla, preview, commit); commit todo o nada en una transacción; sin estado entre llamadas (se vuelve a subir el archivo y se compara SHA-256). Sin cambio de esquema. Único compartido: `exceljs` en `apps/api/package.json` y lock.

Hallazgos:

- [MEDIO] RF-40 (antivirus) → no se pasa por ClamAV (no se guarda ni se sirve; ClamAV es de Dev 3) → D-035 PROPUESTA.
- [MEDIO] Inyección de fórmulas en exportaciones futuras de Dev 5 → aviso en docs/03; se rechazan nombres que empiezan por `= + - @`.
- [MEDIO] Dependencias transitivas antiguas de exceljs → `pnpm audit --prod`.
- [BAJO] Límite de 10/min obliga a QA a usar app propia por bloque.
- [BAJO] Unidades (D-007): 1 MiB = 1 048 576 B.
- [BAJO] RNF-19: síncrono con tope de 1000 filas; si el volumen crece, worker de Dev 5.

**Decisión 1 — Formato y librería.** CSV y XLSX; no `.xls`, `.xlsm`, `.ods` ni cifrados (415).

- CSV sin dependencia: parser propio RFC 4180 (comillas, `""`, CRLF/LF, separador `,` o `;` según el encabezado), solo UTF-8 con BOM opcional (`TextDecoder` fatal; si no → 400 "Guarda el archivo como CSV UTF-8"), byte NUL → 415, comilla sin cerrar → 400.
- XLSX con `exceljs` 4.4.0 exacta. Mitigaciones:
  - `xlsx-guard.ts` antes de ExcelJS: máx. 100 entradas; sin ZIP64, multidisco ni cifrado; métodos 0 u 8; nombres sin `..` ni `/` inicial; `xl/vbaProject.bin` → 415; descompresión real con `zlib.inflateRawSync(..., { maxOutputLength })` y presupuesto total de 20 MiB (→ 400); `<!DOCTYPE` o `<!ENTITY` en `.xml`/`.rels` → 415.
  - Solo la primera hoja. Fórmula → `FORMULA_NOT_ALLOWED`; fecha, booleano o error → `INVALID_CELL`; richText concatenado; hipervínculo → `.text`; número solo si es entero.
  - `workbook.xlsx.load(buffer)` en memoria. Error de ExcelJS → 400 "El archivo está dañado o no es un Excel válido"; al log solo `error.name`.
- Formato por bytes mágicos (`PK\x03\x04`), que debe coincidir con la extensión (→ 415).

**Decisión 2 — Plantillas.** Encabezados en cualquier orden, normalizados (trim, minúsculas, sin tildes, espacios → `_`); faltante o desconocido → 400.

- `students`: `correo`, `nombre_completo`, `grado` (1..5), `seccion` (código 1..8 alfanumérico en mayúsculas; se busca por año activo + grado + código).
- `teachers`: `correo`, `nombre_completo`.
- `guardians`: `correo_apoderado`, `nombre_apoderado`, `correo_estudiante` (una fila por par; hasta 10 hijos; los estudiantes ya deben existir).
- Filas vacías se ignoran; número de fila físico (encabezado = 1).
- `GET /api/v1/users/import/template?type=students|teachers|guardians&format=xlsx|csv`: CSV UTF-8 con BOM, separador `,`, solo encabezados; XLSX con hoja "Datos" (encabezados en negrita, lista 1..5 en `grado`) y hoja "Instrucciones"; sin filas de ejemplo. `Content-Disposition: attachment; filename="plantilla-<tipo>.<ext>"`, `Cache-Control: no-store`.

**Decisión 3 — Flujo.**

- Preview: no escribe; valida filas y luego contra la BD con lecturas simples.
- Commit: mismo archivo + `sha256`; si no coincide → 409; revalida todo dentro de la transacción; errores → 422 sin escribir nada. Sin Redis ni token.
- Límites: ≤ 1 MiB; ≤ 1000 filas (→ 400); ≤ 500 caracteres por celda (`TOO_LONG`); celdas de más → `EXTRA_CELLS`; máx. 500 errores con `errorsTruncated`.
- Duplicados: en el archivo `DUPLICATE_IN_FILE` (con la fila de la primera aparición); en guardians `NAME_MISMATCH`, `DUPLICATE_LINK`, `TOO_MANY_STUDENTS`, `SAME_PERSON`; contra la BD `EMAIL_TAKEN`; P2002 en carrera → 409.
- Reutiliza piezas de F3 sin llamar a sus servicios (que abren transacción y escriben bitácora por fila): `emailSchema`, `fullNameSchema`, `sectionCode` (exportarlo de academic.dto), `checkEmailDomain` (GUARDIAN exento), `normalizeEmail`, `USERS_MSG`, `lockUsersForUpdate`, `lockYearForShare`, `mapPrismaError`, `MSG.conflict`, `AcademicAccessService.getActiveYear()`, token `INSTITUTION_EMAIL_DOMAIN`.
- Orden de bloqueos: (1) guardians: estudiantes existentes `FOR UPDATE` por id, revalidar STUDENT y no WITHDRAWN; (2) students: año activo `FOR SHARE`, revalidar año activo y abierto (409) y secciones (`SECTION_NOT_FOUND` / `SECTION_INACTIVE`); (3) correos usados; (4) escrituras.
- Escrituras: `createMany` en bloques de 500 para `User`, `Enrollment` (`sectionId` y `academicYearId` juntos desde `Section`; `effectiveFrom = now` del servidor) y `GuardianStudent`; ids con `uuidv7()` propio (`import/uuid-v7.ts`, con pruebas); `$transaction(fn, { timeout: 20_000, maxWait: 5_000 })`; P2002/P2034/deadlock → 409.

**Decisión 4 — Endpoints** (`UserImportController`, `@Controller('users/import')`, `@Roles('ADMIN')` + `@UseGuards(ActiveActorGuard)` de clase; los guards corren antes de multer).

| Método y ruta                | Entrada                                     | Respuesta                                              | Errores                                                                     |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /users/import/template` | query `{ type, format }` (strict)           | 200 archivo                                            | 400                                                                         |
| `POST /users/import/preview` | multipart `file`, `type`                    | 200 `ImportReport`                                     | 400; 401/403; 409 sin año activo o cerrado (students); 413; 415; 429        |
| `POST /users/import/commit`  | multipart `file`, `type`, `sha256` (64 hex) | 201 `{ type, created: { users, enrollments, links } }` | 400; 401/403; 409 hash, año, concurrencia; 413; 415; 422 con `details`; 429 |

- `ImportReport = { type, format, sha256, totalRows, validRows, errorRows, errors, errorsTruncated, summary: { users, enrollments, links }, canConfirm }`; `ImportRowError = { row, column | null, code, message }`: mensaje fijo en español que **nunca repite el valor**.
- Códigos: REQUIRED, INVALID_EMAIL, EMAIL_DOMAIN, INVALID_NAME, INVALID_GRADE, INVALID_SECTION, SECTION_NOT_FOUND, SECTION_INACTIVE, DUPLICATE_IN_FILE, EMAIL_TAKEN, STUDENT_NOT_FOUND, NOT_STUDENT, STUDENT_WITHDRAWN, SAME_PERSON, NAME_MISMATCH, TOO_MANY_STUDENTS, DUPLICATE_LINK, FORMULA_NOT_ALLOWED, INVALID_CELL, TOO_LONG, EXTRA_CELLS.
- 422: `new UnprocessableEntityException({ message: errors })`.
- `FileInterceptor('file', { limits: { fileSize: 1_048_576, files: 1, fields: 3, parts: 4, fieldNameSize: 32, fieldSize: 128 } })`, en memoria; campos con Zod strict; tipo local `{ originalname, size, buffer }` (sin `@types/multer`); `buffer.fill(0)` en `finally`.
- Sin ClamAV (D-035). Sin cambios en `app.setup.ts`.

**Decisión 5 — Seguridad.**

- Fórmulas: respuesta solo JSON sin valores; `escapeCsvCell` en `import/csv-escape.ts` (apóstrofo si empieza por `= + - @`, TAB o CR, y comillas RFC 4180); `fullNameSchema` rechaza nombres que empiezan por `= + - @` (afecta a F3; documentar).
- Menores: sin Redis, disco ni copias; nunca al log `originalname`, filas, correos, nombres ni mensajes de la librería; `buffer.fill(0)`; Zod sin el input.
- Bitácora: un evento por importación confirmada, después del commit, `recordUsers` (nunca lanza), `users.import.commit`, sin `entityType`/`entityId` (hacerlos opcionales en `users-audit.ts`), `after: { type, format, rows, usersCreated, enrollmentsCreated, linksCreated, userIds }`. Preview y commit rechazado no se registran. Sin eventos de dominio.
- `@Throttle({ default: { limit: 10, ttl: 60_000 } })` en preview y commit; constante `IMPORT_RATE_LIMIT`.

**Decisión 6 — Compartidos:** `apps/api/package.json` (`"exceljs": "4.4.0"` exacta) y `pnpm-lock.yaml`. No se tocan `app.module.ts`, `app.setup.ts`, `prisma/`, `env.ts`, `common/`.

**Decisión 7 — Agentes y criterios.**

1. `dev2-estructura` en `users/import/`: `import.constants.ts`, `import-columns.ts`, `csv-parser.ts`, `csv-escape.ts`, `import-file.ts`, `xlsx-guard.ts`, `xlsx-reader.ts`, `import-validator.ts` (puro), `uuid-v7.ts`, `import-template.ts`, `import.dto.ts`, `user-import.service.ts`, `user-import.controller.ts` y sus `.spec`; modifica `users.module.ts`, `users-audit.ts`, `users.dto.ts`, `users.errors.ts`, `academic.dto.ts`. Primero CSV y el flujo completo, luego XLSX. Tests del parser, del guard (bomba de 30 MiB → 400, vbaProject → 415, DOCTYPE → 415, cifrado → 415), del lector, del validador (todos los códigos), de `uuidv7`, de `escapeCsvCell` y del servicio con Prisma simulado. api lint/test/build, prettier, `pnpm db:seed` con los mismos conteos, humo `POST /api/v1/users/import/preview` sin sesión → 401.
2. `qa-tester`: `apps/api/test/users-import.e2e-spec.ts` con archivos generados en el test y usuarios `qa-f4-*@colegio.example` en 3A/3B de 2026: 401/403 en las 3 rutas, ADMIN inactivo 403, sin sesión y > 1 MiB → 401; plantillas 2 × 3; preview y commit de los 3 tipos; todos los códigos; CSV con `;` y BOM; 1001 filas → 400; 1 MiB + 1 → 413; `.exe` renombrado → 415; xlsm → 415; zip bomb → 400; hash distinto → 409; con errores → 422 sin cambios; dos commits paralelos → 201 + 409; dominio con apoderado exento; bitácora única sin datos personales; 429 con app propia; limpieza `qa-f4-%`; conteos finales; test:e2e ×2; seed.
3. `seguridad-cumplimiento`. 4. `revisor-pr`. 5. `documentador` (docs/03, D-035 en docs/08, docs/10, manual técnico). Sin modelador-bd ni ux.

Para: dev2-estructura

### Decisión del orquestador

- `pnpm view exceljs dist-tags`: `latest` = 4.4.0 (publicada el 20/12/2024). Instalada exacta con `pnpm --filter api add exceljs@4.4.0 --save-exact`: `apps/api/package.json` +1 línea y `pnpm-lock.yaml` regenerado. Diff contra `origin/features/david`: David añade `@aws-sdk/*`, `argon2` y `otplib` en el mismo bloque → choque de líneas vecinas, se resuelve a mano.
- `pnpm audit --prod` (2 altas, 3 moderadas, 2 bajas):
  - **De exceljs:** solo `uuid` < 11.1.1 (moderada; afecta a v3/v5/v6 con buffer, que la importación no usa).
  - **Preexistentes, no de exceljs:** `multer` < 2.5.0 (**alta**, DoS por archivo asíncrono pendiente) y `body-parser` < 2.4.0 (**alta**, DoS por bytes finales), ambas vía `@nestjs/platform-express` 12.1.3; la última versión de Nest (12.2.0) sigue fijando `multer` 2.4.0. `fast-uri` (moderadas/bajas) solo vía shadcn en web y herramientas de Prisma.
  - La importación **empieza a usar multer**, así que la alta de multer pasa a ser alcanzable por un ADMIN. Corregirla exige `pnpm.overrides` en el `package.json` raíz (archivo compartido de Dev 1) con `multer` 2.5.0 y `body-parser` 2.4.0, versiones publicadas el 22/10/2026. **Se le pregunta al usuario**; la implementación sigue mientras tanto porque no depende de esa decisión.
- Autorizo los compartidos de la Decisión 6 (ya aplicados).

### INFORME 2 — dev2-estructura

Estado: LISTO
Archivos: apps/api/src/modules/users/import/ (13 archivos de código, 10 specs y zip-builder.mock-spec.ts como ayuda de tests); modificados users.module.ts, users-audit.ts (entityType/entityId opcionales), users.dto.ts (nombres que empiezan por = + - @ rechazados, afecta a F3) y spec, users.errors.ts (IMPORT_MSG), academic.dto.ts (export sectionCode).
Endpoints: GET /users/import/template; POST /users/import/preview (200 ImportReport); POST /users/import/commit (201; 409 hash/año/concurrencia incl. P2028; 422 con details).
Comandos: api lint ok; api test 273/273 (28 archivos); build ok (dist carga exceljs); prettier ok; humo temporal (borrado): 401 sin sesión en las 3 rutas y con archivo de 1 MiB + 1; flujo real en MySQL (students 2+2, repetido → 422 EMAIL_TAKEN, guardians con ';' → 1 usuario y 2 vínculos, 2 eventos de bitácora, hash distinto → 409); test:e2e 179/179; db:seed con los mismos conteos.
Hallazgos:

- [MEDIO] Entorno: tras reiniciar MySQL, las e2e fallan con 45028 (ER_CANNOT_RETRIEVE_RSA_KEY; caché de caching_sha2_password vacía) hasta una conexión con allowPublicKeyRetrieval → avisar a QA; arreglo de fondo de Dev 1.
- [MEDIO] multer < 2.5.0 (alta) sigue abierta; decisión del usuario pendiente.
- [BAJO] secciones leídas sin bloqueo en el commit (misma carrera teórica aceptada en F3).
- [BAJO] el cambio de fullNameSchema afecta a F3 → docs/03.
  Decisiones: códigos del guard XLSX (415 cifrado/ZIP64/multidisco/métodos/vbaProject/DOCTYPE/ENTITY en UTF-8 y UTF-16, no ZIP; 400 > 100 entradas, rutas peligrosas, ZIP dañado, > 20 MiB descomprimidos); encabezado en la fila 1; sin filas de datos → 400; errores de duplicados con "(primera aparición en la fila N)" sin el valor; en guardians el correo del estudiante no se valida contra el dominio; SHA-256 antes de leer filas; campos del multipart validados dentro del try para que el buffer se borre también en 400; escapeCsvCell también entrecomilla ';' (contrato para Dev 5: toCsvLine/escapeCsvCell).
  Verificado por el orquestador: api test 273/273.
  Para: qa-tester y seguridad-cumplimiento

### INFORME 3 — seguridad-cumplimiento

Estado: CAMBIOS_PEDIDOS
Hallazgos:

- [ALTO] H1 xlsx-guard.ts:95 y 134-146 — el guard acepta un hueco entre el directorio central y el EOCD; JSZip (zipEntries.js:230-240) suma ese hueco a los offsets locales → el guard inspecciona una entrada inofensiva y ExcelJS extrae otra (bomba o DOCTYPE). Variante: extra field 0x7075 (nombre Unicode) renombra una entrada en JSZip y escapa del filtro XML. Corrección: exigir cdOffset + cdSize === eocd; rechazar (415) extra field 0x7075; spec con hueco → 400.
- [ALTO] H2 xlsx-reader.ts:75-80 e import.constants.ts:21 — el tope de 1000 filas se aplica tras cargar todo; eachRow + getCell(1..cellCount) crea celdas hasta la columna 16384 → bloqueo del event loop u OOM con una sola petición. Corrección: cortar al pasar un máximo físico de filas (p. ej. 5000 → 400), leer como máximo min(cellCount, 30) columnas (si hay más → EXTRA_CELLS), bajar el presupuesto descomprimido (p. ej. 8 MiB total y tope por entrada), spec adversarial de tiempo/memoria.
- [MEDIO] H3 csv-parser.ts:55-64 — filas vacías sin límite (1 MiB de saltos → ~1 millón de objetos) → no acumular vacías o cortar en un máximo de líneas físicas; mismo tope para celdas por registro.
- [MEDIO] H4 xlsx-guard.ts:48-51 — filtro DOCTYPE/ENTITY solo UTF-8/UTF-16 → rechazar (415) partes XML que no empiecen por BOM UTF-8, espacio o '<' en ASCII.
- [MEDIO] H5 multer < 2.5.0 — alcanzable solo por ADMIN activo tras los guards; riesgo residual bajo; decisión del usuario.
- [BAJO] H6 correos que empiezan por + o - pasan emailSchema → Dev 5 debe escapar toda exportación (docs/03).
- [BAJO] H7 las cadenas JS no se pueden borrar → documentar en D-035.
- [BAJO] H8 afterState con hasta 1000 userIds → verificar tamaño.
  Verificado bien: orden de guards antes de multer; límites de multer en memoria; wipe en finally también en 400; formato por extensión y bytes mágicos; fórmulas y escapeCsvCell; sin datos del archivo en respuestas, logs ni bitácora; SHA-256 sin TOCTOU; transacción todo o nada; throttle; sin SQL crudo propio.
  ClamAV (D-035): aceptable si D-035 dice que el archivo nunca se guarda ni se reexpone, y que si algún día se guarda pase por ClamAV.
  Para: dev2-estructura (H1–H4)

### Decisión del orquestador (vuelta 1/2)

Se corrigen H1, H2, H3 y H4 en cuanto termine qa-tester (para no cambiar el código mientras corre los e2e). H5 sigue con el usuario. H6 y H7 al documentador; H8 se verifica en la corrección.

### INFORME 4 — qa-tester

Estado: LISTO
Archivo: apps/api/test/users-import.e2e-spec.ts (nuevo, 59 casos; archivos generados en el test; usuarios qa-f4-*; sección fixture 3F borrada al final).
Cobertura: 401/403 en las 3 rutas; ADMIN inactivo 403; sin sesión + 1 MiB + 1 → 401; plantillas 2 × 3; preview y commit de students (CSV, ';' con BOM y CRLF, comillas, tildes, XLSX), teachers y guardians (dominio exento); los 21 códigos con fila y columna; errorsTruncated; 1000 filas ok y 1001 → 400; 1 MiB ok y 1 MiB + 1 → 413; .exe/.xls/.ods/OLE/ZIP como .csv/CSV como .xlsx → 415; xlsm → 415; bomba ZIP → 400; > 100 entradas → 400; DOCTYPE → 415; latin1 y comilla sin cerrar → 400; NUL → 415; hash distinto → 409; commit con errores → 422 sin cambios; dos commits paralelos → 201 + 409; bitácora única sin datos personales; ninguna respuesta repite valores; 429 en bloque propio.
Comandos: test:e2e 238/238 dos veces; el archivo nuevo 4 veces más sin intermitencia; lint ok; prettier ok; db:seed con los mismos conteos.
Hallazgos (BAJO): almacén de throttling sin límite en la app principal (429 en bloque propio); 409 por año inactivo/cerrado solo en unit tests; la carrera podría dar 422 en CI lento.
Para: dev2-estructura (correcciones H1–H4 del INFORME 3)

### INFORME 5 — dev2-estructura (corrección 1/2)

Estado: LISTO
Archivos: import/xlsx-xml.ts (nuevo); xlsx-guard.ts, xlsx-reader.ts, csv-parser.ts, import.constants.ts, zip-builder.mock-spec.ts (opciones nuevas) y specs.
Cambios:

- H1: solo ZIP canónico (EOCD final, cdOffset + cdSize === eocd, cabecera local idéntica a su entrada central, extra 0x7075 → 415, nombres ASCII sin duplicados, cobertura sin huecos, tamaño y CRC32 verificados). Ataques reproducidos contra el JSZip real → 400/415.
- H2: presupuesto 8 MiB total / 4 MiB por entrada; pre-chequeo del XML antes de ExcelJS (filas ≤ 5000, celdas ≤ 50 000, col max ≤ 16384, mergeCell ≤ 500, áreas de merge/validación/nombres definidos ≤ 50 000) → 400. Encontró además que mergeCell A1:XFD5000 y un nombre definido de hoja completa en archivos de ~1,4 KB provocaban OOM fatal, y col max 10 000 000 ocupaba 1,5 GB: ahora se rechazan. Lector con eachCell, máx. 30 columnas y marcador EXTRA_CELLS.
- H3: CSV sin acumular filas vacías; registro 5001 → 400; > 16384 campos → 400; máx. 30 campos guardados.
- H4: toda parte .xml/.rels/.vml debe empezar por '<' ASCII tras BOM UTF-8 opcional, sin NUL y en UTF-8 válido → 415.
- H8: 1000 userIds = ~40 KB en JSON, cabe.
  Comandos: lint ok; api test 299/299; build ok; prettier ok; test:e2e 237/238 (el caso "exactamente 1 MiB" usa ~1 millón de líneas vacías y ahora da 400 por H3; no se editó); ReDoS del guard < 100 ms.
  Hallazgos (BAJO): tsc --noEmit TS2339 en user-import.service.spec.ts:313 (tipos del spec); mensajes nuevos en import.constants.ts en vez de users.errors.ts; strings del XML tampoco se pueden borrar (D-035).
  Fricción aceptada: validación de datos sobre una columna entera, nombres definidos con fórmulas, partes con nombres no ASCII y filas con estilo más allá de la 5000 dan 400. La plantilla propia pasa. Falta probar con un .xlsx guardado por Excel o LibreOffice real.
  Verificado por el orquestador: api test 299/299.
  Para: qa-tester (ajustar el caso de 1 MiB y añadir e2e de los nuevos límites) y seguridad-cumplimiento (revisar H1–H4)

### INFORME 6 — qa-tester

Estado: LISTO
Archivos: apps/api/test/users-import.e2e-spec.ts; apps/api/src/modules/users/import/user-import.service.spec.ts (TS2339 resuelto).
Cambios: caso de 1 MiB con una sola línea de espacios (1 048 576 B → 200; +1 → 413); 8 casos nuevos: hueco en el ZIP → 400; extra 0x7075 → 415; mergeCell, nombre definido y col max gigantes → 400; 5001 filas físicas (CSV y XLSX) → 400 y 5000 → 200; CSV con 16 385 campos → 400; XML en UTF-16 con DOCTYPE → 415; round-trip de las 6 plantillas (vacía → 400 por no tener datos; con una fila → 200 sin errores).
Comandos: api test 299/299; test:e2e 246/246 dos veces; tsc --noEmit solo con el TS6059 preexistente; lint ok; prettier ok; db:seed con los mismos conteos.
Hallazgos (BAJO): sigue sin probarse un .xlsx guardado por Excel o LibreOffice real; format:check global falla por .claude/ y .agents/.
Para: seguridad-cumplimiento

### INFORME 7 — seguridad-cumplimiento (re-auditoría H1–H4)

Estado: CAMBIOS_PEDIDOS
Verificado: sin diferencial de parser entre el guard y JSZip (EOCD, hueco, cabecera local, extra fields, descriptores, método 0, ZIP64 implícito, nombres, cobertura, tamaño y CRC); el pre-chequeo XML cubre lo que ExcelJS expande (mergeCells, dataValidations, definedNames, cols por hoja, filas, celdas); sin bordes evadibles (prefijos, mayúsculas, comillas, entidades, DOCTYPE en CDATA/comentarios); sin ReDoS; CSV lineal.
Hallazgos:

- [ALTO] H9 xlsx-xml.ts:241-250 y xlsx-reader.ts:101 — `sheetId` sin límite en workbook.xml: ExcelJS hace `_worksheets[sheetId] = …`; con sheetId 4294967294, `get worksheets()` (slice/filter) recorre ~4,3 × 10^9 posiciones → minutos de CPU síncrona con un archivo de cientos de bytes. Corrección: en inspectWorkbook, cada `<sheet>` con sheetId /^[0-9]{1,4}$/ y ≤ 1000, máx. 50 hojas, lo mismo para localSheetId de definedName; spec adversarial < 1 s con ExcelJS real.
- [MEDIO] H10 xlsx-xml.ts:181-189 — sin presupuesto global de columnas (90 hojas × max 16384 → ~1,5 millones de objetos) → acumular el mayor max por hoja y tope global (p. ej. 3 × 16384) o máx. 20 hojas.
- [MEDIO] H11 xlsx-xml.ts:37 y 256-258 — exigir UTF-8 a partes que ExcelJS no lee (customXml, docProps/custom.xml) puede rechazar archivos legítimos de SharePoint/OneDrive → aplicar decodeXmlPart y FORBIDDEN_DECL solo a las partes que ExcelJS procesa (regex de xlsx.js:361-401).
- [BAJO] H12 presupuestos de filas/celdas sumados entre hojas (fricción menor); sharedStrings/styles acotados por 4 MiB por entrada.
  Para: dev2-estructura (H9 bloquea; H10 y H11 recomendados)

### Decisión del orquestador (vuelta 2/2, la última)

Se corrigen H9, H10 y H11 en esta vuelta. Es la última vuelta permitida: si la verificación siguiente vuelve a pedir cambios, se para y se reporta al usuario.

### INFORME 8 — dev2-estructura (corrección 2/2)

Estado: LISTO
H9 reproducido antes de corregir (ExcelJS real, 1,4 KB): sheetId 1e6 → 52 ms, 1e7 → 561 ms, 1e8 → 20,7 s, 4294967294 → no terminó en 600 s. Ahora sheetId /^[0-9]{1,4}$/, ≤ 1000, único; máx. 50 hojas; localSheetId ≤ 1000 → 400 en < 1 s.
H10: presupuesto global = suma de la mayor columna por hoja, tope 3 × 16384.
H11: UTF-8, DOCTYPE/ENTITY y límites solo en las partes que ExcelJS procesa (regex reales de xlsx.js); customXml y docProps/custom.xml en UTF-16 se aceptan.
Hallazgo nuevo (corregido): Row._cells[col-1] se recorre entero en hasValues/eachCell; 27 KB con 4999 filas con un espacio en XFD → 200 tras 6,3 s de CPU. Ahora "ancho de filas" global ≤ 500 000 → 400 en < 1 s.
Revisión de ExcelJS: índices recorridos acotados (_worksheets, columnas, _cells, _rows); el resto solo acceso directo (localSheetId acotado igualmente, worksheetRels, estilos, numFmt, sharedStrings, media, dibujos, definedNames, comentarios, etc.).
Archivos: xlsx-xml.ts, xlsx-guard.ts, import.constants.ts, zip-builder.mock-spec.ts, xlsx-guard.spec.ts, xlsx-reader.spec.ts; specs temporales borrados.
Comandos: lint ok; api test 314/314; build ok; prettier ok; tsc solo TS6059 preexistente; test:e2e 246/246.
Fricción: hojas con más de 100 columnas usadas en 5000 filas dan 400; falta probar con Excel/LibreOffice real.
Verificado por el orquestador: api test 314/314 y sin specs temporales.
Para: seguridad-cumplimiento (verificación final)

### INFORME 9 — seguridad-cumplimiento (verificación final, vuelta 2/2)

Estado: APROBADO (0 CRÍTICO, 0 ALTO)
Verificado contra ExcelJS 4.4.0: H9 (sheetId/localSheetId ≤ 1000, máx. 50 hojas), H10 (presupuesto global de columnas), H11 (las partes que ExcelJS parsea con saxes son exactamente las que revisa el guard, sin bypass) y el ancho de filas (hasValues, eachCell, cellCount) cerrados. Lista de índices de ExcelJS completa; ningún otro recorrido sobre un valor controlado por el atacante.
Hallazgos (BAJO): fricción con Excel real (formato de columna completa en ≥ 4 hojas, > 100 columnas en 5000 filas → 400); tope de áreas sumado entre hojas; H5–H7 como estaban.
Para: revisor-pr

### Decisión del usuario y del orquestador sobre multer y body-parser (H5)

Pedido del usuario: "Sí, agrega pnpm.overrides en el package.json raíz con multer 2.5.0 y body-parser 2.4.0 exactas, vuelve a correr pnpm audit --prod y los tests, y déjalo anotado para David."

- Primero se añadió `pnpm.overrides` en el `package.json` raíz, como se pidió, pero **pnpm 12 lo ignora** ("Lockfile is up to date", versiones sin cambios). Se revirtió ese cambio.
- Se puso en `pnpm-workspace.yaml` (donde pnpm 12 lee la configuración, junto a `allowBuilds`): `overrides: { multer: 2.5.0, body-parser: 2.4.0 }`, con un comentario del motivo. `pnpm install` resolvió `multer@2.5.0` y `body-parser@2.4.0`.
- `pnpm audit --prod`: 0 críticas, **0 altas** (antes 2), 3 moderadas (uuid vía exceljs; fast-uri vía shadcn/prisma), 2 bajas.
- `pnpm lint` ok; `pnpm --filter api test` 314/314; `pnpm build` 5/5; `pnpm --filter api test:e2e` 246/246.
- Nota para David (Dev 1): queda en docs/08 (documentador) que `pnpm-workspace.yaml` y el lock fuerzan esas versiones, por qué, y que se quitan cuando `@nestjs/platform-express` las actualice.

### INFORME 10 — revisor-pr

Estado: APROBADO
Comandos: lint 5/5; test 314/314; build 5/5; test:e2e 246/246; audit --prod 0 críticas y 0 altas; tsc solo TS6059 preexistente; db:seed con los conteos de siempre; format:check falla solo por .agents/ y este expediente.
Verificado: guards antes de multer; buffer borrado en todos los caminos; sin datos personales; todo o nada; guard ZIP/XML (INFORME 9); compartidos limitados (exceljs, overrides, lock sin otras versiones cambiadas); definición de terminado.
Hallazgos: [MEDIO] formatear el expediente; [MEDIO] falta probar un .xlsx de Excel/LibreOffice real; [BAJO] fullNameSchema afecta a F3 (docs/03); H6, H7 y topes sumados entre hojas a docs.
Para: documentador

### INFORME 11 — documentador

Estado: LISTO
Archivos: docs/03 (sección "Importación masiva" y regla de nombres en F3), docs/08 (D-035 importación sin ClamAV con su condición; D-036 overrides de multer y body-parser, nota para David), docs/10 (RF-21), docs/manuales/tecnico.md (sección de importación con las fricciones conocidas).
Hallazgos: [MEDIO] csv-escape.ts:6 no trata espacios antes de = + - @; los datos importados llegan sin espacios, pero las exportaciones de Dev 5 leerán de la BD → pendiente para la tarea de exportaciones. [BAJO] nombres ya guardados que empiecen por = + - @ fallarían en un PATCH (comprobar en BD real).

## Cierre

Fase 4 terminada. docs/ está en .prettierignore (sin formateo). Reporte: .claude/reportes/20261027-dev2-importacion.md. Commit en features/adolfo, subido solo a mio. No va al equipo (D-021).
