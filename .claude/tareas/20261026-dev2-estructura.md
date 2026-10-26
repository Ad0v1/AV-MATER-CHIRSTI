# Trabajo de Dev 2: estructura académica y usuarios (RF-09..25)

Pedido por el usuario: "pasemos ha realizar el trabajo del Dev 2"
Flujo: completo
Vueltas de corrección: 1/2
Entorno: local con Docker (MySQL levantado), rama `features/adolfo`; el avance se sube solo a `mio`.

## Contexto

- **Dev 2 es de un compañero.** Revisado el 26/10/2026: ninguna rama del equipo (`develop`, `features/*`) tiene código de Dev 2; solo las páginas vacías `apps/web/app/(app)/admin/estructura/` y `admin/usuarios/`. No se duplica trabajo existente.
- Según `CLAUDE.md`, los agentes de Dev 2 se usan en el repo privado para destrabar a Dev 4/5. **Este trabajo no va al repo del equipo** salvo que el usuario lo acuerde con el dueño de Dev 2.
- Dev 4 depende de Dev 2: `Enrollment`, `CourseSection`, `AcademicPeriod`, `GuardianStudent` (docs/02, docs/03).
- Convenciones vigentes (D-021, PROPUESTA): PK `@default(uuid(7)) @db.Char(36)`; FK hacia `User` en `@db.Char(36)`; usuarios sin borrado físico (baja por `status`); acciones críticas a la bitácora con `entityType`/`entityId`.
- La rama de David (Dev 1) cambia `auth`, `session`, `login` y el layout: no tocar esos archivos.

## Alcance

RF-09..25 es grande. El arquitecto divide el trabajo en **fases** y detalla la **fase 1**, que debe priorizar lo que destraba a Dev 4: esquema académico (años, períodos, secciones, cursos, asignación de docentes, matrículas, apoderados) y un seed con datos ficticios. Las fases siguientes se ejecutan en tareas aparte.

---

## Informes

### INFORME 1 — arquitecto-integrador

Estado: LISTO
Resumen: RF-09..25 en alcance v1, en 6 fases. Fase 1 = esquema académico + migración con CHECK manual + seed ficticio idempotente. Destraba a Dev 4 (FK `Grade → Enrollment` y datos de prueba). No toca `app.module.ts` ni pantallas.
Hallazgos:

- [ALTO] Las FK `CHAR(36)` dependen de `auth_ajustes_bitacora` (D-021, solo en `features/adolfo`) → no llevar la Fase 1 al equipo hasta aceptar D-021.
- [MEDIO] Nombres de campo de docs/02 vs propuesta (`active`/`isActive`, `startAt`/`startDate`) → documentador actualiza docs/02.
- [MEDIO] Relaciones inversas en `auth.prisma` como grupo aparte (solo líneas añadidas) para no chocar con features/david.
- [BAJO] Falta evento de cierre de año lectivo para Dev 5 → se propone en F2.

Decisiones:

**1. Fases**

| Fase | RF                                             | Contenido                                                                                                                                                                                                         | Dependencia                 |
| ---- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| F1   | Modelo de RF-09/10/12/13/14/18/20/24; RN-11/13 | `academic.prisma`, migración `academic_estructura`, seed                                                                                                                                                          | Bloqueante para Dev 4       |
| F2   | RF-09..14, 17; RN-10..12                       | API `modules/academic` (CRUD, asignación docente, cierre/reapertura de períodos, solo lectura de años inactivos), `GET /course-sections/:id/context`, `GET /me/course-sections`, `AcademicAccessService`, eventos | Alta para Dev 4 y Dev 5     |
| F3   | RF-18..20, 22..25; RN-13                       | API `modules/users`: altas, vínculo apoderado, estados, traslado transaccional, búsqueda                                                                                                                          | Dev 4 (RF-52, RF-24), Dev 5 |
| F4   | RF-21                                          | Importación Excel/CSV                                                                                                                                                                                             | —                           |
| F5   | UI de RF-09..14, 17..25                        | Pantallas `admin/estructura` y `admin/usuarios`                                                                                                                                                                   | —                           |
| F6   | RF-15, 16; RN-15                               | Clonar estructura y promoción en bloque                                                                                                                                                                           | Dev 5, Dev 3                |

Contrato propuesto para F2 (`AcademicAccessService`): `getCourseSectionContext(courseSectionId)`, `assertTeacherOf(userId, courseSectionId)`, `isPeriodOpen(periodId)`, `listCurrentEnrollments(sectionId)`, `listEnrollmentsOfStudent(studentId, academicYearId)`, `getLinkedStudentIds(guardianId)`. Hasta F2, Dev 4 usa un stub.

**2.a Modelos** — archivo nuevo `prisma/schema/academic.prisma`:

```prisma
// Modulo academico: estructura y matriculas. Dueño: Dev 2 (RF-09..25).
// Sin borrado fisico de lo que tiene historial (RN-13/14, D-021): toda FK con Restrict.
// Invariantes que el ORM no cubre: columnas marcador TRUE/NULL + UNIQUE, y CHECK con SQL
// manual en la migracion academic_estructura.

enum AcademicPeriodKind {
  FIRST_BIMESTER   // I Bimestre (D-002)
  SECOND_BIMESTER  // II Bimestre
  THIRD_TRIMESTER  // III Trimestre
  FOURTH_TRIMESTER // IV Trimestre
}

enum EnrollmentEndReason {
  TRANSFER   // traslado de seccion (RF-24)
  WITHDRAWAL // retiro (RF-23)
  YEAR_END   // cierre de año / promocion (RF-16)
  CORRECTION // matricula registrada por error
}

model AcademicYear {
  id        String    @id @default(uuid(7)) @db.Char(36)
  year      Int       @unique @db.SmallInt
  // TRUE = activo; NULL = no activo; nunca FALSE (CHECK). UNIQUE admite varios NULL:
  // asegura un solo año activo (RN-11) incluso con transacciones concurrentes.
  isActive  Boolean?  @unique
  closedAt  DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  periods  AcademicPeriod[]
  sections Section[]
}

model AcademicPeriod {
  id             String             @id @default(uuid(7)) @db.Char(36)
  academicYearId String             @db.Char(36)
  sequence       Int                @db.TinyInt
  kind           AcademicPeriodKind
  label          String             @db.VarChar(32)
  startDate      DateTime           @db.Date
  endDate        DateTime           @db.Date
  closedAt       DateTime?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  academicYear AcademicYear @relation(fields: [academicYearId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([academicYearId, sequence])
  @@unique([academicYearId, kind])
}

model Section {
  id             String   @id @default(uuid(7)) @db.Char(36)
  academicYearId String   @db.Char(36)
  gradeLevel     Int      @db.TinyInt
  code           String   @db.VarChar(8)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  academicYear   AcademicYear    @relation(fields: [academicYearId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  courseSections CourseSection[]
  enrollments    Enrollment[]

  @@unique([academicYearId, gradeLevel, code])
  @@unique([id, academicYearId]) // destino de la FK compuesta de Enrollment
}

model Course {
  id        String   @id @default(uuid(7)) @db.Char(36)
  name      String   @unique @db.VarChar(120)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  courseSections CourseSection[]
}

model CourseSection {
  id        String   @id @default(uuid(7)) @db.Char(36)
  sectionId String   @db.Char(36)
  courseId  String   @db.Char(36)
  teacherId String?  @db.Char(36) // null mientras no hay docente (clonacion RF-15); asignar y reasignar va a la bitacora (RF-14)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  section Section @relation(fields: [sectionId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  course  Course  @relation(fields: [courseId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  teacher User?   @relation("CourseSectionTeacher", fields: [teacherId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([sectionId, courseId])
  @@index([teacherId])
  @@index([courseId])
}

model Enrollment {
  id             String               @id @default(uuid(7)) @db.Char(36)
  studentId      String               @db.Char(36)
  sectionId      String               @db.Char(36)
  academicYearId String               @db.Char(36) // copia del año de la seccion; la FK compuesta asegura que coincidan
  // TRUE = vigente; NULL = cerrada. UNIQUE(academicYearId, studentId, isCurrent): una vigente por año (invariante 2).
  isCurrent      Boolean?             @default(true)
  effectiveFrom  DateTime             @default(now())
  effectiveTo    DateTime?
  endReason      EnrollmentEndReason?
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  student User    @relation("EnrollmentStudent", fields: [studentId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  section Section @relation(fields: [sectionId, academicYearId], references: [id, academicYearId], onDelete: Restrict, onUpdate: Restrict)

  @@unique([academicYearId, studentId, isCurrent])
  @@index([studentId, effectiveFrom])
  @@index([sectionId, academicYearId, isCurrent])
}

model GuardianStudent {
  guardianId String   @db.Char(36)
  studentId  String   @db.Char(36)
  createdAt  DateTime @default(now())

  guardian User @relation("GuardianStudentGuardian", fields: [guardianId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  student  User @relation("GuardianStudentStudent", fields: [studentId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@id([guardianId, studentId])
  @@index([studentId])
}
```

`auth.prisma`: solo líneas añadidas, grupo aparte (separado por línea en blanco) entre `auditLogs AuditLog[]` y `@@index([role, status])`:

```prisma
  // Relaciones inversas de Dev 2 (academic.prisma)
  taughtCourseSections CourseSection[]   @relation("CourseSectionTeacher")
  enrollments          Enrollment[]      @relation("EnrollmentStudent")
  guardianLinks        GuardianStudent[] @relation("GuardianStudentGuardian")
  wardLinks            GuardianStudent[] @relation("GuardianStudentStudent")
```

Invariantes que quedan en el servicio (F2/F3): rol correcto en cada FK hacia `User`, períodos sin solapes, años inactivos de solo lectura, período cerrado (RN-10), invariantes 3–5. Sin DNI, fecha de nacimiento ni teléfono (RNF-09).

**2.b Migración** `academic_estructura` con `--create-only` y, al final:

```sql
-- Invariantes que Prisma no modela (CHECK, MySQL 8.4). Ninguno usa columnas de FK.
ALTER TABLE `AcademicYear`
  ADD CONSTRAINT `AcademicYear_isActive_chk` CHECK (`isActive` IS NULL OR `isActive` = 1),
  ADD CONSTRAINT `AcademicYear_year_chk` CHECK (`year` BETWEEN 2000 AND 2100);
ALTER TABLE `AcademicPeriod`
  ADD CONSTRAINT `AcademicPeriod_sequence_kind_chk` CHECK (
    (`sequence` = 1 AND `kind` = 'FIRST_BIMESTER') OR (`sequence` = 2 AND `kind` = 'SECOND_BIMESTER') OR
    (`sequence` = 3 AND `kind` = 'THIRD_TRIMESTER') OR (`sequence` = 4 AND `kind` = 'FOURTH_TRIMESTER')),
  ADD CONSTRAINT `AcademicPeriod_dates_chk` CHECK (`endDate` >= `startDate`);
ALTER TABLE `Section`
  ADD CONSTRAINT `Section_gradeLevel_chk` CHECK (`gradeLevel` BETWEEN 1 AND 5);
ALTER TABLE `Enrollment`
  ADD CONSTRAINT `Enrollment_isCurrent_chk` CHECK (
    (`isCurrent` = 1 AND `effectiveTo` IS NULL AND `endReason` IS NULL) OR
    (`isCurrent` IS NULL AND `effectiveTo` IS NOT NULL AND `endReason` IS NOT NULL)),
  ADD CONSTRAINT `Enrollment_dates_chk` CHECK (`effectiveTo` IS NULL OR `effectiveTo` >= `effectiveFrom`);
```

Sin columnas generadas ni índices funcionales (Prisma los borraría en la siguiente migración).

**2.c Seed** en `prisma/seed/`: `index.ts` (se niega si `NODE_ENV==='production'`), `fixtures.ts` (constantes reutilizables), `academic.ts`. `PrismaClient` desde `../../apps/api/src/generated/prisma/client.ts` con `PrismaMariaDb(process.env.DATABASE_URL)` y `dotenv/config`. Idempotente con `upsert` por clave natural; matrículas solo si no hay una vigente; sin `AuditLog` ni `LocalCredential`. Todo ficticio en `@colegio.example`:

- Año 2026 activo con 4 períodos: I 2026-03-01..04-30 **cerrado**; II 05-01..06-30; III 07-01..09-30; IV 10-01..12-31.
- Año 2025 inactivo y cerrado, 4 períodos cerrados, sección 2A-2025 y una matrícula cerrada `YEAR_END`.
- Secciones 2026: 1A, 2A, 3A, 3B, 4A, 5A. Cursos: Matemática, Comunicación, Ciencia y Tecnología, Inglés, Ciencias Sociales.
- 5 docentes; 30 `CourseSection` (Matemática 3A → docente01, Matemática 3B → docente02).
- 60 estudiantes (10 por sección). estudiante03 trasladado 3A → 3B (`TRANSFER`); estudiante59 `INACTIVE`; estudiante60 `WITHDRAWN` con matrícula `WITHDRAWAL`.
- Admin `admin@colegio.example`. apoderado01 → estudiante01 (3A) y un estudiante de 3B; apoderado02 → estudiante02.
- Ejecución: en `prisma.config.ts`, `migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed/index.ts' }`; en `package.json` raíz, script `"db:seed": "prisma db seed"` y devDependencies `tsx` y `@prisma/adapter-mariadb` 7.10.1.

**2.d Archivos compartidos a autorizar:** `prisma/schema/auth.prisma` (solo líneas añadidas), nueva carpeta en `prisma/migrations/`, `prisma.config.ts`, `package.json` raíz, `pnpm-lock.yaml`.

**2.e Agentes y criterios de terminado:**

1. `modelador-bd`: `prisma validate`/`format` sin cambios pendientes; migración aplicada e "in sync"; 6 CHECK en `SHOW CREATE TABLE`; `git diff auth.prisma` solo `+`; `db:generate` ok.
2. `dev2-estructura`: `pnpm db:seed` dos veces con los mismos conteos (2 años, 8 períodos, 7 secciones, 5 cursos, 30 CourseSection, 60 estudiantes, 5 docentes, 2 apoderados, 1 admin); api lint/test/build y format:check.
3. `qa-tester`: `apps/api/test/academic-schema.e2e-spec.ts` con `describe.skipIf(!process.env.DATABASE_URL)` (segundo año activo, segunda matrícula vigente, sección de otro año, CHECK, Restrict, seed idempotente, correos `@colegio.example`); `pnpm --filter api test:e2e` en local.
4. `seguridad-cumplimiento`: datos de menores en el seed, protección contra producción, minimización, sin cascadas.
5. `revisor-pr`: alcance limitado a esos archivos; lint/test/build.
6. `documentador`: docs/02 (nombres finales), docs/08 (D-011 a PROPUESTA; D-027 marcadores TRUE/NULL + CHECK; D-028 seed; D-029 `teacherId` opcional), docs/07 (comando de seed).

**3. Riesgos:** `auth.prisma` y orden de migraciones frente a features/david; D-021 no está en el equipo; `app.module.ts` en F2/F3; el futuro dueño de Dev 2 puede diseñar otra forma → todo como PROPUESTA y Dev 4 consume solo `AcademicAccessService`.

Para: modelador-bd

### Decisión del orquestador

Autorizo los archivos compartidos de 2.d para la Fase 1 en el repo privado. Esta tarea ejecuta **solo la Fase 1**; F2..F6 serán tareas aparte. Se usa el agente `dev2-estructura` (Dev 2, de un compañero) solo en el repo privado, porque el usuario lo pidió.

### INFORME 2 — modelador-bd

Estado: BLOQUEADO (expediente sin el plan, por un fallo del orquestador al copiarlo) → reanudado → LISTO
Archivos: `prisma/schema/academic.prisma` (nuevo), `prisma/schema/auth.prisma` (+6 líneas, solo `+`), `prisma/migrations/20261026174231_academic_estructura/migration.sql` (nuevo), cliente regenerado.
Comandos: validate ok; format idempotente; migración aplicada; segundo migrate dev "Already in sync"; migrate status al día (3 migraciones); db:generate ok; api build ok.
Pruebas con ROLLBACK (datos ficticios): segundo año activo → 1062; matrícula con sección de otro año → 1452; gradeLevel 6 → 3819; isActive=0 → 3819; segunda matrícula vigente → 1062; matrícula cerrada sin endReason → 3819; sequence/kind distintos → 3819; borrar año con secciones → 1451. Sin datos remanentes.
Hallazgos:

- [BAJO] Son **7** CHECK, no 6 (el criterio 2.e.1 estaba mal contado): AcademicYear_isActive_chk, AcademicYear_year_chk, AcademicPeriod_sequence_kind_chk, AcademicPeriod_dates_chk, Section_gradeLevel_chk, Enrollment_isCurrent_chk, Enrollment_dates_chk.
- [BAJO] prisma format solo alineó los comentarios de los enums.
- [MEDIO] Datos personales nuevos: vínculo apoderado–menor e historial de matrícula de menores; sin DNI ni cascadas.
  Notas para el seed: año no activo con isActive null (nunca false); matrícula cerrada con isCurrent null + effectiveTo + endReason; Enrollment.academicYearId igual al año de la sección; sequence y kind deben coincidir; claves de upsert: year, academicYearId_sequence, academicYearId_gradeLevel_code, name, sectionId_courseId, guardianId_studentId.
  Verificado por el orquestador: git diff de auth.prisma y migrate status.
  Para: dev2-estructura

### INFORME 3 — dev2-estructura

Estado: LISTO
Archivos: prisma/seed/index.ts, fixtures.ts, academic.ts (nuevos); prisma.config.ts (seed); package.json raíz (db:seed; devDeps tsx y @prisma/adapter-mariadb 7.10.1); pnpm-lock.yaml.
Comandos: pnpm db:seed x3 con la misma salida (68 usuarios, 2 años, 8 períodos, 7 secciones, 5 cursos, 30 CourseSection, 62 matrículas, 59 vigentes, 3 vínculos, 5 períodos cerrados, 0 LocalCredential, 0 AuditLog); matrículas especiales verificadas en MySQL; con NODE_ENV=production sale con exit 1 sin conectarse; api lint/test (23)/build ok; prettier ok.
Hallazgos: [BAJO] el historial de matrículas se crea solo si el estudiante no tiene ninguna en ese año (evita duplicar la cerrada de estudiante60); [BAJO] si hay otro año activo ajeno al seed, el seed falla a propósito (no toca datos ajenos).
Decisiones: estudiantes 3A=01..10, 3B=11..20, 1A=21..30, 2A=31..40, 4A=41..50, 5A=51..60; docente fijo por curso salvo Matemática 3B → docente02; fechas fijas (traslado 2026-06-15, retiro 2026-08-20).
Verificado por el orquestador: pnpm db:seed corre de nuevo sin error.
Para: qa-tester

### INFORME 4 — seguridad-cumplimiento

Estado: APROBADO (sin CRÍTICO ni ALTO)
Verificado: minimización (sin DNI, nacimiento, teléfono); 9 FK RESTRICT/RESTRICT; historial de matrícula conservado; seed sin datos reales, hashes ni secretos, dominio reservado; sin queryRaw; UNIQUE con NULL correcto con los CHECK.
Hallazgos:

1. [MEDIO] prisma/seed/index.ts:10 — el guard solo mira NODE_ENV=production; con NODE_ENV vacío y DATABASE_URL a producción el seed correría → validar host de DATABASE_URL (localhost, 127.0.0.1, ::1 o servicio del compose), negarse con CI=true, opcional opt-in explícito.
2. [MEDIO] Rol correcto en FK hacia User (Enrollment, CourseSection, GuardianStudent) y guardianId distinto de studentId → servicio F2/F3, con tests.
3. [MEDIO] GuardianStudent sin finalidad, conservación ni revocación auditable → F3: finalidad, visibilidad, conservación, revokedAt/createdById o bitácora (modelador-bd decide).
4. [BAJO] Enrollment/GuardianStudent como historial permanente de menores → documentar en docs/04 (se anonimiza el usuario, no se borra la matrícula).
5. [BAJO] Marcadores TRUE/NULL: cerrar = null; buscar cerradas = null; cambio de año activo en una transacción.
6. [BAJO] Section/CourseSection.isActive no se propagan → servicios deben comprobarlos (RN-10).
7. [BAJO] prisma/seed/index.ts:46-49 imprime el error completo (puede incluir host/URL) → solo error.message.
   Pendiente F2/F3: bitácora de acciones críticas académicas.
   Para: dev2-estructura (1 y 7 ahora)

### Decisión del orquestador

Se corrigen ahora los hallazgos 1 y 7 (baratos y del alcance de la Fase 1). Para el 1: validar el host de DATABASE_URL (lista blanca: localhost, 127.0.0.1, ::1, mysql) y negarse con NODE_ENV=production o CI=true; no se exige variable de opt-in para no complicar el uso local. Los hallazgos 2, 3, 5 y 6 pasan a F2/F3; el 4 al documentador. Cuenta como vuelta de corrección 1/2.

### INFORME 5 — qa-tester

Estado: LISTO
Archivo: apps/api/test/academic-schema.e2e-spec.ts (18 casos; describe.skipIf sin DATABASE_URL; carga el .env raíz con dotenv; escrituras en transacción con rollback; años 2090/2091 y correos qa-*@colegio.example; test final sin datos residuales).
Casos: RN-11 (P2002); RF-24 (P2002, traslado convive, FK compuesta P2003); CHECK 3819 por nombre (isActive, sequence_kind, gradeLevel, isCurrent); RN-13 (Restrict P2003); seed (conteos, roles, dominio, años, traslado, retiro).
Comandos: api test:e2e 26/26; api test 23/23; api lint ok; prettier ok; db:seed con los mismos conteos.
Hallazgos: [BAJO] Enrollment_dates_chk se dispara antes que isCurrent_chk si las fechas no son coherentes → los servicios de F3 deben fijar fechas al cerrar matrículas. [BAJO] los tests de conteo asumen la BD solo con el seed.
Para: dev2-estructura (correcciones 1 y 7 de seguridad)

### INFORME 6 — dev2-estructura (corrección 1/2)

Estado: LISTO
Archivo: prisma/seed/index.ts — assertLocalDatabase(): se niega con NODE_ENV=production, CI=true, sin DATABASE_URL, URL inválida o host fuera de {localhost, 127.0.0.1, ::1, [::1], mysql}, antes de crear el cliente y sin mostrar la URL; el catch solo registra el mensaje del error.
Comandos: db:seed ok (mismos conteos); host externo, CI, production y URL inválida → exit 1; api test:e2e 26/26; api test 23/23; lint ok; prettier ok.
Decisión: lista blanca de hosts en ALLOWED_DB_HOSTS (actualizar si cambia el servicio del compose).
Verificado por el orquestador: con un host externo el seed se niega con exit 1.
Para: revisor-pr

### INFORME 7 — revisor-pr

Estado: APROBADO
Resumen: Esquema idéntico a 2.a; migración con 7 CHECK y 9 FK RESTRICT/RESTRICT; seed conforme a 2.c y a las correcciones del INFORME 6. Alcance correcto; nada en auth/session/login/layout de Dev 1.
Comandos: lint 5/5; test 23/23; build 5/5; test:e2e 26/26 (Docker); format:check falla solo por .agents/ y el expediente.
Hallazgos (BAJO): servicios de F3 deben pasar sectionId y academicYearId juntos y fijar effectiveTo >= effectiveFrom; ALLOWED_DB_HOSTS fijo; conteos del e2e asumen BD solo con el seed. MEDIO heredado a F2/F3: rol en FK hacia User y revocación auditable de GuardianStudent.
Decisión: trabajo de Dev 2 (compañero); NO va al equipo; depende de D-021.
Commit propuesto: feat(academic): RF-09/10/12/13/14/18/20/24 esquema academico, migracion con 7 CHECK y seed ficticio.
Para: documentador

### INFORME 8 — documentador

Estado: LISTO
Archivos: docs/02 (nombres finales e invariantes 1 y 2), docs/04 (historial de matrícula y vínculos de menores), docs/07 (pnpm db:seed), docs/08 (D-011 a PROPUESTA; D-027, D-028, D-029), docs/10 (avance RF-09/10/12/13/14/18/20/24).
Pendiente: manual técnico (RNF-32) con el seed, en tarea aparte.

## Cierre

Fase 1 terminada. Reporte: .claude/reportes/20261026-dev2-estructura.md. Commit en features/adolfo, subido solo a mio. No va al equipo (Dev 2 es de un compañero; depende de D-021).
