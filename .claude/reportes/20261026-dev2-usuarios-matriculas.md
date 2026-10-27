# Reporte — Dev 2, Fase 3: usuarios, matrículas, traslados y apoderados

## Pedido

- **Usuario:** "Sigue con la Fase 3 de Dev 2: usuarios, matrículas, traslados y apoderados, con los agentes."
- **Fecha:** 26–27/10/2026 · **Flujo:** completo · **Rama:** `features/adolfo` · **Commit:** `feat(users): RF-18/19/20/22/23/24/25 …` (subido solo a `mio`)
- **Aviso:** Dev 2 es de un compañero. No va al equipo sin acuerdo con el dueño de Dev 2; depende de D-021.

## Resultado

- **Módulo `apps/api/src/modules/users/`** con 14 endpoints, todos solo ADMIN y con un guard que comprueba en la BD que el administrador siga activo:
  - Búsqueda paginada con filtros (rol, estado, grado, sección, texto) y detalle de usuario.
  - Alta de estudiante con su matrícula, de docente y de apoderado con sus hijos.
  - Edición de nombre y correo; cambio de estado (retirar cierra las matrículas vigentes).
  - Matrícula, traslado de sección en una sola operación e historial de matrículas.
  - Vínculo apoderado–estudiante: crear, revocar con motivo, volver a vincular, historial.
- **Esquema:** `GuardianStudent` ahora tiene `id`, marcador de vigencia y `revokedAt`, con 3 reglas `CHECK`: un vínculo revocado se conserva.
- **Error corregido de la Fase 1:** la regla `CHECK` de matrículas dejaba cerrar una matrícula sin fecha ni motivo (en MySQL una condición con NULL no hace fallar un `CHECK`). Corregida con una migración nueva.
- **Para Dev 4/5:** `getLinkedStudentIds` devuelve solo vínculos vigentes y sin estudiantes retirados; 2 eventos nuevos (`user.status-changed.v1`, `enrollment.transferred.v1`).
- **Tests:** 185 unitarios y 179 e2e (86 nuevos de usuarios y 8 casos nuevos de reglas `CHECK`).

## Agentes que participaron

| #   | Agente                   | Modelo | Qué hizo                                                                                                | Estado   |
| --- | ------------------------ | ------ | ------------------------------------------------------------------------------------------------------- | -------- |
| 1   | `arquitecto-integrador`  | Opus   | Plan: esquema, 14 endpoints, bloqueos, bitácora y eventos; detectó el riesgo RF-08 (sesiones abiertas)  | LISTO    |
| 2   | `modelador-bd`           | Opus   | `GuardianStudent` revocable; encontró el error del `CHECK` de matrículas                                | LISTO    |
| 3   | `modelador-bd`           | Opus   | Migración que corrige el `CHECK` de matrículas                                                          | LISTO    |
| 4   | `dev2-estructura`        | Opus   | Módulo de usuarios, seed y cambios en el servicio académico                                             | LISTO    |
| 5   | `seguridad-cumplimiento` | Sonnet | Auditoría: 4 MEDIO (3 de Dev 1) y 5 BAJO                                                                | APROBADO |
| 6   | `qa-tester`              | Sonnet | 86 e2e de usuarios y 8 casos de reglas `CHECK`                                                          | LISTO    |
| 7   | `dev2-estructura`        | Opus   | Corrección 1/2: apoderado sin acceso a retirados, orden de bloqueos, deadlock → 409, límite de búsqueda | LISTO    |
| 8   | `revisor-pr`             | Sonnet | Revisión final                                                                                          | APROBADO |
| 9   | `documentador`           | Haiku  | docs/02, 03, 04, 08 (D-032..D-034), 10 y manual técnico                                                 | LISTO    |

## Prompts usados

### 1. arquitecto-integrador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-usuarios-matriculas.md (léelo completo, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Revisa también los expedientes de las Fases 1 y 2 que cita. Trabaja en C:\Proyectos\AV-MATER-CHIRSTI (rama features/adolfo). No tienes Bash: si necesitas comparar con origin/features/david, pídeselo al orquestador en Pendientes.

Tu encargo: planificar la Fase 3 de Dev 2 (RF-18, 19, 20, 22, 23, 24, 25; RN-13). Lee la ERS (docs/fuentes, PDF) para el texto exacto de esos RF; docs/02, 03 (incluye la sección de la API académica), 04 (incluye la sección de historial de matrícula y vínculos de menores), 05, 06, 08 (D-012, D-013, D-019, D-021, D-024, D-027..D-031), 09; prisma/schema/academic.prisma y auth.prisma; el código de apps/api/src/modules/academic/ (patrones a reutilizar) y common/.

Entrega en Decisiones:
1. ¿Hace falta cambio de esquema? En particular GuardianStudent: revocación auditable (revokedAt, createdById, revokedById, motivo) frente a borrar la fila y apoyarse en la bitácora; y si hace falta algo en User (p. ej. campos de RF-18..20). Si hay cambio, el modelo exacto, la migración (con SQL manual si aplica) y el impacto en el seed y en AcademicAccessService.getLinkedStudentIds / assertCanAccessCourseSection.
2. Estructura de apps/api/src/modules/users/ y qué reutiliza de modules/academic (¿mover utilidades comunes del módulo académico a un lugar compartido o importarlas?; decide sin tocar common/ de Dev 1).
3. Endpoints exactos (método, ruta /api/v1, rol, cuerpo, respuesta, errores): alta de estudiante con matrícula inicial, alta de docente, alta de apoderado, edición de datos, cambio de estado (ACTIVE/INACTIVE/WITHDRAWN) con lo que implica para la matrícula (retiro cierra la matrícula con WITHDRAWAL), traslado de sección en una transacción (cierra la vigente con TRANSFER y abre otra, mismo año), vincular y desvincular apoderado, búsqueda y filtros paginados (RF-25), y el historial de matrículas de un estudiante. Qué puede ver cada perfil (docs/05).
4. Validaciones: rol correcto en cada FK, guardianId !== studentId, status, sección activa del año activo y no de solo lectura, fechas coherentes (effectiveTo >= effectiveFrom, y cómo fijar effectiveTo/effectiveFrom al trasladar), correo institucional único y su dominio (D-013 pendiente: cómo tratar al apoderado), sin borrado físico (RN-13), bloqueo de fila del año cuando corresponda, marcadores TRUE/NULL.
5. Bitácora (acciones, entityType/entityId, solo campos cambiados, sin correos ni nombres en before/after) y eventos si Dev 4/5 los necesitan (p. ej. enrollment.transferred, user.status_changed) con D-031.
6. Archivos compartidos (app.module.ts, prisma/, docs/03) y su cambio mínimo; riesgos frente a features/david (que toca User para autenticación).
7. Plan de agentes y criterios de terminado verificables, incluidos los casos e2e con usuarios del seed, la limpieza de datos de prueba y que `pnpm db:seed` siga dando los mismos conteos.
No modifiques archivos. Termina con el INFORME del protocolo.
```

### 2. modelador-bd (GuardianStudent revocable)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-usuarios-matriculas.md (léelo completo: INFORME 1, sobre todo las Decisiones 1 y 7.1, y la "Decisión del orquestador"; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo, con Docker/MySQL levantados.

Tu encargo: aplicar la Decisión 1. Cambiar el modelo GuardianStudent en prisma/schema/academic.prisma tal cual, y crear la migración `guardian_student_revocable` con `pnpm exec prisma migrate dev --create-only --name guardian_student_revocable`, reemplazando el SQL generado por el SQL manual del expediente (columnas → UPDATE de ids → índice único → cambio de PK → 3 CHECK). Aplícala y corre `pnpm db:generate`. No toques auth.prisma, el seed ni el código (lo hace dev2-estructura; el seed actual usará una clave que desaparece, así que no lo corras).
Criterios (7.1): `pnpm exec prisma validate` ok; `prisma format` sin cambios pendientes; migración aplicada y un segundo `prisma migrate dev` dice "Already in sync" (si Prisma detecta drift porque el SQL manual no coincide con lo que espera, ajusta el SQL hasta que no haya drift y explica qué cambiaste); `SHOW CREATE TABLE GuardianStudent` con PK id, el UNIQUE nuevo y los 3 CHECK; las 3 filas existentes conservan id no nulo e isActive=1; pruebas con transacción y ROLLBACK (datos ficticios): segundo vínculo vigente del mismo par → 1062, isActive=0 → 3819, revocado sin revokedAt → 3819, guardianId=studentId → 3819 (si MySQL rechaza el CHECK con 3823, quítalo del SQL y anótalo); `git diff prisma/schema/auth.prisma` vacío; `pnpm --filter api build` (puede fallar por el seed o por getLinkedStudentIds si usan la clave vieja: anótalo en Pendientes para dev2 sin arreglarlo). Usa `docker compose exec -T mysql sh -c 'mysql -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "..."'`. No leas .env. No hagas commit. Termina con el INFORME del protocolo.
```

### 3. modelador-bd (corrección del CHECK de Enrollment, por mensaje)

```text
Buen hallazgo. Autorizado (ver "Decisión del orquestador" al final del expediente C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-usuarios-matriculas.md): crea una migración NUEVA `enrollment_iscurrent_check_fix` (no edites la de la Fase 1) que suelte `Enrollment_isCurrent_chk` y lo vuelva a crear con la rama TRUE protegida: `(isCurrent IS NOT NULL AND isCurrent = 1 AND effectiveTo IS NULL AND endReason IS NULL) OR (isCurrent IS NULL AND effectiveTo IS NOT NULL AND endReason IS NOT NULL)`. Antes de aplicarla, comprueba que ninguna fila actual viole el nuevo CHECK (SELECT). Aplícala, confirma "Already in sync" sin drift, y prueba con ROLLBACK: cerrar una matrícula sin effectiveTo/endReason → 3819 (antes pasaba), cierre correcto → ok, isCurrent=0 → 3819. Revisa también AcademicPeriod/Section/AcademicYear por si algún otro CHECK con varias ramas tiene el mismo defecto (solo informar, o corregir en la misma migración si es el mismo patrón). No toques el seed ni el código. Corre `pnpm --filter api build` y `pnpm --filter api test:e2e` (los 85 deben pasar; si academic-schema.e2e-spec.ts falla solo por el conteo de GuardianStudent o la clave del seed, anótalo para qa/dev2). No hagas commit. Termina con el INFORME del protocolo.
```

### 4. dev2-estructura (implementación)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-usuarios-matriculas.md (léelo completo: INFORME 1 con las Decisiones 1–7, INFORMES 2 y 3 de modelador-bd con las notas para ti, y las decisiones del orquestador; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo, con Docker/MySQL levantados y las 2 migraciones nuevas ya aplicadas.

Tu encargo (Decisión 7.2):
1. Seed paso 8 (prisma/seed/academic.ts): vínculos con findFirst({ guardianId, studentId, isActive: true }) + create si no existe. `pnpm db:seed` dos veces con los mismos conteos (68 usuarios, 2 años, 8 períodos, 7 secciones, 5 cursos, 30 CourseSection, 62 matrículas, 59 vigentes, 3 vínculos vigentes).
2. modules/academic: `getLinkedStudentIds` con `isActive: true` y su spec; 2 tipos nuevos de evento en AcademicEventMap (user.status-changed.v1, enrollment.transferred.v1).
3. Módulo apps/api/src/modules/users/ completo según las Decisiones 2–5 (endpoints, validaciones, bloqueos en el orden global User FOR UPDATE → AcademicYear FOR SHARE, marcadores null nunca false, cierre de matrícula escribiendo isCurrent null + effectiveTo + endReason juntos, fechas solo del servidor con at = max(now, effectiveFrom), bitácora sin correos ni nombres, eventos después de la bitácora, ActiveActorGuard, token INSTITUTION_EMAIL_DOMAIN). @Roles('ADMIN') y @UseGuards(ActiveActorGuard) a nivel de clase en todos los controladores. Registrar UsersModule en app.module.ts (+2, autorizado). No tocar common/, auth/, session/, config/, auth.prisma ni package.json.
4. Tests unitarios de la Decisión 7.2 (policy, DTO, servicios con Prisma simulado, guard).
Al terminar: `pnpm --filter api lint`, `test`, `build`, prettier --check de los archivos tocados, `pnpm --filter api test:e2e` (85 en verde) y humo: `GET /api/v1/users` sin sesión → 401 (con un e2e temporal que borres después). No hagas commit. Termina con el INFORME del protocolo, con la lista de endpoints.
```

### 5. seguridad-cumplimiento

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-usuarios-matriculas.md (léelo completo, INFORMES 1–4, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: auditar (RNF-02, RNF-09..15, RN-12, RN-13, Ley 29733, menores, OWASP):
- C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\modules\users\ (todo), su registro en app.module.ts, y los cambios en modules/academic (getLinkedStudentIds, eventos).
- prisma/schema/academic.prisma (GuardianStudent) y las migraciones 20261026235821_guardian_student_revocable y 20261027000217_enrollment_iscurrent_check_fix; prisma/seed/academic.ts (paso 8).
Revisa en concreto: @Roles('ADMIN') y ActiveActorGuard en TODOS los controladores; que solo ADMIN vea correos; IDOR; asignación masiva (strictObject, que no se pueda cambiar role/status por PATCH); el $queryRaw de búsqueda (LOCATE) y los de bloqueo: parametrizados, sin inyección; protección del último ADMIN y del propio ADMIN; bitácora sin correos ni nombres y con lo necesario; eventos sin datos personales; motivo de revocación/traslado como texto libre (menores); vínculos revocables y que un apoderado revocado pierda acceso (getLinkedStudentIds); transacciones y orden de bloqueos (deadlocks); el riesgo RF-08 de sesiones abiertas y si ActiveActorGuard lo mitiga en este módulo; validación de dominio y GUARDIAN exento (D-013); fechas solo del servidor.
No modifiques archivos. Termina con el INFORME del protocolo (APROBADO si no hay CRÍTICO ni ALTO; si hay, CAMBIOS_PEDIDOS con archivo:línea y corrección).
```

### 6. qa-tester

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-usuarios-matriculas.md (léelo completo: INFORME 1 Decisión 7.3, INFORMES 2–3 de modelador-bd y el INFORME 4 con las notas para QA; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, con Docker/MySQL, migraciones y seed cargados.

Tu encargo:
1. Crear apps/api/test/users-api.e2e-spec.ts según la Decisión 7.3, con los ajustes del INFORME 4 (q=%% y q=__; dos traslados idénticos → 200 + 422, y busca otra forma de provocar 409 por concurrencia si es posible; dominio con `.overrideProvider(INSTITUTION_EMAIL_DOMAIN).useValue('colegio.example')`; transfer y revoke responden 200). Escrituras solo con usuarios propios `qa-f3-*@colegio.example`; nunca mutes datos del seed. afterAll: borra vínculos, matrículas y usuarios QA; test final de conteos contra la línea base.
2. Ajustar apps/api/test/academic-schema.e2e-spec.ts: contar vínculos vigentes (isActive true) y añadir casos de los 3 CHECK de GuardianStudent (revocado sin revokedAt, isActive=false, mismo id, revokedAt < createdAt) y de Enrollment (cerrar sin fecha ni motivo → 3819, isCurrent=false → 3819), con ROLLBACK.
IDs de RF/RN en los nombres. Si encuentras un bug de producción, no lo corrijas: CAMBIOS_PEDIDOS. Solo archivos de test.
Corre `pnpm --filter api test:e2e` dos veces (todo en verde), `pnpm --filter api lint`, prettier --check de los archivos, y al final `pnpm db:seed` con los mismos conteos. No hagas commit. Termina con el INFORME del protocolo.
```

### 7. dev2-estructura (corrección 1/2)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-usuarios-matriculas.md (lee el INFORME 5 de seguridad-cumplimiento, la "Decisión del orquestador" que le sigue y el INFORME 6 de QA; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, con Docker/MySQL levantados.

Tu encargo (vuelta de corrección 1/2):
1. Hallazgo 2: `getLinkedStudentIds` (modules/academic/academic-access.service.ts) excluye estudiantes con status WITHDRAWN (filtro por estado del estudiante; no revoques vínculos). Actualiza su JSDoc y su spec.
2. Hallazgo 5: en el cambio de estado, cuando el objetivo es ADMIN, bloquea primero la lista de ADMIN activos y después el usuario objetivo (orden global documentado en users-locks.ts); mapea también el deadlock de MySQL (1213, y P2010 si Prisma lo envuelve así) a 409 en el mapeo de errores que usa el módulo users (sin tocar common/). Test unitario.
3. Hallazgo 6: `page` máximo 1000 en el DTO de búsqueda y LIMIT en la consulta raw de `searchIds` (un tope razonable, p. ej. 5000, documentado). Tests unitarios.
4. Hallazgo 3: JSDoc en los esquemas de motivo (reasonSchema, revokeLinkSchema) advirtiendo que se guardan en la bitácora inmutable y no deben contener datos personales, de salud ni familiares.
Corre `pnpm --filter api lint`, `test`, `build`, prettier --check de los archivos tocados y `pnpm --filter api test:e2e` (179 en verde; si algún e2e se ve afectado por el cambio 1, por ejemplo un apoderado de un estudiante retirado, no cambies el test: repórtalo en el INFORME). No hagas commit. Termina con el INFORME del protocolo.
```

### 8. revisor-pr

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-usuarios-matriculas.md (léelo completo, INFORMES 1–7 y las decisiones del orquestador; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo, con Docker levantado.

Tu encargo: revisión final de la Fase 3 de Dev 2. Alcance esperado: apps/api/src/modules/users/ (código y specs), los cambios en apps/api/src/modules/academic/ (academic-access.service.ts y spec, academic-events.ts, academic.errors.ts, academic.mappers.spec.ts), apps/api/src/app.module.ts (+2 UsersModule), prisma/schema/academic.prisma (GuardianStudent), las migraciones 20261026235821_guardian_student_revocable y 20261027000217_enrollment_iscurrent_check_fix, prisma/seed/academic.ts (paso 8), apps/api/test/users-api.e2e-spec.ts y academic-schema.e2e-spec.ts, y .claude/tareas/ (orquestador). Nada en common/, auth/, session/, config/, auth.prisma, package.json ni migraciones anteriores. Ignora .agents/ y skills-lock.json.
Revisa el código contra las Decisiones 1–7 del INFORME 1 y las correcciones del INFORME 7 (@Roles + ActiveActorGuard de clase en los 5 controladores, marcadores null nunca false, cierre de matrícula con los 3 campos juntos, orden global de bloqueos, $queryRaw parametrizados, bitácora sin correos ni nombres, ningún CRÍTICO/ALTO abierto).
Corre pnpm lint, pnpm test, pnpm build, pnpm format:check, pnpm --filter api test:e2e, `pnpm exec prisma migrate status` y `pnpm db:seed` (mismos conteos). Los fallos de format solo por .agents/ o expedientes no cuentan; el TS6059 de tsc --noEmit es preexistente (anótalo). Trabajo de Dev 2 (compañero), no va al equipo (D-021). Propón el mensaje de commit. Termina con el INFORME del protocolo.
```

### 9. documentador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-usuarios-matriculas.md (léelo completo, INFORMES 1–8 y las decisiones del orquestador; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). La Fase 3 está aprobada. Verifica rutas, cuerpos, respuestas y errores reales leyendo los controladores, users.dto.ts y los servicios de C:\Proyectos\AV-MATER-CHIRSTI\apps\api\src\modules\users\, academic-access.service.ts (getLinkedStudentIds) y academic-events.ts antes de escribir.

Tu encargo, solo en C:\Proyectos\AV-MATER-CHIRSTI\docs\, con el estilo de esos documentos y todo como PROPUESTA (trabajo de Dev 2 en el repo privado, pendiente del dueño de Dev 2 y de D-021):
1. docs/02: GuardianStudent con id propio, isActive TRUE/NULL, revokedAt y sus 3 CHECK (ya no clave compuesta).
2. docs/03: sección "API de usuarios (Dev 2)" con la tabla de los 14 endpoints (solo ADMIN, ActiveActorGuard), paginación (page 1..1000, pageSize 1..100, tope de 5000 coincidencias en q), la tabla real de errores de la sección destino (año cerrado → 409, año abierto no activo → 422, sin año activo → 409, sección inactiva → 409), la advertencia de que los motivos de texto libre van a la bitácora inmutable y no deben llevar datos personales, de salud ni familiares; getLinkedStudentIds: solo vínculos vigentes y sin estudiantes WITHDRAWN (Dev 4/5 no deben volver a filtrar); los eventos user.status-changed.v1 y enrollment.transferred.v1 con su payload; la bitácora users.*; el deadlock 1213 → 409.
3. docs/04: revocación de vínculos, retiro (cierra matrículas de años no cerrados), rematrícula, traslado (mismo año y grado, fechas del servidor), y el patrón de CHECK de marcadores TRUE/NULL con `IS NOT NULL` en la rama TRUE (motivo: una condición UNKNOWN no hace fallar un CHECK en MySQL; se corrigió Enrollment_isCurrent_chk).
4. docs/08: D-032 (vínculos revocables con marcador; estudiante WITHDRAWN sin acceso del apoderado por filtro de estado; finalidad y plazo de conservación PENDIENTE INSTITUCIÓN), D-033 (API de usuarios: rol inmutable, apoderado sin dominio hasta D-013, traslado mismo año y grado con hora del servidor, bitácora sin valores personales frente a RNF-14, enlaza D-024), D-034 (eventos user.status-changed.v1 y enrollment.transferred.v1). Comprueba que los números estén libres. En D-019 o una nota, los pedidos a Dev 1: revocar sesiones al recibir user.status-changed.v1 (RF-08), INSTITUTION_EMAIL_DOMAIN obligatoria en producción.
5. docs/10: avance de RF-18, 19, 20, 22, 23, 24, 25 (API; pantallas F5) con los tests.
6. docs/manuales/tecnico.md: sección breve "Módulo de usuarios" (endpoints resumidos, variable INSTITUTION_EMAIL_DOMAIN solo el nombre, cómo se prueba).
No hagas commit. Termina con el INFORME del protocolo.
```

## Decisiones del orquestador

- Hizo el diff contra `origin/features/david` (el arquitecto no tiene Bash): David no toca `auth.prisma`, no añade migraciones, no tiene variable de dominio ni revocación de sesiones por usuario. El plan siguió tal cual.
- Autorizó `academic.prisma`, las 2 carpetas de migración y `app.module.ts` (+2).
- **Corrigió ya el error de la Fase 1** (el `CHECK` de matrículas) con una migración nueva, antes de lanzar al dev, para no cambiar migraciones mientras el dev corría el seed y los tests.
- Lanzó QA y seguridad en paralelo y esperó a QA antes de la corrección.
- Vuelta 1/2: para los estudiantes retirados eligió **filtrar por estado** en vez de revocar los vínculos: es reversible si el estudiante vuelve y no borra historial.
- Corrigió él mismo la ruta de `.env.example` en el manual técnico (decía `apps/api/.env.example`; está en la raíz).
- Verificó por su cuenta: `prisma migrate status`, 180 y luego 185 tests unitarios en verde, y el alcance de archivos.

## Archivos

- `apps/api/src/modules/users/` (módulo nuevo con código y tests)
- `apps/api/src/modules/academic/`: `academic-access.service.ts` y spec, `academic-events.ts`, `academic.errors.ts`, `academic.mappers.spec.ts`
- `apps/api/src/app.module.ts` (+2)
- `prisma/schema/academic.prisma`, `prisma/migrations/20261026235821_guardian_student_revocable/`, `prisma/migrations/20261027000217_enrollment_iscurrent_check_fix/`, `prisma/seed/academic.ts`
- `apps/api/test/users-api.e2e-spec.ts` (nuevo), `apps/api/test/academic-schema.e2e-spec.ts`
- `docs/02`, `03`, `04`, `08`, `10`, `docs/manuales/tecnico.md`
- `.claude/tareas/20261026-dev2-usuarios-matriculas.md`, este reporte

## Verificación

- `pnpm lint` ok · `pnpm test` 185/185 · `pnpm build` 5/5 · `pnpm --filter api test:e2e` 179/179 (varias corridas) · `prisma migrate status` al día (5 migraciones) · `pnpm db:seed` con los mismos conteos.
- Pruebas en MySQL con ROLLBACK de los 3 `CHECK` de `GuardianStudent` y del `CHECK` corregido de matrículas.
- `format:check`: ok en el alcance. Preexistente: `tsc --noEmit` (TS6059) por `academic-schema.e2e-spec.ts`.

## Pendientes y decisiones abiertas

- **No va al equipo** hasta revisión del dueño de Dev 2 y aceptación de D-021.
- PROPUESTA: D-032, D-033, D-034. PENDIENTE INSTITUCIÓN: finalidad y conservación de los vínculos (D-032).
- **Pedidos a Dev 1 (David):** cerrar las sesiones de un usuario desactivado (RF-08; hoy solo este módulo y el académico lo comprueban), `INSTITUTION_EMAIL_DOMAIN` obligatoria en producción, `AuditService.record(event, tx)`.
- Decisiones abiertas: D-013 (identidad del apoderado), D-024 (conservación de la bitácora).
- Para Dev 2: carrera teórica al desactivar una sección mientras se matricula; tope de 5000 coincidencias en la búsqueda.
- `docs/propuestas/schema.propuesto.prisma` sigue con la clave compuesta antigua (borrador histórico).
- Siguientes fases: F4 importación masiva (RF-21) · F5 pantallas · F6 clonación y promoción.

## Expediente

[.claude/tareas/20261026-dev2-usuarios-matriculas.md](../tareas/20261026-dev2-usuarios-matriculas.md)
