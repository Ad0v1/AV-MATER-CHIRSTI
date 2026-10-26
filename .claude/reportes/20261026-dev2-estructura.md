# Reporte — Dev 2, Fase 1: esquema académico y seed

## Pedido

- **Usuario:** "pasemos ha realizar el trabajo del Dev 2"
- **Fecha:** 26/10/2026 · **Flujo:** completo · **Rama:** `features/adolfo` · **Commit:** ver el mensaje `feat(academic): RF-09/10/12/13/14/18/20/24 …` (subido solo a `mio`)
- **Aviso:** Dev 2 es de un compañero. Se revisó que ninguna rama del equipo tenía código de Dev 2. Este trabajo **no va al equipo** sin acuerdo con el dueño de Dev 2 y depende de D-021.

## Resultado

El trabajo de Dev 2 (RF-09..25) se dividió en 6 fases. Se ejecutó la **Fase 1**, que destraba a Dev 4:

- **Esquema** `prisma/schema/academic.prisma`: años, 4 períodos (D-002), secciones, cursos, curso-sección con docente, matrículas con historial y vínculo apoderado–estudiante. Todas las FK son `Restrict`.
- **Migración** `academic_estructura` con 7 restricciones `CHECK`: un solo año activo, una sola matrícula vigente por estudiante y año, período coherente, grado 1..5, fechas coherentes.
- **Seed ficticio** (`pnpm db:seed`): 68 usuarios `@colegio.example`, años 2025 y 2026, 7 secciones, 5 cursos, 30 cursos-sección, 62 matrículas, con un traslado, un retiro y un estudiante inactivo. Idempotente y solo contra una base local.
- **Tests e2e** contra MySQL: 18 casos.

## Agentes que participaron

| #   | Agente                   | Modelo | Qué hizo                                                             | Estado            |
| --- | ------------------------ | ------ | -------------------------------------------------------------------- | ----------------- |
| 1   | `arquitecto-integrador`  | Opus   | Plan en 6 fases; diseño detallado de la Fase 1                       | LISTO             |
| 2   | `modelador-bd`           | Opus   | Esquema, migración con 7 CHECK y 8 pruebas en MySQL                  | BLOQUEADO → LISTO |
| 3   | `dev2-estructura`        | Opus   | Seed ficticio y su configuración                                     | LISTO             |
| 4   | `qa-tester`              | Sonnet | 18 tests e2e contra MySQL                                            | LISTO             |
| 5   | `seguridad-cumplimiento` | Sonnet | Auditoría de datos de menores; 3 MEDIO, 4 BAJO                       | APROBADO          |
| 6   | `dev2-estructura`        | Opus   | Corrección: el seed solo corre contra base local y no muestra la URL | LISTO             |
| 7   | `revisor-pr`             | Sonnet | Revisión final                                                       | APROBADO          |
| 8   | `documentador`           | Haiku  | docs/02, 04, 07, 08 (D-011, D-027..D-029) y 10                       | LISTO             |

## Prompts usados

### 1. arquitecto-integrador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-estructura.md (léelo completo, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI (rama features/adolfo).

Tu encargo: planificar el trabajo de Dev 2 (RF-09..25) dividido en fases, y detallar la FASE 1.
Lee: docs/00, 01, 02 (User, GuardianStudent, AcademicYear, AcademicPeriod, Section, Course, CourseSection, Enrollment y las invariantes 1–4), 03 (contratos que Dev 3/4/5 esperan de Dev 2), 04 (RN-10, RN-11, RN-13, RN-15), 05, 08 (D-002 períodos, D-012, D-013, D-021, y las de matrícula/traslados), 09 (casos QA de Dev 2), 10; docs/propuestas/schema.propuesto.prisma (borrador, no se ejecuta); prisma/schema/*.prisma y prisma/migrations/; apps/api/src (estructura de módulos, auth guard de roles en common/auth, audit, prisma service, cómo se registran módulos en app.module.ts); apps/api/test; prisma.config.ts y package.json raíz (¿existe config de seed de Prisma?).

Entrega en Decisiones:
1. Fases de RF-09..25 (p. ej. F1 esquema + seed; F2 API de estructura académica; F3 usuarios y apoderados; F4 importación masiva; F5 pantallas admin), con los RF de cada una y su dependencia con Dev 4.
2. FASE 1 detallada:
   a. Modelos Prisma exactos en un archivo nuevo prisma/schema/academic.prisma (y si hace falta tocar auth.prisma para las relaciones inversas de User, di exactamente qué líneas), con tipos, CHAR(36)/uuid(7), enums, @@unique, @@index, onDelete coherente con D-021 (sin borrado físico de lo que tenga historial), y cómo se imponen las invariantes que el ORM no resuelve (un año activo, una matrícula vigente por estudiante y año, etc.: constraint, columna generada o servicio). Los 4 períodos de D-002.
   b. Migración nueva: nombre y si necesita SQL manual (--create-only).
   c. Seed ficticio en prisma/seed/ (sin datos reales de menores): qué crea (al menos un año activo, 4 períodos, una sección, cursos, un docente, estudiantes, un apoderado vinculado, un admin) y cómo se ejecuta (config de seed en prisma.config.ts o script; ¿archivo compartido?). Debe servir para probar notas de Dev 4.
   d. Archivos compartidos a tocar y por qué (auth.prisma para relaciones inversas de User, prisma.config.ts, package.json raíz, etc.), para que el orquestador los autorice.
   e. Qué agentes intervienen en la fase 1 y en qué orden (modelador-bd, dev2-estructura, qa-tester, seguridad-cumplimiento por datos de menores, revisor-pr, documentador) y criterios de terminado verificables.
3. Riesgos de conflicto con la rama de David (features/david) y con el futuro dueño de Dev 2.
No modifiques archivos. Termina con el INFORME del protocolo.
```

### 2. modelador-bd (lanzamiento)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-estructura.md (léelo completo: INFORME 1 y "Decisión del orquestador"; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo, con Docker/MySQL levantados.

Tu encargo (Fase 1, paso 1): crear prisma/schema/academic.prisma exactamente como en Decisiones 2.a, añadir en prisma/schema/auth.prisma el grupo de 4 relaciones inversas (solo líneas añadidas, grupo aparte separado por línea en blanco; autorizado), y generar la migración `academic_estructura` con `--create-only` más el bloque de CHECK de 2.b. Luego aplicarla y `pnpm db:generate`.
Criterios de terminado (2.e.1): `pnpm exec prisma validate` ok; `pnpm exec prisma format` no deja cambios (si format reformatea, revisa que auth.prisma siga mostrando solo líneas `+` en git diff); migración aplicada y un segundo `prisma migrate dev` no crea otra ("in sync"); `SHOW CREATE TABLE` de AcademicYear, AcademicPeriod, Section y Enrollment muestra los 6 CHECK; `prisma migrate status` al día; `pnpm --filter api build` ok. Comprueba con una transacción y ROLLBACK (datos ficticios) al menos: segundo año con isActive=1 falla (duplicate key), Enrollment con sectionId de otro año falla (FK), gradeLevel 6 falla (CHECK 3819). Usa `docker compose exec -T mysql sh -c 'mysql -uaula -p"$MYSQL_PASSWORD" aula_virtual -e "..."'`. No leas .env. No crees el seed (lo hace dev2-estructura). No hagas commit. Termina con el INFORME del protocolo, incluyendo la ruta de la migración.
```

### 2b. modelador-bd (reanudación, tras el BLOQUEADO)

```text
Bien hecho al detenerte. El expediente C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-estructura.md ya tiene el INFORME 1 completo (2.a modelos, 2.b SQL de los 6 CHECK, 2.e criterios) y la "Decisión del orquestador" que autoriza auth.prisma (solo líneas añadidas), la carpeta de migración nueva, prisma.config.ts, package.json raíz y pnpm-lock.yaml. Vuelve a leerlo y ejecuta tu encargo original completo (academic.prisma, grupo de relaciones inversas en auth.prisma, migración academic_estructura con --create-only + CHECK, aplicar, db:generate y todas las verificaciones con ROLLBACK). No crees el seed. No hagas commit. Termina con el INFORME del protocolo.
```

### 3. dev2-estructura (seed)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-estructura.md (léelo completo: INFORME 1 —sobre todo 2.c y 2.e.2—, INFORME 2 con las notas para el seed, y la "Decisión del orquestador"; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo, con Docker/MySQL levantados y la migración academic_estructura ya aplicada.

Tu encargo (Fase 1, paso 2): crear el seed ficticio en prisma/seed/ (index.ts, fixtures.ts, academic.ts) según 2.c, y configurarlo. Autorizados por el orquestador: prisma.config.ts (entrada seed en migrations), package.json raíz (script "db:seed": "prisma db seed" y devDependencies tsx y @prisma/adapter-mariadb 7.10.1, instaladas con pnpm add -Dw para que se regenere pnpm-lock.yaml). Mira cómo apps/api/src/common/prisma/prisma.service.ts crea el cliente con el adaptador para hacerlo igual. Todo ficticio en @colegio.example; sin hashes, sin LocalCredential, sin AuditLog; se niega a correr si NODE_ENV==='production'. Idempotente.
Criterios: `pnpm db:seed` dos veces seguidas sin error y mismos conteos (2 años, 8 períodos, 7 secciones, 5 cursos, 30 CourseSection, 60 estudiantes, 5 docentes, 2 apoderados, 1 admin; además verifica las matrículas especiales: estudiante03 con TRANSFER cerrada + vigente en 3B; estudiante60 WITHDRAWN con WITHDRAWAL; matrícula YEAR_END en 2025). Muestra los conteos con una consulta (docker compose exec -T mysql ... o un script). Corre `pnpm --filter api lint`, `pnpm --filter api test`, `pnpm --filter api build` y `pnpm exec prettier --check prisma/seed prisma.config.ts package.json`. No leas .env. No toques prisma/schema ni migrations. No hagas commit. Termina con el INFORME del protocolo.
```

### 4. qa-tester

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-estructura.md (léelo completo, INFORMES 1–3, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, con Docker/MySQL levantados, migración aplicada y seed cargado.

Tu encargo (Fase 1, paso 3): crear apps/api/test/academic-schema.e2e-spec.ts con `describe.skipIf(!process.env.DATABASE_URL)`, siguiendo el estilo de los e2e existentes en apps/api/test (helpers, cómo crean el cliente Prisma, vitest.config.e2e.ts). Casos (con IDs de RF/RN en los nombres):
- segundo año activo → P2002 (RN-11);
- segunda matrícula vigente en el mismo año → P2002;
- matrícula con sección de otro año → error de FK;
- CHECK (error 3819, con el nombre del constraint): sequence/kind distintos, gradeLevel 6, isActive=false, matrícula cerrada sin endReason;
- borrar un User con matrícula → Restrict (RN-13);
- seed: conteos esperados del INFORME 3 y todos los correos en @colegio.example; matrículas especiales (estudiante03 traslado, estudiante60 retiro).
Usa transacciones con rollback o datos con años/correos ficticios que limpies al final para no ensuciar la BD ni romper la idempotencia del seed. Importa constantes de prisma/seed/fixtures.ts si ayuda. Corre `pnpm --filter api test:e2e` (todo el e2e debe pasar, incluidos los existentes), `pnpm --filter api test`, `pnpm --filter api lint` y prettier --check del archivo. Después corre `pnpm db:seed` y confirma que los conteos siguen iguales. Solo archivos de test. No hagas commit. Termina con el INFORME del protocolo.
```

### 5. seguridad-cumplimiento

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-estructura.md (léelo completo, INFORMES 1–3, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: auditar la Fase 1 (RNF-09..13, RN-13, RN-14, Ley 29733, protección de menores):
- C:\Proyectos\AV-MATER-CHIRSTI\prisma\schema\academic.prisma y el grupo añadido en prisma\schema\auth.prisma
- C:\Proyectos\AV-MATER-CHIRSTI\prisma\migrations\20261026174231_academic_estructura\migration.sql
- C:\Proyectos\AV-MATER-CHIRSTI\prisma\seed\ (index.ts, fixtures.ts, academic.ts), prisma.config.ts y el package.json raíz.
Revisa: minimización de datos de menores (sin DNI, nacimiento, teléfono); vínculo apoderado–menor e historial de matrícula como datos personales (finalidad, quién podrá verlos en F2/F3, conservación); que ninguna FK borre historial en cascada; que el seed no pueda correr en producción (y si el guard es suficiente: NODE_ENV, DATABASE_URL apuntando a otra BD, CI); que no haya datos reales, hashes ni secretos; dominio reservado; riesgos del UNIQUE con NULL para invariantes. No modifiques archivos. Termina con el INFORME del protocolo (APROBADO si no hay CRÍTICO ni ALTO; si hay, CAMBIOS_PEDIDOS con archivo:línea y corrección).
```

### 6. dev2-estructura (corrección 1/2)

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-estructura.md (lee el INFORME 4 de seguridad-cumplimiento y la "Decisión del orquestador" que le sigue; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI.

Tu encargo (vuelta de corrección 1/2), solo en prisma/seed/index.ts:
1. Hallazgo 1: además de negarse con NODE_ENV=production, negarse con CI=true y validar el host de DATABASE_URL con `new URL(...)`: solo se permite localhost, 127.0.0.1, ::1 (o [::1]) y mysql (servicio del compose). En cualquier otro caso, salir con exit 1 y un mensaje claro sin imprimir la URL ni la contraseña. Todo antes de crear el cliente. No exijas una variable de opt-in.
2. Hallazgo 7: en el catch, registrar solo `error instanceof Error ? error.message : String(error)`, sin el objeto completo ni la DATABASE_URL.
Verifica: `pnpm db:seed` sigue funcionando en local con los mismos conteos; con `DATABASE_URL=mysql://u:p@db.ejemplo.com:3306/x pnpm exec tsx prisma/seed/index.ts` se niega (exit 1) sin mostrar la URL; con `CI=true` se niega. Luego `pnpm --filter api test:e2e` (26 en verde) y prettier --check prisma/seed. No hagas commit. Termina con el INFORME del protocolo.
```

### 7. revisor-pr

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-estructura.md (léelo completo, INFORMES 1–6 y las decisiones del orquestador; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo.

Tu encargo: revisión final de la Fase 1 de Dev 2. Alcance esperado: prisma/schema/academic.prisma, prisma/schema/auth.prisma (solo líneas añadidas), prisma/migrations/20261026174231_academic_estructura/, prisma/seed/**, prisma.config.ts, package.json raíz, pnpm-lock.yaml (solo tsx y @prisma/adapter-mariadb), apps/api/test/academic-schema.e2e-spec.ts y .claude/tareas/ (orquestador). Ignora .agents/ y skills-lock.json. Revisa que el esquema coincida con 2.a, que la migración tenga los 7 CHECK y FK Restrict, y que el seed cumpla 2.c y las correcciones del INFORME 6.
Corre pnpm lint, pnpm test, pnpm build, pnpm format:check y pnpm --filter api test:e2e (Docker está levantado). Los fallos de format solo por .agents/ o expedientes no cuentan. Este trabajo es de Dev 2 (compañero) y NO va al equipo por ahora: indícalo y anota la dependencia con D-021. Propón el mensaje de commit. Termina con el INFORME del protocolo.
```

### 8. documentador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-dev2-estructura.md (léelo completo, INFORMES 1–7, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). La Fase 1 está aprobada. Verifica los nombres reales leyendo C:\Proyectos\AV-MATER-CHIRSTI\prisma\schema\academic.prisma y prisma\seed\fixtures.ts antes de escribir.

Tu encargo, solo en C:\Proyectos\AV-MATER-CHIRSTI\docs\, con el estilo de esos documentos y todo marcado como PROPUESTA (trabajo de Dev 2 hecho en el repo privado de Dev 4/5, pendiente de revisión del dueño de Dev 2):
1. docs/02_MODELO_ENTIDADES.md: en la tabla de agregados, actualizar los campos de AcademicYear, AcademicPeriod, Section, Course, CourseSection, Enrollment y GuardianStudent con los nombres finales (isActive como marcador TRUE/NULL, startDate/endDate, closedAt, Enrollment.academicYearId/isCurrent/endReason, CourseSection.teacherId opcional e isActive). Indica cómo se imponen las invariantes 1 y 2 (marcadores + UNIQUE + CHECK). No borres las invariantes que quedan para el servicio.
2. docs/08_DECISIONES.md: D-011 (busca cuál es) pasa a PROPUESTA con este diseño si corresponde; nuevas D-027 (marcadores TRUE/NULL + UNIQUE + 7 CHECK para año activo y matrícula vigente), D-028 (seed ficticio @colegio.example con `pnpm db:seed`, idempotente, solo contra base local), D-029 (CourseSection.teacherId opcional). Comprueba que los números estén libres. Anota la dependencia con D-021.
3. docs/07_PLAN_SPRINT0.md: dónde corresponda, el comando `pnpm db:seed` (sin reescribir el plan).
4. docs/04_REGLAS_ESTADOS.md: nota breve de que el historial de matrícula y los vínculos apoderado–estudiante de menores se conservan (RN-13/14); se da de baja al usuario, no se borra la matrícula. Marca la finalidad/conservación de GuardianStudent como pendiente para F3.
5. docs/10_TRAZABILIDAD.md: nota de avance de RF-09/10/12/13/14/18/20/24 (solo modelo de datos y seed; API y pantallas pendientes F2..F5).
No hagas commit. Termina con el INFORME del protocolo.
```

## Decisiones del orquestador

- Revisó todas las ramas del equipo antes de empezar: nadie tenía código de Dev 2.
- Ejecutó **solo la Fase 1**; F2..F6 quedan como tareas aparte.
- Autorizó los archivos compartidos: `auth.prisma` (solo líneas añadidas), carpeta de migración, `prisma.config.ts`, `package.json` raíz y `pnpm-lock.yaml`.
- **Error propio:** el primer intento de copiar el plan al expediente falló (comando de shell mal formado) y `modelador-bd` se detuvo con BLOQUEADO, correctamente. Se copió el plan con otra herramienta y se reanudó al agente.
- Lanzó `qa-tester` y `seguridad-cumplimiento` en paralelo; esperó a que QA terminara antes de tocar el seed.
- De los hallazgos de seguridad corrigió ahora el 1 y el 7 (vuelta 1/2): lista blanca de hosts en vez de una variable de opt-in, para no complicar el uso local. El resto pasa a F2/F3 o a docs.
- Verificó por su cuenta: `git diff` de `auth.prisma` (solo `+`), `prisma migrate status`, `pnpm db:seed` y que el seed se niega con un host externo.

## Archivos

- `prisma/schema/academic.prisma` (nuevo), `prisma/schema/auth.prisma` (+6 líneas)
- `prisma/migrations/20261026174231_academic_estructura/migration.sql` (nuevo)
- `prisma/seed/{index,fixtures,academic}.ts` (nuevos), `prisma.config.ts`, `package.json`, `pnpm-lock.yaml`
- `apps/api/test/academic-schema.e2e-spec.ts` (nuevo)
- `docs/02_MODELO_ENTIDADES.md`, `docs/04_REGLAS_ESTADOS.md`, `docs/07_PLAN_SPRINT0.md`, `docs/08_DECISIONES.md`, `docs/10_TRAZABILIDAD.md`
- `.claude/tareas/20261026-dev2-estructura.md`, este reporte

## Verificación

- Migración aplicada; `prisma migrate status` al día (3 migraciones); 7 CHECK presentes.
- 8 pruebas en MySQL con ROLLBACK: todas fallan con el error esperado (1062, 1452, 3819, 1451).
- `pnpm db:seed` repetido: mismos conteos. Se niega con `NODE_ENV=production`, `CI=true`, URL inválida o host no local.
- `pnpm lint` 5/5, `pnpm test` 23/23, `pnpm build` 5/5, `pnpm --filter api test:e2e` 26/26. `format:check` ok en el alcance.

## Pendientes y decisiones abiertas

- **No va al equipo** hasta que el dueño de Dev 2 lo revise y se acepte D-021.
- Decisiones en PROPUESTA: D-011, D-027, D-028, D-029.
- F2/F3: validar el rol en cada FK hacia `User`, `guardianId` distinto de `studentId`, comprobar `isActive` de sección y curso-sección (RN-10), bitácora de acciones académicas, revocación auditable de `GuardianStudent`, fijar `effectiveTo >= effectiveFrom` al cerrar matrículas.
- Fases siguientes: F2 API académica y `AcademicAccessService` · F3 usuarios y apoderados · F4 importación · F5 pantallas · F6 clonación y promoción.

## Expediente

[.claude/tareas/20261026-dev2-estructura.md](../tareas/20261026-dev2-estructura.md)
