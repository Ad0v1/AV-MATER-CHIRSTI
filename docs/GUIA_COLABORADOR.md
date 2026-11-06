# Guía para colaborar en el repo privado (Ad0v1/AV-MATER-CHIRSTI)

Aula virtual escolar de la I.E. Mater Christi. Es un monorepo pnpm + Turborepo con estas partes:

- `apps/api`: NestJS + Prisma 7 + MySQL.
- `apps/web`: Next.js 16.
- `apps/worker`: colas BullMQ.
- `packages/shared`.

## 1. Cómo trabajar (todo pasa por PR)

1. Acepta la invitación de GitHub al repo.
2. Clona el repo y parte de la rama de trabajo:
   ```bash
   git clone https://github.com/Ad0v1/AV-MATER-CHIRSTI.git
   cd AV-MATER-CHIRSTI
   git switch features/adolfo
   git switch -c feat/<tu-nombre>-<tema>
   ```
3. Haz commits pequeños con el formato `feat(modulo): RF-xx descripción` (ver `docs/06_GIT_CALIDAD.md`).
4. Antes de subir, corre:
   ```bash
   pnpm lint && pnpm test && pnpm build
   ```
5. Sube tu rama con `git push origin feat/<tu-nombre>-<tema>` y abre un **Pull Request hacia `features/adolfo`**.
6. **No hagas push directo a `features/adolfo`, `develop` ni `main`.** Adolfo revisa y acepta cada PR.

En el PR indica:
- qué RF cubre;
- qué probaste;
- qué archivos compartidos tocaste.

### Levantar en local

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm --filter api start:dev
pnpm --filter web dev
pnpm --filter worker dev
```

- El correo de prueba llega a Mailpit, en http://localhost:8025.
- En Windows con WSL exporta antes `NODE_OPTIONS=--dns-result-order=ipv4first`.
- Copia `.env.example` a `.env`. **Nunca subas el `.env`.**

## 2. Qué falta por cada dev

### Dev 1 — Plataforma (auth, guards, bitácora, layout, CI) · 🟡

1. `AuditService.record(event, tx)`: escribir en la bitácora dentro de la transacción. Hoy se escribe después del commit (D-047).
2. Regla de ciclo de vida de 1 día para `incoming/` en MinIO/R2.
3. CORS de Cloudflare R2 para la subida directa.
4. SMTP de producción: `SMTP_USER`, `SMTP_PASS` y `requireTLS`, validados en `env.ts`.
5. Redis de producción con contraseña en `REDIS_URL`, validado en `env.ts`.
6. CSP global con `img-src 'self' <host-del-bucket>`.
7. Mostrar el logo y el nombre de la institución en la cabecera. Ya existe `GET /institution/branding`.
8. `nav.ts`: enlace al "Registro de notas" para ADMIN y la campana de notificaciones en `(app)/layout.tsx`.
9. Revisar los archivos de Dev 1 que otros tocaron con permiso: `app.module.ts`, `env.ts`, `.env.example`, `docker-compose.yml`, el filtro de errores (413) y `app.setup.ts` (límite JSON de 512 KB).
10. Ampliar `rootDir` en `apps/api/tsconfig.json` para quitar 2 `@ts-ignore` en los tests.
11. Turbo: evitar que el `dev` del worker compile la API al mismo tiempo que `api start:dev`.

### Dev 2 — Estructura académica y usuarios · ✅

Está completo. Solo quedan dos detalles:
- Exportar un método de lectura de las asignaciones de `CourseSectionsService`.
- Confirmar el nombre y el payload de `academic-year.closed.v1`.

### Dev 3 — Contenidos, entregas y almacenamiento · 🟡

1. Pasar `gradeState` real en `submissions.service.ts`. Hoy va `null`.
2. En pantalla: descargar el PDF, y editar o borrar tareas.
3. Texto legal del aviso de derechos de autor, que lo da la institución.
4. Que `complete()` rechace la subida si `intentExpiresAt` ya venció.
5. Que `StorageService` acepte XLSX, ZIP y JSON, no solo PDF.
6. Prueba en un navegador real: subida, 360 px y lector de pantalla.

### Dev 4 — Calificaciones y apoderados · 🟡

1. **D-014:** decidir cómo se calcula el promedio anual.
2. **RNF-31:** subir la cobertura de ramas de la API de grading del 81 % al 90 %.
3. Prueba en un navegador real de Mis notas, apoderado, registro del docente y visor PDF, a 360 px y con lector de pantalla.
4. Mover la bitácora a dentro de la transacción cuando exista `record(event, tx)`.

### Dev 5 — Anuncios, notificaciones, reportes y ciclo de vida · 🟡 (4 de 7 fases)

Hecho:

| Fase | Contenido |
|---|---|
| 5a | Esquema `admin.prisma` |
| 5b | Colas BullMQ, worker, correo y barridos |
| 5c | Configuración institucional y logo (RF-61) |
| 5e | Calendario de plazos (RF-54) |

Pendiente:

**5d — RF-32 y RF-53.** Hay una API a medias en el commit `wip` (`b8b7f2c`), que **no compila del todo**: hay errores de tsc en `notification-worker.spec.ts`. Falta:
- Anuncios:
  - el docente publica por curso-sección;
  - el ADMIN publica para toda la institución o por grado;
  - el estudiante y el apoderado los leen.
- Notificaciones por cola en estos casos:
  - tarea nueva;
  - tarea que vence en 24 h;
  - nota MANUAL;
  - anuncio.
- Envío: `dedupeKey` por destinatario y correos en lotes de 50 a 100.
- Campana con contador.
- Retención:
  - leídas: 90 días;
  - no leídas: 180 días;
  - tope: 365 días;
  - reintentos de correo: 7 días.
- Pantallas y e2e.

**5g — RF-55/56 y RF-62..67.** También a medias en el `wip`. Falta:
- Bitácora con filtros y la marca de modo soporte.
- Exportación de datos personales (RF-63), con la bitácora `job.download`.
- Respaldo ZIP al cerrar el año.
- Purga (RF-66): solo con el año cerrado, los respaldos en SUCCEEDED y el plazo cumplido.
- Panel de almacenamiento.
- Límite de 3 jobs activos por usuario.
- Barrido de jobs en RUNNING colgados.
- Pantallas y e2e.

**5f — RF-57..60.** Sin empezar:
- Reportes XLSX y PDF por sección, con logo. El PDF se genera con Gotenberg, que hay que agregar a docker-compose.
- ZIP masivo.
- Dashboard institucional.
- `WorkerModule` debe importar `LiteralScaleModule`.

**Documentación:**
- docs/02: InstitutionSettings tipada.
- docs/03: contratos de jobs, settings, branding, calendar, anuncios y notificaciones.
- D-031: eventos por cola.

### Decisiones abiertas (institución o equipo)

| ID | Qué decidir |
|---|---|
| D-013 | ¿El apoderado recibe correos? |
| D-014 | Promedio anual |
| D-015 | Plazo de purga (60 días por defecto) |
| Otros | Texto legal del aviso de copyright y nombre oficial de la institución |

## 3. Agentes de IA que se usaron y para qué

El desarrollo se hizo con Claude Code. Un **orquestador** reparte cada tarea entre agentes especializados, que están definidos en `.claude/agents/`. Cada tarea deja un expediente en `.claude/tareas/` y un reporte con los prompts literales en `.claude/reportes/`.

| Agente | Propósito |
|---|---|
| `arquitecto-integrador` | Planifica cada tarea: dueño, requisitos, contratos y fases. Es de solo lectura. |
| `modelador-bd` | Dueño del esquema Prisma: modelos, CHECK y migraciones. |
| `dev1-plataforma` | Auth, guards, bitácora, layout, Docker y CI (RF-01..08). En este repo solo se usó para stubs. |
| `dev2-estructura` | Años, períodos, secciones, cursos, usuarios y seed (RF-09..25). |
| `dev3-contenidos` | Materiales, tareas, entregas, MinIO y ClamAV (RF-26..31, 33..40). |
| `dev4-calificaciones` | Notas, NE, exoneración, registro, Mis notas y apoderado (RF-41..52). |
| `dev5-administracion` | Anuncios, notificaciones, reportes, ciclo de vida y worker (RF-32, 53..67). |
| `qa-tester` | Escribe y corre tests de Vitest y e2e contra MySQL. Solo toca tests. |
| `seguridad-cumplimiento` | Audita OWASP, permisos, Ley 29733 y protección de menores. Es de solo lectura. |
| `ux-accesibilidad` | Revisa las pantallas: shadcn/ui, 360 px y WCAG 2.1 AA. Es de solo lectura. |
| `revisor-pr` | Revisión final: definición de terminado, carpetas permitidas, lint, test y build. |
| `documentador` | Actualiza los manuales y `docs/`. |

**Flujo de una tarea completa:**

```
arquitecto → modelador-bd (si hay esquema) → dev dueño → qa
           → seguridad ∥ ux → revisor → documentador
```

Se permiten como máximo 2 vueltas de corrección.

Si usas Claude Code, lee `CLAUDE.md` y `.claude/PROTOCOLO_AGENTES.md` antes de lanzar agentes. **`.claude/` y `CLAUDE.md` no se envían al repo del equipo** (`sxxntoz/AV-MATER-CHIRSTI`).

## 4. Reglas

- **No leer ni subir `.env`, ni credenciales reales.**
- **No hacer `git push` al repo del equipo.** Eso lo hace Adolfo.
- **Si vas a tocar un archivo compartido, avisa en el PR.** Son compartidos `app.module.ts`, `package.json`, `prisma/schema` de otro dev, `nav.ts` y `docker-compose.yml`.
- **Datos de menores:** nada de nombres, notas ni correos en logs, colas o URLs.
