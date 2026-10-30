# AV-MATER-CHIRSTI — Flujo de trabajo de Dev 4 y Dev 5 (local, GitHub y nube)

**Autor:** Ad0v1 (Dev 4 y Dev 5) · **Fecha:** 26/10/2026

Este documento explica cómo voy a trabajar mis módulos (calificaciones y administración) para que el equipo sepa qué esperar. **No cambia nada del repo del equipo ni de la forma en que ustedes trabajan.**

---

## 1. Resumen

- Sigo trabajando **en local**, igual que todos (Docker, base de datos, `pnpm`).
- Tengo una **copia privada** del repo en mi cuenta: `Ad0v1/AV-MATER-CHIRSTI`. Solo la uso yo.
- Uso **Claude Code en la nube** para tareas sueltas que no necesitan Docker (por ejemplo, el motor de notas y sus tests).
- **Todo lo que llega al repo del equipo llega por Pull Request** desde `features/adolfo` hacia `develop`. Nunca hago push directo a `main` ni a `develop`.

---

## 2. Repositorios

| Remoto | Repositorio | Para qué |
|---|---|---|
| `origin` | `sxxntoz/AV-MATER-CHIRSTI` | Repo oficial del equipo. Aquí solo llegan PRs desde `features/adolfo`. |
| `mio` | `Ad0v1/AV-MATER-CHIRSTI` (privado) | Mi copia de trabajo. Ahí trabaja Claude en la nube y ahí guardo pruebas. |

Ramas en la copia privada:

| Rama | Contenido |
|---|---|
| `main`, `develop` | Espejo de las del equipo. **No se hacen commits ahí**; solo se actualizan desde `origin`. |
| `features/adolfo` | Mi única rama de trabajo y la rama por defecto: `develop` + agentes de IA (`.claude/`, `CLAUDE.md`) + mi código de Dev 4 y Dev 5. **No se sube tal cual al equipo**; ver el paso 5 del ciclo. |
| `claude/*` | Ramas que crea Claude en la nube. Se revisan en local antes de pasar algo a `features/adolfo`. |

---

## 3. Qué se hace en cada lugar

```
 PC local (Docker, BD, pruebas completas)
     │   git push mio ...            ▲  git fetch mio
     ▼                               │  (traigo lo que hizo la nube)
 GitHub: Ad0v1/AV-MATER-CHIRSTI ──► Claude en la nube (tareas sueltas)
     │
     │   PR desde features/adolfo
     ▼
 GitHub: sxxntoz/AV-MATER-CHIRSTI (repo del equipo, rama develop)
```

| Tarea | Local | Nube |
|---|:---:|:---:|
| Escribir código de mis módulos | ✅ | ✅ |
| `pnpm lint`, `pnpm build` | ✅ | ✅ |
| Tests unitarios (Vitest), p. ej. motor de notas | ✅ | ✅ |
| Levantar la app completa con Docker | ✅ | ❌ |
| MySQL real, MinIO, ClamAV | ✅ | ❌ |
| Tests de punta a punta (Playwright) | ✅ | ❌ |
| Abrir el PR al repo del equipo | ✅ | ❌ |

**Regla:** nada de lo que hace la nube va directo al equipo. Primero lo traigo a mi PC, lo pruebo completo con Docker y recién lo paso a `features/adolfo`.

---

## 4. Ciclo de trabajo

1. Actualizo mi copia con lo último del equipo:
   ```bash
   git fetch origin
   git push mio origin/develop:refs/heads/develop
   ```
2. Le encargo a Claude en la nube una tarea concreta (por ejemplo, "implementa la NE automática según RN-03 con sus tests").
3. Claude deja el resultado en una rama `claude/...` de mi copia privada.
4. Lo traigo y lo pruebo en local:
   ```bash
   git fetch mio
   git checkout <rama-claude>
   ```
5. Si funciona, lo integro en `features/adolfo` y lo subo a mi copia (`git push`, que va a `mio`).
6. Para enviarlo al equipo, armo una rama limpia desde `develop` del equipo con **solo** mis carpetas (sin `.claude/` ni `CLAUDE.md`), la subo como `features/adolfo` del equipo y abro el PR hacia `develop`:
   ```bash
   git fetch origin
   git switch -c envio origin/develop
   git checkout features/adolfo -- <carpetas de Dev 4 o Dev 5 que cambié>
   git commit -m "feat(grading): RN-01 motor de notas"
   git push origin envio:features/adolfo
   git switch features/adolfo
   git branch -D envio
   ```
   **Nunca** `git push origin features/adolfo`: llevaría los agentes al repo del equipo.

---

## 5. Compromisos con el equipo

- **Solo toco las carpetas de Dev 4 y Dev 5** en los PRs:
  - Dev 4: `packages/shared/src/grading`, `apps/api/src/modules/grading`, `apps/web/app/(app)/curso/[id]/registro`, `apps/web/app/(app)/mis-notas`, `apps/web/app/(app)/apoderado`
  - Dev 5: `apps/api/src/modules/` (`reports`, `notifications`, `announcements`, `lifecycle`, `settings`), `apps/web/app/(app)/admin/` (`reportes`, `configuracion`, `bitacora`, `almacenamiento`), `apps/worker`
- Si necesito un cambio en un archivo compartido (`prisma/schema/base.prisma`, `app.module.ts`, `package.json`, layout), **lo aviso antes** y va en un PR aparte y pequeño.
- **Los secretos no salen de mi PC:** el `.env` no se sube a ningún repo, y en la nube solo se usan valores de prueba.
- Los archivos de configuración de Claude (`.claude/`, `CLAUDE.md`) **no van en los PRs al equipo**, salvo que lo acordemos.
- Cada PR pasa `pnpm lint`, `pnpm test` y `pnpm build` en local antes de abrirse.

---

## 6. Qué necesito del equipo

- Nada en especial. Solo saber que mi trabajo llegará por PR desde `features/adolfo`.
- Si alguien cambia los contratos entre módulos (`docs/03`) o el esquema de Prisma, que me avise para mantener mi copia al día.
