# Reporte: agentes de diseño, guía y maqueta

## Pedido

"genera los agentes para armar el diseño y luego planifica lo que se tendra o realiza preguntas con base de webs que son aulas virtuales, ademas que quisiera tener una maquetacion y por cada avance levantas la web para ver lo que se ha cambiado/nuevo, primero fijate si hay algo nuevo en la repo grupal" — 08/11/2026, flujo completo con pantallas, rama `features/adolfo`, sin commit.

## Resultado

- Se revisó el repo del grupo: el PR #20 ya está integrado y `features/david` tiene 114011e (diseño del login) sin integrar.
- Se crearon 4 agentes de diseño en Sonnet, se escribió la guía `docs/diseno/guia.md` y se armó la maqueta estática en `/maqueta`.

## Agentes que participaron

| Agente                                                               | Modelo        | Qué hizo       | Estado |
| -------------------------------------------------------------------- | ------------- | -------------- | ------ |
| director-diseno (vía general-purpose; el tipo aún no estaba cargado) | Sonnet, alto  | Guía de diseño | LISTO  |
| disenador-ui                                                         | Sonnet, medio | Maqueta        | LISTO  |

## Prompts usados

Literales en `.claude/reportes/20261109-tres-niveles.md` (sección Prompts usados). Resumen:

- **director-diseno:** "Actúa como el agente definido en .claude/agents/director-diseno.md … escribe docs/diseno/guia.md … Decisiones del usuario: 1. pendientes primero; 2. barra inferior; 3. cálido y amigable sobre #592719/#ffcc00, paleta de cursos con AA; 4. Lexend + Source Sans 3 (114011e); 5. patrones para la maqueta de inicio por rol y curso por dentro …".
- **disenador-ui:** "arma la MAQUETA estática en apps/web/app/maqueta/: índice, inicio estudiante/docente/apoderado, curso con pestañas; componentes de la sección 5 en _componentes/; tokens locales en maqueta.css; layout propio con sidebar ≥768 y BottomNav <768; sin API; no tocar fuera de maqueta; avisar si proxy.ts bloquea …".

## Decisiones del orquestador

- Los agentes nuevos no estaban cargados en la sesión, así que se usó general-purpose con Sonnet siguiendo el archivo del agente.
- La maqueta va autocontenida. No se tocaron `tokens.css`, `globals.css`, `(app)/layout.tsx` ni `proxy.ts`, que son de Dev 1.
- Para verla se usó una cookie ficticia en el navegador del orquestador.

## Archivos

- `.claude/agents/{director-diseno,disenador-ui,revisor-visual,revisor-movimiento}.md`
- `CLAUDE.md`
- `docs/diseno/guia.md`
- `apps/web/app/maqueta/**`
- el expediente y este reporte

## Verificación

- `pnpm --filter web exec tsc --noEmit`: ok.
- `eslint app/maqueta`: ok.
- Revisión en el navegador a 360 y 1280 px: ok.

## Pendientes

- Autorizar cambios en tokens, `globals.css`, layout y `proxy.ts` (de Dev 1).
- Crear la ruta `/cursos`.
- Instalar Playwright MCP para el `revisor-visual`.
- Revisar el logo en la barra superior móvil de la maqueta.
- Faltan los estados de carga y error, y la vista del docente dentro del curso.

Expediente: `.claude/tareas/20261108-diseno-web.md`
