# Reporte: parpadeos entre páginas (useLayoutEffect vs useEffect)

## Pedido

- **Pedido 1:** "quiero que verifiques los layouts de la web, debido a que quiero evitar los parpadeos entre paginas de la web, tomando en cuenta el 'Use LayoutEffect' en contraste con 'useEffect' (...), realiza un testeo".
- **Pedido 2:** "Sí, corrígelas".
- **Datos:** 17/11/2026, flujo corto, rama `features/adolfo`, sin commit.

## Resultado

Lo hizo el orquestador, sin agentes, porque el usuario había pedido ahorrar tokens. Midió con Playwright MCP en 1280 y 360 px, con sesión de docente.

- **"Mi perfil" dentro del aula:** la página pasó a `app/(app)/mi-perfil`, así que ya no desaparece el menú lateral ni se vuelve a montar toda la página con un fundido. El proxy pasa la ruta en `x-aula-pathname` para que el layout no redirija en bucle a quien debe completar sus datos. Se quitó `/mi-perfil` de las rutas públicas de `RootRouteTransition`.
- **Esqueleto de carga:** ahora aparece solo si la carga pasa de 350 ms, antes eran 150 ms, así las navegaciones rápidas no destellan.
- **Menú:** se quitó el grupo "Curso de ejemplo" con enlaces a `/curso/demo/*`, un curso que no existe y daba error en la consola. "Mis cursos" ya lista los cursos reales.
- **Pestañas del curso:** `course-tabs.tsx` usa `useLayoutEffect` para desplazar la barra hasta la pestaña activa antes de pintar. Los otros 27 `useEffect` no afectan lo visible: cargan datos, mueven el foco, anuncian mensajes o manejan temporizadores.

## Agentes que participaron

Ninguno.

## Decisiones del orquestador

- `useIsMobile` ya usa `useSyncExternalStore`, así que no se tocó.
- El esqueleto de unos 300 ms que sigue apareciendo al entrar a un curso corresponde a una carga real, de unos 650 ms en modo desarrollo. No es un destello. En producción, con _prefetch_, será más rápido.

## Archivos

- `apps/web/app/mi-perfil/page.tsx` → `apps/web/app/(app)/mi-perfil/page.tsx`
- `apps/web/app/(app)/layout.tsx`
- `apps/web/proxy.ts`
- `apps/web/components/layout/route-transition.tsx`
- `apps/web/components/layout/course-tabs.tsx`
- `apps/web/lib/nav.ts`
- `apps/web/app/globals.css`

## Verificación

| Comprobación    | Resultado |
| --------------- | --------- |
| tsc web         | 0 errores |
| eslint          | ok        |
| Tests de la web | 560 ok    |

| Medición              | Antes                                     | Después                                     |
| --------------------- | ----------------------------------------- | ------------------------------------------- |
| Aula → Mi perfil      | esqueleto 223 ms, opacidad 0,72, sin menú | esqueleto 0 ms, opacidad 1, CLS 0, con menú |
| Calendario y anuncios | sin cambios: 0 ms                         | 0 ms                                        |

## Pendientes

- Los archivos tocados también los cambia la rama de David (`features/david`): `nav.ts`, `route-transition.tsx` y `mi-perfil`. Al integrar habrá conflictos pequeños.
- No se pudo medir el salto de las pestañas en el celular: los enlaces de prueba apuntaban al curso inexistente.
