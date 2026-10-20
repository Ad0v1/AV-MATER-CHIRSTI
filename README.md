# AV-MATER-CHIRSTI — documentación maestra del Sprint 0

> **Estado: propuesta para revisión del equipo (v0.1, 13/10/2026).** No es una implementación ni una ERS aprobada. Este paquete se debe revisar en PR hacia `develop`, especialmente por Dev 1 (integrador), Dev 2 y Dev 4.

Proyecto: **Aula Virtual Institucional (Secundaria)**. Alcance único: `docs/fuentes/ERS_Aula_Virtual_Secundaria.pdf` (v1.0, borrador) y `docs/fuentes/Plan_Trabajo_Aula_Virtual.pdf` (13/10/2026). Las decisiones técnicas adicionales se identifican como **PROPUESTA**, no como requisitos de la institución.

## Instalación local

Requisitos: **Node 24**, **pnpm 12** (`corepack enable`), **Docker Desktop** y **Git**.

```bash
git clone https://github.com/sxxntoz/AV-MATER-CHIRSTI.git
cd AV-MATER-CHIRSTI
git switch features/<tu-nombre>      # tu rama de trabajo
git merge origin/develop             # traer lo último
cp .env.example .env                 # en PowerShell: Copy-Item .env.example .env
pnpm install
docker compose up -d                 # MySQL, Redis, MinIO, ClamAV y Mailpit
```

ClamAV tarda unos 2–3 minutos en quedar `healthy` la primera vez (`docker compose ps`).

| Qué | Comando | URL |
|---|---|---|
| API (NestJS) | `pnpm --filter api start:dev` | http://localhost:4000/api/v1/health |
| Web (Next.js) | `pnpm --filter web dev` | http://localhost:3000 |
| Consola MinIO | — | http://localhost:9001 |
| Correos de prueba (Mailpit) | — | http://localhost:8025 |

Base de datos (Prisma 7, esquema dividido en `prisma/schema/*.prisma`, un archivo por módulo):

| Qué | Comando |
|---|---|
| Crear y aplicar una migración en local | `pnpm db:migrate --name <descripcion>` |
| Aplicar migraciones existentes (CI/producción) | `pnpm db:deploy` |
| Regenerar el cliente (se hace solo en `pnpm install`) | `pnpm db:generate` |

Reglas: sincroniza con `develop` **antes** de generar una migración y sube **una sola migración por PR**. Si tu modelo se relaciona con `User`, agrega la relación inversa en el archivo de `User` en tu mismo PR (Prisma exige ambos lados).

Primer administrador (cuenta local de respaldo, RF-04). La contraseña va por variable de entorno, mínimo 12 caracteres:

```bash
ADMIN_PASSWORD='<contraseña>' pnpm --filter api admin:create -- correo@colegio.edu.pe "Nombre Completo"
```

En PowerShell: `$env:ADMIN_PASSWORD='<contraseña>'; pnpm --filter api admin:create -- correo@colegio.edu.pe "Nombre Completo"`. Luego se inicia sesión en `POST /api/v1/auth/login` y el 2FA se activa con `POST /api/v1/auth/2fa/setup` y `/2fa/enable`.

Calidad antes de abrir un PR: `pnpm format:check`, `pnpm lint`, `pnpm test` y `pnpm build`. El CI ejecuta los mismos cuatro pasos.

Detener los servicios: `docker compose down` (añade `-v` para borrar también los datos locales).

## Si acabas de entrar al proyecto

1. Lee [00 — Inicio y mapa del Sprint 0](docs/00_INICIO_Y_MAPA.md) (5 minutos).
2. Localiza tu responsabilidad en [01 — Arquitectura y límites](docs/01_ARQUITECTURA.md).
3. Revisa [02 — Diccionario de entidades](docs/02_MODELO_ENTIDADES.md) y el [diagrama ER conceptual](docs/diagramas/erd.mmd).
4. Antes de implementar una integración, revisa [03 — Contratos entre módulos](docs/03_CONTRATOS.md) y [04 — Reglas y estados](docs/04_REGLAS_ESTADOS.md).
5. Aplica [05 — Acceso y privacidad](docs/05_AUTORIZACION.md), [06 — Git y calidad](docs/06_GIT_CALIDAD.md) y [07 — Plan Sprint 0](docs/07_PLAN_SPRINT0.md).
6. Registra desacuerdos en [08 — Decisiones pendientes](docs/08_DECISIONES.md). Dev 1 coordina aprobación del contrato y la integración.
7. Usa [09 — Casos QA](docs/09_QA_BASE.md) y [10 — Trazabilidad](docs/10_TRAZABILIDAD.md).

## Qué contiene el paquete

| Carpeta/archivo | Uso |
|---|---|
| `docs/*.md` | Acuerdos técnicos maestros (editables y revisables en Git) |
| `docs/diagramas/erd.mmd` | Relaciones conceptuales, representables con Mermaid |
| `docs/propuestas/schema.propuesto.prisma` | **Borrador** de entidades y relaciones; **no ejecutar migraciones desde aquí** |
| `docs/plantillas/PR.md` | Plantilla para cambios trazables por RF/RN/RNF |
| `docs/fuentes/*.pdf` | Documentos originales de referencia, sin alteraciones |

## Reglas de adopción

- Este paquete **no debe copiarse encima de código existente** ni sustituir el esquema Prisma activo sin revisión.
- Ningún endpoint o nombre de modelo en estos Markdown equivale a aprobación automática.
- Las ramas existentes son `main`, `develop`, `features/juica` y `features/{luchito,david,adolfo,azael}`. No se asignan personas a Dev 1/2/4/5 sin confirmación.
- El flujo aprobado por el plan es `features/*` → PR revisado → `develop` → PR de release → `main`.
- **No hay asistencia, exámenes, cuestionarios, SIAGIE ni Google Classroom en v1**, según sección 7 de la ERS.
- Cuatro períodos oficiales para este diseño: I Bimestre, II Bimestre, III Trimestre, IV Trimestre (ERS §2.2; confirmado por el equipo).

## Entrega deseada del Sprint 0

**Un repositorio arrancable y documentado**, con contratos acordados, entidades iniciales, seeds ficticios, Docker, CI mínima, rutas definidas y un flujo demostrable. Por el momento este paquete es la **propuesta documental** que permite comenzar ese trabajo.
