# AV-MATER-CHIRSTI — Agentes de IA del proyecto

**Autor:** Ad0v1 (Dev 4 y Dev 5) · **Fecha:** 26/10/2026 · **Estado:** creados en la rama `ia/base` (solo repo privado): `CLAUDE.md`, `.claude/PROTOCOLO_AGENTES.md`, `.claude/agents/*.md` y `.claude/settings.json`.

Este documento describe los agentes de Claude Code que usaré en mi copia privada (`Ad0v1/AV-MATER-CHIRSTI`): cuántos son, qué hace cada uno y qué límites tiene. Los requisitos y las carpetas salen de `docs/00_INICIO_Y_MAPA.md` y `docs/10_TRAZABILIDAD.md`.

---

## 1. Resumen

| | Cantidad |
|---|---|
| Orquestador (la sesión principal, guiada por `CLAUDE.md`) | 1 |
| Agentes que cubren a cada desarrollador | 5 |
| Agentes especializados transversales | 7 |
| **Total de agentes** | **12 + orquestador** |

- El **orquestador** no es un archivo de agente. Es la sesión principal de Claude que llama a los demás en orden, porque un agente no puede lanzar a otro.
- Cada agente es un archivo `.claude/agents/<nombre>.md`.
- **Al repo del equipo solo llega el trabajo de Dev 4 y Dev 5**, por PR desde `features/adolfo`. Los agentes de Dev 1, 2 y 3 solo se usan en la copia privada, para prototipos o *stubs* que respeten `docs/03_CONTRATOS.md`, nunca para reemplazar el trabajo de los compañeros.

---

## 2. Agentes por desarrollador (5)

| # | Agente | Cubre a | Requisitos | Qué construye | Modelo |
|---|---|---|---|---|---|
| 1 | `dev1-plataforma` | Dev 1 | RF-01..08, RNF-01..08 (RNF-03 compartido con Dev 3), RNF transversales | Login con Google y lista blanca, 2FA del admin, sesiones, guards de rol y pertenencia, bitácora, Docker, CI, layout y menú por rol | Opus |
| 2 | `dev2-estructura` | Dev 2 | RF-09..25 | Años, períodos, grados, secciones, cursos, asignación de docentes, usuarios, importación masiva y seed | Opus |
| 3 | `dev3-contenidos` | Dev 3 | RF-26..31, RF-33..40, RNF-03, RNF-18 | Materiales, tareas, entregas PDF, reentregas, entregas tardías, MinIO con URLs firmadas y ClamAV | Opus |
| 4 | `dev4-calificaciones` | **Dev 4 (yo)** | RF-41..52, RN-01..07, RNF-31 | Motor de notas, calificación, NE automática, exoneración, registro auxiliar, "Mis notas" y vista de apoderado | Opus |
| 5 | `dev5-administracion` | **Dev 5 (yo)** | RF-32, RF-53..67, RNF-19 | Anuncios, modo soporte, Excel y PDF por sección, ZIP, notificaciones, calendario, archivado, purga, worker y colas | Opus |

> **RF-32 (anuncios) es de Dev 5**, aunque en la ERS esté en la sección de contenidos (ver `docs/00`).
> **RNF-19 (`BackgroundJob`)** queda en Dev 5 con infraestructura; según `docs/02`, falta acordar quién es el dueño.

### Carpetas que puede modificar cada uno

| Agente | Carpetas |
|---|---|
| `dev1-plataforma` | `apps/api/src/modules/auth/`, `apps/api/src/common/`, `apps/api/src/config/`, `apps/api/src/health/`, `apps/web/app/login/`, `apps/web/app/(app)/layout.tsx`, `packages/ui/`, `docker/`, `docker-compose.yml`, `.github/` |
| `dev2-estructura` | `apps/api/src/modules/academic/`, `apps/api/src/modules/users/`, `apps/web/app/(app)/admin/estructura/`, `apps/web/app/(app)/admin/usuarios/`, `prisma/seed/` |
| `dev3-contenidos` | `apps/api/src/modules/contents/`, `apps/api/src/modules/submissions/`, `apps/api/src/modules/storage/`, `apps/web/app/(app)/curso/[id]/clases/`, `apps/web/app/(app)/curso/[id]/lecturas/`, `apps/web/app/(app)/curso/[id]/tareas/` |
| `dev4-calificaciones` | `packages/shared/src/grading/`, `apps/api/src/modules/grading/`, `apps/web/app/(app)/curso/[id]/registro/`, `apps/web/app/(app)/mis-notas/`, `apps/web/app/(app)/apoderado/` |
| `dev5-administracion` | `apps/api/src/modules/reports/`, `apps/api/src/modules/notifications/`, `apps/api/src/modules/announcements/`, `apps/api/src/modules/lifecycle/`, `apps/api/src/modules/settings/`, `apps/web/app/(app)/admin/reportes/`, `apps/web/app/(app)/admin/configuracion/`, `apps/web/app/(app)/admin/bitacora/`, `apps/web/app/(app)/admin/almacenamiento/`, `apps/worker/` |
| `modelador-bd` | `prisma/schema/<modulo>.prisma` (un archivo por módulo), `prisma/migrations/` (solo en local) |

Las rutas son las reales del repo: las pantallas con sesión iniciada van dentro de `apps/web/app/(app)/`, que es un *route group* de Next.js, y el esquema Prisma está dividido en un archivo por módulo dentro de `prisma/schema/`.

**Archivos compartidos sin dueño único.** Ningún agente de dev los edita por su cuenta: `prisma/schema/base.prisma`, `prisma/migrations/`, `apps/api/src/app.module.ts`, `apps/api/src/app.setup.ts`, los `package.json`, `pnpm-lock.yaml`, `turbo.json`, `apps/web/app/layout.tsx` y `packages/shared/src/index.ts`. Si una tarea los necesita, el agente se detiene, lo reporta y el cambio va en un PR aparte y avisado al equipo.

---

## 3. Agentes especializados (7)

| # | Agente | Función | Permisos | Modelo |
|---|---|---|---|---|
| 6 | `arquitecto-integrador` | Planifica cada tarea, revisa los contratos (`docs/03`), las dependencias entre módulos, el orden del plan y los RNF transversales (RNF-16..19) | Solo lectura | Opus |
| 7 | `modelador-bd` | Esquema Prisma por módulo, migraciones, `CHECK` e índices. Usa la skill `analisis-base-de-datos` y las skills de Prisma de `.agents/skills/` | Edita `prisma/` | Opus |
| 8 | `seguridad-cumplimiento` | Audita OWASP (inyección, XSS, CSRF), permisos por pertenencia, Ley 29733 y protección de menores (RNF-09..13) | Solo lectura | Sonnet |
| 9 | `ux-accesibilidad` | Coherencia visual con shadcn/ui, diseño desde 360 px y WCAG 2.1 AA (RNF-24..27) | Solo lectura; reporta y el agente del dev corrige | Sonnet |
| 10 | `qa-tester` | Tests de Vitest y Playwright de los flujos críticos (tarea → entrega → nota → exportación), según `docs/09_QA_BASE.md` | Solo archivos de test | Sonnet |
| 11 | `revisor-pr` | Verifica la definición de terminado (`docs/06_GIT_CALIDAD.md`), que solo se tocaron las carpetas permitidas (`git diff --name-only`) y que pasan `lint`, `test` y `build` | Sin `Edit`/`Write`; usa Bash solo para correr validaciones | Sonnet |
| 12 | `documentador` | Manuales por perfil, manual técnico y documentación de la API (RNF-32), y mantiene `docs/` al día | Solo `docs/` | Haiku |

> **Límite técnico:** en Claude Code, el campo `tools` de un agente limita *qué herramientas* usa, no *qué carpetas* toca. Las restricciones de carpeta se controlan con las instrucciones de cada agente y con la revisión de `revisor-pr`. Si hace falta, se pueden reforzar con un hook `PreToolUse`.

---

## 4. Flujo de trabajo

El orquestador llama a los agentes **uno tras otro**, no anidados:

```
1. arquitecto-integrador     → plan de la tarea
2. modelador-bd              → solo si hay cambios de esquema
3. agente del dev dueño      → implementa
4. qa-tester                 → tests
5. seguridad-cumplimiento    → auditoría  ┐ en paralelo
   ux-accesibilidad          → revisión   ┘ (solo si hay pantallas)
6. revisor-pr                → aprueba o pide cambios
7. documentador              → actualiza docs/
```

- Si `revisor-pr` pide cambios, la tarea vuelve al agente del dev. Hay **máximo 2 vueltas**; si sigue sin pasar, se reporta qué falta.
- **Flujo corto** para cambios pequeños (un bug, un test, un ajuste): agente del dev → `qa-tester` → `revisor-pr`. Así se ahorran créditos.

### Cómo se comunican

Detalle completo en `.claude/PROTOCOLO_AGENTES.md`.

1. **Todo pasa por el orquestador.** Los agentes no se llaman entre sí.
2. **Expediente por tarea** en `.claude/tareas/<AAAAMMDD>-<slug>.md`. Lo escribe **solo el orquestador**; cada agente lo lee al empezar para ver el encargo y lo que hicieron los anteriores.
3. **INFORME con formato fijo** al final de cada agente: `Estado`, `Requisitos`, `Resumen`, `Archivos`, `Comandos`, `Hallazgos`, `Decisiones`, `Pendientes` y `Para`. El orquestador lo pega en el expediente.
4. **El `Estado` decide el siguiente paso:**

| Estado | Lo emite | Qué hace el orquestador |
|---|---|---|
| `LISTO` | agentes que construyen | Sigue al siguiente paso |
| `APROBADO` | revisores | Sigue al siguiente paso |
| `CAMBIOS_PEDIDOS` | `qa-tester`, `seguridad-cumplimiento`, `ux-accesibilidad`, `revisor-pr` | Devuelve los hallazgos al dev dueño y repite desde QA (máximo 2 vueltas) |
| `BLOQUEADO` | cualquiera | Lanza al agente indicado en `Para:`; si es el usuario o un archivo compartido, para y pregunta |
| `RECHAZADO` | `arquitecto-integrador` | Para y explica al usuario |

5. **Pedidos entre agentes** con el campo `Para:`. Ejemplos:
   - `dev4-calificaciones` necesita una columna nueva → `BLOQUEADO`, `Para: modelador-bd`.
   - `dev4-calificaciones` necesita `Enrollment` y aún no existe → `BLOQUEADO`, `Para: dev2-estructura` (stub).
   - `dev5-administracion` necesita una función del motor de notas → `BLOQUEADO`, `Para: dev4-calificaciones`.
   - Cualquier agente necesita un contrato que no está en `docs/03` → `BLOQUEADO`, `Para: arquitecto-integrador`.
6. **Un hallazgo `CRÍTICO` de seguridad** siempre vuelve al dev antes de `revisor-pr`.

---

## 5. Orden de construcción

1. `dev4-calificaciones` → **motor de notas**. No depende de nadie y es lo que mejor funciona en la nube (solo Vitest).
2. `dev1-plataforma` → base: monorepo, Docker, auth, guards, bitácora y layout.
3. `dev2-estructura` → estructura académica, usuarios y seed.
4. `dev3-contenidos` → tareas, entregas y almacenamiento.
5. `dev4-calificaciones` → calificación sobre tareas y matrículas.
6. `dev5-administracion` → reportes, notificaciones y ciclo de vida, sobre todo lo anterior.

Los pasos 2 a 4 los hacen los compañeros. En la copia privada solo se hacen *stubs* si bloquean el trabajo de Dev 4 o Dev 5.

---

## 6. Reglas

- **Ningún agente hace `git push` a `origin`** (repo del equipo) ni push forzado, y ninguno lee `.env`. Se bloquea con reglas `deny` en `.claude/settings.json`, que también aplican en la nube.
- Los agentes tampoco hacen `commit`, `merge` ni cambian de rama: eso lo hace el usuario.
- Los PRs al equipo los abro yo, manualmente, desde `features/adolfo`.
- `.claude/` y `CLAUDE.md` **no van en los PRs al equipo** salvo acuerdo. Viven en una rama solo de la copia privada (por ejemplo `ia/base`).
- Los secretos no se dan a ningún agente: en la nube solo se usan valores de prueba.
- Fuera del alcance de v1 (ERS §7): asistencia, exámenes, cuestionarios, SIAGIE, Google Drive/Classroom y ponderación de actividades.

---

## 7. Dónde corre cada agente

| | Local (mi PC) | Nube (claude.ai/code) |
|---|:---:|:---:|
| `dev4-calificaciones` (motor de notas) | ✅ | ✅ |
| `dev5-administracion` (worker, colas, exportes) | ✅ | Parcial: sin MySQL ni Docker |
| `qa-tester` (Vitest) | ✅ | ✅ |
| `qa-tester` (Playwright) | ✅ | ❌ |
| `revisor-pr`, `arquitecto-integrador`, `seguridad-cumplimiento`, `documentador` | ✅ | ✅ |
| `modelador-bd` (migraciones contra MySQL) | ✅ | Solo editar el esquema |

Ver también `docs/FLUJO_LOCAL_GITHUB_NUBE.md`.
