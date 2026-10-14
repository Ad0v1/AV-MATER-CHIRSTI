# 06 — Convenciones Git, revisión y Definition of Done

## Ramas existentes (observadas en la terminal del equipo)

`main`, `develop`, `features/juica`, `features/luchito`, `features/david`, `features/adolfo`, `features/azael`.

**No interpretar nombres de ramas como la asignación de Dev 1, 2, 4 y 5.** Dev 3 es Christian, `features/juica`.

## Flujo diario recomendado (Plan §4)

```powershell
git switch features/juica
git fetch origin
git merge origin/develop
# hacer cambios propios, probar
git add docs/ README.md
git commit -m "docs(sprint0): documentar entidades y contratos compartidos"
git push -u origin features/juica
```

Se abre **Pull Request de `features/juica` hacia `develop`**. No `push` directo a `main` o `develop` (el plan requiere protección y aprobación). Ejecutar `git status` antes de `add`; no subir temporales, PDFs de alumnos ni `.env`.

## Convención de commits (propuesta alineada al plan)

`tipo(módulo): ID breve resumen`.

Ejemplos: `feat(contents): RF-26 publicar material de clase`, `test(submissions): RF-37 cubrir entrega tardia`, `docs(schema): acordar relaciones Assignment-Grade`.

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`. PRs pequeños por requisito/grupo estrecho; revisar por otro desarrollador; CI en verde (lint, tests, build); no hacer PR con 3 semanas de acumulación.

## Checklist para PR de arquitectura (antes de código)

- [ ] Referencia exacta a ERS/plan e IDs afectados.
- [ ] Qué es requisito vs propuesta técnica identificado.
- [ ] Entidades, cardinalidades y restricciones revisadas por dueños.
- [ ] No hay columnas duplicadas que compitan con otra fuente de verdad.
- [ ] Endpoint/evento compartido versionado y documentado.
- [ ] Permisos de backend y manejo de errores explicitados.
- [ ] Decisión pendiente anotada en `08_DECISIONES.md`.
- [ ] Aprobación Dev 1 y dueño del módulo afectado.

## Definition of Done (extraído del Plan §5)

Debe funcionar en `develop` levantado con Docker; comprobar permisos y pertenencia en el backend; auditar acciones críticas; ser usable desde 360 px; incluir tests de lógica principal; recibir revisión cruzada; y mencionar el RF en el PR.

## Distinción clave

Aprobar un documento **no es aprobar una funcionalidad**; cada RF se valida posteriormente con tests y flujo demostrable.
