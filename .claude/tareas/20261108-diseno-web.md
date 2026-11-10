# Diseño de la web: agentes, guía y maqueta

Pedido por el usuario: "genera los agentes para armar el diseño y luego planifica lo que se tendra o realiza preguntas con base de webs que son aulas virtuales, ademas que quisiera tener una maquetacion y por cada avance levantas la web para ver lo que se ha cambiado/nuevo, primero fijate si hay algo nuevo en la repo grupal"
Flujo: completo (con pantallas)
Vueltas de corrección: 0/2

## Paso 0 — Revisión del repo del grupo (08/11/2026)

- `origin/main` = 9e173a6 (merge del PR #20). Local al día salvo `CLAUDE.md`.
- `develop` y `features/luchito`: sin commits fuera de `main`.
- **`features/david` tiene 1 commit sin integrar:** 114011e "Diseño del login y verificacion en dos pasos": tipografía Lexend + Source Sans 3, fondo del login, página `/verificacion-dos-pasos`, y ajustes en login, 2FA y códigos de recuperación. La paleta de `tokens.css` ya está en local.

## Paso 1 — Agentes creados (orquestador, sin agentes)

- `.claude/agents/director-diseno.md` (Sonnet, alto), `disenador-ui.md` (medio), `revisor-visual.md` (bajo, Playwright MCP), `revisor-movimiento.md` (bajo).
- `CLAUDE.md`: agentes en la tabla y flujo con pantallas.

## Pendiente

- Respuestas del usuario a las preguntas de diseño.
- Instalar Playwright MCP y, si el usuario aprueba, las skills de terceros.

## INFORME 1 — director-diseno (general-purpose en Sonnet, esfuerzo alto): LISTO

- Escribió `docs/diseno/guia.md` v1.0: 9 colores de curso con contraste AA, radios 0,875 rem, barra inferior por rol debajo de 768 px, Lexend + Source Sans 3.
- Hallazgos: `--line-field` 1,51:1 (ALTO), `--ink-3` 4,49:1 (MEDIO), dorado nunca como texto, `Button` de 32 px (MEDIO).
- Pendientes: aplicar los tokens (archivos de Dev 1), crear la ruta `/cursos`, cambiar el layout compartido y definir los datos del inicio.

## Decisión 1 del orquestador

- La maqueta va autocontenida en `apps/web/app/maqueta/`, con los tokens de curso locales. No toca `tokens.css`, `globals.css` ni `(app)/layout.tsx` hasta que el usuario lo autorice.

## INFORME 2 — disenador-ui: LISTO

- Maqueta en `apps/web/app/maqueta/`: índice, inicio de estudiante, docente y apoderado, curso por dentro y 8 componentes en `_componentes/`, con tokens locales en `maqueta.css`.
- Hallazgo ALTO: `proxy.ts` redirige `/maqueta` a `/login` sin cookie. No se tocó.
- El orquestador corrió tsc y eslint (ok) y abrió la maqueta a 360 y 1280 px con una cookie ficticia (se ve bien). En móvil, el logo de la barra superior se ve como un espacio vacío: revisar.

## 09/11 — Ronda 2 (Brightspace, diseño unificado, imágenes y login)

- director-diseno: guía v1.1 LISTO. Hallazgo ALTO: el proyecto es solo secundaria (ERS y grados 1..5); los 3 niveles son una decisión de alcance del usuario.
- curador (general-purpose Sonnet): 11 webp de Pexels en `apps/web/public/maqueta/img/` (766 KB) y CREDITOS.md. Pendiente: el balón de Ed. Física puede tener marca; `inicio.webp` es vertical.
- disenador-ui: maqueta v1.1 LISTO (login, tarjetas con foto, ImageBanner, banner de inicio, aviso con miniatura).
- Orquestador: borró `_ref/`; agregó `unoptimized` a las `<Image>` de la maqueta (el optimizador de Next pide la imagen sin cookie y el proxy lo redirige al login); tsc y eslint ok; revisión en el navegador a 1280 px ok.

## 10/11/2026 — Elección y motion

- El usuario eligió la **opción B (cálido con fotos, Brightspace)** entre las 3 de https://claude.ai/artifact/BoKGRNHugy96ntJ1LnyVRU.
- Skill `motion-design` (LottieFiles, MIT, solo Markdown) copiada a `.claude/skills/motion-design/` desde un clon del repo, sin ejecutar `npx skills`. Asignada a `disenador-ui`, solo para el login, la carga y el cierre de sesión.
- Fotos del colegio: no se encontraron fotos publicadas del Colegio Mater Christi de Cañete (solo homónimos en Surco, Brasil y Australia). Se piden al usuario el enlace oficial o las fotos, con la autorización del colegio.

## 10/11/2026 — Integración y motion (orquestador, sin subagentes, con la skill motion-design)

- Integración: `origin/main` (PR #22, mismo contenido) registrado con `-s ours`; los cambios de David (PR #21 en develop: d4ca2a6..0783065) se aplicaron con 3-way. Conflictos: el login se queda con el diseño de David; el sidebar sigue siendo de servidor (SchoolBrand y Mis cursos) y el menú pasa a `sidebar-nav.tsx` (cliente). `RootRouteTransition` va dentro de Suspense (arregla el build del PR #21). Commits b540b59 y bc6726d.
- Motion (arquetipo Corporate):
  - login: entrada escalonada de 320 ms (60 ms de desfase, 500 ms en total) y carrusel `login-carousel.tsx` con fundido de 700 ms cada 7 s, acercamiento ambiente a 1,04, pausa con mouse o foco y botón de pausa (WCAG 2.2.2);
  - carga: el skeleton aparece a los 150 ms con un fundido de 200 ms;
  - cierre de sesión: salida ease-in de 200 ms de `[data-app-shell]`;
  - reduced motion: solo opacidad, la mitad de duración, sin avance automático ni zoom.
- Fotos del carrusel: la fachada real (asset de David) y el aula de Pexels (`public/brand/login-aula.webp`, pública porque `/maqueta` exige sesión). Faltan las fotos del colegio.
- Verificación: tsc 0, lint 0, web 560 ok, build 5/5 (antes del motion), y en el navegador el carrusel avanza y pausa.
