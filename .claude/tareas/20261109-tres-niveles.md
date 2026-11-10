# Ampliar el aula a inicial, primaria y secundaria

Pedido por el usuario: "Los tres niveles" (respuesta del 09/11/2026 a: ¿El aula debe cubrir inicial y primaria además de secundaria?)
Flujo: completo
Vueltas de corrección: 1/2

## Contexto

- Hoy es solo secundaria: ERS, `Section.gradeLevel 1..5`, RNF-25 (11 a 17 años) y notas de 0 a 20.
- Inicial y primaria califican con escala literal AD/A/B/C (CNEB, MINEDU). Hay que confirmarlo.
- El diseño ya es unificado (`docs/diseno/guia.md` v1.1).
- Es un cambio de alcance: hay que acordarlo con el grupo antes de enviarlo a sxxntoz.

## INFORME 1 — arquitecto-integrador: BLOQUEADO (Para: usuario y grupo)

- Supuestos de "solo secundaria": CHECK `gradeLevel 1..5` (migración académica), `Grade.value Decimal 0..20`, el literal se deriva del número (`packages/shared/src/grading`), `MAX_GRADE=5` en la promoción, DTO `.max(5)`, reportes y textos del login.
- Propuesta: `enum EducationLevel` + `Section.level`, grado dentro del nivel (inicial 3..5, primaria 1..6, secundaria 1..5), `GradingScale` por nivel y `Grade.literal`. Migración con backfill SECUNDARIA.
- Orden: grupo → modelador-bd → dev2 → dev4 → dev5 → dev1 → qa/seguridad/ux/revisor → documentador.
- 6 decisiones abiertas (alcance, escalas, resumen literal y NE, escala fija o configurable, inicial con cuentas o no, RNF-25).
- Hallazgo MEDIO: `reports.dto.ts:34,44` acepta grado hasta 12.

## Decisiones del usuario (09/11/2026)

1. Secundaria mantiene la escala vigesimal 0–20. Inicial y primaria usan la escala literal AD/A/B/C, fija por nivel.
2. Con escala literal, el logro del bimestre lo elige el docente (el sistema muestra los logros de las tareas como apoyo).
3. Inicial: los niños no tienen cuenta propia; el apoderado ve materiales, avisos y logros. Sin entregas de PDF en inicial.
4. Se trabaja primero solo en el repo privado (`mio`, `features/adolfo`). No va a sxxntoz hasta que el grupo lo apruebe.
   Pendiente: el literal de la NE automática en inicial y primaria, y el nuevo rango de RNF-25 (3 a 17 años) con su efecto en el consentimiento.

## INFORME 2 — modelador-bd: LISTO

- `EducationLevel` + `Section.level` (por defecto SECUNDARIA) con CHECK de grado por nivel; único `academicYearId_level_gradeLevel_code`.
- `GradeLiteral` + `Grade.literal` (`value` pasa a nulo; CHECK: exactamente uno en GRADED/NE); `Assignment.noSubmissionLiteral`; tabla `PeriodAchievement`; `Announcement.level`.
- La escala no se guarda en la BD: se resuelve en código (`scaleForLevel` en shared, lo hace dev4).
- Migración `20261109120000_tres_niveles` aplicada en local; no se perdieron filas (7 Section).
- `auth.prisma` solo cambió de formato (prisma format).
- Verificación del orquestador: api test 102 archivos / 1244 ok; tsc de api y worker ok.
- Rompe (a corregir): seed y DTO de sections/users/promoción (dev2), motor de notas y PeriodAchievement (dev4), NE literal en assignments (dev3/dev4), anuncios, reportes y exportación de datos personales (dev5).

## INFORME 3 — dev2-estructura: LISTO

- Catálogo `@aula/shared/academic` (LEVEL_GRADES, gradeLabel, scaleForLevel); `level` en secciones, usuarios, contexto y Mis cursos; promoción entre niveles; seed con I5C, P4C y P6A (94 usuarios; 4 niños de inicial sin correo, código ni credencial).
- api 1247, web 547 y shared 128 tests ok; lint y tsc ok; seed idempotente.
- 18 e2e en falla (academic-api, academic-schema, users-api) porque tienen el contrato y los conteos viejos → qa-tester.
- La web no depende de `@aula/shared`: el catálogo está copiado en `admin/estructura/_lib/levels.ts`.

## INFORME 4 — qa-tester: CAMBIOS_PEDIDOS (Para: dev5)

- Las 18 fallas de dev2 están en verde, con casos nuevos: CHECK por nivel, 400 de rango, niños de inicial sin acceso y promoción entre niveles.
- e2e: 717 tests, 713 ok. Fallan 4 de `announcements.e2e-spec.ts`: `POST /announcements` con alcance GRADE da 500 porque falta `Announcement.level` (dto:43, service:176, filtros cerca de la línea 100). Era trabajo previsto para el paso 4; se adelanta.

## Pausa (09/11/2026, pedido del usuario: "deten por el momento los procesos")

- Se detuvo a dev5 (anuncios con nivel) a mitad de trabajo, cuando actualizaba los tests web: sus cambios en anuncios pueden estar incompletos y sin verificar.
- Se detuvieron los servidores web y api.
- Al retomar: revisar el diff de anuncios, terminarlo o revertirlo, y correr el e2e completo.

## INFORME 5 — dev5-administracion (anuncios con nivel): LISTO

- GRADE pide `level` y valida el grado según el nivel; la audiencia se calcula por el par (nivel, grado) en anuncios y en avisos del worker; la web tiene selector de nivel; docs/03 tiene sección de anuncios.
- api 1247, web 547; e2e 718/718 ok. El orquestador pasó prettier por docs/02 y docs/03.

## INFORME 6 — dev4-calificaciones (paso 3): LISTO

- Dos escalas: literal sin promedio (`LITERAL_SCALE`) con logro del bimestre (`PeriodAchievement`, PUT nuevo); la API devuelve 400 si la nota no corresponde a la escala; la NE literal sale de `noSubmissionLiteral`; la web tiene selector AD/A/B/C y columna de logro.
- shared 144, api 1252, web 548; e2e 37 archivos / 726 ok.
- Pendientes: selector de `noSubmissionLiteral` en tareas (dev3); logro en reportes (dev5); literal NE por defecto (decisión del usuario, hoy null).

## INFORME 7 — dev1-plataforma (paso 5): LISTO

- Login con texto unificado ("Inicial · Primaria · Secundaria", blanco opaco); `sectionLabel` con nivel en el encabezado y en Mis cursos.
- web 548 ok, tsc y eslint ok. El catálogo de niveles está copiado en 3 lugares de la web (unificarlo luego con `@aula/shared`).

## INFORME 8 — dev3-contenidos: LISTO

- Selector de NE literal en primaria e inicial; en inicial, actividad sin entrega (la web oculta el envío). web 557 ok.
- Hallazgo: la API no bloquea entregas en INICIAL. Decisión del orquestador: se bloquea en la API, porque es coherente con la decisión del usuario ("inicial sin entregas").

## INFORME 9 — dev3-contenidos (corrección autorizada): LISTO

- La API devuelve 409 `NO_SUBMISSIONS_IN_LEVEL` en entregas y en upload-intents de INICIAL (`files.service.ts` es de Dev 3 / storage, así que queda dentro de lo autorizado); el docente de INICIAL ya no ve la tabla de entregas.
- api 1268, web 558; e2e de submissions y files: 52 ok.

## INFORME 10 — dev5-administracion (paso 4): LISTO

- Reportes XLSX/PDF/ZIP y dashboard según la escala del nivel (literal + logro), sin comentarios; el DTO exige `level` (se acabó el máximo de 12); exportación de datos personales v2 con literales y `logrosDelPeriodo`; web con filtro de nivel.
- api 1268, web 558; e2e 37 archivos / 727 ok.
- Riesgo en literal = solo C, como el motor de Dev 4; "sin logro" se cuenta aparte (queda abierto para el usuario).

## INFORME 11 — qa-tester (final): LISTO

- Nuevo `levels-reports.e2e-spec.ts` con 11 casos: XLSX/PDF literales, dashboard MIXED, exportación v2, traslado con logro, período cerrado, soporte y aislamiento.
- lint ok; tsc de los 4 paquetes ok; api 1268, web 558, shared 144; e2e 38 archivos / 738 ok; build ok; seed limpio.
- El ADMIN en soporte tampoco escribe logros en período cerrado (decisión de producto, a confirmar).

## INFORME 12 — ux-accesibilidad: APROBADO (3 MEDIO, 3 BAJO)

- MEDIO: `grade-form.tsx:54-56,125-137` en INICIAL arranca en "No entregó" (cambiar a GRADED y renombrar); `achievement-cell.tsx` tiene el error sin `aria-describedby`/`aria-invalid` ni foco; `tareas/page.tsx:368` dice "con entrega en PDF" también en INICIAL.
- BAJO: la tarjeta de anuncios del apoderado está desactualizada; falta foco visible en el summary y el textarea del logro; el filtro de reportes solo actualiza el grado después de "Filtrar".
- Se juntan con los hallazgos de seguridad en una sola vuelta.

## INFORME 13 — seguridad-cumplimiento: CAMBIOS_PEDIDOS

- ALTO: `createStudent` (enrollments.service:98-104 / credential-issuer:56-77), `resetPassword`/reissue (users.service:330-381), la importación y el vínculo por DNI pueden dar login a niños de INICIAL.
- MEDIO: la migración no hace backfill de `Announcement.level` antes del CHECK; `notification-recipients.service.ts:85` falla abierto; RNF-25 y POLICY_VERSION para 3 a 17 años.
- BAJO: el logro acepta una matrícula cerrada (se deja así: QA lo cubre como deliberado, RN-14); retención del comentario.

## Vuelta de corrección 1 (orquestador)

- modelador-bd primero (backfill en la migración: aún no tiene commit y solo está en local, así que se edita y se resetea la BD local + seed).
- Después en paralelo, sobre archivos distintos: dev2 (ALTO), dev4 (UX: grade-form, achievement-cell, tarjeta de anuncios del apoderado), dev3 (subtítulo de tareas), dev5 (fallo cerrado). Solo tests unitarios; el e2e lo corre QA al final.
- RNF-25, POLICY_VERSION y retención → documentador al final; la reaceptación de la política se le consulta al usuario.

## Pausa por límite de uso (09/11/2026)

- El usuario autorizó resetear la BD local y la reaceptación de la política (nueva POLICY_VERSION).
- Se agregó el backfill de `Announcement.level` a la migración. El reset NO se ejecutó: Prisma exige el consentimiento literal en PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION. Hay que correrlo de nuevo con ese consentimiento y después `pnpm db:seed`.
- Se detuvieron a mitad de trabajo dev2 (ALTO, niños de inicial), dev4 (UX: grade-form hecho, faltaba achievement-cell), dev3 (subtítulo) y dev5 (fallo cerrado). Sus cambios están incompletos y sin verificar.
- Falta: retomar los 4, QA con e2e, documentador (RNF-25, política, retención), revisor-pr y reporte final.

## Vuelta 1 — cierre (10/11/2026, el orquestador sin subagentes)

- Al reanudar, dev4 (grade-form y tarjeta del apoderado), dev3 (subtítulo), dev5 (fallo cerrado, con un error de tipos que corrigió el orquestador) y dev2 (createStudent en INICIAL) ya tenían sus cambios hechos.
- El orquestador completó la a11y de achievement-cell, el 422 en reset y correctDni (+ e2e), el backfill de la migración, D-065, POLICY_VERSION 2026-2 y prettier.
- Verificación: tsc 0, lint 0, api 1269, web 560, shared 144, e2e 739 ok y build 5/5.
- Reporte: `.claude/reportes/20261109-tres-niveles.md`.

## INFORME 14 — revisor-pr: APROBADO

- Sin CRÍTICO ni ALTO pendientes. Avisos: separar la tarea de diseño en otro commit (CLAUDE.md, maqueta y docs/diseno); el reporte ya existe; docs/03 no tenía el 422 `STUDENT_WITHOUT_ACCOUNT` (el orquestador lo agregó a reset-password y correct-dni).
- `pnpm format:check` marca 99 archivos, todos de la tarea de diseño o ajenos (.agents, .claude): hay que formatearlos antes de integrar el diseño.
