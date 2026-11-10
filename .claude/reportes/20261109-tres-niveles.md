# Reporte: aula para inicial, primaria y secundaria

## Pedido

- "Los tres niveles" (09/11/2026), seguido de "Sí, empieza", "Sí, sigue", "continua desde donde se quedaron…" y "continua con las correciones y todo lo que se quedó a medias…" (10/11/2026).
- Flujo completo, rama `features/adolfo`, sin commit. Por decisión del usuario, solo va al repo privado hasta que el grupo lo apruebe.

## Resultado

El aula cubre inicial (3, 4 y 5 años), primaria (1.° a 6.°) y secundaria (1.° a 5.°) con un solo diseño.

- **Secciones:** cada sección tiene su nivel y el grado se valida según ese nivel.
- **Promoción:** pasa de inicial a primaria y de primaria a secundaria.
- **Notas:** secundaria sigue con 0–20. Inicial y primaria usan AD/A/B/C sin promedio, con un logro del bimestre que elige el docente.
- **Inicial:** los niños no tienen cuenta ni entregas. La API lo impide con 422 y 409; el apoderado ve sus logros y avisos.
- **Avisos, reportes y exportación de datos personales:** consideran el par (nivel, grado) y la escala del nivel.
- **Login:** el texto es unificado. La versión de la política sube a `2026-2`, así que todos deben volver a aceptarla.

## Agentes que participaron

| #   | Agente                 | Modelo   | Qué hizo                                                        | Estado                                                 |
| --- | ---------------------- | -------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | arquitecto-integrador  | definido | Plan e inventario                                               | BLOQUEADO (decisiones del usuario)                     |
| 2   | modelador-bd           | definido | Esquema y migración `20261109120000_tres_niveles`               | LISTO                                                  |
| 3   | dev2-estructura        | definido | Catálogo de niveles, DTO, promoción, seed y admin web           | LISTO                                                  |
| 4   | qa-tester              | definido | e2e de estructura y usuarios                                    | CAMBIOS_PEDIDOS (anuncios)                             |
| 5   | dev5-administracion    | definido | Anuncios y avisos por (nivel, grado)                            | LISTO (pausado y retomado)                             |
| 6   | dev4-calificaciones    | definido | Motor de notas literal, logro del bimestre y web                | LISTO                                                  |
| 7   | dev5-administracion    | definido | Reportes, dashboard y exportación v2                            | LISTO                                                  |
| 8   | dev1-plataforma        | definido | Textos del login y etiquetas con nivel                          | LISTO                                                  |
| 9   | dev3-contenidos        | definido | NE literal en tareas e inicial sin entregas (con 409 en la API) | LISTO                                                  |
| 10  | qa-tester              | definido | e2e `levels-reports` (11 casos) y batería completa              | LISTO                                                  |
| 11  | ux-accesibilidad       | definido | Revisión de pantallas                                           | APROBADO (3 MEDIO)                                     |
| 12  | seguridad-cumplimiento | definido | Auditoría                                                       | CAMBIOS_PEDIDOS (1 ALTO)                               |
| 13  | dev2, dev4, dev3, dev5 | definido | Vuelta 1 de corrección                                          | Detenidos por el límite de uso; terminó el orquestador |
| 14  | revisor-pr             | definido | Revisión final                                                  | ver expediente                                         |

## Decisiones del orquestador

- La escala no se guarda en la BD: sale de `scaleForLevel(level)`.
- Bloquear entregas de INICIAL también en la API, por coherencia con la decisión del usuario.
- Adelantar la parte de anuncios (paso 4) para dejar el e2e en verde.
- Vuelta 1: tras el límite de uso, el orquestador terminó él mismo las correcciones, sin subagentes, para ahorrar tokens (pedido del usuario):
  - fallo cerrado en `notification-recipients`;
  - accesibilidad de `achievement-cell`;
  - 422 `STUDENT_WITHOUT_ACCOUNT` en el reset y en la corrección de DNI;
  - backfill de `Announcement.level`;
  - D-065 y `POLICY_VERSION`.
- La importación masiva solo busca secciones de SECUNDARIA, así que no puede dar login a niños de inicial; queda así.
- El logro en una matrícula cerrada se permite (RN-14), y QA lo cubre como comportamiento deliberado.
- La BD local no se reseteó: Prisma exige un consentimiento literal. Tiene aplicada la migración sin la línea de backfill, lo que es equivalente porque no había anuncios GRADE.

## Archivos

Ver `git status`:

- `prisma/schema/*` y la migración nueva;
- `packages/shared/src/{academic,grading}`;
- `apps/api/src/modules/{academic,users,grading,contents,submissions,files,announcements,notifications,reports,lifecycle,config}`;
- `apps/api/test/*`;
- `apps/web/app/(app)/{admin,anuncios,curso,mis-notas,apoderado}`, `apps/web/app/login`, `apps/web/components/layout`;
- `docs/02`, `docs/03`, `docs/04` y `docs/08` (D-065);
- `.env.example`.

## Verificación (10/11/2026)

| Comando                         | Resultado                                                           |
| ------------------------------- | ------------------------------------------------------------------- |
| tsc api / web / worker / shared | 0 errores                                                           |
| `pnpm lint`                     | 0 errores, 0 avisos                                                 |
| api test                        | 103 archivos / 1269 ok                                              |
| web test                        | 33 / 560 ok                                                         |
| shared test                     | 144 ok                                                              |
| e2e API                         | 38 archivos / 739 ok (un timeout ocasional del PDF pasó al repetir) |
| `S3_PUBLIC_ORIGIN=… pnpm build` | 5/5 ok                                                              |
| prettier                        | ok                                                                  |

## Pendientes y decisiones abiertas

- **Usuario:**
  - literal por defecto de la NE en inicial y primaria (hoy NE sin literal);
  - si "sin logro" cuenta como en riesgo.
- **Institución:**
  - texto definitivo de la política (menores de 3 a 17 años y logro del bimestre);
  - plazo de retención del comentario del logro.
- **Pendiente técnico:**
  - columna `nivel` en la importación CSV;
  - unificar el catálogo de niveles de la web con `@aula/shared` (hoy está copiado en 3 sitios);
  - resetear la BD local cuando el usuario lo confirme con el texto literal.
- **Pruebas manuales:**
  - en el navegador a 360 px y con teclado;
  - PDF real con Gotenberg.
- **Grupo:** aprobar el cambio de alcance antes de enviarlo a sxxntoz.

Expediente: `.claude/tareas/20261109-tres-niveles.md`.

## Prompts usados (literales)

Incluye también los de la tarea de diseño del 08–09/11 (guía, maqueta e imágenes), que el reporte `20261108-diseno-web.md` solo resumía.

### director-diseno — Guía de diseño del aula

```text
Expediente: .claude/tareas/20261108-diseno-web.md (léelo). Requisitos: RNF-24..27.

Encargo: escribe docs/diseno/guia.md, la guía de diseño del Aula Virtual Mater Christi, siguiendo tu archivo de agente.

Decisiones del usuario (obligatorias):
1. Inicio del estudiante: "pendientes primero" (tareas por vencer y avisos arriba, cursos debajo), al estilo Canvas.
2. Navegación móvil: barra inferior fija (Inicio, Cursos, Notas, Avisos según rol); en escritorio se mantiene el sidebar marrón actual.
3. Estilo: "cálido y amigable", tipo Google Classroom: tarjetas de curso con color, más redondeado, cercano para estudiantes pequeños; siempre sobre la paleta institucional marrón #592719 y dorado #ffcc00 de apps/web/app/tokens.css. Define una paleta secundaria de colores para tarjetas de curso que cumpla contraste AA con texto blanco u oscuro y combine con la marca.
4. Tipografía del grupo: Lexend (títulos) y Source Sans 3 (texto), del commit 114011e de la rama origin/features/david (puedes verlo con `git show 114011e` si tuvieras Bash; si no, tómalo como dado).
5. La maqueta que viene después será: inicio por rol (estudiante, docente, apoderado) y curso por dentro (encabezado, pestañas, clases, materiales, tareas). Incluye en la guía los patrones que esas pantallas necesitan.

Investiga brevemente referentes (Google Classroom, Canvas, Moodle, Schoology) y cita URLs. Las skills de terceros (UI UX Pro Max, taste-skill) no están instaladas: aplica su criterio con tu conocimiento y dilo en Decisiones. Escribe solo en docs/diseno/. Termina con el INFORME.
```

### general-purpose — Guía de diseño del aula

```text
Actúa como el agente definido en .claude/agents/director-diseno.md (léelo primero y respeta sus reglas y límites: solo escribes en docs/diseno/, no tocas código).

Expediente: .claude/tareas/20261108-diseno-web.md (léelo). Requisitos: RNF-24..27.

Encargo: escribe docs/diseno/guia.md, la guía de diseño del Aula Virtual Mater Christi.

Decisiones del usuario (obligatorias):
1. Inicio del estudiante: "pendientes primero" (tareas por vencer y avisos arriba, cursos debajo), al estilo Canvas.
2. Navegación móvil: barra inferior fija (Inicio, Cursos, Notas, Avisos según rol); en escritorio se mantiene el sidebar marrón actual.
3. Estilo: "cálido y amigable", tipo Google Classroom: tarjetas de curso con color, más redondeado, cercano para estudiantes pequeños; siempre sobre la paleta institucional marrón #592719 y dorado #ffcc00 de apps/web/app/tokens.css. Define una paleta secundaria de colores para tarjetas de curso que cumpla contraste AA con su texto y combine con la marca (verifica los contrastes calculándolos).
4. Tipografía del grupo: Lexend (títulos) y Source Sans 3 (texto), del commit 114011e de origin/features/david (`git show 114011e`).
5. La maqueta siguiente será: inicio por rol (estudiante, docente, apoderado) y curso por dentro (encabezado, pestañas, clases, materiales, tareas). Incluye los patrones que esas pantallas necesitan.

Investiga brevemente referentes (Google Classroom, Canvas, Moodle, Schoology) y cita URLs. Las skills de terceros (UI UX Pro Max, taste-skill) no están instaladas: aplica su criterio y dilo en Decisiones. No hagas commits. Termina con el INFORME del protocolo (.claude/PROTOCOLO_AGENTES.md).
```

### disenador-ui — Maqueta inicio y curso

```text
Expediente: .claude/tareas/20261108-diseno-web.md (léelo). Guía: docs/diseno/guia.md (léela completa). Requisitos: RF-08, RNF-24..27.

Encargo: arma la MAQUETA estática en apps/web/app/maqueta/ (ver tu archivo de agente):
1. /maqueta — índice con enlaces a cada pantalla.
2. /maqueta/inicio/estudiante — "pendientes primero": tareas por vencer, avisos, luego tarjetas de curso con color.
3. /maqueta/inicio/docente — por calificar, próximas clases, mis cursos.
4. /maqueta/inicio/apoderado — selector de hijo, notas recientes, pendientes del hijo, avisos.
5. /maqueta/curso — curso por dentro: cabecera con color del curso, pestañas (Clases, Lecturas/Materiales, Tareas, Avisos), con contenido de ejemplo en cada pestaña (las pestañas pueden ser estado local de cliente).

Reglas:
- Implementa los componentes de la sección 5 de la guía DENTRO de apps/web/app/maqueta/_componentes/ (CourseCard, CourseHeader, BottomNav, TaskRow, StatusChip, AnnouncementBanner, EmptyState, StudentSwitcher), usando apps/web/components/ui y los tokens existentes. Los colores de curso, radios y sombras nuevos van como variables CSS locales a la maqueta (p. ej. un maqueta.css importado en apps/web/app/maqueta/layout.tsx), NO en tokens.css ni globals.css.
- La maqueta tiene su propio layout.tsx: sidebar marrón en ≥768 px y BottomNav por rol en <768 px; aviso visible "Maqueta: datos de ejemplo". Carga Lexend y Source Sans 3 con next/font/google solo en ese layout.
- Datos ficticios en el mismo archivo, sin API, sin Server Actions, sin cookies. Nombres ficticios.
- No toques nada fuera de apps/web/app/maqueta/. La ruta /maqueta debe ser accesible sin sesión: comprueba si apps/web/middleware.ts o proxy.ts redirige rutas no públicas; si lo hace, NO lo cambies: avísalo en el INFORME.
- Verifica: `pnpm --filter web exec tsc --noEmit` y `pnpm --filter web lint` (anteponer NODE_OPTIONS=--dns-result-order=ipv4first). No hagas commits.
Termina con el INFORME.
```

### director-diseno — Guía con Brightspace unificada

```text
Expediente: .claude/tareas/20261108-diseno-web.md. Guía actual: docs/diseno/guia.md (v1.0, tuya). Requisitos: RNF-24..27.

Encargo: actualiza docs/diseno/guia.md a v1.1 con estas decisiones nuevas del usuario (09/11/2026):
1. **Brightspace (D2L)** es el referente principal para los tres niveles del colegio: inicial, primaria y secundaria. Investiga su interfaz (homepage con widgets, portada de curso con imagen/banner, navbar, "Work To Do", course selector, Daylight design system de D2L) y cita URLs oficiales (d2l.com, documentation.brightspace.com, design system Daylight). Explica qué se adopta de Brightspace en cada patrón. Los otros referentes quedan como secundarios.
2. **Diseño unificado:** el mismo diseño para inicial, primaria y secundaria. Nada personalizado por nivel. Elimina o evita cualquier variante por nivel; el nivel solo aparece como dato (p. ej. "3.° Primaria").
3. **Imágenes:** el aula usará fotografías e ilustraciones de bancos libres (Unsplash/Pexels) en el login, las portadas de curso (banner tipo Brightspace con imagen por área: Matemática, Comunicación, Ciencia y Tecnología, Personal Social, Arte, Educación Física, Inglés, Religión), el inicio y los avisos. Define reglas: sin rostros identificables de menores (Ley 29733), overlay para contraste de texto (calcula el overlay mínimo para texto blanco AA), relación de aspecto, tamaño y formato webp, y texto alternativo. Otra persona está descargando las imágenes a apps/web/public/maqueta/img/; tú solo defines reglas y la lista de imágenes necesarias (nombre de archivo esperado por uso: login.webp, inicio.webp, curso-matematica.webp, curso-comunicacion.webp, curso-ciencia.webp, curso-personal-social.webp, curso-arte.webp, curso-educacion-fisica.webp, curso-ingles.webp, curso-religion.webp, aviso.webp).
4. **Login:** agrega un patrón de login completo y no básico, al estilo Brightspace/colegio: foto de fondo, escudo, nombre del colegio, bienvenida, formulario por código de usuario y contraseña (el login real es por código, ver apps/web/components/auth/login-form.tsx), enlace de recuperación y pie institucional. Respeta el trabajo de David (114011e: `git show 114011e -- apps/web/app/login apps/web/components/auth`).

Mantén lo demás de la v1.0 (paleta, contrastes, barra inferior, pendientes primero, estilo cálido). Solo escribes en docs/diseno/. Termina con el INFORME.
```

### general-purpose — Buscar imágenes libres

```text
Eres el curador de imágenes del Aula Virtual del colegio Mater Christi (inicial, primaria y secundaria, Perú). El usuario pidió explícitamente: "prefiero que busques las mejores imagenes" para la maqueta del aula virtual. Expediente: .claude/tareas/20261108-diseno-web.md.

Encargo: busca y descarga imágenes de bancos con licencia libre de uso comercial sin atribución obligatoria: SOLO Unsplash (unsplash.com, licencia Unsplash) o Pexels (pexels.com, licencia Pexels). Nada de otras fuentes.

Reglas:
- Sin rostros identificables de niños o adolescentes (de espaldas, manos, lejos, desenfocado, u objetos). Adultos docentes sí se aceptan.
- Estilo cálido, luminoso, educativo, que combine con marrón #592719 y dorado #ffcc00. Nada de marcas visibles.
- Descarga con curl directamente desde la URL de imagen del banco (images.unsplash.com con parámetros w=1600&q=80&fm=jpg, o images.pexels.com), a la carpeta temporal C:\Users\Laptop\AppData\Local\Temp\claude\ee035ce27a2a3d8b\71109640-d7c9-4a80-bcf2-98b3cd90b151\scratchpad\img-descargas\ (créala). Verifica que cada archivo sea realmente una imagen (`file` o cabecera JPEG/PNG) y no HTML.
- Luego conviértelas a webp con sharp (está en node_modules del monorepo: usa `node -e` con require resuelto desde apps/web, o `pnpm --filter web exec node`), a lo ancho: login.webp 1920 px; inicio.webp y aviso.webp 1600 px; banners de curso 1600x400 recortados centrados (cover). Calidad 75. Destino final: C:\Proyectos\AV-MATER-CHIRSTI\apps\web\public\maqueta\img\
- Archivos requeridos: login.webp (fachada/aula/biblioteca escolar luminosa), inicio.webp (útiles, escritorio de estudio), aviso.webp (pizarra o tablón), curso-matematica.webp, curso-comunicacion.webp (libros/lectura), curso-ciencia.webp, curso-personal-social.webp (mapa/globo/historia), curso-arte.webp, curso-educacion-fisica.webp, curso-ingles.webp, curso-religion.webp (vela, capilla o vitral, sobrio).
- Escribe C:\Proyectos\AV-MATER-CHIRSTI\apps\web\public\maqueta\img\CREDITOS.md con, por archivo: URL de la página de la foto, autor, banco y licencia, y un texto alternativo en español.
- Tamaño total objetivo < 3 MB. No toques ningún otro archivo del repo. No hagas commits. No ejecutes nada descargado.

Termina con un INFORME:
## INFORME — curador-imagenes
Estado: LISTO | BLOQUEADO
Resumen / Archivos (con tamaño) / Comandos / Pendientes
```

### disenador-ui — Maqueta v1.1 con login e imágenes

```text
Expediente: .claude/tareas/20261108-diseno-web.md. Guía: docs/diseno/guia.md v1.1 (léela entera; manda sobre tu maqueta anterior). Imágenes: apps/web/public/maqueta/img/ (11 webp + CREDITOS.md). Requisitos: RF-08, RNF-24..27.

Encargo: actualiza la maqueta de apps/web/app/maqueta/ a la guía v1.1:
1. **Login nuevo** en /maqueta/login, completo y no básico (patrón 4.9): foto login.webp de fondo con velo brand-dark ≥65 %, escudo (/brand/escudo.webp) en círculo blanco, nombre del colegio, lema, tarjeta con formulario por código de usuario y contraseña (solo visual, sin lógica), "¿Olvidaste tu contraseña?", ayuda y pie institucional. Diseño único sin mencionar "secundaria" ni ningún nivel. Base de David: lee apps/web/app/maqueta/_ref/david-login.diff.txt (su commit 114011e de diseño del login, con fondo y tipografía) y conserva su composición donde encaje con la guía. El login de maqueta va fuera del shell (sin sidebar ni barra inferior): usa un route group o layout propio para que no herede MaquetaShell.
2. **Tarjeta de curso** con imagen arriba (curso-*.webp según área, función courseArea) y texto debajo sobre blanco, sin velo; fallback de color con inicial si no hay área.
3. **Cabecera de curso** (ImageBanner) con la imagen del área y velo según la guía. Los banners descargados miden 1600x400: usa object-cover con la proporción de la guía.
4. **Banner de inicio** con inicio.webp (112/144 px) sin empujar "Para hacer" fuera de 360x640; miniatura aviso.webp en avisos.
5. Corrige el logo vacío de la barra superior móvil (usa /brand/logo-mater-christi.webp o el escudo).
6. Diseño unificado: ningún color, icono o texto por nivel; el nivel solo como dato (p. ej. "3.° Primaria · A", "2.° Secundaria · B", "5 años · Inicial" en los datos de ejemplo).
7. Agrega /maqueta/login al índice.

Reglas: usa next/image o <img> con alt="" en fotos decorativas; no toques nada fuera de apps/web/app/maqueta/ ni de apps/web/public/maqueta/; no cambies proxy.ts. Al terminar borra apps/web/app/maqueta/_ref/. No hagas commits. Termina con el INFORME (el orquestador correrá tsc, lint y el navegador).
```

### arquitecto-integrador — Plan para tres niveles

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (léelo). Decisión del usuario (09/11/2026): el Aula Virtual pasa de solo secundaria a cubrir inicial, primaria y secundaria, con un diseño unificado (docs/diseno/guia.md v1.1).

Encargo (solo planificar, no implementar): produce el plan de impacto y de implementación.
1. Inventario de todo lo que hoy asume "solo secundaria": ERS y docs/ (00, 02, 03, 04, 05, 09, 10, 12), prisma/schema (Section.gradeLevel 1..5, grados, cursos/áreas), seed, validaciones DTO y zod en packages/shared, motor de notas de Dev 4 (escala 0–20, NE, exoneración, promedio, RN-01..07), reportes/Excel/PDF de Dev 5, textos de la web (p. ej. apps/web/app/login/page.tsx dice "Nivel Secundaria"), RNF-25 (edades). Cita archivo:línea.
2. Modelo propuesto: cómo representar nivel (INICIAL/PRIMARIA/SECUNDARIA) y grado (inicial 3, 4 y 5 años; primaria 1.°–6.°; secundaria 1.°–5.°), y la escala de calificación por nivel (literal AD/A/B/C en inicial y primaria vs vigesimal 0–20 en secundaria, según el CNEB del MINEDU; marca qué está por confirmar). Indica si conviene escala configurable por nivel o por año.
3. Orden de pasos con dueño (modelador-bd, dev2, dev4, dev5, dev1, documentador), qué es compartido y qué es solo del repo privado, y riesgos (migración de datos existentes, tests e2e, contratos de docs/03).
4. Decisiones que debe tomar el usuario o el grupo (lista corta y concreta).
Termina con el INFORME del protocolo.
```

### modelador-bd — Esquema para tres niveles

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (léelo entero: informe del arquitecto y decisiones del usuario). Requisitos: RF-09..25 (estructura), RF-41..52 y RN-01..07 (notas), RNF-25.

Encargo (paso 1 del plan): cambios de esquema Prisma y migración para cubrir inicial, primaria y secundaria. Solo repo privado; no hagas commits.
1. `enum EducationLevel { INICIAL PRIMARIA SECUNDARIA }` y `Section.level` (NOT NULL, default SECUNDARIA para el backfill de filas existentes). `gradeLevel` sigue siendo el grado dentro del nivel: INICIAL 3..5 (años), PRIMARIA 1..6, SECUNDARIA 1..5. Reemplaza el CHECK actual (migración 20261026174231_academic_estructura:142) por uno que dependa del nivel. Ajusta el índice único de Section para incluir el nivel.
2. Escala por nivel, fija: `enum GradingScale { NUMERIC_0_20 LITERAL_ADABC }`. Decide si va como columna derivada en otra tabla o se resuelve en código a partir del nivel (preferible en código vía packages/shared si no hace falta persistirla; justifica). INICIAL y PRIMARIA → LITERAL_ADABC, SECUNDARIA → NUMERIC_0_20.
3. `Grade` (prisma/schema/grading.prisma): agrega `literal` (enum `GradeLiteral { AD A B C }`, nullable). `value` pasa a nullable. CHECK: exactamente uno de `value`/`literal` cuando el estado lo requiere; EXEMPT sigue como hoy. Revisa también `noSubmissionGrade` (contents.prisma:114) y el resumen del período: el logro del bimestre lo elige el docente en escala literal → propone dónde se guarda (p. ej. campo `periodLiteral` en la entidad de resumen existente, o tabla nueva) mirando el modelo actual.
4. Anuncios: ajusta el CHECK de audiencia GRADE (admin.prisma y migración 20261030140220_admin_base:94-97) para que incluya el nivel.
5. Crea la migración con `prisma migrate dev --create-only` y revísala; aplícala sobre la BD local de Docker (`pnpm exec prisma migrate dev`, con NODE_OPTIONS=--dns-result-order=ipv4first). Verifica que no se pierden filas (cuenta Section y Grade antes y después). Regenera el cliente.
6. Corre `pnpm --filter api exec tsc --noEmit` y lista los errores de tipo que provoca el cambio (value nullable, etc.) SIN arreglar código de otros módulos: eso lo harán dev2/dev4/dev5. Sí actualiza docs/02_MODELO_ENTIDADES.md con el modelo nuevo.
No leas ni muestres .env. Termina con el INFORME del protocolo, incluyendo la lista de archivos que rompen tipos agrupados por dueño.
```

### dev2-estructura — Paso 2 estructura tres niveles

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (léelo entero, en especial INFORME 2 del modelador-bd y las decisiones del usuario). Requisitos: RF-09..25. Solo repo privado; no hagas commits.

Encargo (paso 2): adapta estructura académica, usuarios, promoción y seed a los tres niveles.
1. Catálogo en packages/shared (p. ej. src/academic/levels.ts) con `EducationLevel`, `LEVEL_GRADES` (INICIAL 3..5, PRIMARIA 1..6, SECUNDARIA 1..5), helper de validación de grado por nivel y etiqueta legible ("5 años", "3.° Primaria", "2.° Secundaria"). Incluye también `GradingScale` y `scaleForLevel(level)` (INICIAL y PRIMARIA → LITERAL_ADABC, SECUNDARIA → NUMERIC_0_20) para que Dev 4 lo use. El orquestador autoriza exportarlo desde packages/shared/src/index.ts.
2. API: academic.dto.ts (crear/editar sección con `level` obligatorio y rango por nivel; respuestas SectionView con `level`), users.dto.ts (filtro por `level`), servicios y controladores afectados; actualiza docs/03_CONTRATOS.md en lo que cambie de secciones y usuarios.
3. Promoción (promotion-policy.ts): tope por nivel; INICIAL 5 años → PRIMARIA 1.°, PRIMARIA 6.° → SECUNDARIA 1.°, SECUNDARIA 5.° egresa. Ajusta sus specs.
4. Seed (prisma/seed): clave única nueva `academicYearId_level_gradeLevel_code` y secciones de ejemplo en los tres niveles (al menos una de inicial, dos de primaria y las de secundaria actuales), con cursos y matrículas coherentes. Decisión del usuario: los niños de INICIAL no tienen cuenta propia → no crees usuarios STUDENT con login para inicial; si el modelo exige matrícula con usuario, créalos sin credencial y vinculados a un apoderado, y dilo en Decisiones. Corre `pnpm db:seed` en local y verifica.
5. Web de Dev 2 (pantallas de admin de estructura/usuarios): agrega el selector de nivel donde se crea o filtra una sección, y muestra la etiqueta del nivel.
Verifica con NODE_OPTIONS=--dns-result-order=ipv4first: tsc api/web/shared, lint, `pnpm --filter api test`, `pnpm --filter web test`, y los e2e académico y de promoción. No leas .env. Termina con el INFORME.
```

### qa-tester — QA e2e tres niveles paso 2

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (lee los INFORMES 2 y 3; el detalle de hallazgos de dev2 está resumido allí, más abajo te lo repito). Requisitos: RF-09..25. Solo repo privado; no hagas commits.

Encargo: deja en verde los e2e de la API tras el paso 2 (tres niveles) y agrega casos nuevos.
Fallas conocidas (18) que reportó dev2:
- apps/api/test/academic-api.e2e-spec.ts:251, 520, 583-630: los POST /academic-years/:id/sections no mandan `level` (ahora obligatorio) → agregar `level: 'SECUNDARIA'` y un caso 400 con `{ level: 'INICIAL', gradeLevel: 2 }`.
- apps/api/test/academic-schema.e2e-spec.ts:376-395: conteos del seed → 40 curso-sección, 86 matrículas, 83 vigentes, GUARDIAN_LINKS 8, 3 apoderados; 94 usuarios en BD (4 niños de inicial sin correo). Líneas 53 y 174: agrega un caso del CHECK por nivel (PRIMARIA 7 o INICIAL 2 → falla).
- apps/api/test/users-api.e2e-spec.ts:393: `role=STUDENT&gradeLevel=6` ahora es válido → probar `level=SECUNDARIA&gradeLevel=6` → 400. Además: 6 docentes; apoderado01 tiene 3 estudiantes (uno es inicial03).
Casos nuevos mínimos: promoción INICIAL 5 años → PRIMARIA 1.° y PRIMARIA 6.° → SECUNDARIA 1.° (si users-promotion ya los cubre, confírmalo); los niños de inicial no pueden iniciar sesión (sin code ni credencial).
Corre con NODE_OPTIONS=--dns-result-order=ipv4first el e2e completo de la API (`pnpm --filter api exec vitest run --config vitest.config.e2e.ts`) y reporta el total. Si alguna falla es de código de producción y no de test, no lo cambies: repórtalo con archivo:línea. Termina con el INFORME.
```

### dev5-administracion — Anuncios con nivel (dev5)

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (lee INFORMES 2–4). Requisitos: RF-32. Solo repo privado; no hagas commits.

Encargo (adelanto del paso 4, solo anuncios): `POST /announcements` con scope GRADE da 500 porque la migración 20261109120000_tres_niveles exige `Announcement.level` cuando scope=GRADE (CHECK `Announcement_scope_chk`).
1. apps/api/src/modules/announcements/announcements.dto.ts:43 — con scope GRADE pide `level` (EducationLevel) y valida `gradeLevel` según el nivel con `LEVEL_GRADES`/helpers de `@aula/shared` (packages/shared/src/academic). Respuesta del anuncio incluye `level`.
2. announcements.service.ts:176 guarda `level`; los filtros por audiencia (~línea 100, `gradeLevels`) deben comparar (level, gradeLevel) de las secciones del usuario, no solo el grado (un alumno de 3.° primaria no ve un anuncio para 3.° secundaria). Los apoderados de niños de inicial deben ver los anuncios de su nivel/grado.
3. Pantalla web de anuncios del admin (apps/web): selector de nivel cuando la audiencia es por grado y etiqueta legible (usa la copia del catálogo en apps/web/app/(app)/admin/estructura/_lib/levels.ts).
4. Actualiza el test apps/api/test/announcements.e2e-spec.ts para mandar `level: 'SECUNDARIA'` y agrega un caso de aislamiento entre niveles; actualiza docs/03_CONTRATOS.md de anuncios.
Verifica con NODE_OPTIONS=--dns-result-order=ipv4first: tsc y lint de api y web, `pnpm --filter api test`, y el e2e completo de la API (`pnpm --filter api exec vitest run --config vitest.config.e2e.ts`); reporta el total. Termina con el INFORME.
```

### SendMessage → a49a90abaadffbc87

```text
El usuario pidió retomar. Continúa exactamente donde te detuviste (estabas actualizando los tests web de anuncios). Revisa el diff actual de los 10 archivos de anuncios, completa el encargo original y verifica con NODE_OPTIONS=--dns-result-order=ipv4first: tsc y lint de api y web, `pnpm --filter api test`, `pnpm --filter web test` y el e2e completo de la API. Termina con el INFORME.
```

### dev4-calificaciones — Paso 3 notas con letras (dev4)

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (léelo entero: decisiones del usuario e INFORMES 2–5). Requisitos: RF-41..52, RN-01..07. Solo repo privado; no hagas commits.

Encargo (paso 3): motor de notas con dos escalas.
- Escala por nivel con `scaleForLevel(level)` de `@aula/shared` (packages/shared/src/academic): SECUNDARIA → NUMERIC_0_20 (sin cambios de comportamiento); INICIAL y PRIMARIA → LITERAL_ADABC.
- Modelo ya migrado: `Grade.literal` (GradeLiteral AD/A/B/C, `value` nullable; CHECK: GRADED/NE llevan exactamente uno de value/literal; EXEMPT ninguno), `Assignment.noSubmissionLiteral`, tabla `PeriodAchievement` (enrollmentId, courseSectionId, periodId, literal, comment).
1. packages/shared/src/grading: tipos de entrada `{ value } | { literal }` según escala; `gradebook`, `effective-entry` y `average` ramificados: en literal NO hay promedio aritmético; el resumen del período es el `PeriodAchievement` que elige el docente (decisión del usuario), y el registro muestra los literales de las tareas como apoyo. NE automática en literal: usa `noSubmissionLiteral` de la tarea y, si es nulo, deja la entrada como NE sin literal mostrado como "NE" (el usuario aún no decidió el literal por defecto: déjalo configurable y anótalo en Pendientes).
2. API de notas (apps/api/src/modules/grading): PUT de notas acepta value o literal y valida que coincida con la escala del nivel de la sección (400 si no). CRUD de logro del bimestre: `PUT /course-sections/:id/periods/:periodId/achievements/:enrollmentId` (docente de la sección; período abierto; solo escala literal) y su lectura en registro, "Mis notas" y vista de apoderado. Bitácora sin el comentario (dato de menor). Exoneración igual que hoy.
3. apps/api/src/modules/contents/assignments.policy.ts: validar `noSubmissionLiteral` en INICIAL/PRIMARIA (stub de Dev 3 autorizado por el orquestador).
4. Web de Dev 4 (registro auxiliar, calificar entrega, Mis notas, apoderado): selector AD/A/B/C cuando la escala es literal, columna "Logro del bimestre" editable para el docente, y etiquetas de nivel. Los niños de inicial no tienen cuenta: su vista es solo la del apoderado.
5. Actualiza docs/03_CONTRATOS.md (notas, registro, mis notas, apoderado, logros) y docs/04 si cambian reglas RN.
Verifica con NODE_OPTIONS=--dns-result-order=ipv4first: tsc y lint de api/web/shared, tests unitarios de api/web/shared y el e2e completo de la API (`pnpm --filter api exec vitest run --config vitest.config.e2e.ts`); agrega e2e de notas literales y de logro del bimestre. Termina con el INFORME.
```

### dev5-administracion — Paso 4 reportes y exportación

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (lee INFORMES 2–6). Requisitos: RF-57..60, RF-63. Solo repo privado; no hagas commits. Corre en paralelo con dev1 (login/layout) y dev3 (tareas): no toques sus archivos.

Encargo (paso 4):
1. reports.dto.ts:34,44 — hoy acepta gradeLevel hasta 12: agrega `level` y valida el grado con `isValidGradeForLevel` de `@aula/shared`.
2. Reportes por sección (section-report.ts ~87-91, report-xlsx.ts, PDF, dashboard-aggregate.ts, reports.service.ts): ramifica por `scaleForLevel(section.level)`. En escala literal muestra los literales por tarea y el logro del bimestre (`PeriodAchievement`) en vez de promedio; el indicador "en riesgo" en literal = logro C (o sin logro). Filtros y agrupaciones por (nivel, grado). Etiquetas con nivel ("3.° Primaria A", "5 años C"). Ningún comentario de logro en reportes ni exportaciones institucionales.
3. Exportación de datos personales (lifecycle/processors/personal-data-export.processor.ts:178): incluye `literal` de las notas y los `PeriodAchievement` (literal y comentario) del titular; revisa también la purga para que borre PeriodAchievement donde corresponda.
4. Pantalla web /admin/reportes: filtro de nivel.
5. docs/03 en lo que cambie.
Verifica con NODE_OPTIONS=--dns-result-order=ipv4first: tsc/lint api y web, tests api y web, e2e completo de la API. Termina con el INFORME.
```

### dev1-plataforma — Paso 5 textos login y encabezado

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (léelo). Guía de diseño: docs/diseno/guia.md v1.1 (patrón 4.9 del login, diseño unificado). Solo repo privado; no hagas commits. Corre en paralelo con dev5 (reportes) y dev3 (tareas): no toques sus archivos.

Encargo (paso 5, solo textos y etiquetas; NO rediseñar todavía):
1. apps/web/app/login/page.tsx:25-32 — quita "nivel secundaria"/"Nivel Secundaria": texto unificado para inicial, primaria y secundaria (p. ej. "Plataforma del colegio para estudiantes, docentes y familias de inicial, primaria y secundaria."). Texto blanco opaco en lugar de /80 y /70 sobre el panel.
2. apps/web/components/layout/course-header.tsx y lo relacionado (sectionLabel, my-courses-list, course-nav-model): mostrar la sección con nivel ("3.° Secundaria A", "4.° Primaria C", "5 años C") usando el campo `level` que ya devuelve la API en `MyCourseSection.section` y en el contexto del curso. Ajusta sus tests.
3. Busca en apps/web otros textos fijos de "secundaria" o grados 1..5 en archivos de Dev 1 (layout, sidebar, perfil) y corrígelos.
Verifica: tsc, eslint y `pnpm --filter web test` (con NODE_OPTIONS=--dns-result-order=ipv4first). Termina con el INFORME.
```

### dev3-contenidos — Selector NE literal en tareas

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (lee INFORME 6). Solo repo privado; no hagas commits. Corre en paralelo con dev5 y dev1: no toques sus archivos.

Encargo: en el formulario de crear/editar tarea (apps/web/app/(app)/curso/[id]/tareas/: assignment-fields.tsx, edit-assignment-form.tsx, actions.ts, assignment-format.ts y tests), cuando la sección es INICIAL o PRIMARIA (escala literal, `context.section.level`), reemplaza el campo de nota NE numérica por un selector AD/A/B/C opcional (`noSubmissionLiteral`), que la API ya acepta (assignments.dto/policy). En SECUNDARIA queda como hoy. Además, para INICIAL los niños no entregan PDF (decisión del usuario): en secciones de INICIAL la tarea debe presentarse como actividad sin entrega (revisa si la API ya lo impide; si no, NO cambies la API: repórtalo como hallazgo). Verifica tsc, eslint y `pnpm --filter web test` con NODE_OPTIONS=--dns-result-order=ipv4first. Termina con el INFORME.
```

### SendMessage → ae4a8a292a78510ee

```text
Orquestador: autorizo cerrar el hallazgo, coherente con la decisión del usuario (inicial sin entregas). En apps/api/src/modules/submissions/ rechaza crear/reemplazar entregas (y pedir URL de subida para entregas) cuando la sección de la tarea es INICIAL: 409 con código `NO_SUBMISSIONS_IN_LEVEL` y mensaje en español; agrega spec unitario y un caso en el e2e de entregas. Oculta también la tabla "Entregas" del docente en INICIAL. Actualiza docs/03 (entregas). Verifica con NODE_OPTIONS=--dns-result-order=ipv4first: tsc/lint api, `pnpm --filter api test`, `pnpm --filter web test` y el e2e de submissions. No toques archivos de reports ni lifecycle (dev5 trabaja en paralelo). Termina con el INFORME.
```

### qa-tester — QA final tres niveles

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (lee INFORMES 2–10). Requisitos: RF-09..25, RF-32, RF-41..52, RF-57..60, RF-63, RN-01..07. Solo repo privado; no hagas commits.

Encargo: QA del cambio a tres niveles completo.
1. Revisa los e2e nuevos o tocados por los devs (grading-levels, announcements, submissions INICIAL, reports) y cubre lo que falta:
   - reportes de escala literal con logros reales en la BD (XLSX/PDF con columna Logro, dashboard con `achievements` y `totalByScale`);
   - exportación de datos personales v2 con `logrosDelPeriodo`;
   - casos límite literales: traslado con logro, período cerrado al poner logro, ADMIN en modo soporte;
   - aislamiento: un docente de secundaria no puede poner logro en una sección de primaria ajena.
2. Corre todo con NODE_OPTIONS=--dns-result-order=ipv4first: lint, tsc de api/web/shared/worker, tests unitarios de api/web/shared, el e2e completo de la API y el build (`S3_PUBLIC_ORIGIN=https://bucket.ci.invalid pnpm build`). Al final vuelve a correr `pnpm db:seed` para dejar la BD local limpia.
Solo modificas archivos de test. Si una falla es de producción, repórtala con archivo:línea y dueño. Termina con el INFORME con los totales.
```

### seguridad-cumplimiento — Seguridad tres niveles

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (lee INFORMES 2–11; los archivos tocados están listados en cada uno; también `git status --short` y `git diff` del working tree, que no tiene commit). Requisitos: RNF-09..13, RF-63.

Audita el cambio a tres niveles: endpoint nuevo de logro del bimestre (PUT achievements) y su autorización por pertenencia y período; validación de escala por nivel en notas; aislamiento entre niveles en anuncios, avisos del worker y reportes; bloqueo de entregas en INICIAL (submissions y files.service); niños de inicial como usuarios STUDENT sin code/email/credencial (que no haya vía de login ni de recuperación para ellos, y que nada asuma email no nulo); datos de menores desde 3 años: comentario del logro fuera de la bitácora y de reportes institucionales, incluido en la exportación de datos personales v2 (`logrosDelPeriodo`) y su retención/purga; Ley 29733 y consentimiento del apoderado con el nuevo rango de edades. Termina con el INFORME del protocolo.
```

### ux-accesibilidad — UX tres niveles

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (lee INFORMES 3, 5–10). Guía: docs/diseno/guia.md v1.1. Requisitos: RNF-24..27.

Revisa las pantallas cambiadas por los tres niveles (archivos .tsx listados en esos INFORMES): selector de nivel y grado en admin de estructura, usuarios, anuncios y reportes; selector AD/A/B/C al calificar y en el formulario de tareas (NE literal); columna "Logro del bimestre" editable en el registro (achievement-cell.tsx); Mis notas y vista del apoderado con logros; tareas de INICIAL como actividad sin entrega; textos del login y etiquetas de sección con nivel. Criterios: 360 px, teclado, etiquetas, errores asociados, contraste, coherencia con shadcn y diseño unificado (nada personalizado por nivel). Termina con el INFORME del protocolo.
```

### modelador-bd — Backfill en migración

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (INFORME 13 y "Vuelta de corrección 1"). Solo repo privado; no hagas commits.

Encargo: en prisma/migrations/20261109120000_tres_niveles/migration.sql agrega, antes del ADD CONSTRAINT del nuevo CHECK de Announcement, `UPDATE Announcement SET level = 'SECUNDARIA' WHERE scope = 'GRADE' AND level IS NULL;`. Haz lo mismo si hay otro CHECK nuevo que requiera backfill (revisa Section y Grade). La migración no tiene commit y solo está aplicada en la BD local de Docker, así que el orquestador autoriza editarla y luego, con NODE_OPTIONS=--dns-result-order=ipv4first: `pnpm exec prisma migrate reset --force` (solo BD local; local-guard debe aceptar) y `pnpm db:seed`. Prueba el backfill: en una BD temporal o con una transacción, inserta un anuncio GRADE sin level antes de la migración (o razona sobre el SQL) y confirma que pasa. Verifica `prisma migrate status` y el diff vacío. No leas .env. Termina con el INFORME.
```

### dev2-estructura — Corrección ALTO niños inicial

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (INFORME 13, hallazgo ALTO, y "Vuelta de corrección 1"). Solo repo privado; no hagas commits. Corren en paralelo dev4 (grading/web registro), dev3 (tareas) y dev5 (notifications): no toques sus archivos. NO corras e2e ni toques la BD (lo hará QA); solo tests unitarios.

Encargo: los niños de INICIAL no deben obtener login por ninguna vía de la API.
1. enrollments.service.ts:98-104 `createStudent`: si la sección destino es INICIAL, no llamar a `issuer.createUser`; crear `User` STUDENT sin code, email ni LocalCredential, DNI opcional; respuesta sin `credentials`. La web de alta de estudiante no debe mostrar la hoja de credenciales en ese caso. Puedes tocar mínimamente apps/api/src/modules/auth/credential-issuer.service.ts (de Dev 1) solo si es imprescindible; prefiere no hacerlo.
2. users.service.ts:330-381 `resetPassword` y reissue de código: 422 `STUDENT_WITHOUT_ACCOUNT` si el usuario es STUDENT sin credencial y su matrícula vigente es de INICIAL.
3. users/import/user-import.service.ts:216-249: igual regla en la importación masiva (filas de INICIAL sin credencial; agrega columna `nivel` a la plantilla si hace falta para saberlo — si es demasiado, rechaza filas cuya sección sea INICIAL con mensaje claro).
4. Vínculo GuardianStudent por DNI: que no requiera DNI del niño de INICIAL si no hay; revisa que no emita credencial.
5. docs/03 en lo que cambie. Specs unitarios de las 3 rutas.
Verifica tsc/lint de api y web, `pnpm --filter api test` y `pnpm --filter web test` con NODE_OPTIONS=--dns-result-order=ipv4first. Termina con el INFORME.
```

### dev4-calificaciones — Correcciones UX notas inicial

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (INFORMES 12 y 13, y "Vuelta de corrección 1"). Solo repo privado; no hagas commits. Corren en paralelo dev2, dev3 y dev5: no toques sus archivos. NO corras e2e ni toques la BD; solo tests unitarios.

Corrige:
1. [MEDIO] apps/web/app/(app)/curso/[id]/registro/tarea/[assignmentId]/grade-form.tsx:54-56,125-137 (y page.tsx:74, grading-format.ts:77-81): en INICIAL empezar en GRADED y renombrar la opción NE a "Sin registro de logro" (pasa un flag `noDelivery` desde la página).
2. [MEDIO] registro/_components/achievement-cell.tsx:35-37,54-71,90-94: `id` en el mensaje de error, `aria-describedby` y `aria-invalid` en el fieldset, foco al primer radio si falta elegir. [BAJO] líneas 52 y 81: clases de foco `focus-visible:ring-2 focus-visible:ring-ring` en summary y textarea, y el estilo INVALID_FIELD común en el textarea.
3. [BAJO] apps/web/app/(app)/apoderado/page.tsx:90-98: reemplaza la tarjeta "Pronto verás aquí los anuncios" por un enlace "Ver anuncios" a /anuncios (con el studentId si la ruta lo admite).
Ajusta los tests. Verifica tsc, eslint y `pnpm --filter web test` con NODE_OPTIONS=--dns-result-order=ipv4first. Termina con el INFORME.
```

### dev3-contenidos — Subtítulo tareas inicial

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (INFORME 12). Solo repo privado; no hagas commits; no toques archivos de otros devs; no corras e2e.
Corrige [MEDIO] apps/web/app/(app)/curso/[id]/tareas/page.tsx:368: el subtítulo fijo "Tareas del curso con entrega en PDF" debe ser "Actividades del curso" en INICIAL y quedarse como está en PRIMARIA/SECUNDARIA; la hora del servidor solo si hay entrega. Ajusta page.test.ts. Verifica tsc, eslint y `pnpm --filter web test` con NODE_OPTIONS=--dns-result-order=ipv4first. Termina con el INFORME.
```

### dev5-administracion — Fallo cerrado en avisos

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (INFORME 13). Solo repo privado; no hagas commits; no toques archivos de otros devs; no corras e2e ni toques la BD.
Corrige [MEDIO] apps/api/src/modules/notifications/worker/notification-recipients.service.ts:85: `level: a.level ?? undefined` falla abierto. Si un anuncio GRADE llega con `level` nulo, la audiencia debe ser vacía (fallo cerrado). Revisa el mismo patrón en notifications.service.ts y announcements.service.ts. Agrega specs unitarios. Verifica tsc/lint de api y `pnpm --filter api test` con NODE_OPTIONS=--dns-result-order=ipv4first. Termina con el INFORME.
```

### revisor-pr — Revisión final tres niveles

```text
Expediente: .claude/tareas/20261109-tres-niveles.md (léelo entero; los INFORMES 1–13 y las decisiones). Revisión final del cambio a tres niveles, sin commit (working tree). El orquestador ya cerró la vuelta 1: fallo cerrado en notification-recipients.service.ts, a11y de achievement-cell.tsx, 422 STUDENT_WITHOUT_ACCOUNT en users.service.ts (resetPassword y correctDni, helper en users-queries.ts, e2e en users-api.e2e-spec.ts), backfill de Announcement.level en la migración 20261109120000_tres_niveles, D-065 en docs/08 y POLICY_VERSION 2026-2 (env.ts y .env.example).
Verificación ya hecha por el orquestador (no la repitas entera; puedes muestrear): tsc 0 errores en api/web/worker/shared; lint 0; api 1269, web 560, shared 144; e2e 739/739 (reports-edge PDF tuvo un timeout ocasional y pasó al repetir); build 5/5; prettier ok.
Revisa: definición de terminado, que los hallazgos ALTO/MEDIO de seguridad y UX estén resueltos, coherencia de docs/03 y docs/02 con el código, que no se hayan tocado archivos fuera de lo justificado en el expediente, y que .agents/, docs.zip, docs/criterios.rar y .env no estén afectados. Nota: la BD local tiene aplicada la migración sin la línea de backfill (checksum distinto); no la resetees. Termina con el INFORME (APROBADO o CAMBIOS_PEDIDOS).
```
