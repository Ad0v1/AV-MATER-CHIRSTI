# Guía de diseño — Aula Virtual Mater Christi

**Versión 1.1 · 09/11/2026 · Autor: `director-diseno`** · Requisitos: RNF-24 (adaptable desde 360 px), RNF-25 (fácil de usar, 11 a 17 años), RNF-26 (WCAG 2.1 AA), RNF-27 (últimas dos versiones de Chrome, Edge, Firefox y Safari).

Esta guía la siguen `disenador-ui`, `revisor-visual`, `revisor-movimiento` y `ux-accesibilidad`. Se decide una vez; solo cambia si cambia la identidad visual. **Solo tema claro** (no hay modo oscuro en v1).

Los contrastes de este documento están **calculados** con la fórmula de luminancia relativa de WCAG 2.1 (ver sección 6), no estimados.

**Qué cambió en la v1.1** (decisiones del usuario del 09/11/2026): Brightspace (D2L) pasa a ser el referente principal (sección 7); el diseño es **uno solo** para inicial, primaria y secundaria (principio 7); el aula usa **fotografías de bancos libres** con reglas de privacidad, contraste y formato (sección 2.8); la tarjeta de curso, la cabecera de curso y el inicio pasan a llevar imagen (4.2, 4.3 y 4.4); y hay un **patrón de login completo** (4.9). Todo lo demás de la v1.0 (paleta, contrastes, barra inferior, pendientes primero, estilo cálido) se mantiene.

---

## 0. Decisiones del usuario que gobiernan esta guía

| # | Decisión | Dónde se aplica |
|---|---|---|
| 1 | Inicio del estudiante: **pendientes primero** (tareas por vencer y avisos arriba, cursos debajo), estilo Canvas | 4.3 |
| 2 | Móvil: **barra inferior fija** (Inicio, Cursos, Notas, Avisos según rol). Escritorio: **sidebar marrón** actual | 3 |
| 3 | Estilo **cálido y amigable** (tipo Google Classroom): tarjetas de curso con color, más redondeado, cercano para estudiantes pequeños, **siempre sobre marrón `#592719` y dorado `#ffcc00`** | 1, 2 |
| 4 | Tipografía del grupo: **Lexend** (títulos) y **Source Sans 3** (texto), commit `114011e` de `origin/features/david` | 2.2 |
| 5 | Primera maqueta: inicio por rol (estudiante, docente, apoderado) y curso por dentro (encabezado, pestañas, clases, materiales, tareas) | 4 |
| 6 | **Brightspace (D2L)** es el referente principal para los tres niveles del colegio; los demás referentes son secundarios (09/11/2026) | 7 y los patrones 3, 4.2 a 4.4 |
| 7 | **Diseño unificado:** el mismo diseño para inicial, primaria y secundaria; nada personalizado por nivel; el nivel solo es un dato ("3.° Primaria") | 1 (principio 7), 4.1 |
| 8 | **Imágenes:** fotografías e ilustraciones de bancos libres (Unsplash, Pexels) en login, portadas de curso, inicio y avisos, con reglas de privacidad (Ley 29733), contraste y formato | 2.8, 4.2 a 4.4, 4.8 |
| 9 | **Login completo** al estilo Brightspace/colegio: foto, escudo, nombre del colegio, bienvenida, código de usuario y contraseña, recuperación y pie institucional; respeta el trabajo de David (`114011e`) | 4.9 |

---

## 1. Principios

1. **Lo que debo hacer hoy, lo veo primero.** Un estudiante de 11 años encuentra su tarea pendiente en **dos toques** desde que abre el aula: abrir el aula (ya ve "Para hacer") → tocar la tarea. Un apoderado ve las novedades de su hijo/a **sin navegar**. En 360 × 640 px la primera tarea se ve sin desplazarse, aunque haya un aviso arriba.
2. **Cálido, no infantil.** Esquinas redondeadas, color en los cursos, fotografías cálidas, frases cortas en tono de "tú". Pero sin mascotas ni confeti: el mismo aula la usan estudiantes de 17 años y docentes con poca experiencia digital (RNF-25). La alegría viene del color, la forma y la fotografía, no de adornos.
3. **Marca primero, color de curso después.** Estructura, botones principales y navegación van en marrón/dorado/neutros. El color de curso aparece **solo** como identificador de contenido de un curso (barra bajo la imagen, franja, punto, pestaña activa). Nunca como color de acción.
4. **Nada depende solo del color.** Estado, urgencia, curso y rol siempre llevan **texto o icono** además de color (RNF-26). Un daltónico debe poder distinguir "vencida" de "pendiente" y "Matemática" de "Comunicación".
5. **Igual de cómodo en un celular de 360 px que en escritorio.** Se diseña primero en 360 px; todo objetivo táctil mide **≥ 44 × 44 px**; ninguna pantalla pide scroll horizontal (salvo tablas de notas, con primera columna fija).
6. **Predecible y tranquilo.** Mismos patrones en todo el aula, poco movimiento, sin sorpresas. Ajustes de dirección (interpretación de los dials de taste-skill, que no está instalada): **VARIANCE 3/10, MOTION 2/10, DENSITY 5/10** (6/10 en tablas de notas del docente).
7. **Un solo diseño para todo el colegio.** Inicial, primaria y secundaria usan **las mismas pantallas, los mismos componentes, la misma paleta, la misma tipografía y las mismas imágenes de área**. No hay temas, mascotas, iconos, colores ni textos "para pequeños" o "para mayores". El nivel aparece **solo como dato** ("3.° Primaria", "2.° Secundaria") con el mismo estilo de texto que cualquier otro metadato. Quien necesite más ayuda (un niño pequeño) la recibe por la claridad del diseño único y por el apoderado, no por una variante visual.
8. **La fotografía acompaña, no informa.** Las imágenes dan calidez e identifican el área (como el banner de Brightspace), pero **nunca son la única forma de saber algo**: el nombre del curso, el estado y el plazo siempre van en texto. Todas son decorativas (`alt=""`), no muestran personas identificables y el texto que se coloca encima siempre cumple AA gracias al velo de 2.8.3.

---

## 2. Tokens

Los tokens institucionales viven en `apps/web/app/tokens.css` (capas: marca → tailwind → shadcn). En componentes se usan **utilidades o variables semánticas, nunca HEX sueltos**. Esta guía solo **añade** tokens (secciones 2.1.3, 2.4, 2.5, 2.6 y 2.8.3) y **propone dos correcciones de contraste** (2.1.2); la marca no cambia.

### 2.1 Color

#### 2.1.1 Tokens existentes y su uso

| Token (utilidad) | Valor | Uso |
|---|---|---|
| `brand` | `#592719` | Sidebar, botón primario, títulos destacados, enlaces, ítem activo |
| `brand-dark` | `#431c12` | Hover del botón primario; texto sobre dorado; **color del velo sobre fotografías** (2.8.3) |
| `brand-soft` | `#f4eae5` | Fondo de ítem activo, hover de botón outline, chips de marca |
| `gold` | `#ffcc00` | **Solo como relleno** con texto `brand-dark`, o sobre marrón. Acento de "hoy", avisos, indicador del sidebar |
| `gold-dark` | `#e6b800` | Hover del botón dorado |
| `gold-soft` | `#fff8d6` | Fondo de avisos institucionales |
| `canvas` | `#f7f8fa` | Fondo de página |
| `surface` | `#ffffff` | Tarjetas, barra inferior, formularios |
| `surface-2` | `#f2f4f7` | Fondos de grupo, skeleton, cabecera de tabla |
| `row-hover` | `#f8f5f2` | Hover de fila |
| `ink` | `#20242c` | Texto principal |
| `ink-2` | `#5f6877` | Texto secundario (metadatos, descripciones) |
| `ink-3` | `#697386` | Texto terciario, **solo sobre `surface`** hasta aplicar 2.1.2 |
| `ink-disabled` | `#98a2b3` | Solo elementos deshabilitados (exentos de contraste) |
| `line` | `#e4e7ec` | Divisores y bordes decorativos de tarjeta |
| `line-field` | `#cdd3dc` | Borde de campos (ver corrección 2.1.2) |
| `line-active` / `ring` | `#8b5238` | Foco, borde de campo activo |
| `success` / `warning` / `danger` / `info` (+ `-soft`) | ver `tokens.css` | Estados; siempre con `-soft` de fondo, icono y texto |

**Reglas de uso del dorado** (el dorado sobre blanco mide 1,51:1 y sobre `canvas` 1,42:1, **no cumple** ni como texto ni como indicador no textual):
- Permitido: relleno dorado con texto `brand-dark` (9,83:1); dorado sobre marrón (8,03:1); fondo `gold-soft` con texto `brand-dark` (13,90:1).
- Prohibido: texto dorado sobre blanco/gris, subrayado dorado sobre blanco, borde dorado como única señal de selección sobre fondo claro.
- **Prohibido también texto dorado sobre fotografía**, aunque lleve velo: en el peor caso mide 3,23:1 (sección 6.1). Sobre fotografías el texto es **siempre blanco al 100 %**; el dorado solo puede ser un relleno de botón o una línea decorativa.

#### 2.1.2 Correcciones de contraste propuestas (requieren al dueño de `tokens.css`)

El marrón y el dorado **no se tocan**. Se proponen estos dos ajustes porque hoy incumplen WCAG 2.1 AA:

| Token | Hoy | Problema (calculado) | Propuesta | Resultado |
|---|---|---|---|---|
| `--ink-3` | `#697386` | 4,49:1 sobre `canvas` y 4,33:1 sobre `surface-2` (< 4,5:1) | `#667085` | 4,97 sobre `surface`; 4,68 sobre `canvas`; 4,51 sobre `surface-2` |
| `--line-field` | `#cdd3dc` | 1,51:1 sobre `surface`: el borde del campo no se distingue (WCAG 1.4.11 pide 3:1) | `#848ea0` | 3,30 sobre `surface`; 3,11 sobre `canvas`; 3,00 sobre `surface-2` |

Mientras no se apliquen: `ink-3` solo sobre `surface` blanco, y los campos llevan además fondo `surface` y borde de 1 px más etiqueta visible. `ink-disabled` (2,58:1) es aceptable solo porque WCAG exime a los elementos deshabilitados; nunca para texto informativo.

#### 2.1.3 Paleta secundaria: colores de curso

Nueve colores terrosos y apagados, elegidos para convivir con el marrón y el dorado (matices cálidos y de bosque, sin neones), más **cacao** (la propia marca) **reservado a contenido institucional** (anuncios del colegio, cabeceras sin curso). Un curso **nunca** recibe cacao.

Cada color de curso tiene dos tonos:
- `solid`: barra de color bajo la imagen, punto, pestaña activa, y **fondo de reserva** de la cabecera y de la tarjeta cuando la imagen no existe o no carga (2.8.6). **Texto blanco encima** solo cuando el fondo es este color plano (≥ 6:1).
- `soft`: el `solid` al 12 % sobre blanco. Fondo de chips y de fila resaltada. **Texto `ink` encima** (≥ 12,8:1) o el propio `solid` como texto (≥ 5,05:1).

Contrastes calculados (WCAG 2.1; umbral texto normal 4,5:1):

| Orden | Nombre | `solid` | Blanco sobre `solid` | `soft` | `ink` sobre `soft` | `solid` sobre `soft` | `solid` sobre blanco |
|---|---|---|---|---|---|---|---|
| 1 | Terracota | `#a3472b` | 6,01 | `#f4e9e6` | 13,07 | 5,05 | 6,01 |
| 2 | Azul | `#2d5ba6` | 6,65 | `#e6ebf4` | 13,00 | 5,56 | 6,65 |
| 3 | Bosque | `#1c6a46` | 6,56 | `#e4ede9` | 13,03 | 5,50 | 6,56 |
| 4 | Ciruela | `#7a3a69` | 7,96 | `#efe7ed` | 12,83 | 6,57 | 7,96 |
| 5 | Ocre | `#7a5600` | 6,65 | `#efebe0` | 13,06 | 5,58 | 6,65 |
| 6 | Turquesa | `#0e6a70` | 6,34 | `#e2edee` | 13,02 | 5,30 | 6,34 |
| 7 | Vino | `#a03556` | 6,69 | `#f4e7eb` | 12,94 | 5,57 | 6,69 |
| 8 | Oliva | `#56681c` | 6,19 | `#ebede4` | 13,16 | 5,24 | 6,19 |
| 9 | Índigo | `#4a4a9c` | 7,63 | `#e9e9f3` | 12,90 | 6,33 | 7,63 |
| inst. | Cacao (marca) | `#592719` | 12,15 | `#ebe5e3` | 12,48 | 9,75 | 12,15 |

El orden alterna cálidos y fríos para que **dos cursos consecutivos del listado se distingan**.

**Asignación (sin tocar la base de datos).** El color se deriva del `course.id` (no del curso-sección), de modo que el mismo curso tiene el mismo color para todos (docente, estudiante, apoderado) y en todas las secciones:

```ts
// apps/web/lib/course-color.ts (a crear por disenador-ui)
const COURSE_COLORS = ['terracota','azul','bosque','ciruela','ocre','turquesa','vino','oliva','indigo'] as const;
export function courseColor(courseId: string): (typeof COURSE_COLORS)[number] {
  let h = 5381;
  for (let i = 0; i < courseId.length; i++) h = ((h << 5) + h + courseId.charCodeAt(i)) >>> 0;
  return COURSE_COLORS[h % COURSE_COLORS.length];
}
```

Dos cursos distintos pueden coincidir en color: por eso **el color nunca es la única señal** (siempre va el nombre del curso). La **imagen** (área, 2.8.4) es independiente del color: el color sale del `course.id`; la imagen, del nombre del curso. Si el colegio quiere elegir color o área por curso, requiere un campo nuevo (decisión abierta, sección 9).

**Reglas del color de curso:**
- Texto blanco sobre `solid` solo si el fondo es el color **plano**. Prohibido poner texto sobre el patrón decorativo: con un 18 % de blanco encima, el contraste del texto blanco baja a 4,1–4,4 (por ejemplo, Terracota 4,17, Oliva 4,14) y deja de cumplir.
- Patrón decorativo opcional del fondo de reserva (círculos o curvas): blanco al **10 %** como máximo, en el borde derecho, `aria-hidden`, lejos del texto. No se usa encima de fotografías.
- La inicial del curso (solo en el fondo de reserva sin imagen) va en un círculo con **borde** blanco al 40 % y **sin relleno**, texto blanco sobre el color plano.
- Como contorno/icono/barra sobre `canvas` o blanco, `solid` cumple 3:1 en todos (mínimo 5,66).
- En el sidebar marrón, el punto de color de cada curso es **decoración** (contrasta 1,5–2,0:1 con el marrón): el nombre en texto blanco es quien identifica al curso.

**CSS a añadir** (lo aplica el dueño de `tokens.css`; los HEX no se repiten en componentes):

```css
:root {
  --course-terracota: #a3472b;  --course-terracota-soft: #f4e9e6;
  --course-azul:      #2d5ba6;  --course-azul-soft:      #e6ebf4;
  --course-bosque:    #1c6a46;  --course-bosque-soft:    #e4ede9;
  --course-ciruela:   #7a3a69;  --course-ciruela-soft:   #efe7ed;
  --course-ocre:      #7a5600;  --course-ocre-soft:      #efebe0;
  --course-turquesa:  #0e6a70;  --course-turquesa-soft:  #e2edee;
  --course-vino:      #a03556;  --course-vino-soft:      #f4e7eb;
  --course-oliva:     #56681c;  --course-oliva-soft:     #ebede4;
  --course-indigo:    #4a4a9c;  --course-indigo-soft:    #e9e9f3;
  --course-cacao:     var(--brand); --course-cacao-soft: #ebe5e3;
}
/* En la tarjeta: style={{ '--course': 'var(--course-azul)', '--course-soft': 'var(--course-azul-soft)' }} */
```

#### 2.1.4 Colores de estado de entrega (RF-38)

Los seis estados visibles. Chip con **icono + texto**; fondo `-soft` y texto del color de estado (todos ≥ 4,9:1):

| Estado | Chip | Color | Icono (lucide) | Contraste |
|---|---|---|---|---|
| Pendiente | "Pendiente" | `info` / `info-soft` | `Circle` | 6,18 |
| Entregada | "Entregada" | `success` / `success-soft` | `CircleCheck` | 4,90 |
| Entregada con retraso | "Entregada con retraso" | `warning` / `warning-soft` | `Clock` | 6,22 |
| No entregada (NE) | "No entregada" | `danger` / `danger-soft` | `CircleX` | 5,76 |
| Calificada | "Calificada · 16/20" | `brand` / `brand-soft` | `Award` | 10,26 |
| Exonerada | "Exonerada" | `ink-2` / `surface-2` | `MinusCircle` | 5,11 |

Modificador de urgencia sobre una tarea **Pendiente**: "Vence hoy" (`warning`), "Vencida" (`danger`), "Vence mañana" (`warning`). El texto de plazo se escribe siempre en palabras (4.3).

Las notas son de 0 a 20. **No se colorea la nota por umbral** (rojo si < 11, etc.) en v1: la regla de aprobación no está definida en los documentos; se decide con el colegio (sección 9). La nota se muestra **tal como la entrega la API**; el diseño no inventa una escala distinta por nivel (principio 7).

### 2.2 Tipografía

| Rol | Fuente | Dónde se carga |
|---|---|---|
| Títulos (h1–h6, `CardTitle`, cifras de nota) | **Lexend** | `--font-lexend` → `--font-heading` (ya en `apps/web/app/layout.tsx` y `globals.css` por el commit `114011e`) |
| Texto, controles, tablas | **Source Sans 3** | `--font-source-sans-3` → `--font-sans` |
| Código/identificadores (solo admin) | Geist Mono | `--font-geist-mono` (ya cargada) |

Lexend se diseñó para facilitar la lectura (fluidez en lectores principiantes); Source Sans 3 es sobria y legible en tablas. Ambas cubren las tildes y la ñ del subconjunto `latin`.

**Escala** (móvil → escritorio ≥ 768 px). Cuerpo de **16 px** (no 14): estudiantes pequeños y celulares. Los componentes shadcn traen `text-sm` (14 px) por defecto; se reservan para metadatos y tablas.

| Nivel | Fuente · peso | Móvil | Escritorio | Uso |
|---|---|---|---|---|
| Saludo / display | Lexend 600 | 24/32 | 28/36 | Solo "Hola, Valeria" en el banner del inicio; lema del login en escritorio (36/44) |
| H1 | Lexend 600 | 22/30 | 24/32 | Título de página y de curso (uno por página) |
| H2 | Lexend 600 | 18/26 | 20/28 | Secciones y widgets ("Para hacer", "Mis cursos") |
| H3 / título de tarjeta | Lexend 500 | 17/24 | 17/24 | `CardTitle`, título de tarea o material |
| Cuerpo | Source Sans 3 400 | 16/24 | 16/24 | Texto general, descripciones, formularios |
| Cuerpo destacado | Source Sans 3 600 | 16/24 | 16/24 | Énfasis dentro de un párrafo |
| Pequeño | Source Sans 3 400/600 | 14/20 | 14/20 | Metadatos, tablas, ayudas de campo |
| Etiqueta / chip | Source Sans 3 600 | 12/16 | 12/16 | Chips, etiqueta de la barra inferior, contadores. **12 px es el mínimo absoluto** |

Reglas: líneas de texto corrido ≤ 70 caracteres; sin cursiva ni mayúsculas forzadas; cifras de nota y fechas con `tabular-nums`; interlineado ≥ 1,5 en cuerpo; el texto debe poder ampliarse al 200 % sin perder contenido (WCAG 1.4.4). Texto sobre fotografías: blanco, opaco y nunca por debajo de 14 px.

### 2.3 Espaciado

Rejilla base de **4 px** (utilidades Tailwind `1 = 4 px`).

| Token | px | Uso típico |
|---|---|---|
| `1`–`2` | 4–8 | Entre icono y texto; dentro de chips |
| `3` | 12 | Entre elementos de una fila |
| `4` | 16 | Margen de página en móvil; relleno de tarjeta; entre campos |
| `6` | 24 | Margen de página en ≥ 768 px; entre tarjetas |
| `8` | 32 | Margen de página en ≥ 1024 px; entre secciones |
| `12`–`16` | 48–64 | Espacio entre bloques grandes, altura de la barra inferior |

Ancho máximo del contenido: **72 rem** (inicios y listas de cursos), **48 rem** (lectura, tarea, formularios), tablas a todo el ancho disponible.

Puntos de quiebre: los de Tailwind (`sm 640`, `md 768`, `lg 1024`, `xl 1280`). **`md` es el punto en que cambia la navegación** (debajo: barra inferior; desde `md`: sidebar).

### 2.4 Radios

Más redondeado que el actual. Se propone subir la base `--radius` de `0.625rem` (10 px) a **`0.875rem` (14 px)** en `globals.css`; todos los componentes shadcn derivan de ella (`sm`=0,6×, `md`=0,8×, `lg`=1×, `xl`=1,4×, `2xl`=1,8×).

| Elemento | Utilidad | Radio resultante |
|---|---|---|
| Chips, avatares, barra inferior (píldora del ítem activo), indicadores | `rounded-full` | completo |
| Botones, campos, selects, miniatura de aviso | `rounded-lg` | 14 px |
| Tarjetas, avisos, widgets, tablas contenedoras | `rounded-xl` | ≈ 20 px |
| **Tarjeta de curso**, banners (inicio y curso), tarjeta de login, diálogos | `rounded-2xl` | ≈ 25 px |

### 2.5 Sombras

Sombras suaves teñidas de marrón (no gris azulado), pocas. El `Card` de shadcn usa `ring-1 ring-foreground/10`; se conserva y se añade sombra solo donde se indica.

```css
:root {
  --shadow-card:   0 1px 2px rgb(89 39 25 / 6%), 0 2px 8px rgb(89 39 25 / 6%);
  --shadow-raised: 0 4px 12px rgb(89 39 25 / 10%), 0 12px 32px rgb(89 39 25 / 8%);
  --shadow-nav:    0 -2px 12px rgb(89 39 25 / 8%);
}
```

| Nivel | Uso |
|---|---|
| `--shadow-card` | Tarjetas de curso, widgets y avisos en reposo |
| `--shadow-raised` | Hover/foco de tarjeta de curso, menús, popovers, diálogos, **tarjeta de login** |
| `--shadow-nav` | Barra inferior móvil |

### 2.6 Movimiento (MOTION baja)

El movimiento **explica un cambio de estado**, no decora. Solo se animan `transform`, `opacity`, `background-color`, `box-shadow`.

| Token | Valor | Uso |
|---|---|---|
| `--motion-fast` | 120 ms | Hover, pulsación, cambio de color |
| `--motion-base` | 200 ms | Aparición de tarjetas, acordeones, indicador de pestaña |
| `--motion-slow` | 300 ms | Diálogos y hojas (`Sheet`) |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Cambios dentro de la pantalla |
| `--ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | Elementos que entran |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elementos que salen (usa 70 % de la duración de entrada) |

Efectos permitidos: elevación de 2 px + `--shadow-raised` al pasar el cursor sobre una tarjeta de curso; pulsación `translateY(1px)` (ya está en `Button`); aparición con `opacity` y 8 px de desplazamiento; skeleton con pulso suave. **Prohibido:** parpadeos, rebotes, parallax, animaciones infinitas fuera del skeleton, cualquier efecto que dure más de 300 ms. **Las fotografías no se animan** (sin zoom lento, sin Ken Burns, sin carruseles, sin parallax): una imagen es estática.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 2.7 Iconografía

Solo `lucide-react` (ya instalada): trazo 1,75–2 px, 20 px en texto, 24 px en la barra inferior, 32 px dentro de círculos de estado vacío. Los iconos decorativos llevan `aria-hidden="true"`; los que son el único contenido de un botón llevan `aria-label`. Los mismos iconos para todos los niveles (principio 7).

### 2.8 Imágenes (fotografías e ilustraciones de bancos libres)

Las imágenes dan calidez e identifican el área, al estilo del banner de curso de Brightspace (sección 7). Esta sección define **reglas y la lista de imágenes**; quien descarga las fotografías las revisa con la lista de 2.8.2 y completa el registro de 2.8.7.

#### 2.8.1 Origen y licencia

- Bancos permitidos: **Unsplash** y **Pexels**. Ambas licencias permiten uso gratuito, comercial y sin atribución obligatoria. Unsplash: https://unsplash.com/license (no se pueden vender sin modificación sustancial ni recopilar para crear un servicio competidor). Pexels: https://www.pexels.com/license/ (las personas identificables no pueden aparecer de forma negativa, no se puede insinuar que respaldan el producto, y no se redistribuye como banco de fotos).
- **Las licencias no garantizan que existan autorizaciones (releases) de las personas retratadas ni de las marcas que aparezcan**; no se debe asumir que existen. Por eso la regla de 2.8.2 (sin rostros identificables) es la que protege al colegio, no la licencia.
- Se conserva el **registro de origen** de cada imagen (2.8.7): enlace de la página, autor, banco, fecha de descarga y licencia vigente ese día. Una imagen sin registro no se usa.
- Esta guía no certifica cumplimiento legal; la validación con la institución sigue pendiente (como en `docs/05_AUTORIZACION.md`). Cuando el colegio tenga fotografías propias con las autorizaciones de los apoderados, **reemplazan** a estas con el mismo nombre de archivo.

#### 2.8.2 Qué se acepta y qué no (Ley 29733, protección de menores)

La imagen de una persona identificable es un dato personal, y el aula es un espacio de menores. Regla: **ninguna fotografía con rostros identificables**, ni de menores ni de adultos.

| Se acepta | No se acepta |
|---|---|
| Objetos, útiles, materiales, espacios vacíos, paisajes, arquitectura | Rostros reconocibles (de frente o de perfil nítido), menores o adultos |
| Personas **de espaldas**, en silueta, recortadas a manos o piernas, o con rostro desenfocado de forma que no sea identificable | Niños en uniforme de otro colegio, nombres o placas legibles, credenciales |
| Manos trabajando (escribir, pintar, experimentar) | Logotipos o marcas visibles, pantallas con interfaces reconocibles, marcas de agua |
| Tonos cálidos (marrones, ocres, dorados) que combinan con la marca | Texto legible superpuesto en la foto (se confunde con el texto de la interfaz); se tolera un alfabeto o fórmulas genéricas |
| Composición tranquila en la zona donde irá el texto (2.8.5) | Imágenes que sugieran violencia, riesgo, consumo de alcohol o tabaco, o contenido político o partidario |
| Ilustraciones vectoriales abstractas y neutras (si no hay buena fotografía) | Ilustraciones de personajes infantiles o "mascotas" (principio 7: no hay variante por nivel) |

Revisión previa a usar cada imagen (quien descarga marca la casilla en el registro): sin rostros, sin texto legible, sin logos, ajustada al motivo, tonos compatibles, licencia verificada, metadatos eliminados.

#### 2.8.3 Velo (overlay) para texto sobre fotografía

Una fotografía no tiene contraste garantizado: puede ser casi blanca justo donde cae el texto. Se resuelve con un **velo** del color `brand-dark` (`#431c12`, tinta marrón que mantiene la calidez) sobre la imagen, y el texto es **siempre blanco al 100 %**.

**Cálculo (peor caso).** Como el texto es blanco, cuanto más oscuro el fondo, más contraste. El peor fondo posible es un píxel de la foto **blanco puro** (#ffffff). Si el texto cumple sobre ese píxel con el velo, cumple sobre **cualquier** fotografía. El velo se mezcla con la foto en sRGB (como lo hace el navegador). Resultado para el velo `brand-dark` de opacidad `a` sobre blanco puro:

| Opacidad del velo | Color resultante (peor caso) | Blanco sobre él | Cumple |
|---|---|---|---|
| 50 % | `#a18d88` | 3,13 | Solo texto grande (≥ 24 px, o ≥ 18,66 px en negrita) |
| 55 % | `#98827d` | 3,61 | Solo texto grande |
| 60 % | `#8e7771` | 4,18 | No (texto normal) |
| 63 % | `#89706a` | 4,59 | Sí (límite) |
| **65 %** | `#856b65` | **4,88** | **Sí, texto normal. Mínimo de la guía** |
| 70 % | `#7b6059` | 5,72 | Sí |
| 80 % | `#694941` | 7,98 | Sí |

(Con un velo negro puro el mínimo sería ≈ 53,5 %; se usa `brand-dark` por la calidez de marca y por eso el mínimo sube a 65 %.)

**Regla de la guía:** en toda zona donde haya texto sobre fotografía, el velo es **≥ 65 %**. El título del banner (22–24 px, 600) calificaría como texto grande con 50 %, pero el subtítulo de 14 px no; se aplica 65 % a toda la zona para no depender del tamaño.

**Dónde cae el texto y cómo se aplica:**

| Pieza | Zona de texto | Velo |
|---|---|---|
| Banner de curso e inicio, móvil (< 768 px) | Todo el ancho | Uniforme **70 %** |
| Banner de curso e inicio, ≥ 768 px | Primer 60 % del ancho (título, subtítulo). A la derecha solo botones, que llevan su propio fondo | Degradado horizontal: 72 % → **65 % al 60 % del ancho** → 35 % al borde |
| Login, panel de foto en ≥ 1024 px | Todo el panel (nombre, lema, pie) | Degradado vertical: 68 % hasta la mitad, 82 % abajo |
| Login, banda de foto en < 1024 px | Todo el ancho | Uniforme **70 %** |
| Tarjeta de curso, miniatura de aviso | **Ninguna: no hay texto encima** | Sin velo (la imagen es decorativa y el texto va sobre blanco debajo) |

```css
:root {
  --scrim-70:      color-mix(in srgb, var(--brand-dark) 70%, transparent);
  --scrim-banner:  linear-gradient(90deg,
                     color-mix(in srgb, var(--brand-dark) 72%, transparent) 0%,
                     color-mix(in srgb, var(--brand-dark) 65%, transparent) 60%,
                     color-mix(in srgb, var(--brand-dark) 35%, transparent) 100%);
  --scrim-login:   linear-gradient(180deg,
                     color-mix(in srgb, var(--brand-dark) 68%, transparent) 0%,
                     color-mix(in srgb, var(--brand-dark) 68%, transparent) 50%,
                     color-mix(in srgb, var(--brand-dark) 82%, transparent) 100%);
}
/* móvil: background: var(--scrim-70); desde md: background: var(--scrim-banner); */
```

Reglas adicionales sobre fotografías:
- El texto es blanco **opaco** (`text-white`), no `text-white/80`: una transparencia sobre una foto no tiene contraste garantizado.
- Nada de `text-shadow` como sustituto del velo.
- El **foco** sobre una zona con velo es un anillo **blanco** de 2 px con separación de 2 px (blanco sobre el peor caso del velo: 4,88:1 ≥ 3:1).
- Botones sobre la foto: `Button` dorado (texto `brand-dark`, 9,83:1; el borde dorado contra el peor fondo con velo mide 3,23:1, cumple 3:1 de componentes) o blanco con texto `ink`. Nunca botones "fantasma" transparentes.
- El escudo del colegio sobre una foto va siempre dentro de un **círculo blanco** (`bg-white`, `rounded-full`, relleno 4 px).

#### 2.8.4 Lista de imágenes necesarias

Carpeta de trabajo actual: `apps/web/public/maqueta/img/`. Para producción ver 2.8.8. Todas en **WebP**.

| Archivo | Uso | Dimensiones | Relación | Peso máx. | Motivo sugerido (sin rostros) |
|---|---|---|---|---|---|
| `login.webp` | Fondo del login (panel o banda) | 1920 × 1280 | 3:2 | 220 KB | El propio colegio de día, patio o aula vacía con luz natural; o útiles sobre un pupitre. Preferible una foto real del colegio (con autorización) |
| `inicio.webp` | Banner del inicio (los tres roles) | 1920 × 640 | 3:1 | 150 KB | Mochilas o útiles sobre un escritorio, estante con libros, luz cálida de mañana |
| `curso-matematica.webp` | Banner y tarjeta del área Matemática | 1920 × 640 | 3:1 | 150 KB | Regla, compás, cuaderno cuadriculado, figuras geométricas de madera |
| `curso-comunicacion.webp` | Área Comunicación | 1920 × 640 | 3:1 | 150 KB | Libros abiertos, lápices y cuaderno, biblioteca, manos escribiendo |
| `curso-ciencia.webp` | Área Ciencia y Tecnología | 1920 × 640 | 3:1 | 150 KB | Microscopio, probetas, plántula germinando, globo terráqueo |
| `curso-personal-social.webp` | Área Personal Social | 1920 × 640 | 3:1 | 150 KB | Mapa, globo terráqueo, manos juntas sin rostros, siluetas o personas de espaldas |
| `curso-arte.webp` | Área Arte | 1920 × 640 | 3:1 | 150 KB | Pinceles, témperas, paleta de colores, arcilla |
| `curso-educacion-fisica.webp` | Área Educación Física | 1920 × 640 | 3:1 | 150 KB | Balones, zapatillas, cancha vacía, cuerda |
| `curso-ingles.webp` | Área Inglés | 1920 × 640 | 3:1 | 150 KB | Alfabeto en letras sueltas, libro, auriculares, mapamundi |
| `curso-religion.webp` | Área Religión | 1920 × 640 | 3:1 | 150 KB | Vitral, velas, Biblia abierta, rosario o manos juntas sin rostros. Motivo sobrio y coherente con la identidad del colegio; validar con la dirección |
| `aviso.webp` | Miniatura del aviso institucional | 800 × 800 | 1:1 | 60 KB | Tablero de corcho vacío, campana escolar o pizarra sin texto |

Total aproximado: ≤ 1,6 MB para las 11. **El mismo archivo** `curso-*.webp` sirve a la tarjeta de curso (recorte 3:1) y a la cabecera del curso (recorte más ancho): no se piden dos versiones.

**Asignación por área.** La imagen sale del **nombre del curso**, no de la base de datos. Función a crear por `disenador-ui`:

```ts
// apps/web/lib/course-area.ts
export type CourseArea = 'matematica' | 'comunicacion' | 'ciencia' | 'personal-social'
  | 'arte' | 'educacion-fisica' | 'ingles' | 'religion';

export function courseArea(courseName: string): CourseArea | null {
  const n = courseName.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (/educacion fisica|psicomotri/.test(n)) return 'educacion-fisica'; // antes que "fisica" de ciencia
  if (/matemat/.test(n)) return 'matematica';
  if (/comunicaci|lenguaje|literatura/.test(n)) return 'comunicacion';
  if (/ciencia|tecnolog|biolog|quimic|fisica/.test(n)) return 'ciencia';
  if (/personal social|desarrollo personal|ciudadan|civica|historia|geograf|economia/.test(n)) return 'personal-social';
  if (/arte|musica|dibujo/.test(n)) return 'arte';
  if (/ingles|english/.test(n)) return 'ingles';
  if (/religi/.test(n)) return 'religion';
  return null; // sin imagen: fondo de reserva de color de curso (2.8.6)
}
// ruta: `/img/curso-${area}.webp`
```

Un curso fuera de las ocho áreas (por ejemplo, "Educación para el Trabajo") **no recibe imagen**: usa el fondo de reserva de color. No se inventa una imagen genérica.

#### 2.8.5 Formato, tamaño y composición

- **Formato:** WebP, calidad 75–80, sRGB, **sin metadatos** (se eliminan EXIF y GPS al exportar). No se sube JPG/PNG a producción.
- **Dimensiones** de la tabla 2.8.4, ya recortadas. Los banners son 3:1 porque se muestran recortados: 360 × 128 px en móvil (≈ 2,8:1), hasta 1152 × 168 px en escritorio (≈ 6,9:1). Brightspace recomienda para su banner 2400 × 960 px (2,5:1) según una guía universitaria (sección 7); nuestro 1920 × 640 es más ligero y suficiente para 1152 px de ancho en pantallas de densidad 1,5 a 1,7.
- **Zona segura:** el motivo importante debe estar dentro de la **franja central del 35 % de alto**; se muestra con `object-fit: cover` y `object-position: center 40 %`. Lo de arriba y abajo puede perderse.
- **Composición para el texto:** el texto cae a la izquierda (2.8.3). El motivo principal va en el **tercio derecho o central**; la zona izquierda debe ser tranquila (poco detalle, sin bordes duros).
- **Peso** máximo de la tabla 2.8.4. Con `next/image`, usar `sizes` (por ejemplo `(min-width: 1280px) 1152px, 100vw`) y `priority` solo en la imagen que es el primer elemento visible (banner o login); el resto, carga diferida. Si el equipo mantiene `unoptimized` (como el logo del login actual), el peso del archivo es el presupuesto real.
- **Nunca** se incrusta texto, logotipo ni escudo dentro de la imagen.

#### 2.8.6 Texto alternativo y fallos de carga

**Todas las imágenes de esta sección son decorativas: `alt=""`.** El nombre del curso, el estado y el aviso están siempre en texto al lado, así que describir la foto agregaría ruido a un lector de pantalla (WCAG 1.1.1, imágenes decorativas). Excepción única: el **escudo** (`alt="Colegio Mater Christi"`).

Si algún día una imagen pasa a informar (por ejemplo, un aviso con la foto de un evento), lleva `alt` en español, ≤ 125 caracteres, que describa el contenido sin comenzar con "imagen de" ni "foto de".

**Fallo de carga o curso sin área:** el contenedor tiene siempre `background-color: var(--course)` (o `var(--brand)` en el login) debajo de la imagen. Sin imagen se ve el color plano con el texto blanco encima (cumple ≥ 6:1, 2.1.3) y, en la tarjeta, la inicial del curso en círculo. No aparece icono de imagen rota ni mensaje de error: la pantalla sigue siendo legible y completa.

#### 2.8.7 Registro de imágenes (completar al descargar)

Cada fila la completa quien descarga. La columna "Descripción interna" es para quien cura el banco; **no es el `alt`** (que es `""`).

| Archivo | Banco | Enlace de origen | Autor | Licencia (fecha de verificación) | Descripción interna | Revisada (2.8.2) |
|---|---|---|---|---|---|---|
| `login.webp` | | | | | | ☐ |
| `inicio.webp` | | | | | | ☐ |
| `curso-matematica.webp` | | | | | | ☐ |
| `curso-comunicacion.webp` | | | | | | ☐ |
| `curso-ciencia.webp` | | | | | | ☐ |
| `curso-personal-social.webp` | | | | | | ☐ |
| `curso-arte.webp` | | | | | | ☐ |
| `curso-educacion-fisica.webp` | | | | | | ☐ |
| `curso-ingles.webp` | | | | | | ☐ |
| `curso-religion.webp` | | | | | | ☐ |
| `aviso.webp` | | | | | | ☐ |

#### 2.8.8 Ubicación en producción (importante para el login)

`apps/web/proxy.ts` redirige a `/login` toda ruta que no sea `api`, `_next/static`, `_next/image`, `favicon.ico`, `icon.png`, `apple-icon.png`, `brand`, `login` ni `recuperar` cuando **no hay cookie de sesión**. Consecuencia: **la foto del login no se cargaría** si vive en `public/img/` o `public/maqueta/img/`, porque la petición de la imagen sería redirigida al login antes de iniciar sesión.

- `login.webp` en producción va en **`apps/web/public/brand/login.webp`** (carpeta `brand` ya exceptuada del proxy). No requiere tocar el proxy.
- Las demás (`inicio`, `curso-*`, `aviso`) van en `apps/web/public/img/` (solo se ven con sesión, no hay problema).
- En la maqueta (`/maqueta/img/…`) ocurre lo mismo sin cookie; el orquestador ya usa una cookie ficticia para verla.

---

## 3. Navegación y estructura

### 3.1 Dos estructuras según ancho

| Ancho | Estructura |
|---|---|
| **≥ 768 px (`md`)** | **Sidebar marrón** actual (shadcn `Sidebar`, 16 rem): marca arriba, grupos por rol, "Mis cursos", cerrar sesión. Barra superior de 48 px con campana. Contenido a la derecha. Sin cambios de comportamiento |
| **< 768 px** | **Barra superior** compacta (56 px: escudo + "Aula Virtual", campana y menú de cuenta con avatar) **más barra inferior fija** con 4 destinos. El sidebar-hoja (hamburguesa) **se retira** para estudiante, docente y apoderado |

La barra superior cumple el papel de la **minibar de Brightspace**: está en todas las páginas, lleva el acceso a Inicio, las alertas con contador y el menú personal (sección 7). El perfil y "Cerrar sesión" van en el **menú de cuenta** (avatar) de la barra superior móvil; en escritorio siguen en el sidebar. **Administrador:** su navegación es larga (7 destinos) y su trabajo es de escritorio; en móvil conserva la hamburguesa y el sidebar-hoja, sin barra inferior.

### 3.2 Barra inferior móvil (decisión 2)

| Rol | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Estudiante | Inicio `/` (`House`) | Cursos (`BookOpen`) | Notas `/mis-notas` (`FileText`) | Avisos `/anuncios` (`Bell`/`Megaphone`) |
| Docente | Inicio `/` | Cursos | Calendario `/calendario` (`CalendarDays`) | Avisos `/anuncios` |
| Apoderado | Inicio `/apoderado` | Notas (`FileText`) | Calendario `/calendario` | Avisos `/anuncios` |

Los docentes no tienen "Notas" global: sus notas están en la pestaña **Registro** de cada curso. El apoderado no tiene "Cursos" navegables; sus notas por curso están en su panel.

Especificación:
- Altura **64 px + `env(safe-area-inset-bottom)`**; `position: fixed`; fondo `surface`; borde superior `line`; `--shadow-nav`; `z-index` por encima del contenido y por debajo de diálogos.
- Cada destino ocupa `flex-1`, **mínimo 44 × 56 px**. Icono de 24 px + **etiqueta siempre visible** (12 px, 600). Nunca solo iconos.
- Inactivo: icono y texto `ink-2` sobre blanco (5,63:1). **Activo:** píldora `brand-soft` de 56 × 32 px tras el icono, icono y texto `brand` en peso 600 (10,26:1), `aria-current="page"`. El estado activo se distingue por **forma (píldora) y peso**, no solo por color.
- Contador de avisos sin leer: círculo `danger` de ≥ 16 px con número blanco (6,57:1), tope "9+", y `<span class="sr-only">` con "3 avisos nuevos".
- Es un `<nav aria-label="Principal">` con `<ul>`; los destinos son enlaces. Foco visible (4.1 y 6.2).
- El contenido lleva `padding-bottom: calc(64px + env(safe-area-inset-bottom) + 16px)` para que nada quede tapado. Las barras de acción fijas (por ejemplo "Entregar") se apoyan **encima** de la barra inferior.
- "Cursos" abre la **lista de todos mis cursos** (tarjetas, 4.2). La ruta `/cursos` **no existe todavía** (decisión abierta, sección 9); la maqueta la asume.

### 3.3 Sidebar de escritorio

Sin cambios de estructura. Ajustes de estilo que sí van:
- Cursos de "Mis cursos" con un **punto de 8 px del color del curso** a la izquierda del nombre (decoración; el nombre identifica).
- Ítem activo: fondo dorado con texto `brand-dark` (9,83:1), como ya define `tokens.css`.
- Radio de los ítems: `rounded-lg` (sube con la base nueva).

### 3.4 Selector de curso (inspirado en el Course Selector de Brightspace)

Dentro de un curso (`/curso/:id/*`) el usuario puede saltar a otro sin volver al inicio. Es la versión sencilla del *Course Selector* de Brightspace (lista de cursos ordenable y con búsqueda en la minibar):

- Botón **"Cambiar de curso"** (`BookOpen`, 44 px, blanco con texto `ink`, sobre el banner del curso, a la derecha en escritorio y debajo del subtítulo en móvil).
- Abre una **hoja** (`Sheet`: lateral en escritorio, inferior en móvil) con la lista de **mis cursos como enlaces** (no un `<select>` que navega al cambiar: eso cambia el contexto sin aviso, WCAG 3.2.2). Cada fila: punto del color del curso, nombre, "3.° Primaria · A", mínimo 56 px de alto. El curso actual lleva `aria-current="page"`.
- Orden v1: **alfabético por nombre**. Si hay más de 8 cursos, campo "Buscar curso" arriba. "Recientes primero" (como Brightspace) y fijar cursos quedan **fuera de v1** (requieren datos de último acceso que la API no entrega).
- Para el apoderado no existe (no tiene pestañas de curso).
- Prioridad media: puede entrar en la segunda iteración; el sidebar de escritorio ya cubre el caso y en móvil la barra inferior lleva a "Cursos".

---

## 4. Patrones de pantalla

### 4.1 Reglas de página

- Cada página: **un solo `<h1>`**, a la izquierda, y las acciones principales a la derecha en escritorio / debajo en móvil. Migas solo en páginas de tercer nivel (por ejemplo, tarea dentro de un curso).
- Fondo `canvas`; el contenido se agrupa en **tarjetas `surface`** (widgets) o en secciones con h2 sobre el fondo.
- Primer elemento siempre **accionable o informativo**: los banners con imagen siempre llevan el título de la página (saludo o nombre del curso), nunca son solo adorno.
- Tono: "tú", frases cortas, verbo claro ("Entregar tarea", "Ver notas"). Errores que dicen qué hacer: "No pudimos subir el archivo. Revisa que sea un PDF de hasta 10 MB y vuelve a intentarlo" (el límite real viene de la configuración, no se inventa en la interfaz).
- Fechas en español de Perú, zona horaria `America/Lima`: "Vence hoy, 11:59 p. m." · "Vence mañana" · "Vence el vie 14 nov". Nunca solo "14/11".
- **El nivel es un dato, no un estilo** (principio 7). Se escribe como texto plano con la misma tipografía y color que el resto del metadato: "3.° Primaria", "2.° Secundaria", "Inicial 4 años"; con sección: "3.° Primaria · A". Prohibido: colores, iconos, insignias, fondos, ilustraciones, tamaños o textos distintos según el nivel; pantallas o rutas distintas por nivel. El formato exacto depende de los datos de grado que exponga la API (decisión abierta 9.1, sección 9).

### 4.2 Tarjeta de curso

Componente central del aula. **Cambia respecto de la v1.0:** ahora es una tarjeta de imagen (como el *tile* del widget "My Courses" de Brightspace: imagen arriba; nombre, código y docente debajo), manteniendo el color de curso y la calidez de Classroom.

```
┌──────────────────────────────┐  rounded-2xl, --shadow-card, borde line
│ [ fotografía del área 3:1 ]  │  alto 112 px, object-cover, alt="", SIN texto encima
│▬▬▬ barra --course de 6 px ▬▬▬│  decorativa: identifica el color del curso
├──────────────────────────────┤  fondo surface
│ Matemática                   │  H3 Lexend 500 17/24, 2 líneas máx. (ink)
│ 3.° Primaria · A             │  14 px ink-2 (el nivel es un dato)
│ Prof. Rosa Quispe            │  14 px ink-2 (estudiante/apoderado) | "28 estudiantes" (docente)
│ [● 2 tareas por entregar]    │  chip soft del color del curso, texto ink; o chip "Al día" (success)
└──────────────────────────────┘  toda la tarjeta es UN enlace (min 44 px), foco con anillo 2 px
```

- **Sin texto sobre la imagen:** el nombre y los metadatos van en el cuerpo blanco, así que **no hace falta velo** y el contraste es el de `ink` sobre `surface` (15,55:1). Es la razón de que la tarjeta no repita el patrón de banner.
- **Sin imagen** (curso fuera de las ocho áreas o fallo de carga): la banda de 112 px es el color plano `--course` con la **inicial del curso** en círculo de borde blanco al 40 % (regla de 2.1.3); sigue sin texto de nombre encima.
- **Un solo enlace** que cubre la tarjeta (`<a>` en el título con `::after` ampliado) → `/curso/:id/clases`. Evita enlaces anidados.
- Contenido del pie por rol: estudiante = tareas por entregar o "Al día"; docente = "12 por calificar" o "Sin pendientes"; apoderado = informativa (sin enlace a curso: el apoderado no tiene pestañas de curso).
- Hover: elevación 2 px y `--shadow-raised` (`--motion-fast`); la imagen **no** se amplía. Foco: anillo `ring` de 2 px con separación de 2 px, **100 % opaco**.
- Cuadrícula: `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))`, hueco de 16 px (móvil) / 24 px. En 360 px, una columna a todo el ancho.
- El color (`--course`) viene de `courseColor(course.id)` (2.1.3); la imagen, de `courseArea(course.name)` (2.8.4). Sin curso asociado (contenido institucional): cacao.
- Imagen con `loading="lazy"` salvo las dos primeras tarjetas visibles.

### 4.3 Inicio por rol

**Anatomía común de widget** (de la *homepage* de Brightspace, que se arma con widgets independientes, sección 7): cada bloque del inicio es una tarjeta `surface` `rounded-xl` con cabecera (h2 a la izquierda y enlace "Ver todo" a la derecha, objetivo táctil de 44 px) y cuerpo. Los widgets son: Para hacer / Por calificar, Avisos, Notas recientes, Mis cursos.

**Banner de inicio (los tres roles, igual para todos los niveles).** Primer elemento de la página, con `inicio.webp`:
- Alto **112 px** móvil / **144 px** escritorio, `rounded-2xl`, la fotografía con `object-position: center 40%` y el velo de 2.8.3 (70 % uniforme en móvil; degradado de 72 → 65 → 35 % desde `md`). Fondo de reserva `--brand`.
- Dentro, el **h1**: estudiante y docente, "Hola, Valeria" (display, blanco), y debajo la fecha de hoy (14 px, blanco). Apoderado: "Panel de Mateo". Una sola línea de saludo; sin ilustración añadida.
- La barra de 4 px dorada decorativa en el borde inferior es opcional; no lleva texto.
- Debe respetar el principio 1: **no empuja "Para hacer" fuera de la pantalla** (a 360 × 640, con aviso incluido, la primera fila de tareas queda visible: 56 barra + 16 + 112 banner + 16 + aviso 88 + 16 + encabezado del widget 48 = 352; la primera fila ocupa 352–416).

#### Estudiante — "pendientes primero" (decisión 1)

Orden vertical en móvil; en escritorio, **dos columnas** (principal 2/3 y lateral 1/3) y los cursos debajo, a todo el ancho.

1. **Banner de inicio** (arriba): "Hola, Valeria" + fecha.
2. **Aviso institucional urgente** (solo si existe): banda `gold-soft`, borde izquierdo de 4 px `brand`, miniatura `aviso.webp` (4.8), icono `Megaphone`, texto `brand-dark`, enlace "Leer aviso". Máximo uno visible; el resto va en Avisos.
3. **Para hacer** (widget principal; h2 + enlace "Ver todas"). Como el *Work To Do* de Brightspace (vencidas arriba, próximas debajo, en todos los cursos), pero agrupada por plazo: *Vencidas* (si hay, en `danger`), *Hoy*, *Esta semana*, *Más adelante* (plegado). **Máximo 5 filas** visibles (Brightspace muestra 6; se baja a 5 para que el siguiente bloque asome en 360 px) y "Ver las 12 restantes". Cada fila:
   - franja vertical de 4 px del color del curso (decorativa) + título de la tarea (H3) + nombre del curso en `ink-2`;
   - plazo en palabras con icono de reloj ("Hoy, 11:59 p. m."), y chip de estado (2.1.4);
   - **toda la fila es un enlace** de mínimo 64 px de alto → la tarea (dos toques desde el inicio).
   - Estado vacío: "¡Estás al día! No tienes tareas pendientes" con icono `PartyPopper`/`CircleCheck` en círculo `success-soft` (una frase, un botón secundario "Ver mis notas").
4. **Avisos** (widget lateral; en móvil va justo después de "Para hacer"): hasta 3 avisos recientes con punto "nuevo" (`brand`, más texto oculto "Nuevo"), curso en chip, fecha y 2 líneas de texto. Enlace "Ver todos los avisos".
5. **Mis cursos** (h2): cuadrícula de tarjetas de curso con imagen (4.2). Debajo de lo pendiente, como decidió el usuario.
6. *(Opcional, segunda iteración)* "Notas recientes": últimas 3 notas con chip *Calificada · 16/20*.

#### Docente

1. **Banner de inicio**: "Hola, Rosa" + fecha.
2. **Por calificar** (principal): entregas esperando nota, **agrupadas por tarea y curso-sección** ("Ensayo 1 · Comunicación · 3.° Primaria A — 12 por calificar", botón "Calificar"). Cada fila ≥ 64 px, enlace a la tarea. Vacío: "No tienes entregas por calificar".
3. **Próximos plazos de mis tareas** (lateral): tareas que vencen pronto, con cuántos ya entregaron ("18 de 28 entregaron"; texto, no solo barra; la barra, si existe, es complemento con 3:1).
4. **Avisos** recientes.
5. **Mis cursos**: tarjetas con pie "12 por calificar" y acción rápida visible en la tarjeta de curso solo en escritorio (**"Nueva tarea"**, botón secundario); en móvil se entra al curso.
6. Acciones de docente (crear, publicar, eliminar) en botones con texto, no solo iconos.

#### Apoderado

Es consulta, no operación: **sin botones de entrega**, lenguaje para adultos, y el nombre del estudiante siempre visible para evitar confusiones. Sigue el modelo del portal de padres de Brightspace (widgets *Work To Do* y *Recent Grades* por hijo, solo lectura).

1. **Banner de inicio** con h1 "Panel de Mateo".
2. **Selector de estudiante** (si tiene más de uno): fila de chips-avatar de ≥ 44 px, con nombre y grado ("Mateo · 1.° Secundaria"); el seleccionado lleva borde `brand`, fondo `brand-soft` y `aria-pressed="true"`. Con un solo hijo/a, solo se muestra el nombre en el h1.
3. **Esta semana** (principal): tareas pendientes del estudiante seleccionado, solo lectura, con chip de estado y plazo.
4. **Notas recientes**: últimas calificaciones con curso, tarea y *Calificada · 16/20* (o NE/Exonerada); enlace "Ver todas las notas".
5. **Avisos** del colegio y de los docentes (RF-32), con punto de "nuevo".
6. **Cursos de Mateo**: tarjetas informativas con imagen (curso, docente, promedio si lo expone la API). Sin enlace a pestañas de curso.
7. Solo se muestran datos del estudiante seleccionado; nunca mezclar hijos en una misma lista sin etiqueta de nombre. Datos de menores: sin DNI ni contactos en pantallas de inicio.

### 4.4 Curso por dentro (portada de curso)

**Cabecera de curso** (todas las páginas `/curso/:id/*`; una por curso, no por pestaña). Es el **banner de curso de Brightspace**: la imagen del curso bajo la barra de navegación, con el nombre encima. Cambia respecto de la v1.0 (antes era color plano).

```
┌───────────────────────────────────────────────────────────┐ rounded-2xl, overflow-hidden
│ [fotografía del área, object-position center 40 %]        │ alto 128 px móvil / 168 px escritorio
│ ░░░ velo brand-dark ≥ 65 % bajo el texto (2.8.3) ░░░      │
│  Matemática                                [Nueva tarea]  │ H1 blanco; botón dorado (solo docente)
│  3.° Primaria · A · Prof. Rosa Quispe · 2026               │ 14 px blanco
│  [Cambiar de curso]                                        │ botón blanco, 44 px (3.4)
│▬▬▬▬▬▬▬▬▬▬▬▬▬▬ barra --course de 6 px ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│ decorativa; color del curso
└───────────────────────────────────────────────────────────┘
```

- Contenedor: `relative isolate overflow-hidden rounded-2xl bg-(--course)` (el color de reserva está siempre debajo). Móvil: de borde a borde, con las esquinas inferiores redondeadas.
- Capas: imagen (`alt=""`, `object-cover`) → velo (`aria-hidden`) → contenido. El texto va en el primer 60 % del ancho en escritorio; **nada de texto fuera de la zona con velo ≥ 65 %** (2.8.3).
- Contenido: **H1** con el nombre del curso (blanco opaco, 22–24 px, máximo dos líneas, sin recorte) y debajo "3.° Primaria · A · Prof. Rosa Quispe · 2026" (14 px blanco opaco). La inicial en círculo solo aparece en el fondo de reserva (sin imagen).
- Botón principal, solo docente: "Nueva tarea" con `Button` **dorado** de 44 px (texto `brand-dark`, 9,83:1). Se elimina la variante "blanco con texto del color del curso" de la v1.0: el color de curso ya no es fondo de la cabecera.
- Barra inferior de 6 px del color del curso (`--course`): es el identificador de color; lleva nombre del curso al lado, así que el color no es la única señal.
- Sin imagen (curso fuera de las ocho áreas o fallo): la cabecera es el color plano `--course` con texto blanco (≥ 6:1) y la inicial en círculo, como en la v1.0.
- Para el **apoderado** no hay cabecera de curso navegable.
- **Opcional, desde `lg`, en la pestaña Clases (portada):** columna lateral con dos widgets inspirados en la portada de curso K-12 de Brightspace: "Último anuncio del curso" y "Tu docente" (solo nombre y rol; ningún dato de contacto que no entregue la API ni autorice la política de datos).

**Pestañas** (`CourseTabs`, ya existe; son enlaces con `aria-current`, no un `tablist`; equivalen a la *navbar* de curso de Brightspace): Clases · Lecturas · Tareas · Anuncios · Registro (esta última solo docente/admin).
- Barra pegada (`sticky`) bajo la barra superior, con scroll horizontal en pantallas estrechas y la pestaña activa visible.
- Objetivo táctil **≥ 44 × 44 px** (ya se cumple con `min-h-11`).
- Activa: borde inferior de **3 px del color del curso**, texto `ink` en peso 600; inactiva: `ink-2`. La activa se distingue por borde y peso, no solo por color.
- Foco: anillo de 2 px `ring` por dentro.

**Clases** (materiales de tipo clase):
- Agrupadas por **período** (Bimestre I–IV) en secciones plegables (h2 con botón; `aria-expanded`); el período vigente abierto.
- Cada ítem es una fila de ≥ 64 px: icono en círculo `soft` del color del curso, título (H3), descripción (2 líneas), fecha de publicación, y botón "Ver" / "Descargar PDF". Las descargas usan URL firmada (el aviso de "este enlace caduca" solo si el diseño lo requiere).
- Docente: botón "Agregar clase" y menú por ítem (Editar, Eliminar), con confirmación en `AlertDialog` para eliminar ("Se puede restaurar durante 30 días", según contrato).
- Vacío: "Aún no hay clases publicadas" + (docente) botón "Agregar clase".

**Lecturas / materiales** (materiales de tipo lectura):
- Misma lista que Clases, con **aviso de derechos de autor** en `Alert` informativa arriba de la lista (`info-soft`, icono `Info`). *El texto legal está pendiente de validación; la guía no lo inventa.*
- Chip "Reutilizable" solo para docente cuando corresponda.

**Tareas**:
- *Lista*: agrupada en **Pendientes · Entregadas · Calificadas** (estudiante) o **Abiertas · Cerradas** (docente), ordenada por plazo. Fila de tarea ≥ 72 px: título (H3), plazo en palabras con icono de reloj, chip de estado (2.1.4) y, si está calificada, la nota ("16/20", Lexend 600). Docente: "18 de 28 entregaron" + "12 por calificar".
- *Detalle de tarea* (ancho 48 rem): H1 con título; bloque de plazo con estado; instrucciones; archivos de apoyo; **zona de entrega**.
- *Zona de entrega (PDF)*: botón "Elegir PDF" (siempre disponible, teclado) más arrastrar y soltar como complemento; muestra nombre, tamaño y estado **en palabras**: "Subiendo…", "Revisando el archivo…", "Listo", "No se pudo revisar el archivo". Barra de progreso con texto "60 %" (`role="progressbar"`). Botón primario "Entregar tarea"; con reentrega: "Reemplazar entrega". Aviso de entrega tardía en `warning-soft` antes de confirmar. Confirmación posterior: recibo con fecha y hora (componente `receipt-view` existente).
- *En escritorio*: instrucciones a la izquierda, zona de entrega a la derecha (tarjeta pegada). *En móvil*: una columna; el botón "Entregar tarea" en barra fija encima de la barra inferior.

### 4.5 Tablas de notas (Registro del docente, "Mis notas")

DENSITY 6/10: aquí el docente necesita ver el conjunto.

- Componente `Table` de shadcn. Texto 14 px, fila **≥ 44 px** de alto, relleno horizontal 12 px.
- Cabecera `surface-2`, texto `ink` 600, **pegada arriba**; primera columna (estudiante) **pegada a la izquierda** con sombra sutil al desplazar; scroll horizontal con `overflow-x-auto` y `tabindex="0"` + `aria-label` en el contenedor.
- Cifras **alineadas a la derecha**, `tabular-nums`; escala 0–20 (RN-05); un decimal solo si la regla lo define. Hover de fila `row-hover`.
- NE y Exonerada se muestran como **chip con texto** (2.1.4), nunca como celda vacía ni solo con color. Estados con `scope="col"` / `scope="row"` correctos, `<caption>` visible o `sr-only`.
- **Mis notas (estudiante):** en móvil se presenta como **lista de tarjetas por curso** (nombre del curso, promedio, desglose por tarea) en vez de tabla ancha; en escritorio, tabla. Sin fotografías en las tablas.
- Edición de nota en línea: campo numérico de ≥ 44 px, `inputmode="decimal"`, rango 0–20 indicado en la ayuda, error junto al campo.

### 4.6 Formularios

- Etiqueta **visible encima** del campo (nunca solo placeholder); obligatorio escrito como "(obligatorio)" o lo opcional como "(opcional)", no solo `*`.
- Texto del campo **16 px** (evita el zoom automático de iOS); alto **44 px** en táctil (los controles `h-8` de shadcn por defecto se elevan a `h-11` en móvil con `min-h-11`).
- Borde `line-field` (con la corrección 2.1.2), foco con borde `ring` y halo; error con borde `danger` **más** icono y mensaje bajo el campo (`aria-invalid`, `aria-describedby`); el resumen de errores arriba del formulario recibe el foco al fallar el envío.
- Una columna siempre en móvil; máximo dos en escritorio para campos cortos relacionados.
- Botón primario al final, a la derecha en escritorio; a ancho completo en móvil. Secundario "Cancelar" como `outline` o `ghost`. Botón destructivo siempre pasa por `AlertDialog` que nombra lo que se borrará.
- Deshabilitar solo con explicación ("Elige un archivo para entregar"). Preferir dejarlo activo y explicar el error al enviar.

### 4.7 Estados de pantalla

| Estado | Patrón |
|---|---|
| **Vacío** | Círculo `brand-soft` de 64 px con icono de 32 px `brand`; título (H3), una línea que dice qué es y qué hacer, y **un** botón si hay acción posible. Sin ilustraciones complejas ni fotografías |
| **Carga** | `Skeleton` con la **forma final** (misma altura de fila y de tarjeta; los banners reservan su alto de 112/128/144/168 px) para no mover el diseño; contenedor con `aria-busy="true"`; texto sr-only "Cargando…". Sin spinners de pantalla completa |
| **Error** | `Alert` `danger-soft` con icono `CircleAlert`, qué pasó en palabras simples y botón "Intentar de nuevo". `role="alert"`. No mostrar códigos técnicos ni trazas |
| **Sin permiso (403)** | "No tienes acceso a esta página." + "Volver al inicio". No revela si el recurso existe ni quién lo administra |
| **No encontrado (404)** | "No encontramos esta página." + "Volver al inicio" |
| **Sesión vencida** | Aviso `warning-soft` y redirección a `/login` conservando el destino |
| **Guardando / éxito** | Botón con texto "Guardando…" y deshabilitado; éxito con `Alert` `success-soft` (`role="status"`) y sin desaparecer antes de 6 s |
| **Imagen que no carga** | Se ve el color de reserva (2.8.6) con el texto encima; sin icono de imagen rota ni mensaje |

### 4.8 Avisos

- **Aviso institucional** (RF-32): banda `gold-soft`, borde izquierdo 4 px `brand`, icono `Megaphone`, título Lexend 600 `brand-dark`, texto `ink`. Máximo uno fijo en el inicio. **Con imagen:** miniatura `aviso.webp` de 64 × 64 px (móvil) / 96 × 96 px (escritorio), `rounded-lg`, a la izquierda del texto, `alt=""`, `object-cover`. **Sin texto sobre la imagen**, por eso no lleva velo. Si el aviso no tiene imagen propia, la banda funciona igual con el icono.
- **Anuncio en lista:** tarjeta con autor (docente o "Colegio Mater Christi"), fecha, chip del curso (color `soft`), cuerpo con 3 líneas y "Leer más". No leído: punto `brand` de 8 px **y** texto "Nuevo" para lectores de pantalla. Sin imagen por anuncio (repetir una foto en cada fila es ruido).
- **Campana de notificaciones** (RF-53): contador `danger` con número; el panel agrupa por día; cada fila es enlace. Equivale a los iconos de alertas de la minibar de Brightspace.
- **Alertas en línea** (`Alert`): `info`, `success`, `warning`, `danger`, cada una con **icono + texto + fondo `-soft`** (todos ≥ 4,9:1). `role="status"` salvo errores (`role="alert"`).

### 4.9 Login completo

Patrón de la pantalla `/login`. Estilo Brightspace/colegio: una fotografía a pantalla completa con la identidad del colegio, y una tarjeta clara con el formulario. **El mismo login para los tres niveles y los cuatro roles** (principio 7); no se pregunta nivel.

**Qué se respeta del trabajo de David (`114011e`).** Se conserva sin cambios: la estructura de dos paneles (marrón + formulario, columnas 5fr / 4fr desde `lg`), el borde dorado, la tipografía Lexend/Source Sans 3, el lema "Tu aula, tus cursos y tus notas en un solo lugar.", la tarjeta con el `h1` "Iniciar sesión" y **todo `LoginForm`** (lógica, validación del código de 10 dígitos, segundo factor por TOTP o código de recuperación, mensajes y bloqueo tras 5 intentos). Esta guía **no cambia ninguna lógica**: solo añade la capa de fotografía y la identidad del colegio.

> **Límite de esta revisión.** La sesión de diseño no tuvo acceso a `git` y el repo del grupo no es público, así que **no se pudo leer `git show 114011e`**. La base descrita sale de `apps/web/app/login/page.tsx` y `apps/web/components/auth/login-form.tsx` del árbol local, que según el expediente aún no incluyen el commit de David (fondo del login, `/verificacion-dos-pasos`). Antes de aplicar, `disenador-ui` compara este patrón con `origin/features/david`: si David ya puso una imagen de fondo, **se conserva su composición** y se suman solo el velo (2.8.3), el escudo en círculo blanco y el pie.

**Estructura de escritorio (≥ 1024 px):**

```
┌───────────────────────────────────────┬───────────────────────────────┐
│ [foto login.webp + velo 68–82 %]  5fr │ canvas                    4fr │
│  (◯ escudo)  Colegio Mater Christi    │                               │
│              Aula Virtual             │   ┌─────────────────────────┐ │
│                                       │   │ Iniciar sesión   (h1)   │ │
│  ▬▬ (barra dorada decorativa)         │   │ Te damos la bienvenida  │ │
│  Tu aula, tus cursos y tus notas      │   │ Código de usuario       │ │
│  en un solo lugar.        (36/44)     │   │ [__________] 10 dígitos │ │
│  Plataforma del colegio para          │   │ Contraseña              │ │
│  estudiantes, docentes y familias     │   │ [____________] (ojo)    │ │
│  de inicial, primaria y secundaria.   │   │ [      Ingresar      ]  │ │
│                                       │   │ ¿Olvidaste tu contraseña?│ │
│  Colegio Mater Christi · Cañete       │   │ Si no puedes ingresar...│ │
│  © 2026 · Uso exclusivo de la         │   └─────────────────────────┘ │
│  comunidad educativa                  │                               │
└───────────────────────────────────────┴───────────────────────────────┘
```

**Estructura móvil (< 1024 px):** columna única. Arriba, una **banda de foto** de 176 px (`login.webp`, `object-cover`, velo uniforme 70 %, borde inferior dorado de 4 px) con el escudo y el nombre; debajo, sobre `canvas`, la tarjeta del formulario y, al final, el pie institucional en `ink-2` (14 px). El lema largo y el párrafo se ocultan en móvil (como ya hace el panel actual).

**Elementos, en orden:**

| # | Elemento | Especificación |
|---|---|---|
| 1 | **Fotografía de fondo** | `login.webp` (2.8.4), `alt=""`, `priority`. Fondo de reserva `--brand` (se ve primero y el texto ya es legible). Velo de 2.8.3. Sin animación |
| 2 | **Escudo** | `/brand/escudo.webp` en círculo blanco (`bg-white rounded-full p-1`), 64 px en escritorio / 56 px en móvil; `alt="Colegio Mater Christi"` (es informativo). Un solo escudo visible: la tarjeta **ya no repite el logo** que hoy lleva arriba |
| 3 | **Nombre del colegio** | "Colegio Mater Christi" (Lexend 600, 24/32 en escritorio, 18/26 en móvil, blanco opaco) y debajo "Aula Virtual" (Source Sans 3 600, 16/24, blanco opaco) |
| 4 | **Bienvenida / lema** (solo ≥ 1024 px) | Barra dorada decorativa de 56 × 4 px + lema (Lexend 600, 36/44, `text-balance`, blanco) + párrafo (16/24, blanco **opaco**; se elimina el `/80` actual). Es un `<p>`, **no un título**: el único `h1` es el de la tarjeta |
| 5 | **Tarjeta del formulario** | `surface`, `rounded-2xl`, `--shadow-raised`, `max-w-sm`, relleno 24 px (móvil) / 32 px. `h1` "Iniciar sesión" (Lexend 600, 24/32) y bajo él: "Te damos la bienvenida. Ingresa con tu código de usuario y tu contraseña." (16/24, `ink-2`) |
| 6 | **Código de usuario** | Etiqueta visible "Código de usuario"; `inputMode="numeric"`, `autoComplete="username"`, 10 dígitos (`USER_CODE_LENGTH`); ayuda "Son 10 dígitos y te lo entregó el colegio." Alto 44 px |
| 7 | **Contraseña** | `PasswordField` existente con mostrar/ocultar (botón de 44 px, `aria-pressed`), `autoComplete="current-password"` |
| 8 | **Botón "Ingresar"** | `Button` dorado, ancho completo, 44 px, 16 px. Estado de envío "Ingresando…" con el spinner existente (`motion-reduce:animate-none`) |
| 9 | **Segundo factor** (si lo pide la API; hoy el administrador) | Mismo bloque de la tarjeta: aparece el campo de código de verificación (6 dígitos) o de recuperación (XXXXX-XXXXX); botón "Verificar e ingresar". Sin cambios de lógica |
| 10 | **Error** | `role="alert"`, `danger-soft`, icono `CircleAlert`, mensajes existentes ("Código o contraseña incorrectos.", "Demasiados intentos. Espera un minuto e inténtalo de nuevo.", sin conexión). Aparece sobre el botón |
| 11 | **Recuperación** | Enlace "¿Olvidaste tu contraseña?" → `/recuperar`, objetivo táctil de 44 px, color `brand`, subrayado en hover y foco |
| 12 | **Ayuda** | "Si no puedes ingresar, comunícate con el administrador del colegio." (14 px, `ink-2`, filete `line` encima), como ya está. Sin teléfonos ni correos inventados |
| 13 | **Pie institucional** | "Colegio Mater Christi · Cañete" y "© {año actual} · Plataforma de uso exclusivo de la comunidad educativa". En escritorio, al pie del panel de foto (blanco opaco, 14 px, sobre el velo de 82 %); en móvil, bajo la tarjeta (`ink-2` sobre `canvas`, 5,29:1). Si existe una **ruta pública** de política de privacidad, se enlaza aquí; hoy `/politica` exige sesión (decisión abierta 9.4) |

**Reglas del login:**
- El `<main>` contiene panel y tarjeta; un solo `h1`; orden de tabulación: código → contraseña → mostrar/ocultar → Ingresar → recuperación. Foco inicial en el código (`autoFocus`, ya existe).
- Ningún texto sobre la foto fuera de las zonas con velo de 2.8.3; texto blanco al 100 %; sin dorado como texto. Reemplazar `text-ink-inverse/80` y `/70` actuales por blanco opaco cuando haya foto debajo.
- Ajustes sobre `LoginForm` que **no cambian su lógica** (para acordar con David): etiquetas de 16 px 600 (hoy `text-sm`, 14 px); ayudas de campo de 14 px (hoy `text-xs`, 12 px, `ink-3` → `ink-2`); texto del campo de 16 px para que iOS no haga zoom. Si David no lo acepta, quedan como mejora MEDIA, no bloquean.
- Textos que hoy dicen "de nivel secundaria" y "Nivel Secundaria" (panel del login) **deben cambiar**: el diseño es del colegio completo (decisión 7). Texto propuesto en la fila 4. Depende de la decisión abierta 9.1 sobre el alcance de niveles.
- Sin carruseles ni rotación de fotos. Una foto fija por pantalla.
- Responsive: probar en 360, 768, 1024 y 1280 px; la tarjeta nunca se corta ni genera scroll horizontal; con el teclado en pantalla el botón "Ingresar" sigue accesible con scroll (usar `min-h-dvh`, no `h-screen`).
- Contraste verificado: blanco sobre el velo ≥ 65 % ≥ 4,88:1 (6.1); `ink-2` sobre `surface` 5,63:1; `brand` (enlace) sobre `surface` 12,15:1; botón dorado texto `brand-dark` 9,83:1; error `danger` sobre `danger-soft` 5,76:1.

---

## 5. Componentes: qué se reutiliza

No se inventa nada que ya exista en `apps/web/components/ui/` (shadcn): `Button` (variantes `default`, `gold`, `outline`, `secondary`, `ghost`, `destructive`, `link`), `Card`, `Badge`, `Alert`, `AlertDialog`, `Dialog`, `Sheet`, `Sidebar`, `Table`, `Skeleton`, `Input`, `Textarea`, `NativeSelect`, `Field`, `Label`, `Tooltip`, `Pagination`, `Separator`. Del login se reutilizan `LoginForm`, `PasswordField` y el logo/escudo de `apps/web/public/brand/`.

**Componentes nuevos que la maqueta necesita** (los crea `disenador-ui`, sobre los de shadcn, en `apps/web/components/`):

| Componente | Base | Nota |
|---|---|---|
| `CourseCard` | `Card` | 4.2. **Actualizar:** imagen arriba, sin texto encima, barra de color; ya no franja de color con texto |
| `ImageBanner` | — | Contenedor `relative isolate` con imagen, velo (2.8.3) y fondo de reserva. Lo usan la cabecera de curso, el banner de inicio y la banda del login. Props: `src \| null`, `color`, `altura` |
| `CourseHeader` | `ImageBanner` | 4.4 (existe `course-header` lógico; aquí el visual) |
| `CourseSelector` | `Sheet` | 3.4 (prioridad media) |
| `LoginShell` | — | 4.9: panel/banda de foto + tarjeta + pie; envuelve a `LoginForm` sin tocarlo |
| `BottomNav` | — | 3.2 |
| `TaskRow` | — | Fila de tarea con franja de color, plazo y chip |
| `StatusChip` | `Badge` | Los seis estados de 2.1.4 con icono |
| `AnnouncementBanner` | `Alert` | 4.8. **Actualizar:** miniatura `aviso.webp` |
| `EmptyState` | — | 4.7 |
| `StudentSwitcher` | — | Selector de hijos del apoderado |
| `Widget` | `Card` | Anatomía común de 4.3 (h2 + "Ver todo" + cuerpo) |

Funciones auxiliares: `courseColor` (2.1.3) y `courseArea` (2.8.4) en `apps/web/lib/`.

**Ajustes de tamaño a los existentes:** `Button` por defecto mide `h-8` (32 px): para cumplir 44 px en táctil se usa un tamaño nuevo `touch` (`h-11`) o `h-11` en `max-md`. `Badge` mide `h-5` (20 px): es solo informativo, nunca un objetivo táctil.

---

## 6. Accesibilidad (WCAG 2.1 AA, RNF-26)

### 6.1 Contrastes verificados

Método: luminancia relativa de WCAG 2.1 (`L = 0,2126 R + 0,7152 G + 0,0722 B` con sRGB linealizado), `contraste = (L1 + 0,05) / (L2 + 0,05)`. Texto normal ≥ 4,5:1; texto grande (≥ 24 px, o ≥ 18,66 px en negrita) ≥ 3:1; componentes e iconos de interfaz ≥ 3:1.

| Par | Contraste | Resultado |
|---|---|---|
| `ink` / `canvas` | 14,64 | ✔ |
| `ink` / `surface` | 15,55 | ✔ |
| `ink-2` / `surface` · `canvas` · `surface-2` | 5,63 · 5,29 · 5,11 | ✔ |
| `ink-2` / `brand-soft` | 4,75 | ✔ |
| `ink-3` / `surface` | 4,78 | ✔ |
| `ink-3` / `canvas` · `surface-2` | **4,49 · 4,33** | ✘ → usar `ink-2` o aplicar corrección 2.1.2 (4,68 · 4,51) |
| `ink-disabled` / `surface` | 2,58 | Exento (deshabilitado) |
| Blanco / `brand` · `brand-dark` | 12,15 · 14,86 | ✔ |
| `brand` / `surface` | 12,15 | ✔ |
| `brand` / `brand-soft` · `gold-soft` | 10,26 · 11,36 | ✔ |
| `brand-dark` / `gold` · `gold-dark` | 9,83 · 7,94 | ✔ |
| `ink` / `gold` | 10,29 | ✔ |
| `gold` / `brand` · `brand-dark` | 8,03 · 9,83 | ✔ |
| **`gold` / `surface`** · `canvas` | **1,51 · 1,42** | ✘ no usar como texto ni indicador |
| `success` / `success-soft` · `surface` | 4,90 · 5,41 | ✔ |
| `warning` / `warning-soft` · `surface` | 6,22 · 6,79 | ✔ |
| `danger` / `danger-soft` · `surface` | 5,76 · 6,57 | ✔ |
| `info` / `info-soft` · `surface` | 6,18 · 6,95 | ✔ |
| Blanco / `danger` · `success` · `info` | 6,57 · 5,41 · 6,95 | ✔ (contador, botones de estado) |
| `line-active` (`ring`) / `surface` · `canvas` | 6,25 · 5,88 | ✔ (foco, 3:1 exigido) |
| **`line-field` / `surface`** | **1,51** | ✘ borde de campo → corrección 2.1.2 (3,30) |
| Blanco / color de curso `solid` (9 colores) | 6,01 – 7,96 | ✔ (tabla 2.1.3; fondo de reserva sin imagen) |
| `ink` / color de curso `soft` | 12,83 – 13,16 | ✔ |
| Blanco / color de curso con 18 % de blanco encima | 4,14 – 5,10 | ✘ en 6 de 9 (Índigo, Ciruela y Vino quedan en 4,61–5,10) → **no poner texto sobre decoración** |
| **Blanco / foto blanca pura con velo `brand-dark` al 50 % · 55 % · 60 %** | 3,13 · 3,61 · 4,18 | ✘ para texto normal; solo 50 % y 55 % valen para texto grande |
| **Blanco / foto blanca pura con velo `brand-dark` al 63 % · 65 % · 70 % · 80 %** | 4,59 · **4,88** · 5,72 · 7,98 | ✔ (65 % es el mínimo de la guía; peor caso, vale para cualquier foto) |
| **Dorado / foto blanca pura con velo `brand-dark` al 65 %** | **3,23** | ✘ no usar texto dorado sobre fotografía |
| Dorado (borde del botón) / peor fondo con velo al 65 % | 3,23 | ✔ solo como componente (3:1), no como texto |
| Blanco (anillo de foco) / peor fondo con velo al 65 % | 4,88 | ✔ (3:1 exigido) |

### 6.2 Foco, teclado y táctil

- **Foco visible siempre**, en todo elemento interactivo: anillo de **2 px** `ring` (`#8b5238`) con separación de 2 px, **100 % opaco** o acompañado de un borde `ring` sólido (el halo `ring/50` del `Button` por sí solo mide menos de 3:1). Sobre fondos marrones (sidebar): anillo **dorado** (`sidebar-ring`, 8,03:1). Sobre banners y fotos con velo: anillo **blanco** (4,88:1). Nunca `outline: none` sin reemplazo.
- Orden de tabulación = orden visual. Enlace "Saltar al contenido" como primer elemento de la página (visible al recibir foco).
- Todo se opera con teclado: pestañas, tarjetas (un enlace por tarjeta), menús (flechas, `Esc` cierra), diálogos y hojas con foco atrapado y devolución del foco.
- **Objetivos táctiles ≥ 44 × 44 px** (regla del proyecto; WCAG 2.1 AA no la exige, es una mejora para estudiantes de 11 años). Separación ≥ 8 px entre objetivos contiguos.
- **Reflujo:** sin scroll horizontal a 320 px de ancho (salvo tablas); zoom hasta 200 % sin pérdida (1.4.4, 1.4.10). Los banners crecen en alto si el texto se amplía; el velo cubre todo el contenedor.
- **Imágenes:** todas las fotografías son decorativas (`alt=""`); el escudo lleva `alt="Colegio Mater Christi"`. Ninguna información se transmite solo por imagen (principio 8).
- `<html lang="es">` (ya está). Un `<h1>` por página, jerarquía de títulos sin saltos; regiones `main`, `nav` (con `aria-label`), `header`.
- Mensajes dinámicos (éxito, error, nuevo aviso): `role="status"` / `role="alert"` / `aria-live="polite"`.
- **No se usa solo color** para: estado de entrega, urgencia, curso, ítem activo, estudiante seleccionado, campo con error.

### 6.3 Movimiento

`prefers-reduced-motion: reduce` anula transiciones y animaciones (bloque en 2.6). El skeleton pasa a color fijo. Ningún contenido ni función depende de una animación. Las fotografías no se animan nunca.

### 6.4 Navegadores (RNF-27)

Últimas dos versiones de Chrome, Edge, Firefox y Safari (escritorio y móvil). Cuidar: `env(safe-area-inset-bottom)` en iOS, `100dvh` en lugar de `100vh`, `sticky` dentro de contenedores con `overflow` (la tabla), `color-mix` (velos) y `:has()` ya soportados en las versiones objetivo; WebP lo soportan todas.

---

## 7. Referentes revisados

Revisión del 08/11/2026 (referentes secundarios) y del 09/11/2026 (Brightspace). No se copió ningún diseño ni código; se tomó el criterio.

**Nivel de verificación (honesto).** Las páginas oficiales de la base de conocimiento de D2L (`community.d2l.com/brightspace/kb/...`) cargaron en la herramienta de lectura **solo con el título**; el detalle de su contenido sale de **guías de universidades y colegios que reproducen esos artículos** y de resúmenes de búsqueda, y se marca abajo como "guía" o "resumen". `documentation.brightspace.com` ya **redirige (301, comprobado) a `community.d2l.com/brightspace`**. El sitio del sistema de diseño Daylight (`daylight.d2l.dev`) **exige inicio de sesión de D2L** (redirige a `d2l.dev/login`): de Daylight solo se usa lo público. Conviene confirmar con la interfaz real de Brightspace antes de cerrar la maqueta.

### 7.1 Referente principal: Brightspace (D2L)

Elegido por el usuario para los tres niveles (inicial, primaria y secundaria). D2L declara para su oferta K-12 funciones de accesibilidad "que apoyan a estudiantes con necesidades diversas en todos los niveles escolares" (https://www.d2l.com/k-12/, página oficial leída): es el argumento a favor de **un solo diseño** (principio 7).

| Patrón de Brightspace | Cómo es | Qué se adopta en Mater Christi | Dónde |
|---|---|---|---|
| **Minibar** (barra superior en todas las páginas) | Enlace a *My Home*, *Course Selector*, iconos de alertas (mensajes, suscripciones, actualizaciones) con círculo rojo si hay no leídos, y menú personal (perfil, notificaciones, cuenta, cerrar sesión) | Barra superior fija: Inicio, campana con contador `danger` + texto sr-only, menú de cuenta con avatar | 3.1, 4.8 |
| **Homepage de widgets** ("My Home") | Página de inicio armada con widgets independientes (cursos, por hacer, noticias, calendario) | Cada bloque del inicio es un **widget** con anatomía común: h2 + "Ver todo" + cuerpo, en tarjeta `surface` | 4.3 |
| **Work To Do** | Resume las actividades **vencidas y próximas de todos los cursos** (en el inicio) o de un curso (en su portada); vencidas arriba; hasta 6 actividades; enlace "ver todo"; el nombre abre el detalle | "Para hacer": vencidas primero, hasta 5 filas, enlace "Ver todas", fila completa clicable → tarea en dos toques | 4.3 |
| **My Courses** (*tiles*) | Una tarjeta por curso con **imagen**, nombre, código y docente | Tarjeta de curso con imagen arriba y metadatos debajo, sin texto sobre la foto | 4.2 |
| **Banner de curso** | Imagen bajo la navbar con el nombre del curso; el docente la cambia; la misma imagen es el *tile* y aparece en la app móvil; tamaño recomendado 2400 × 960 px en una guía universitaria | Cabecera de curso con imagen por área + velo + nombre; la **misma imagen** sirve a tarjeta y cabecera; 1920 × 640 | 2.8, 4.4 |
| **Navbar de curso** | Herramientas del curso (Contenido, Tareas, Debates, Calificaciones) en barra bajo el banner; en teléfonos Daylight la colapsa a menú hamburguesa | Pestañas de curso (Clases, Lecturas, Tareas, Anuncios, Registro). En móvil **no** hamburguesa: barra inferior global y pestañas con scroll | 4.4, 3.2 |
| **Course Selector** | Lista en la minibar con cursos fijados, últimos accedidos y el resto; ordenable por nombre o último acceso; búsqueda; "cargar más" | "Cambiar de curso": hoja con lista alfabética y búsqueda. Fijar y "recientes" fuera de v1 | 3.4 |
| **Portada de curso K-12** | Widgets de anuncios, "Tu docente y asistentes", calendario y tiles de contenido | Columna lateral opcional en Clases: último anuncio y "Tu docente" (sin datos de contacto no autorizados) | 4.4 |
| **Portal de padres** (Parent & Guardian) | Widgets *Work To Do* y *Recent Grades* de cada hijo, de solo lectura; resumen semanal por correo | Panel del apoderado: "Esta semana" y "Notas recientes" por estudiante. El correo semanal **no** entra en v1 | 4.3 |
| **Daylight** (sistema de diseño) | Componentes web accesibles y de código abierto (`BrightspaceUI/core`, Apache-2.0) con pruebas automáticas **axe**; interfaz responsive con mucho espacio en blanco e iconos simples | Espacio en blanco generoso, iconos simples (`lucide`), y recomendación a `qa-tester` de añadir **axe** a las pruebas de pantallas | principios 5 y 6, 6 |

**Lo que no se toma de Brightspace:** la barra azul y su paleta (la marca es marrón y dorado), la densidad de herramientas (Debates, Cuestionarios, Rúbricas: fuera de alcance v1 y abruma a docentes con poca experiencia digital), notificaciones *push* de Pulse, el correo semanal para padres, fijar cursos y la biblioteca de imágenes elegible por el docente (la imagen la define el área).

**Fuentes de Brightspace:**

| Fuente | URL | Verificación |
|---|---|---|
| D2L, página K-12 (oficial) | https://www.d2l.com/k-12/ | Leída |
| D2L, página de producto | https://www.d2l.com/brightspace/ | Leída |
| D2L Community, "Navigate Brightspace and find your course" (oficial; sustituye a documentation.brightspace.com) | https://community.d2l.com/brightspace/kb/articles/5539-navigate-brightspace-and-find-your-course | Solo título; detalle por espejo y resumen |
| Espejo de ese artículo (Univ. of Central Arkansas) | https://uca.teamdynamix.com/TDClient/1923/Portal/KB/ArticleDet?ID=171274 | Resumen de búsqueda (orden del Course Selector) |
| D2L Community, "About the Work To Do widget" | https://community.d2l.com/brightspace/kb/articles/3510-about-the-work-to-do-widget | Solo título; detalle por guía (Xavier Univ.) y resumen |
| D2L Community, "Introducing the Work To Do widget" | https://community.d2l.com/brightspace/kb/articles/5566-introducing-the-work-to-do-widget | Solo título |
| Guía de Work To Do (Xavier University of Louisiana) | https://cat.xula.edu/food/brightspace-tip-239-work-to-do-widget/ | Leída (vencidas arriba, próximas debajo; en *My Home* y en cada portada) |
| D2L Community, "Create a widget-based homepage" | https://community.d2l.com/brightspace/kb/articles/3316-create-a-widget-based-homepage | Resumen de búsqueda |
| Homepage, Navbar y Minibar (Minnesota State) | https://servicedesk.minnstate.edu/TDClient/30/Portal/KB/ArticleDet?ID=93 | Leída (minibar, navbar, Course Selector) |
| Banner de curso (Univ. of Windsor): 2400 × 960 px, bajo la navbar | https://uwindsor.teamdynamix.com/TDClient/1975/Portal/KB/ArticleDet?ID=151462 | Leída |
| Hilo de la comunidad D2L sobre el banner (permiso "Change Course Image and Banner Text") | https://community.d2l.com/brightspace/discussion/6103/change-banner-image-on-organization-homepage | Resumen de búsqueda |
| Portada de curso en un colegio K-12 que usa Brightspace (Sophie, Online School) | https://sophie.onlineschool.ca/books/information-for-families/page/navigating-the-course-homepage/export/html | Leída (widgets de anuncios, docente, calendario, contenido) |
| D2L Community, "View your child's work to do and recent grades" (portal de padres) | https://community.d2l.com/brightspace/kb/articles/27280-view-your-childs-work-to-do-and-recent-grades | Solo título; detalle por resumen de búsqueda |
| D2L Community, "Receive a weekly summary email of your child's activity" | https://community.d2l.com/brightspace/kb/articles/18064-view-and-monitor-your-childs-school-progress | Resumen de búsqueda |
| Daylight: `BrightspaceUI/core` (componentes accesibles, Apache-2.0, pruebas axe) | https://github.com/BrightspaceUI/core | Leída |
| Sitio del sistema de diseño Daylight | https://daylight.d2l.dev/ | **No accesible** (exige login de D2L) |
| Qué es Daylight (Eastern Illinois Univ.; Clarion Univ.) | https://www.eiu.edu/d2l/daylight.php · https://clarion.edu/about-clarion/computing-services/learning-technology-center/d2l/daylight-experience.html | Resumen de búsqueda |
| Documentación antigua (redirige a la comunidad) | https://documentation.brightspace.com/ → https://community.d2l.com/brightspace | Redirección comprobada |

### 7.2 Referentes secundarios

Sirven para decisiones puntuales; si chocan con Brightspace, manda Brightspace.

| Referente | Qué hace bien | Qué tomamos | Fuente |
|---|---|---|---|
| **Google Classroom** | Cada clase es una **tarjeta con color**; dentro, pestañas *Novedades / Trabajo de clase / Personas*; lista "Pendientes" de todas las clases | **La calidez** y la barra de color de la tarjeta (decisión 3); cabecera cercana para pequeños | Página oficial "About Classroom": https://support.google.com/edu/classroom/answer/6020279 · Guías: https://www.customguide.com/google-classroom/classroom-navigation · https://alicekeeler.com/2020/05/02/google-classroom-students-find-a-list-of-their-work |
| **Canvas (Instructure)** | Panel con tarjetas de curso + lista **Por hacer** y plazos de todos los cursos a la derecha; navegación global a la izquierda | **Inicio "pendientes primero"** (decisión 1); lista agrupada por plazo; navegación global lateral en escritorio | Guía oficial del Dashboard (estudiante): https://community.instructure.com/docs/DOC-4431 (contenido conocido por resúmenes) |
| **Moodle 4** | Navegación **secundaria** de curso como pestañas bajo el nombre del curso (varía por rol); **índice de curso** lateral | Pestañas por rol (ya existen); agrupación de materiales por período | Página oficial "Course index": https://docs.moodle.org/404/en/Course_index · https://docs.moodle.org/dev/Moodle_4.0_navigation_improvements (resumen de búsqueda) |
| **Schoology (PowerSchool)** | Inicio con **actividad reciente** y **por hacer / próximos**, calendario y app móvil | Calendario como destino propio; avisos con punto de "nuevo" | https://support.schoology.com/hc/en-us/articles/201001203-Home-Page-Students- → https://uc.powerschool-docs.com/en/schoology/latest/home-page-students (cuerpo no cargó; resumen de búsqueda) |
| **Criterios de accesibilidad** | WCAG 2.1 AA | Contrastes 1.4.3 y 1.4.11, foco 2.4.7, reflujo 1.4.10, tamaño de texto 1.4.4, imágenes decorativas 1.1.1 | https://www.w3.org/TR/WCAG21/ |

Lo que **no** se toma: la densidad de menús de Moodle y Schoology (abruma a docentes con poca experiencia digital, RNF-25), ni las funciones fuera del alcance v1 (asistencia, exámenes, cuestionarios, integración con Google Classroom).

---

## 8. Lista de verificación para revisores

`revisor-visual` y `ux-accesibilidad` comprueban, en **360 px y en 1280 px** (y en 1024 px para el login):

1. Usa solo tokens y utilidades de `tokens.css` (sin HEX sueltos; los colores de curso por variable; velos con `color-mix` sobre `--brand-dark`).
2. Un `<h1>`; jerarquía sin saltos; tipografía según 2.2 (Lexend en títulos, Source Sans 3 en texto, cuerpo 16 px, mínimo 12 px).
3. Todos los objetivos táctiles ≥ 44 × 44 px; sin scroll horizontal a 360 px (salvo tablas).
4. Foco visible con anillo ≥ 2 px en todos los interactivos (blanco sobre velo); operable con teclado.
5. Ninguna información solo por color; chips con icono y texto.
6. Texto blanco solo sobre color plano de curso **o** sobre fotografía con velo ≥ 65 % en la zona del texto; sin dorado como texto sobre claro ni sobre foto; sin texto con transparencia sobre foto.
7. Estados: vacío, carga (skeleton con forma final), error y sin permiso resueltos; imagen que falla = color de reserva legible.
8. Movimiento ≤ 300 ms, solo `transform`/`opacity`/color/sombra, fotografías sin animar, y `prefers-reduced-motion` respetado.
9. Barra inferior en `< md` con 4 destinos y etiquetas visibles; sin sidebar-hoja para estudiante, docente y apoderado.
10. Español de Perú, tono "tú", fechas en palabras con zona horaria de Lima.
11. **Diseño unificado:** ningún color, icono, ilustración, texto ni ruta distintos por nivel; el nivel aparece solo como dato de texto plano.
12. **Imágenes:** nombre de archivo de 2.8.4, WebP, dentro del peso máximo, `alt=""` salvo el escudo, sin rostros identificables, sin texto ni logos legibles, con fila completa en el registro 2.8.7.
13. **Tarjeta de curso:** sin texto sobre la imagen; barra de color de 6 px; un solo enlace por tarjeta.
14. **Cabecera de curso e inicio:** velo ≥ 65 % bajo el texto; título dentro de la imagen como `h1`; color de reserva presente; la primera fila de "Para hacer" visible en 360 × 640 incluso con aviso.
15. **Login:** foto de `public/brand/login.webp` visible **sin sesión**; escudo en círculo blanco; un solo `h1`; `LoginForm` sin cambios de lógica; sin textos que digan "secundaria" únicamente.

---

## 9. Decisiones abiertas y trabajo que esta guía solicita a otros

| # | Asunto | Quién decide / hace |
|---|---|---|
| 1 | Aplicar las correcciones de contraste `ink-3` y `line-field` (2.1.2), la base `--radius: 0.875rem`, los tokens de curso, sombras, movimiento y velos (2.1.3, 2.4–2.6, 2.8.3) | Dueño de `apps/web/app/tokens.css` / `globals.css` (Dev 1). Tras decisión del orquestador |
| 2 | Ruta **`/cursos`** (lista de todos mis cursos) y destino "Inicio" distinto por rol (`/` vs `/apoderado`) | Orquestador + Dev 1/Dev 2. La maqueta la asume |
| 3 | `apps/web/app/(app)/layout.tsx`: añadir `BottomNav` y barra superior móvil, retirar el sidebar-hoja en `< md` para los tres roles | Dev 1 / orquestador. Es un cambio de layout compartido |
| 4 | Color de curso **elegible por el colegio** (hoy se deriva del `course.id`) y **área de la imagen elegible** (hoy se deriva del nombre, 2.8.4) | Usuario; implicaría campos nuevos en `Course` (modelador-bd) |
| 5 | Umbral de aprobación y coloreado de notas (0–20) | Usuario / colegio |
| 6 | Texto legal del aviso de derechos de autor de las lecturas | Pendiente de validación legal (ya registrado en contratos) |
| 7 | Eliminar el bloque `.dark` heredado de shadcn en `globals.css` (no hay modo oscuro en v1) | Dev 1, limpieza no urgente |
| 8 | Qué datos exactos expone la API para "Para hacer", "Por calificar" y "Notas recientes" en el inicio (¿un endpoint agregado o varias llamadas?) | `arquitecto-integrador` |

**Pendientes que nacen de la v1.1 (09/11/2026).** Se numeran 9.1 a 9.8 y así se citan en el resto de la guía.

| # | Asunto | Quién decide / hace |
|---|---|---|
| 9.1 | **Alcance de niveles.** El diseño unificado es del colegio completo (inicial, primaria y secundaria), pero el proyecto está definido para **secundaria**: README y ERS ("Aula Virtual Institucional (Secundaria)"), `Section.gradeLevel (1..5)` en `docs/02_MODELO_ENTIDADES.md`, RNF-25 ("11 a 17 años") y los textos del login actual. Inicial (3 a 5 años) y primaria (1.° a 6.°) **no caben hoy en el modelo**, y puede que usen otra escala de calificación (el sistema peruano suele usar escala literal AD/A/B/C en inicial y primaria y vigesimal en secundaria; **confirmar con el colegio**). La guía solo muestra el nivel como dato y la nota como la entrega la API; no resuelve esto | **Usuario** (alcance, ERS §7) → `arquitecto-integrador` y `modelador-bd` |
| 9.2 | Imágenes: descargar las 11, recortarlas y exportarlas a WebP según 2.8.4–2.8.5, pasar la revisión 2.8.2 y completar el registro 2.8.7 | Persona que descarga + `director-diseno` (revisión) |
| 9.3 | **Ruta pública de `login.webp`**: debe ir en `apps/web/public/brand/` (el proxy no la redirige); si se prefiere otra carpeta, hay que añadirla al matcher de `apps/web/proxy.ts` (archivo de Dev 1) | Orquestador + Dev 1 |
| 9.4 | **Política de privacidad pública** para el pie del login: hoy `/politica` exige sesión (se muestra después del primer ingreso) | Dev 1 / usuario |
| 9.5 | **Comparar con `origin/features/david`** (commit `114011e`: fondo del login, 2FA) antes de implementar 4.9; esta revisión no pudo leerlo | `disenador-ui` u orquestador |
| 9.6 | Aplicar a `LoginForm` los ajustes de tipografía de 4.9 (etiquetas 16 px, ayudas 14 px `ink-2`) y cambiar los textos "nivel secundaria" del panel | David / Dev 1 (dueño de `apps/web/components/auth/` y `app/login/`) |
| 9.7 | Validar con la dirección el motivo de la imagen de Religión y, si existen, **reemplazar** las fotografías de banco por fotos propias del colegio con las autorizaciones de los apoderados | Usuario / colegio |
| 9.8 | Añadir pruebas **axe** a las pantallas (Daylight las usa en sus componentes) | `qa-tester` |

**Trabajo para `disenador-ui` tras la v1.1.** La maqueta actual (`apps/web/app/maqueta/`) se hizo con la v1.0. Falta: `CourseCard` con imagen (4.2), `ImageBanner`/cabecera de curso con imagen y velo (4.4), banner de inicio (4.3), miniatura en `AnnouncementBanner` (4.8), `Widget` común, pantalla `/maqueta/login` con 4.9, `courseArea`, y el nivel mostrado como "3.° Primaria · A". Además queda abierto el hallazgo anterior: en móvil el logo de la barra superior se ve como un espacio vacío. Las imágenes llegan de otra persona a `apps/web/public/maqueta/img/`; mientras no estén, los banners muestran el color de reserva (2.8.6).

La maqueta debe, por tanto, trabajar con **datos de ejemplo** y los componentes de la sección 5, sin tocar el backend.

---

## 10. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 08/11/2026 | Guía inicial: decisiones del usuario del 08/11/2026, paleta de cursos y contrastes calculados |
| 1.1 | 09/11/2026 | Brightspace (D2L) como referente principal con fuentes y matriz de adopción (7); diseño unificado, sin variantes por nivel (principio 7, 4.1); sección de imágenes con licencias, reglas de privacidad, velo de contraste calculado, formato, alt, lista de 11 archivos y registro (2.8); tarjeta de curso, cabecera de curso, inicio y aviso con imagen (4.2 a 4.4, 4.8); selector de curso (3.4); patrón de login completo (4.9); componentes y lista de verificación ampliados (5, 8); pendientes nuevos, entre ellos el alcance de niveles (9.1) |
