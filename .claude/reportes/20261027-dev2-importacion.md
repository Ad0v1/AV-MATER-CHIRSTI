# Reporte — Dev 2, Fase 4: importación masiva de usuarios (RF-21)

## Pedido

- **Usuario:** "Sigue con la Fase 4 de Dev 2: importación masiva de usuarios (RF-21), con los agentes."
- **Pedido adicional durante la tarea:** "Sí, agrega pnpm.overrides en el package.json raíz con multer 2.5.0 y body-parser 2.4.0 exactas, vuelve a correr pnpm audit --prod y los tests, y déjalo anotado para David."
- **Fecha:** 27/10/2026 · **Flujo:** completo · **Vueltas de corrección:** 2/2 · **Rama:** `features/adolfo` · **Commit:** `feat(users): RF-21 importacion masiva …` (subido solo a `mio`)
- **Aviso:** Dev 2 es de un compañero. No va al equipo sin acuerdo con el dueño de Dev 2; depende de D-021.

## Resultado

- **3 endpoints** (solo ADMIN activo), en `apps/api/src/modules/users/import/`:
  - `GET /users/import/template`: plantilla CSV o Excel para estudiantes, docentes o apoderados.
  - `POST /users/import/preview`: valida el archivo **sin guardar nada** y devuelve los errores por fila (21 códigos), sin repetir los datos del archivo.
  - `POST /users/import/commit`: se vuelve a subir el mismo archivo; si el SHA-256 coincide y no hay errores, crea todo en una sola transacción (**todo o nada**).
- **Formatos:** CSV (UTF-8, `,` o `;`) y XLSX con **ExcelJS 4.4.0** (librería exigida por la ERS §6), instalada exacta.
- **Protecciones:** 1 MiB, 1000 filas de datos, guard del ZIP "canónico" que lee exactamente lo mismo que la librería, rechazo de macros, fórmulas, XML con DOCTYPE o en otra codificación, y topes de filas, celdas, columnas, hojas y combinaciones que cortan los archivos que tumbaban la API. Sin datos de menores en logs, respuestas ni bitácora; el buffer se borra al terminar; 10 intentos por minuto.
- **Dependencias:** `multer` 2.5.0 y `body-parser` 2.4.0 forzadas en `pnpm-workspace.yaml`; `pnpm audit --prod` pasa de 2 altas a **0 altas**.
- **Tests:** 314 unitarios y 246 e2e (67 nuevos de importación).

## Agentes que participaron

| #   | Agente                   | Modelo | Qué hizo                                                                                          | Estado          |
| --- | ------------------------ | ------ | ------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `arquitecto-integrador`  | Opus   | Diseño: formatos, plantillas, flujo preview/commit, límites, seguridad                            | LISTO           |
| 2   | `dev2-estructura`        | Opus   | Implementación (CSV, luego XLSX con guard) y 273 tests                                            | LISTO           |
| 3   | `qa-tester`              | Sonnet | 59 e2e de importación                                                                             | LISTO           |
| 4   | `seguridad-cumplimiento` | Sonnet | 2 ALTO: engaño al guard del ZIP y saturación del lector Excel                                     | CAMBIOS_PEDIDOS |
| 5   | `dev2-estructura`        | Opus   | Corrección 1/2: ZIP canónico, pre-chequeo del XML; encontró que un Excel de 1,4 KB tumbaba la API | LISTO           |
| 6   | `qa-tester`              | Sonnet | Ajuste del caso de 1 MiB, 8 e2e nuevos, round-trip de plantillas                                  | LISTO           |
| 7   | `seguridad-cumplimiento` | Sonnet | 1 ALTO nuevo: `sheetId` enorme bloquea la API                                                     | CAMBIOS_PEDIDOS |
| 8   | `dev2-estructura`        | Opus   | Corrección 2/2: `sheetId`, columnas, partes XML; encontró el caso del ancho de filas              | LISTO           |
| 9   | `seguridad-cumplimiento` | Sonnet | Verificación final                                                                                | APROBADO        |
| 10  | `revisor-pr`             | Sonnet | Revisión final                                                                                    | APROBADO        |
| 11  | `documentador`           | Haiku  | docs/03, 08 (D-035, D-036), 10 y manual técnico                                                   | LISTO           |

## Prompts usados

### 1. arquitecto-integrador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (léelo completo, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Revisa también el expediente de la Fase 3 (.claude/tareas/20261026-dev2-usuarios-matriculas.md) y el código de C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\modules\users\ para reutilizarlo. Trabaja en C:\Proyectos\AV-MATER-CHIRSTI (rama features/adolfo). No tienes Bash: si necesitas algo de git o de npm, pídeselo al orquestador en Pendientes.

Tu encargo: planificar la Fase 4 de Dev 2, RF-21 (importación masiva de usuarios). Lee el texto exacto de RF-21 en la ERS (docs/fuentes, PDF) y lo relacionado en docs/03, 04, 05, 08 (D-013, D-021, D-024, D-032..D-034) y 09. Revisa apps/api/package.json, app.setup.ts (límites de tamaño del body), common/ y la configuración de seguridad existente.

Entrega en Decisiones:
1. Formato soportado (CSV, XLSX o ambos) y librería: si hace falta una dependencia nueva (p. ej. exceljs o un parser CSV), cuál, versión exacta estable y por qué; o si se puede hacer sin dependencias. Riesgos de seguridad de la librería (fórmulas, zip bombs, tamaño, XXE) y cómo se mitigan.
2. Plantilla: columnas exactas por tipo (estudiantes con sección, docentes, apoderados con sus hijos por correo), encabezados en español, y un endpoint para descargarla si corresponde.
3. Flujo: validación previa sin escribir (dry-run) con reporte por fila (número de fila, campo, error) y luego confirmación que crea todo; ¿todo o nada en una transacción, o por filas?; cómo evitar que el archivo cambie entre la previsualización y la confirmación (token/hash con expiración en Redis, o volver a subir el archivo); límites (tamaño, filas máximas); duplicados dentro del archivo y contra la BD; reutilización de UsersService/EnrollmentsService/GuardianLinksService sin duplicar reglas.
4. Endpoints exactos (método, ruta /api/v1, rol ADMIN + ActiveActorGuard, multipart o JSON, respuesta, errores) y cómo se recibe el archivo (multer en memoria con límite; ¿pasa por ClamAV? decide considerando que no se almacena).
5. Seguridad: inyección de fórmulas al reexportar el reporte de errores (CSV injection), datos personales de menores en memoria/logs/Redis y su borrado, bitácora (un evento por importación con conteos, sin correos ni nombres), rate limiting.
6. Archivos compartidos a tocar (apps/api/package.json, pnpm-lock.yaml, app.module.ts, app.setup.ts si cambia el límite del body) con el cambio mínimo exacto para que el orquestador lo autorice; riesgo frente a features/david.
7. Plan de agentes y criterios de terminado verificables (unitarios del parser y validador; e2e con archivos de prueba generados en el test, con usuarios qa-f4-*@colegio.example y limpieza; `pnpm db:seed` con los mismos conteos).
No modifiques archivos. Termina con el INFORME del protocolo.
```

### 2. dev2-estructura (implementación)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (léelo completo: INFORME 1 con las Decisiones 1–7 y la "Decisión del orquestador"; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo, con Docker/MySQL levantados. exceljs 4.4.0 ya está instalado en apps/api por el orquestador.

Tu encargo (Decisión 7.1): implementar las Decisiones 1–5 en apps/api/src/modules/users/import/ y los cambios indicados en users.module.ts, users-audit.ts (entityType/entityId opcionales), users.dto.ts (rechazo de nombres que empiezan por = + - @), users.errors.ts y academic.dto.ts (exportar sectionCode). Primero CSV y el flujo completo (template, preview, commit), luego XLSX con el guard de ZIP. Reglas: @Roles('ADMIN') + @UseGuards(ActiveActorGuard) de clase; los guards antes de multer; nada de datos personales en logs, respuestas de error ni bitácora; buffer.fill(0) en finally; transacción todo o nada con el orden de bloqueos de la Decisión 3; marcadores TRUE/NULL; fechas del servidor. No toques app.module.ts, app.setup.ts, common/, config/, prisma/, package.json ni pnpm-lock.yaml.
Escribe los tests unitarios de la Decisión 7.1 (ZIP y XLSX maliciosos generados en el test con node:zlib/ExcelJS, sin archivos binarios en el repo).
Al terminar: `pnpm --filter api lint`, `test`, `build`, prettier --check de los archivos tocados, `pnpm --filter api test:e2e` (179 en verde), `pnpm db:seed` con los mismos conteos, y humo: POST /api/v1/users/import/preview sin sesión → 401 (e2e temporal que borres después). No hagas commit. Termina con el INFORME del protocolo, con la lista de archivos y endpoints.
```

### 3. qa-tester (e2e)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (léelo completo: INFORME 1 Decisión 7.2 y el INFORME 2 con las notas para QA; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, con Docker/MySQL, migraciones y seed cargados.

Ojo con el entorno (INFORME 2): si las e2e fallan con 45028 / ER_CANNOT_RETRIEVE_RSA_KEY tras un reinicio de MySQL, calienta la autenticación con una conexión única con allowPublicKeyRetrieval desde un script en el scratchpad C:\Users\Laptop\AppData\Local\Temp\claude\C--Proyectos-AV-MATER-CHIRSTI\d111556e-64dd-44a4-b5f2-177ecf4c5a23\scratchpad\ (nunca dentro del repo) y anótalo.

Tu encargo: crear apps/api/test/users-import.e2e-spec.ts según la Decisión 7.2. Archivos generados en el test (CSV como Buffer, XLSX con ExcelJS, ZIP maliciosos con el patrón de zip-builder.mock-spec.ts), sin binarios en el repo. Solo usuarios qa-f4-*@colegio.example en 3A/3B de 2026; nunca mutes datos del seed. Cubre: 401/403 en las 3 rutas, ADMIN inactivo → 403, sin sesión y archivo > 1 MiB → 401; plantillas 2 formatos × 3 tipos; preview y commit de students, teachers y guardians (apoderado con 2 hijos); todos los códigos de error de fila; CSV con ';' y BOM; 1001 filas → 400; 1 MiB + 1 → 413; .exe renombrado → 415; xlsm (vbaProject.bin) → 415; zip bomb → 400; hash distinto → 409; commit con errores → 422 con details y conteos sin cambio; dos commits paralelos del mismo archivo → 201 + 409; dominio con overrideProvider(INSTITUTION_EMAIL_DOMAIN) y apoderado exento; un único evento users.import.commit sin correos ni nombres (MemoryAuditSink); 429 en un bloque con app propia; que ninguna respuesta de error repita valores de las celdas. afterAll: borra GuardianStudent, Enrollment y User de qa-f4-%; test final de conteos.
IDs de RF/RN en los nombres. Si encuentras un bug de producción, no lo corrijas: CAMBIOS_PEDIDOS. Solo archivos de test.
Corre `pnpm --filter api test:e2e` dos veces (todo en verde), `pnpm --filter api lint`, prettier --check del archivo y `pnpm db:seed` con los mismos conteos. No hagas commit. Termina con el INFORME del protocolo.
```

### 4. seguridad-cumplimiento (auditoría)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (léelo completo, INFORMES 1 y 2 y la decisión del orquestador sobre la auditoría de dependencias; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: auditar C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\modules\users\import\ (todo) y los cambios en users.module.ts, users-audit.ts, users.dto.ts, users.errors.ts y academic.dto.ts (RF-21, RF-40, RNF-02, RNF-09..15, menores, OWASP de subida de archivos). Revisa en concreto:
- que los guards (@Roles('ADMIN') + ActiveActorGuard) corran antes de que multer lea el archivo; límites de multer; almacenamiento solo en memoria y buffer.fill(0) en todos los caminos (incluidos los 400 de validación y las excepciones);
- el parser CSV (UTF-8 estricto, NUL, comillas, límites) y el guard XLSX (zip bomb con descompresión real y presupuesto, ZIP64, cifrado, rutas, vbaProject, DOCTYPE/ENTITY en UTF-8 y UTF-16, máximo de entradas): busca formas de evadirlo (p. ej. datos tras el directorio central, entradas duplicadas, métodos raros, XML en otras partes, sharedStrings enormes);
- inyección de fórmulas: celdas con fórmula, escapeCsvCell, nombres que empiezan por = + - @;
- que ninguna respuesta, log ni bitácora contenga valores del archivo (correos, nombres, originalname, mensajes de ExcelJS);
- la verificación SHA-256 entre preview y commit (TOCTOU) y la transacción todo o nada con el orden de bloqueos;
- límite de peticiones (@Throttle) y DoS por CPU (1000 filas, validación, createMany);
- la decisión de no pasar el archivo por ClamAV (RF-40, D-035): ¿es aceptable?;
- el impacto de la vulnerabilidad alta de multer < 2.5.0 en este endpoint (la decisión del override está con el usuario).
No modifiques archivos. Termina con el INFORME del protocolo (APROBADO si no hay CRÍTICO ni ALTO; si hay, CAMBIOS_PEDIDOS con archivo:línea y corrección).
```

### 5. dev2-estructura (corrección 1/2)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (lee el INFORME 3 de seguridad-cumplimiento, la "Decisión del orquestador (vuelta 1/2)" y el INFORME 4 de QA; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, con Docker/MySQL levantados.

Tu encargo (vuelta 1/2), solo en apps/api/src/modules/users/import/:
1. H1 (ALTO, xlsx-guard.ts): exigir cdOffset + cdSize === eocd (sin hueco ni prefijo), comprobar que cada local header en localOffset coincida con su entrada del directorio central (nombre, método, flags, tamaños), rechazar (415) entradas con extra field 0x7075 (nombre Unicode) y, si es posible, también entradas duplicadas por nombre y datos que no estén cubiertos por el directorio. Verifica el comportamiento contra el JSZip real que usa ExcelJS (node_modules) con specs: ZIP con hueco y offsets desplazados → 400; extra 0x7075 → 415.
2. H2 (ALTO, xlsx-reader.ts e import.constants.ts): cortar en cuanto rowNumber pase un máximo físico (p. ej. 5000 → 400 tooManyRows) sin recorrer todo; leer como máximo min(cellCount, 30) columnas sin crear celdas más allá (si hay datos más allá → EXTRA_CELLS); bajar el presupuesto descomprimido (p. ej. 8 MiB total y un tope por entrada). Si ExcelJS carga toda la hoja antes de que puedas cortar, evalúa un pre-chequeo en el guard sobre xl/worksheets/sheet1.xml (contar `<row` y la dimensión `<dimension ref=...>` / referencias de columna) para rechazar antes de cargar. Spec adversarial (100 000 filas, celda en XFD) que termine rápido (p. ej. < 2 s) con 400.
3. H3 (MEDIO, csv-parser.ts): no acumular filas vacías (solo contar la fila física) y cortar con 400 al pasar un máximo de líneas físicas (p. ej. 5000) y de celdas por registro.
4. H4 (MEDIO, xlsx-guard.ts): rechazar (415) partes XML cuyo inicio no sea BOM UTF-8, espacio o '<' ASCII.
5. H8: comprueba que afterState con 1000 userIds cabe en la columna JSON de AuditLog (MySQL JSON); anótalo.
No toques los e2e ni nada fuera de import/ (salvo constantes compartidas del propio import). Corre `pnpm --filter api lint`, `test`, `build`, prettier --check de los archivos tocados y `pnpm --filter api test:e2e` (238 en verde; si algún e2e cambia de resultado por los nuevos límites, no lo edites: repórtalo). No hagas commit. Termina con el INFORME del protocolo.
```

### 6. qa-tester (ajuste a los nuevos límites)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (lee el INFORME 3 de seguridad y el INFORME 5 del dev con sus pendientes para ti; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, con Docker/MySQL.

Tu encargo, solo en archivos de test:
1. apps/api/test/users-import.e2e-spec.ts:725 ("exactamente 1 MiB se acepta"): cambia el relleno para que no pase de 5000 filas físicas (p. ej. una línea larga de espacios o un campo entre comillas largo en una fila vacía) y siga siendo exactamente 1 048 576 bytes → 200.
2. Añade e2e de los límites nuevos del INFORME 5: ZIP con hueco y offsets desplazados → 400; extra field 0x7075 → 415; mergeCell gigante → 400; nombre definido de hoja completa → 400; col max enorme → 400; 5001 filas físicas (CSV y XLSX) → 400; CSV con > 16384 campos → 400; parte XML en UTF-16 → 415; y que la plantilla propia descargada (xlsx y csv) se pueda volver a subir y validar (round-trip). Usa zip-builder.mock-spec.ts.
3. Arregla el error de tipos TS2339 de apps/api/src/modules/users/import/user-import.service.spec.ts:313 (estrecha el tipo; es un spec) y comprueba `pnpm --filter api exec tsc --noEmit -p tsconfig.json` (el único error que debe quedar es el TS6059 preexistente de academic-schema.e2e-spec.ts).
Si algo revela un bug de producción, no lo corrijas: CAMBIOS_PEDIDOS. Corre `pnpm --filter api test`, `pnpm --filter api test:e2e` dos veces (todo en verde), lint, prettier y `pnpm db:seed` con los mismos conteos. No hagas commit. Termina con el INFORME del protocolo.
```

### 7. seguridad-cumplimiento (re-auditoría H1–H4)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (lee tu INFORME 3 y el INFORME 5 del dev; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: re-auditar solo las correcciones de H1–H4 en C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\modules\users\import\ (xlsx-guard.ts, xlsx-xml.ts nuevo, xlsx-reader.ts, csv-parser.ts, import.constants.ts y sus specs). Compara contra el JSZip y ExcelJS reales de node_modules: ¿queda algún diferencial de parser entre el guard y JSZip (EOCD, comentario, data descriptors, entradas almacenadas, nombres, extra fields, ZIP64 implícito)? ¿El pre-chequeo de XML cubre las estructuras que hacen explotar ExcelJS (mergeCells, definedNames, dataValidations, cols, conditionalFormatting, hyperlinks, sharedStrings, styles, drawings, comments)? ¿Los límites tienen bordes evadibles (entidades, comillas, espacios, prefijos de namespace como `x:row`)? ¿Hay riesgo de ReDoS en los escaneos? Evalúa también la fricción con archivos legítimos de Excel/LibreOffice que el dev aceptó.
No modifiques archivos. Termina con el INFORME del protocolo (APROBADO si no queda CRÍTICO ni ALTO; si queda, CAMBIOS_PEDIDOS con archivo:línea y corrección).
```

### 8. dev2-estructura (corrección 2/2)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (lee el INFORME 7 de seguridad-cumplimiento y la "Decisión del orquestador (vuelta 2/2, la última)"; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, con Docker/MySQL levantados. Es la última vuelta de corrección: sé exhaustivo.

Tu encargo, solo en apps/api/src/modules/users/import/:
1. H9 (ALTO): en inspectWorkbook (xlsx-xml.ts), recorrer cada `<sheet>` de xl/workbook.xml: sheetId obligatorio con /^[0-9]{1,4}$/ y ≤ 1000, máximo 50 hojas, sheetId sin repetir; lo mismo para localSheetId de definedName (≤ 1000). Si no → 400 xlsxTooComplex. ANTES de corregir, reprodúcelo con un spec temporal que cargue con ExcelJS real un .xlsx con sheetId="4294967294" y mide el tiempo (anota el resultado en el INFORME). Después, spec permanente: ese archivo → 400 en < 1 s.
2. Busca en el código de ExcelJS 4.4.0 (node_modules) cualquier otro valor entero del XML que se use como índice de un arreglo y luego se recorra (como _worksheets[sheetId] o _rows) y acótalo igual; anota cuáles revisaste.
3. H10 (MEDIO): presupuesto global de columnas sumando el mayor `max` de cada hoja (tope 3 × 16384) → 400.
4. H11 (MEDIO): aplicar decodeXmlPart y FORBIDDEN_DECL solo a las partes que ExcelJS procesa (usa las regex reales de xlsx.js:361-401 y las rutas fijas: _rels/.rels, xl/workbook.xml, xl/_rels/workbook.xml.rels, xl/sharedStrings.xml, xl/styles.xml, docProps/app.xml, docProps/core.xml, worksheets y sus _rels, theme, drawings y sus _rels, comments, tables, vmlDrawing). Las demás partes solo pasan tamaño y CRC. Spec: un customXml/item1.xml en UTF-16 se acepta; una hoja en UTF-16 sigue dando 415.
No toques los e2e. Corre `pnpm --filter api lint`, `test`, `build`, prettier --check de los archivos tocados, `pnpm --filter api exec tsc --noEmit -p tsconfig.json` (solo debe quedar el TS6059 preexistente) y `pnpm --filter api test:e2e` (246 en verde). No hagas commit. Termina con el INFORME del protocolo.
```

### 9. seguridad-cumplimiento (verificación final)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (lee tus INFORMES 3 y 7 y el INFORME 8 del dev; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Es la verificación de la última vuelta de corrección permitida.

Tu encargo: verificar en C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\modules\users\import\ (xlsx-xml.ts, xlsx-guard.ts, import.constants.ts, xlsx-reader.ts y los specs xlsx-guard.spec.ts / xlsx-reader.spec.ts) que H9, H10, H11 y el hallazgo nuevo del ancho de filas (Row._cells / hasValues / eachCell) quedan cerrados, contrastando con ExcelJS 4.4.0 en node_modules. Revisa también que la nueva selección de partes de H11 (isExcelJsXmlPart con las regex de xlsx.js) no deje fuera ninguna parte que ExcelJS sí parsea con saxes (si una queda fuera, sería un bypass de DOCTYPE y de límites). Y la lista de índices de ExcelJS que el dev declara revisados: ¿falta alguno que se recorra?
No modifiques archivos. Termina con el INFORME del protocolo: APROBADO si no queda CRÍTICO ni ALTO; si queda, CAMBIOS_PEDIDOS con archivo:línea, evidencia y corrección (el orquestador lo llevará al usuario, porque no quedan vueltas).
```

### 10. revisor-pr

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (léelo completo, INFORMES 1–9 y las decisiones del orquestador y del usuario; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo, con Docker levantado.

Tu encargo: revisión final de la Fase 4 (RF-21). Alcance esperado: apps/api/src/modules/users/import/ (código, specs y zip-builder.mock-spec.ts), los cambios en users.module.ts, users-audit.ts, users.dto.ts y su spec, users.errors.ts, academic.dto.ts, apps/api/test/users-import.e2e-spec.ts, apps/api/package.json (solo exceljs 4.4.0 exacta), pnpm-workspace.yaml (solo el bloque overrides de multer y body-parser, autorizado por el usuario), pnpm-lock.yaml y el expediente. Nada en common/, auth/, session/, config/, prisma/, app.module.ts ni app.setup.ts. Ignora .agents/ y skills-lock.json.
Revisa el código contra las Decisiones del INFORME 1 y las correcciones de los INFORMES 5 y 8 (guards antes de multer, buffer borrado en todos los caminos, sin datos personales en respuestas/logs/bitácora, todo o nada, guard ZIP/XML, límites). Comprueba que el lock solo añade exceljs y sus dependencias y aplica los overrides.
Corre pnpm lint, pnpm test, pnpm build, pnpm format:check, pnpm --filter api test:e2e, `pnpm audit --prod` (0 altas/críticas), `pnpm --filter api exec tsc --noEmit -p tsconfig.json` (solo el TS6059 preexistente) y `pnpm db:seed` (mismos conteos). Los fallos de format solo por .agents/ o expedientes no cuentan. Trabajo de Dev 2 (compañero), no va al equipo (D-021). Propón el mensaje de commit. Termina con el INFORME del protocolo.
```

### 11. documentador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261027-dev2-importacion.md (léelo completo, INFORMES 1–10 y las decisiones del orquestador y del usuario; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). La Fase 4 está aprobada. Verifica rutas, campos, códigos, mensajes y límites reales leyendo C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\modules\users\import\ (controller, dto, constants, csv-escape) antes de escribir.

Tu encargo, solo en C:\Proyectos\AV-MATER-CHIRSTI\docs\, con el estilo de esos documentos y todo como PROPUESTA (trabajo de Dev 2 en el repo privado, pendiente del dueño de Dev 2 y de D-021):
1. docs/03_CONTRATOS.md: sección "Importación masiva (RF-21)": los 3 endpoints, ImportReport e ImportRowError, los 21 códigos de fila, los errores de archivo (400/413/415/409/422/429) con sus mensajes, los límites (1 MiB, 1000 filas de datos, 5000 filas físicas, 30 columnas, celdas, hojas, columnas, ancho de filas, 8 MiB descomprimidos), las plantillas por tipo, el flujo preview → commit con SHA-256 y todo o nada; el contrato `escapeCsvCell`/`toCsvLine` que Dev 5 debe usar en TODA exportación CSV (incluidos correos que empiezan por + o -); y que `fullNameSchema` ahora rechaza nombres que empiezan por = + - @ también en las altas y el PATCH de F3.
2. docs/08_DECISIONES.md: D-035 (PROPUESTA) "Importación masiva (RF-21)": CSV y XLSX con ExcelJS 4.4.0 exacta (ERS §6), sin estado entre llamadas, todo o nada, sin ClamAV con su motivo y la condición (el archivo nunca se guarda ni se reexpone; si algún día se guarda, pasa por ClamAV, RF-40), límites en MiB (relación con D-007), cadenas JS no borrables de memoria (limitación aceptada), bitácora única. Y una nota para David (Dev 1), en D-019 o en una entrada nueva: `pnpm-workspace.yaml` fuerza `multer` 2.5.0 y `body-parser` 2.4.0 por avisos altos de DoS (en pnpm 12 los overrides van en pnpm-workspace.yaml, no en package.json); quitarlos cuando `@nestjs/platform-express` los actualice; además el entorno puede dar 45028/ER_CANNOT_RETRIEVE_RSA_KEY tras reiniciar MySQL. Comprueba que D-035 esté libre.
3. docs/10_TRAZABILIDAD.md: avance de RF-21 (API; pantalla en F5) con los tests.
4. docs/manuales/tecnico.md: sección "Importación masiva" (cómo usarla, plantillas, límites y fricciones conocidas con archivos de Excel/LibreOffice reales, cómo se prueba).
No hagas commit. Termina con el INFORME del protocolo.
```

## Decisiones del orquestador

- **ExcelJS:** comprobó con `pnpm view` que 4.4.0 es la versión `latest` (publicada el 20/12/2024) e la instaló exacta. Es la librería que fija la ERS §6.
- **Auditoría de dependencias:** detectó 2 vulnerabilidades altas preexistentes (`multer` y `body-parser`, ambas vía NestJS) y llevó la decisión al usuario, porque corregirlas exigía tocar un archivo raíz compartido y las versiones corregidas tenían 4 días. La implementación siguió mientras tanto.
- **Overrides:** el usuario pidió ponerlos en el `package.json` raíz. Se hizo, pero **pnpm 12 los ignora** (versiones sin cambios). El orquestador revirtió ese cambio y los puso en `pnpm-workspace.yaml`, donde pnpm 12 los aplica; se verificó con `pnpm why` y con la auditoría.
- Hizo los diffs contra `origin/features/david` (`apps/api/package.json`: David añade otras dependencias en el mismo bloque).
- Esperó a que QA terminara antes de cada vuelta de corrección, para no cambiar código mientras se probaba.
- Llegó a la **vuelta 2/2**, la última permitida; la verificación final aprobó.
- No reabrió la fase por el hallazgo del `documentador` sobre espacios antes de `= + - @` en `escapeCsvCell`: solo afecta a exportaciones futuras de Dev 5 y queda como pendiente.

## Archivos

- `apps/api/src/modules/users/import/` (código, specs y ayuda de tests `zip-builder.mock-spec.ts`)
- `apps/api/src/modules/users/{users.module.ts, users-audit.ts, users.dto.ts, users.dto.spec.ts, users.errors.ts}`, `apps/api/src/modules/academic/academic.dto.ts`
- `apps/api/test/users-import.e2e-spec.ts` (nuevo)
- `apps/api/package.json` (`exceljs` 4.4.0), `pnpm-workspace.yaml` (overrides), `pnpm-lock.yaml`
- `docs/03_CONTRATOS.md`, `docs/08_DECISIONES.md` (D-035, D-036), `docs/10_TRAZABILIDAD.md`, `docs/manuales/tecnico.md`
- `.claude/tareas/20261027-dev2-importacion.md`, este reporte

## Verificación

- `pnpm lint` 5/5 · `pnpm test` 314/314 · `pnpm build` 5/5 · `pnpm --filter api test:e2e` 246/246 · `pnpm audit --prod` 0 críticas y 0 altas · `tsc --noEmit` solo el TS6059 preexistente · `pnpm db:seed` con los conteos de siempre.
- Ataques reproducidos con la librería real antes de corregir: Excel de 1,4 KB que agotaba la memoria; `sheetId` 4294967294 que no terminaba en 600 s; 27 KB con 4999 filas que costaban 6,3 s de CPU. Ahora los tres dan 400 en menos de 1 s.

## Pendientes y decisiones abiertas

- **No va al equipo** hasta revisión del dueño de Dev 2 y aceptación de D-021.
- PROPUESTA: D-035 (importación sin ClamAV, con su condición) y D-036 (overrides).
- **Probar con un `.xlsx` guardado por Excel o LibreOffice real:** los controles son estrictos y pueden rechazar archivos legítimos (formato de columna completa en 4 o más hojas, más de 100 columnas en 5000 filas, nombres definidos con fórmulas).
- **Para David (Dev 1):** quitar los overrides cuando NestJS actualice `multer` y `body-parser`; el error 45028 (ER_CANNOT_RETRIEVE_RSA_KEY) tras reiniciar MySQL.
- **Para Dev 5:** usar `escapeCsvCell` en toda exportación CSV y decidir si también debe tratar los espacios antes de `= + - @`.
- Comprobar en la BD real si hay nombres guardados que empiecen por `= + - @` (fallarían en un PATCH).
- Siguientes fases: F5 pantallas (incluida la de importación) · F6 clonación y promoción.

## Expediente

[.claude/tareas/20261027-dev2-importacion.md](../tareas/20261027-dev2-importacion.md)
