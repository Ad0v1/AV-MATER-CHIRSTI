# Dev 2, Fase 6: clonar la estructura al año siguiente y promoción en bloque (RF-15, RF-16, RN-15)

Pedido por el usuario: "Empezar F6"
Flujo: completo
Vueltas de corrección: 1/2
Entorno: local con Docker, rama `features/adolfo` en `96665a1`; se sube solo a `mio`. En esta máquina, `localhost` IPv6 lo intercepta WSL: todo comando de Node que conecte a MySQL/Redis lleva `NODE_OPTIONS=--dns-result-order=ipv4first`, y MySQL se calienta antes por el error 45028 (ver `docs/manuales/tecnico.md`).

## Contexto

- Fases previas de Dev 2: F1 esquema y seed, F2 API académica y `AcademicAccessService`, F3 usuarios/matrículas/traslados/apoderados, F4 importación (API), F5 pantallas (`.claude/tareas/20261028-dev2-pantallas.md`, commits `49fa112`, `94363f9`, `96665a1`).
- Esquema en `prisma/schema/academic.prisma` (AcademicYear, AcademicPeriod, Section, Course, CourseSection con `teacherId` opcional por D-029, Enrollment con `isCurrent` TRUE/NULL); convenciones de BD: PK uuid(7) CHAR(36), FK Restrict, sin borrado físico, marcadores TRUE/NULL, CHECK con `IS NOT NULL AND = 1`.
- API en `apps/api/src/modules/academic/` y `apps/api/src/modules/users/`; web en `apps/web/app/(app)/admin/` con `_shared/` (patrones de foco, anuncios, motivos) y cliente BFF `apps/web/lib/api/` (D-037).
- RN-15 (docs/04): "Promoción confirmada manualmente por admin". D-029: `teacherId` nulo permite clonar sin docentes.
- Relación con otros: Dev 5 (ciclo de vida, archivado) y Dev 3/4 consumen la estructura; no tocar sus módulos.
- Trabajo de un compañero (Dev 2): queda en el repo privado y no va al equipo sin acuerdo.
- Pedido del usuario: ser eficiente con los agentes (encargos acotados, paralelo cuando se pueda, reanudar agentes con contexto).

## Alcance

RF-15 (clonar la estructura de un año al siguiente) y RF-16 (proponer la promoción en bloque, que el admin corrige y confirma; RN-15), con API y pantalla. Fuera: archivado y purga (Dev 5), login real (Dev 1).

---

## Informes

### INFORME 1 — arquitecto-integrador

Estado: LISTO
Requisitos: RF-15, RF-16, RN-15 (además RN-11, RN-13, RN-14, RF-17, D-029, D-030; RNF-09/11/14; RNF-24..27)
Resumen: dentro del alcance v1 y de Dev 2. Sin cambio de esquema (Section, CourseSection con teacherId null por D-029, Enrollment con endReason YEAR_END ya existente). 3 endpoints nuevos en docs/03 y D-038 nueva. Dos entregas: 6a clonar (API + pantalla) y 6b promoción (API + pantalla). No pudo leer la ERS en PDF (falta pdftoppm); RF-15/16 tomados del expediente, docs/04, D-029 y el enum YEAR_END.
Archivos: ninguno. Comandos: ninguno.

Hallazgos:

- [BAJO] apps/api/src/modules/users/users-locks.ts:42 — lockUsersForUpdate hace una consulta por usuario → en 6b, variante `WHERE id IN (...) ORDER BY id FOR UPDATE` en una sola consulta.
- [BAJO] docs/fuentes/ERS_Aula_Virtual_Secundaria.pdf — texto literal de RF-15/16 sin confirmar.

Decisiones:

(A) RF-15, CLONAR (6a, módulo academic)

1. `POST /academic-years/:id/clone-structure` (:id = destino), solo ADMIN, cuerpo estricto `{ sourceYearId: uuid, copyTeachers?: boolean = false }` → 201 `{ targetYear, sourceYearId, created: { sections, courseSections, teachersAssigned }, skipped: { inactiveSections, inactiveCourseSections, inactiveCourses, teachersNotActive } }`. Errores: 400; 404 origen/destino; 409 destino cerrado o de solo lectura (D-030), destino con alguna sección, o concurrencia (1213/P2034); 422 mismo año, origen no anterior al destino u origen sin secciones activas.
2. Se copian solo secciones activas y, de cada una, CourseSection activos con Course activo. teacherId null por defecto; con copyTeachers solo si sigue TEACHER y ACTIVE (si no, null y suma teachersNotActive). No se copian períodos (el destino se crea antes con RF-09), matrículas, vínculos ni contenidos.
3. Idempotencia: destino con 0 secciones; segundo clon → 409 sin escribir. Una sola transacción.
4. Bloqueos: años de menor a mayor (origen FOR SHARE, destino FOR UPDATE con lockAcademicYear); recontar secciones del destino dentro de la transacción; el UNIQUE (academicYearId, gradeLevel, code) cubre carreras.
5. Bitácora `academic.year.clone_structure` sobre el año destino, after `{ sourceYearId, copyTeachers, created, skipped }`, sin nombres, después del commit. Sin evento.

(B) RF-16/RN-15, PROMOCIÓN (6b, `apps/api/src/modules/users/promotion/`)

1. Sin estado: `GET /academic-years/:id/promotion-proposal?sourceYearId=` → 200 PromotionProposal (lectura, sin bitácora); `POST /academic-years/:id/promotion` `{ sourceYearId, fingerprint, decisions: [{ enrollmentId, action, sectionId? }] }` (1..2000, sin repetir) → 201 `{ promoted, repeated, graduated, excluded, closedEnrollments, createdEnrollments }`. Errores 400; 404; 409 huella distinta, concurrencia o destino cerrado; 422 con details `decisions.i`. Todo o nada. fingerprint = SHA-256 de las matrículas vigentes del origen (enrollmentId, studentId, sectionId, status) + secciones activas del destino (id, gradeLevel), recalculada en la transacción tras los bloqueos.
2. Precondiciones: origen con sus 4 períodos cerrados (si no, 422; puede estar cerrado). Destino `year = origen.year + 1`, no cerrado, no solo lectura, con al menos 1 sección activa (422/409); activo o no.
3. Entran las matrículas vigentes del origen; retirados con matrícula cerrada y estudiantes sin matrícula vigente no aparecen.
4. PromotionItem `{ enrollmentId, studentId, fullName, status, from: { sectionId, gradeLevel, code }, proposed: { action, sectionId|null }, flags[] }` con flags INACTIVE, WITHDRAWN, NO_TARGET_SECTION, ALREADY_ENROLLED; orden grado, código, nombre; summary por acción; canConfirm = ninguna sección sin elegir.
5. Regla: grados 1..4 → PROMOTE a grado+1 (mismo código si existe y activa; si no, la única activa; si no, null con NO_TARGET_SECTION); grado 5 → GRADUATE; WITHDRAWN o ALREADY_ENROLLED → EXCLUDE; INACTIVE → PROMOTE con flag.
6. Correcciones: PROMOTE (sección activa grado+1, obligatoria), REPEAT (sección activa mismo grado, obligatoria), GRADUATE (solo grado 5, sin sección), EXCLUDE; WITHDRAWN/ALREADY_ENROLLED solo EXCLUDE. Las decisiones cubren exactamente todas las filas (si no, 422).
7. Efecto: PROMOTE/REPEAT/GRADUATE cierran la matrícula del origen (isCurrent NULL, effectiveTo = max(ahora, effectiveFrom), endReason YEAR_END); PROMOTE/REPEAT crean la del destino (effectiveFrom ahora, isCurrent TRUE). EXCLUDE deja la del origen vigente (tandas; si no queda nadie, 200 con items vacío). No cambia el status del usuario.
8. D-038: la promoción es la ÚNICA escritura permitida sobre un año origen cerrado o de solo lectura (D-030) y solo cierra matrículas vigentes con YEAR_END; notas y contenidos no se tocan (RN-14).
9. Bloqueos: (1) estudiantes FOR UPDATE por id en una consulta; (2) años FOR SHARE de menor a mayor; (3) secciones del destino FOR SHARE; luego huella, validación y escrituras (updateMany condicionado a isCurrent TRUE con conteo exacto o 409; createMany). 1213/P2034 → 409; UNIQUE (academicYearId, studentId, isCurrent) respalda.
10. Bitácora `users.promotion.commit` sobre el año destino con after `{ sourceYearId, promoted, repeated, graduated, excluded, closedEnrollmentIds, createdEnrollmentIds }`, solo ids y conteos, después del commit. Sin evento.
11. Lógica pura en `promotion-policy.ts` (proposePromotion, validateDecisions, promotionFingerprint), sin Prisma.

(C) WEB (D-037, `admin/_shared`)

- 6a: `estructura/anios/[anioId]/clonar/page.tsx` + componente en `estructura/_components/`: elegir año origen (solo anteriores, con número de secciones activas), casilla "copiar docentes", ConfirmAction, resultado con anuncio y foco; enlace desde `anios/[anioId]/page.tsx` solo si el año no tiene secciones y no es de solo lectura.
- 6b: `estructura/anios/[anioId]/promocion/page.tsx`, lógica pura en `estructura/_lib/promotion-machine.ts` (al estilo de import-machine.ts): origen (por defecto el año anterior), tabla agrupada por grado y sección con acción y sección por fila, acciones en bloque por sección, resumen, confirmación "todo o nada", 409 por huella → "la propuesta cambió, vuelve a cargarla", 360 px y teclado; enlace desde el año destino.

(D) Contratos: docs/03 (3 endpoints), docs/04 (YEAR_END y tandas), D-038 en docs/08.

(E) Archivos compartidos: ninguno (sin dependencias; controladores en academic.module.ts y users.module.ts de Dev 2; sin menú). Si hiciera falta alguno, BLOQUEADO.

(F) Plan: 6a.1 API de clonación con unit tests; 6a.2 e2e `apps/api/test/academic-clone.e2e-spec.ts` (clon correcto, copyTeachers con docente inactivo, segundo clon 409, destino cerrado/solo lectura 409, origen posterior 422, inactivos omitidos, 403, bitácora sin nombres); 6a.3 pantalla con Vitest. 6b.1 promotion-policy con tests; 6b.2 servicio y controlador; 6b.3 e2e `apps/api/test/users-promotion.e2e-spec.ts` (propuesta, todo o nada, huella 409, tandas, YEAR_END, período abierto 422, no consecutivo 422, origen cerrado permitido, paralelo 201/409, 403, bitácora solo ids); 6b.4 pantalla y promotion-machine.test.ts. Comandos con MySQL con NODE_OPTIONS=--dns-result-order=ipv4first y MySQL calentado; seed como estaba al final.

(G) Dependencias: ninguna de otros devs (AuditService, ActiveActorGuard, lockYearForShare, lockAcademicYear ya existen).

(H) Fuera: archivado y purga (Dev 5), estado "egresado", promoción automática (contra RN-15), promoción por notas, copiar materiales o tareas, reabrir años cerrados, asistencia/exámenes/SIAGIE.

Pendientes: texto literal de RF-15/16; D-038 propuesta; ¿egresados a INACTIVE? (por ahora no); posible evento enrollment.promoted.v1 para Dev 5 (no en v1); D-019 y D-021 abiertas.

Para: dev2-estructura — entrega 6a; sin modelador-bd.

### Decisión del orquestador 1 — plan y eficiencia

Se sigue el plan: sin modelador-bd. Para ser eficiente, se encadena: dev2-estructura hace 6a; mientras QA, seguridad y UX revisan 6a en paralelo, el mismo dev (reanudado, con su contexto) avanza 6b, que toca archivos distintos (users/promotion/, promocion/). Un solo documentador al final de 6b.

### INFORME 2 — dev2-estructura (BLOQUEADO, primera ejecución)

Estado: BLOQUEADO — el expediente no tenía aún el INFORME 1 ni la Decisión 1 (falló el guardado del orquestador: el heredoc de bash no terminó). Correcto según el protocolo §2.3 (no adivinar contratos). El orquestador pegó el plan y reanudó al mismo agente con SendMessage.

### INFORME 3 — dev2-estructura (entrega 6a)

Estado: LISTO
Requisitos: RF-15, D-029, D-030 (más RNF-24..27)
Resumen: 6a hecha según (A), (C) 6a y (F) 6a.1–6a.3, sin cambio de esquema. API `POST /academic-years/:id/clone-structure` (ADMIN + ActiveActorGuard solo en ese método, Zod estricto); `planClone` puro con tests; pantalla `/admin/estructura/anios/[anioId]/clonar` enlazada desde la ficha solo si el año no tiene secciones y no es de solo lectura. e2e nuevo y academic-api juntos 71/71. BD con el seed y servidores detenidos.
Archivos:

- API nuevos: apps/api/src/modules/academic/academic-clone-policy.ts (planClone, teacherIdsToCheck, cloneYearIssue), academic-clone-policy.spec.ts (8 tests), academic-clone.service.ts; apps/api/test/academic-clone.e2e-spec.ts (12 tests)
- API modificados: academic-years.controller.ts (ruta con ActiveActorGuard solo en el método), academic-years.service.ts (exporta toSummary y YearRow), academic.dto.ts (cloneStructureSchema), academic.errors.ts (5 mensajes), academic-locks.ts (lockAcademicYearForShare y lockAcademicYearRow), academic.module.ts (provider AcademicCloneService)
- Web nuevos: estructura/_lib/clone.ts y clone.test.ts (10 tests), estructura/_components/clone-structure.tsx, estructura/anios/[anioId]/clonar/page.tsx
- Web modificados: estructura/_lib/actions.ts (cloneStructureAction, CloneActionState), _lib/focus.ts (focusIds.cloneResult), anios/[anioId]/page.tsx (enlace condicionado a canOfferClone)

Comandos: MySQL calentado ok; api lint ok; api test 29/322 ok; api build ok; e2e academic-clone 12/12 y con academic-api 71/71 (con NODE_OPTIONS); web lint ok (aviso preexistente jsx-ast-utils); web test 10/235 ok; web build ok; prettier ok. Humo (node dist/main :4000, next start :3000, ADMIN): año 2027 creado por API → enlace y "2026 (6 secciones activas)"; clon 201 `{created: 6/30/0, skipped: 0}`; segundo clon 409; luego sin enlace y aviso de que ya tiene 6 secciones; 2025 cerrado sin enlace y "El año está cerrado"; sin sesión 401. Año 2027 borrado por SQL; pnpm db:seed ok (68 usuarios, 2 años, 8 períodos, 7 secciones, 30 curso-sección, 62 matrículas).
Hallazgos:

- [BAJO] aviso jsx-ast-utils preexistente fuera de estructura/ y \_shared/.
- [BAJO] la server action no se probó en navegador (diálogo, resultado, anuncio y foco en "Estructura copiada en N").
- [BAJO] el token de dev-session se imprimió una vez en la salida de un comando (local y temporal; archivo borrado; la sesión caduca).

Decisiones:

1. Orden: 422 si sourceYearId === :id antes de buscar; 404 destino y luego origen; 422 si el origen no es anterior; en la transacción 409 cerrado, 409 solo lectura, 409 con secciones, 422 origen sin secciones activas; P2002/P2034/1213 → 409 con el mensaje de destino con secciones.
2. 201 con targetYear YearSummary `{ id, year, isActive, closedAt, readOnly }`.
3. Bloqueos: origen FOR SHARE y destino FOR UPDATE con consultas propias en academic-locks.ts (necesitan year y closedAt); recuento y revalidación tras los bloqueos; docentes leídos sin bloqueo.
4. skipped.inactiveCourseSections cuenta solo los de secciones activas; una sección activa sin cursos copiables se copia igual.
5. ActiveActorGuard solo en el método de clonar.
6. Web: resultado en el estado del cliente; ConfirmAction sigue montado y se oculta con `hidden` para cerrar, anunciar y enfocar #resultado-clonacion; orígenes: hasta 10 años anteriores con alguna sección activa.

Pendientes: prueba manual en navegador; docs/03 y manual técnico al final de 6b. Sin commit.
Para: qa-tester, seguridad-cumplimiento y ux-accesibilidad en paralelo.

### Decisión del orquestador 2

Se lanzan en paralelo QA, seguridad y UX sobre la 6a, y a la vez se reanuda al mismo dev2-estructura con la 6b (archivos distintos: users/promotion/, test/users-promotion.e2e-spec.ts, estructura/anios/[anioId]/promocion/, \_lib/promotion-machine.ts). Si la 6a recibe CAMBIOS_PEDIDOS, se corrigen después de la 6b con el mismo agente.

### INFORME 4 — seguridad-cumplimiento (entrega 6a)

Estado: APROBADO (sin CRÍTICO ni ALTO; 2 MEDIO y 1 BAJO no bloqueantes)
Revisado (solo lectura): academic-clone.service.ts, academic-clone-policy.ts, academic-years.controller.ts, academic.dto.ts, academic-locks.ts, estructura/\_lib/actions.ts y \_lib/clone.ts.
Cumple: @Roles('ADMIN') de clase (controller.ts:33) y ActiveActorGuard en el método (:87-88); z.strictObject con uuid y boolean (dto.ts:112-115) e idSchema; Server Action con isUuid (actions.ts:137) y parseCloneForm (clone.ts:100-105); sin dangerouslySetInnerHTML; $queryRaw parametrizado (academic-locks.ts:38-40, 49-51); bloqueos origen FOR SHARE (:66) y destino FOR UPDATE (:68) con revalidación (:70), sin ciclo con cerrar año, reabrir período ni usuarios; 409 por cerrado (:75), solo lectura (:80) y con secciones (:83-84); una sola transacción con mapPrismaError; copyTeachers solo con TEACHER y ACTIVE (policy.ts:87-94, service.ts:110); bitácora después del commit con ids, bandera y conteos (:141).
Hallazgos:

1. MEDIO — academic-clone.service.ts:109-113, 122-133 — la elegibilidad de docentes se lee sin bloqueo: un docente desactivado entre la lectura y el INSERT puede quedar asignado, y el INSERT con FK toma un lock compartido sobre User después del año FOR UPDATE (orden inverso al de users.service: User → año) → posible deadlock 1213. → Con copyTeachers, bloquear los docentes FOR SHARE en orden de id y releer su estado ANTES de los bloqueos de año; o aceptar la carrera y verificar que 1213/P2034 → 409.
2. MEDIO — academic-clone.service.ts:141 — si recordAcademic falla tras el commit, la API responde error aunque la estructura se creó (reintento → 409). → Confirmar que recordAcademic captura y registra su error sin relanzar; si no, try/catch.
3. BAJO — academic-clone.service.ts:52-57 — 404 distintos para destino y origen (solo ADMIN; sin acción).
   Para: orquestador — MEDIO corregibles en una vuelta opcional con dev2-estructura.

### INFORME 5 — ux-accesibilidad (entrega 6a)

Estado: APROBADO (sin CRÍTICO ni ALTO; nada bloquea)
Revisado (solo lectura): estructura/\_components/clone-structure.tsx, anios/[anioId]/clonar/page.tsx, enlace en anios/[anioId]/page.tsx:140-150, confirm-action.tsx, SelectField y textos de \_lib/clone.ts.
Verificado: foco y anuncio con el contenedor `hidden` (clone-structure.tsx:82) funcionan (diálogo en portal, setResult en :75 antes del ok, h2#resultado-clonacion en :150 con tabIndex=-1, announce con cloneSuccessMessage, refocusIfLost); 360 px en columna, selector de 44 px, diálogo al ancho de pantalla; selector con Label y ayuda por aria-describedby (:83-94); casilla con label htmlFor, aria-describedby y fila min-h-11 (:95-113); ConfirmAction con texto claro (:119-138); mensajes de bloqueo con causa y enlace de vuelta (:56-70, cloneBlockReason); coherencia con admin/\_shared; enlace con min-h-11 (page.tsx:142-147).
Recomendaciones (BAJO, no bloquean):

1. clone-structure.tsx:97-104 — casilla de 20 px; hacer que el label envuelva la fila con min-h-11 y cursor-pointer.
2. clone-structure.tsx:82 — comprobar en el navegador que `hidden` gana a `flex` (Tailwind 4 lo garantiza).
3. clone-structure.tsx:123-127 — añadir al diálogo "No se copian períodos, matrículas ni contenidos".
4. clone-structure.tsx:43 — opcional, enlace "Ver las secciones" en el bloqueo "ya tiene N secciones".

### Decisión del orquestador 3 — seguimiento de 6a

Seguridad y UX aprobaron la 6a. MEDIO 2 de seguridad ya resuelto: `recordAcademic` (academic-audit.ts:19-40) captura el error de la bitácora y solo lo registra, sin relanzarlo (probado en academic-concurrency.spec.ts:257). MEDIO 1 (docentes leídos sin bloqueo y posible deadlock con users.service) y los BAJO 1 y 3 de UX se pasan al mismo dev2-estructura al terminar la 6b, en un solo mensaje, para no interrumpir su trabajo. Se espera además el INFORME de qa-tester de la 6a.

### INFORME 6 — qa-tester (entrega 6a)

Estado: LISTO (sin bugs)
Archivos (solo tests): academic-clone-policy.spec.ts (+6: curso-sección inactivo con curso inactivo, docente de curso inactivo no suma, orden por código y lista de elegibles ignorada sin copyTeachers, origen vacío, teacherIdsToCheck, cloneYearIssue); test/academic-clone.e2e-spec.ts (+2: docente ACTIVE que ya no es TEACHER no se copia y bitácora sin nombres ni correos; clon rechazado deja intacto el origen); estructura/_lib/clone.test.ts (+5).
No añadido: "destino sin períodos" (un año siempre se crea con sus 4 períodos, RF-09). Ya cubiertos por el dev: campos extra, id no UUID, copyTeachers no booleano, curso inactivo, sección sin cursos, clones en paralelo.
Comandos: api test 29/328 ok; e2e academic-clone + academic-api 73/73 ok (MySQL calentado); web test 10/240 ok; pnpm db:seed al final (68 usuarios, 2 años, 8 períodos, 7 secciones, 5 cursos, 30 curso-sección, 62 matrículas). Sin lint ni build. No tocó promotion/ ni promocion/.
Nota del orquestador: QA corrió e2e y db:seed contra la misma BD mientras dev2 trabaja en la 6b; si la 6b reporta fallos de e2e intermitentes en esa ventana, se repiten.

### INFORME 7 — dev2-estructura (entrega 6b)

Estado: LISTO
Requisitos: RF-16, RN-15, D-038 (también RN-14, D-030, RNF-24..27)
Resumen: 6b terminada según (B) 1–11, (C) 6b y (F) 6b.1–6b.4, sin cambio de esquema. API GET promotion-proposal y POST promotion (ADMIN + ActiveActorGuard, Zod estricto), reglas puras en promotion-policy.ts, pantalla /admin/estructura/anios/[anioId]/promocion con promotion-machine.ts. e2e nuevos + users-api + academic-clone 113/113. BD con el seed y servidores detenidos.
Archivos:

- API nuevos (apps/api/src/modules/users/promotion/): promotion-policy.ts, promotion-policy.spec.ts (12), promotion.dto.ts, promotion.errors.ts, promotion.service.ts, promotion.controller.ts
- API modificados: users-locks.ts (lockUsersForUpdateBulk, una consulta ORDER BY id FOR UPDATE; importa Prisma como valor), users-audit.ts ('AcademicYear' en UsersEntity), users.module.ts (PromotionController y PromotionService)
- e2e nuevo: apps/api/test/users-promotion.e2e-spec.ts (13)
- Web nuevos (estructura/): \_lib/promotion-machine.ts + test (25), \_components/promotion-screen.tsx, anios/[anioId]/promocion/page.tsx
- Web modificados: \_lib/data.ts (getPromotionProposal), \_lib/actions.ts (promotionCommitAction con parseCommitInput), anios/[anioId]/page.tsx (enlace con canOfferPromotion)

Comandos: api lint 0 avisos; api test 30/341; api build; e2e users-promotion 13/13 y con users-api y academic-clone 113/113; web lint 0 (aviso preexistente); web test 11/260; web build; prettier ok. Humo: 2027 creado y clonado (201), enlace de promoción; 422 por períodos abiertos mostrado en la página; con los períodos 2–4 de 2026 cerrados por SQL solo durante la prueba: 59 filas, summary {promote 50, graduate 9}, canConfirm true, bloques por sección y marca "Estudiante inactivo"; docente 403; períodos restaurados y 2027 borrado; commit cubierto por el e2e. pnpm db:seed ok.
Cobertura e2e: 401; 403 docente, estudiante y ADMIN inactivo; 400 varios; 404 destino y origen; 422 mismo año, no consecutivo, período abierto, destino sin secciones activas; 409 solo lectura y cerrado; propuesta (forma, marcas, orden, resumen, retirado ausente, sin bitácora); 422 con details sin escribir; 409 huella sin escribir; tanda con REPEAT y EXCLUDE (YEAR_END, matrículas nuevas, effectiveTo = max, egresado sin cambio de status); bitácora solo ids y conteos; origen cerrado permitido (D-038); paralelo 201/409; queda solo el retirado como EXCLUDE; limpieza.
Hallazgos:

- [MEDIO] apps/web/lib/api/server.ts:24 — timeout del BFF de 15 s y transacción de hasta 20 s + 5 s de espera: con ~2000 filas la web podría mostrar error de red aunque la API confirme.
- [BAJO] apps/web/lib/api/errors.ts:17 — solo 20 details; la pantalla marca hasta 20 filas (aceptable).
- [BAJO] prettier sobre estructura/ pudo reformatear clone.test.ts de QA (solo formato).

Decisiones:

1. La huella incluye también a los ya matriculados en el destino (más estricta; el cliente no la calcula).
2. PromotionProposal `{ sourceYear, targetYear, fingerprint, targetSections, items, summary:{promote,repeat,graduate,exclude,withoutSection}, canConfirm }`; POST 201 con los conteos.
3. Orden de respuestas: 422 mismo año, 404, 422 no consecutivo, 422 período abierto, 409 cerrado, 409 solo lectura, 422 sin secciones activas; en el POST se repiten tras los bloqueos y siguen huella (409) y decisiones (422); P2028/P2034/1213/P2002 → 409.
4. Bloqueos: estudiantes FOR UPDATE en una consulta → años FOR SHARE de menor a mayor → Section del destino ORDER BY id FOR SHARE; updateMany por lotes de 500 condicionado a isCurrent TRUE (por fila cuando effectiveFrom > ahora); 409 si el conteo no cuadra; createMany con uuidv7.
5. Web: el origen es siempre el año inmediatamente anterior (aviso si no existe).
6. 409 al confirmar cierra el diálogo con "La propuesta cambió; vuelve a cargarla." y foco al aviso con "Volver a cargar la propuesta"; 422 deja el diálogo abierto y marca filas.
7. Las acciones en bloque no tocan filas que solo admiten EXCLUDE.

Pendientes: prueba manual en navegador; documentador; decisión del timeout. Sin commit.
Para: qa-tester, seguridad-cumplimiento y ux-accesibilidad.

### Decisión del orquestador 4 — timeout y correcciones de 6a

- Timeout (MEDIO del INFORME 7): `apps/web/lib/api/server.ts` lo creó Dev 2 en la F5 bajo la autorización A2 (TEMPORAL hasta el cliente de Dev 1), así que se corrige aquí: opción `timeoutMs` por petición (15 s por defecto) y 30 s solo para el POST de promoción, mayor que los 25 s de la transacción. Sin bajar el límite de la transacción.
- Se pasan a la vez al mismo dev2-estructura: ese cambio, el MEDIO 1 de seguridad de 6a (bloquear docentes FOR SHARE en orden de id y releer su estado antes de los bloqueos de año cuando copyTeachers) y los BAJO 1 y 3 de UX de 6a (fila completa clicable en la casilla; "No se copian períodos, matrículas ni contenidos" en el diálogo).
- En paralelo, QA, seguridad y UX revisan la 6b (archivos distintos a los de la corrección, salvo una línea en estructura/\_lib/actions.ts).

### INFORME 8 — ux-accesibilidad (entrega 6b)

Estado: CAMBIOS_PEDIDOS
Revisado (solo lectura): promotion-screen.tsx, promocion/page.tsx y el enlace en anios/[anioId]/page.tsx:152-161.
Bloquea (ALTO):

1. promotion-screen.tsx:300-307 y :174-184 — las acciones en bloque cambian muchas filas sin anuncio y el resumen no es región viva (4.1.3). → announce con conteos ("Se aplicó «Repite» a 28 estudiantes de 2.º A; se mantuvieron 2 excluidos") o resumen con role="status".
2. promotion-screen.tsx:103-108 y :339-340 — tras un 422 el mensaje no da el conteo y al cerrar el diálogo el foco vuelve a Confirmar, no a la primera fila con error. → conteo en el mensaje, foco al primer select con error (id por fila, requestAnimationFrame), anuncio y aria-describedby de las filas hacia el mensaje.
   Debe corregirse (MEDIO):
3. promotion-screen.tsx:357, 372, 268, 280 — 60 selectores con la misma etiqueta. → "Acción de {nombre}", "Sección de destino de {nombre}" (visible o sr-only conteniendo el texto visible, 2.5.3) y "Acción para toda la sección {label}".
4. promotion-screen.tsx:200-201 — Confirmar desactivado sin motivo legible (un botón disabled no recibe foco). → texto visible con el motivo y qué hacer.
5. promotion-screen.tsx:360 — selector deshabilitado con una sola opción sin explicación. → "Solo puede quedar excluido".
   BAJO:
6. promocion/page.tsx:41 — quitar "(RN-15)" del texto.
7. promotion-screen.tsx:213 — "Volver a la propuesta" no dice que descarta los cambios.
   Correcto: marcas con texto; selectores apilados de 44 px; fieldset/legend por fila y h2 por sección; errores de fila asociados; diálogo "todo o nada" claro; foco y anuncio tras éxito; aviso 409 con foco y "Volver a cargar la propuesta"; coherencia con admin/\_shared.
   Para: dev2-estructura — vuelta 1/2 de la F6.

### INFORME 9 — seguridad-cumplimiento (entrega 6b)

Estado: APROBADO (sin CRÍTICO ni ALTO)
Revisado: users/promotion/{controller,dto,policy,service}.ts, users-locks.ts, users-audit.ts, estructura/\_lib/{actions,data,promotion-machine}.ts y promotion-screen.tsx (solo patrones peligrosos).
Verificado: @Roles('ADMIN') + ActiveActorGuard en ambos endpoints (controller.ts:20-22); z.strictObject en query y cuerpo, 1..2000 decisiones uuid sin repetidas, huella /^[0-9a-f]{64}$/ (dto.ts:11-29); $queryRaw etiquetado con Prisma.join (users-locks.ts:66) y sin Unsafe; bloqueos estudiantes → años → secciones con ORDER BY id (service.ts:129-137) coherentes con el módulo y P2028/1213/P2034 → 409 (:70-75); revalidación, huella y decisiones tras los bloqueos en una sola transacción con timeout y updateMany con isCurrent y conteo exacto (:139-176); D-038 solo cierra matrículas con YEAR_END en el origen (:161, 168-172, 236-257); propuesta sin correos, huella sin nombres (policy.ts:262-268), sin dangerouslySetInnerHTML, localStorage ni console, URLs solo con ids; bitácora después del commit con ids y conteos, sin relanzar (:201-208, users-audit.ts:41-53); parseCommitInput en la Server Action (actions.ts:171-179, promotion-machine.ts:417-454).
Observaciones:

- MEDIO — service.ts:201-208 — bitácora fuera de la transacción (mismo diseño del módulo; pendiente de Dev 1 `record(event, tx)`).
- BAJO — service.ts:204-205 — afterState con hasta 4000 ids: confirmar que la columna JSON lo admite; si no, conteos + hash.
- BAJO — service.ts:159-174 — añadir `academicYearId: source.id` al filtro de updateMany (defensa en profundidad).
- BAJO — service.ts:118-123 — ids de estudiantes leídos antes de la transacción (cubierto por la huella → 409).
  Para: orquestador → revisor-pr; sin CRÍTICO.

### INFORME 10 — qa-tester (entrega 6b)

Estado: CAMBIOS_PEDIDOS
Hallazgo (bug): POST /academic-years/:id/promotion con más de 2000 decisiones devuelve 500, no 400. El parser JSON de Express corta en 100 kb y lanza un 413 que no es HttpException; apps/api/src/common/errors/api-exception.filter.ts:35-36 lo convierte en 500. Consecuencias: el tope de 2000 (promotion.dto.ts:9) nunca se alcanza por HTTP (2001 decisiones mínimas ≈ 160 kb) y una confirmación legítima grande (2000 filas con sectionId ≈ 250 kb) también falla. Corrección sugerida: que el filtro respete el 413 (PAYLOAD_TOO_LARGE) y subir el límite JSON (main.ts:8) a ~512 kb. Test en rojo: users-promotion.e2e-spec.ts, "RF-16: más de 2000 decisiones" (~l. 450), reproducible en 2 corridas.
Tests añadidos: promotion-policy.spec.ts (secciones destino sin coincidencia, marcas acumuladas, allowedActions, REPEAT sin sección, GRADUATE con sección, PROMOTE en 5.º, lista vacía, huella estable y distinta); users-promotion.e2e-spec.ts (+5: decisión que sobra 422, faltan 422, sectionId de otro año 422, sección inactiva 422, más de 2000); promotion-machine.test.ts (varios casos de la máquina y parseCommitInput con 2000).
Comandos: api test 31/356 ok; web test 12/269 ok; e2e users-promotion 17/18 (falla solo el de 2000); pnpm db:seed ok.
Para: dev1-plataforma (filtro compartido) y/o dev2-estructura (límite de cuerpo).

### INFORME 11 — dev2-estructura (correcciones de 6a y timeout, Decisión 4)

Estado: LISTO
Requisitos: RF-15, RF-16 (también RNF-24..27)
Resumen: las tres correcciones de la Decisión 4 aplicadas. e2e de clonación ok; promoción 17/18 (falla el test nuevo de QA de más de 2000 decisiones por el límite de cuerpo de la plataforma).
Cambios:

1. Timeout: apps/web/lib/api/request-guards.ts:34 `resolveTimeoutMs` (1–60 s, si no 15 s); apps/web/lib/api/server.ts:25 y :49 `RequestOptions { timeoutMs? }` con AbortSignal.timeout (solo `post` acepta la opción); estructura/\_lib/actions.ts:158 y :193 `PROMOTION_TIMEOUT_MS = 30_000`; test nuevo apps/web/lib/api/timeout.test.ts.
2. MEDIO 1 de 6a: academic-locks.ts:63 `lockUsersForShare` (una consulta ORDER BY id FOR SHARE); academic-clone.service.ts:68-81 docentes bloqueados primero (User → AcademicYear) y elegibles según la lectura bloqueada; :105-110 docente nuevo no bloqueado → 409; método privado readSourceStructure; test nuevo academic-clone-locks.spec.ts (orden de llamadas, estado bloqueado, sin copyTeachers no bloquea usuarios, 409, P2034/1213/P2010 → 409).
3. BAJO 1 y 3 de UX de 6a: clone-structure.tsx:97-110 label que envuelve la fila (min-h-11, cursor-pointer) y :129 "No se copian períodos, matrículas ni contenidos."

Comandos: api lint 0; api test 31/356; api build; e2e academic-clone ok; users-promotion 17/18; web lint ok; web test 12/269; web build; prettier ok; pnpm db:seed ok.
Hallazgos: [ALTO] apps/api/src/app.setup.ts — body-parser con límite de 100 kb y ApiExceptionFilter convierte su 413 en 500: una promoción de ~1300+ filas no llega a la API. [BAJO] server.ts — get/patch/put sin options (se añadirán cuando hagan falta).
Decisiones: timeoutMs limitado a 60 s; en la clonación, un docente nuevo entre la lectura previa y la transacción da 409.

### Decisión del orquestador 5 — límite de cuerpo y vuelta 1/2

Pregunta al usuario: ¿tocar archivos de Dev 1 o bajar el tope a 800 por tandas? Respuesta: "Tocar archivos de Dev 1 (Recomendado)". Se autoriza al mismo dev2-estructura (con el contexto completo) a cambiar solo: el límite JSON de la API a 512 KB (en app.setup.ts o main.ts, donde se configure el body-parser) y que ApiExceptionFilter responda 413 PAYLOAD_TOO_LARGE (no 500) a los errores de body-parser con status 413. Queda como pendiente para David (Dev 1). En la misma vuelta (1/2 de la F6) se pasan los 2 ALTO y 3 MEDIO de UX de la 6b (INFORME 8), los BAJO 6 y 7, y el BAJO de seguridad de añadir `academicYearId: source.id` al filtro de updateMany (INFORME 9). Columna de bitácora: `afterState Json?` (auth.prisma:80); 4000 ids (~150 KB) caben, no se cambia.

### INFORME 12 — dev2-estructura (vuelta de corrección 1/2)

Estado: LISTO
Requisitos: RF-16, RN-15 (también RNF-24..27)
Resumen: límite de cuerpo y 413 en los dos archivos de Dev 1 autorizados, 2 ALTO + 3 MEDIO + 2 BAJO de UX de la 6b y el BAJO de seguridad. El test de QA de más de 2000 decisiones pasa (400 por Zod); users-promotion 18/18. Tests de QA sin tocar. BD con el seed.
Archivos:

1. Dev 1 (comentario "autorizado por el usuario el 29/10/2026 (Decisión del orquestador 5); PENDIENTE DE REVISIÓN por Dev 1"): apps/api/src/app.setup.ts:14 y :19 (`JSON_BODY_LIMIT = '512kb'`, `useBodyParser('json', { limit })` antes de app.init(), también en createTestApp); apps/api/src/common/errors/api-exception.filter.ts:29 (`isPayloadTooLarge`) y :49-60 (413 PAYLOAD_TOO_LARGE "El cuerpo de la solicitud supera el tamaño permitido", sin details ni stack); test nuevo api-exception-413.spec.ts.
2. UX 6b: promotion-screen.tsx:404 (bulkAnnouncement); :126-131 (422 cierra el diálogo y anuncia invalidRowsMessage(n)); :241 (focusTargetOf al primer select con error o al aviso); ~:212-232 (aviso persistente #promocion-errores); filas con aria-invalid y aria-describedby (rowFieldIds, RowSelect); :364/377/471/496 (nombres únicos con sufijo sr-only); :260 (confirmBlockReason visible); :438 (nota "Solo puede quedar excluido…"); :256 ("Descartar mis cambios" con anuncio); promocion/page.tsx:41 (sin "(RN-15)"); lógica pura al final de promotion-machine.ts; test nuevo \_lib/promotion-a11y.test.ts (7).
3. Seguridad: promotion.service.ts:161 y :168 con `academicYearId: source.id`.

Comandos: api lint 0; api test 32/359; api build; e2e users-promotion, academic-clone, users-import y app 4/102 (users-promotion 18/18); web lint ok; web test 13/275; web build; prettier ok; pnpm db:seed ok.
Hallazgos: [BAJO] en 409/422 ConfirmAction recibe 'ok' para cerrar y enfocar, así que el aviso sale con estilo de éxito aunque el texto diga que no se guardó (posible variante "cerrar con aviso" en \_shared); [BAJO] otros errores de body-parser (JSON mal formado, 400 entity.parse.failed) siguen dando 500 → Dev 1, fuera de la autorización.
Decisiones: tras un 422 el diálogo se cierra para llevar el foco al primer select con error; el límite de 512 KB es global.
Pendientes: revisión de Dev 1 de app.setup.ts y api-exception.filter.ts; revisión de UX; prueba manual. Sin commit.

### Decisión del orquestador 6 — verificación eficiente

El dev ya corrió api/web lint, test, build y 4 e2e (102 tests, incluido el test de QA que estaba en rojo), así que no se repite QA. Se lanzan en paralelo y acotados: ux-accesibilidad sobre los cambios de la 6b y seguridad-cumplimiento solo sobre el cambio del filtro y del límite de cuerpo (archivos de Dev 1). Después, revisor-pr y documentador en paralelo (el documentador solo toca docs/).

### INFORME 13 — seguridad-cumplimiento (límite de cuerpo, 413 y filtro de updateMany)

Estado: APROBADO (sin CRÍTICO ni ALTO)

1. app.setup.ts:14, :19 — 512 KB global: riesgo BAJO (sigue siendo pequeño, hay throttler, multer de la importación es independiente). Opcional: parser por ruta y 100 KB en el resto.
2. api-exception.filter.ts:29-33, 49-60, 81-84 — el 413 no filtra nada (mensaje fijo, details vacío, requestId; sin stack, limit ni length; el log del stack solo para errores que no son 413 ni HttpException).
3. JSON mal formado sigue dando 500 (MEDIA-BAJA, no bloquea): body-parser lanza status 400 que el filtro no reconoce (:51-55) y cada caso escribe un stack en el log (:76). Para Dev 1: generalizar a errores 4xx de body-parser con mensaje fijo y sin stack.
4. promotion.service.ts:161, :168 — academicYearId en el where correcto; con el conteo de :177 la transacción se revierte si no cuadra.
   Para: orquestador → revisor-pr; puntos 1 y 3 como mejoras opcionales para Dev 1.

### INFORME 14 — ux-accesibilidad (corrección 1/2 de la 6b)

Estado: APROBADO (sin CRÍTICO, ALTO ni MEDIO; solo lectura)
Resueltos: ALTO 1 (promotion-screen.tsx:404, machine :548-560); ALTO 2 (:129-132, focusTargetOf :69-75, aviso persistente :211-233, firstErrorFieldId machine :507-515; filas con aria-invalid/aria-describedby :475-476, 503-504, error :449); MEDIO 3 (:364, 377, 471, 496); MEDIO 4 (machine :526-533, :259-263); MEDIO 5 (machine :536-542, :485-489); BAJO 6 (page.tsx:41); BAJO 7 (:252-256).
Sobre el aviso con estilo de éxito en 409/422: bastan los avisos persistentes #promocion-errores y #propuesta-desactualizada (variante de alerta, reciben el foco); no hace falta variante en _shared ahora.
Sin regresiones. Observaciones BAJO: aviso temporal "No se guardó nada" con estilo de éxito (:127-131); machine.ts:556 arma la etiqueta a mano (el orquestador comprobó que sectionLabel en _shared/lib/format.ts:19-20 usa el mismo formato `${gradeLevel}.º ${code}`).

### Decisión del orquestador 7

QA (vía la batería del dev), seguridad y UX en verde. Se lanzan en paralelo revisor-pr (código + expediente) y documentador (solo docs/: 3 endpoints en docs/03, YEAR_END y tandas en docs/04, D-038 en docs/08, docs/10 y manual técnico, y la nota de los dos archivos de Dev 1 pendientes de su revisión).

### INFORME 15 — documentador (Fase 6)

Estado: LISTO
Archivos: docs/03_CONTRATOS.md (sección "API de clonación y promoción de años": 3 endpoints, errores con mensajes exactos, límite JSON 512 KB y 413 como nota de plataforma pendiente de Dev 1); docs/04_REGLAS_ESTADOS.md ("Promoción en bloque (RN-15, RF-16)"); docs/08_DECISIONES.md (D-038 PROPUESTA del 29/10/2026 y adenda a D-037 sobre timeoutMs: 15 s por defecto, 60 s máximo, 30 s para la promoción); docs/10_TRAZABILIDAD.md (RF-15 y RF-16); docs/manuales/tecnico.md (sección F6); docs/manuales/administrador.md (CREADO: copiar estructura y promover).
Verificado contra el código: rutas, cuerpos, respuestas, mensajes (PROMOTION_MSG, MSG), allowedActions, timeouts, JSON_BODY_LIMIT, isPayloadTooLarge.
Hallazgos: [MEDIO] falta el INFORME de revisor-pr (corre en paralelo); [MEDIO] tecnico.md conserva en secciones previas "fuera de esta fase: clonación y promoción (F6)", ya superado (no reescrito; la sección F6 lo aclara); [BAJO] nota histórica de F5 en docs/10.
Pendientes: revisor-pr; revisión de Dev 1 de app.setup.ts y api-exception.filter.ts; JSON mal formado da 500; texto literal de RF-15/16; egresados a INACTIVE (por ahora no); prueba manual; sin PR al equipo.

### INFORME 16 — revisor-pr (Fase 6)

Estado: APROBADO
Comandos: api lint ok; api test 32/359; api build; MySQL calentado; e2e academic-clone, academic-api, users-promotion, users-api y users-import 5/244 ok (NODE_OPTIONS=--dns-result-order=ipv4first); web lint ok (aviso preexistente); web test 13/275; web build; prettier ok sobre código y expediente; pnpm db:seed (68 usuarios, 2 años, 8 períodos, 7 secciones, 5 cursos, 30 curso-sección, 62 matrículas).
Alcance: sin cambios en package.json, lockfile, prisma/schema, nav, routes, layouts, next.config, packages/ui ni módulos de otros devs; app.setup.ts y api-exception.filter.ts solo con lo autorizado y su comentario; lib/api solo añade timeoutMs; bloqueos, módulos y users-audit solo se extienden; sin console, dangerouslySetInnerHTML ni TODO.
Definición de terminado: permisos con e2e 401/403; bitácora sin nombres con test; unit + e2e; UX y seguridad sin CRÍTICO ni ALTO; ALTO previos cerrados.
Hallazgos (BAJO): límite global de 512 KB (opcional por ruta, Dev 1); JSON mal formado da 500 (Dev 1); aviso temporal con estilo de éxito en promotion-screen.tsx:127-131; docs/manuales/administrador.md sin seguimiento (del documentador).
Archivos del commit: 17 modificados y 23 nuevos (lista en el reporte), más el expediente y el reporte. Excluidos .agents/ y skills-lock.json.

### Decisión del orquestador 8 — cierre

Todo en verde. El commit incluye también la documentación del INFORME 15 (docs/03, 04, 08, 10, manuales/tecnico.md y el nuevo manuales/administrador.md): el revisor la dejó fuera solo porque no estaba en su alcance, y CLAUDE.md pide la documentación junto al trabajo. Un solo commit para la F6.
