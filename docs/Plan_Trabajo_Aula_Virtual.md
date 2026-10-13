# PLAN DE TRABAJO DEL EQUIPO

# Aula Virtual Institucional

**Repartición del trabajo**

Módulos por developer, plan por sprints y flujo de trabajo con Git

| | |
|---|---|
| Equipo | 5 developers practicantes – UNDC |
| Documento base | ERS – Aula Virtual Institucional (Secundaria) v1.0 |
| Ramas | `main` (producción) · `develop` (pruebas) · `features/{nombre}` (una por developer) |
| Elaborado por | Walter David Santos Mendieta Napan |
| Fecha | 13 de octubre de 2026 |

**Antes de empezar:** reemplacen «Dev 1» a «Dev 5» por sus nombres y cada `{devN}` por el nombre de su rama `features/{nombre}`. Los códigos RF-xx, RN-xx y RNF-xx se refieren al documento de requerimientos (ERS).

---

Plan de trabajo – Aula Virtual Institucional　　　　　　　　　　　　　　　　　　　　　　　　　13/10/2026

## 1. Criterio de división

Cada developer es **dueño de un módulo completo de punta a punta**: backend, frontend y pruebas de su parte. No se divide en «uno hace el backend y otro el frontend» por tres razones:

- Cada uno trabaja sobre carpetas distintas, así que hay **menos conflictos de merge**.
- Cada uno puede probar su módulo completo sin esperar a otro.
- Todos aprenden el stack completo: NestJS, Next.js, Prisma y Docker.

El orden de dependencia entre módulos define quién va primero:

| Dev 1 | Dev 2 | Dev 3 | Dev 4 | Dev 5 |
|---|---|---|---|---|
| Plataforma y Auth | Estructura y Usuarios | Contenidos y Entregas | Calificaciones | Reportes y Admin |

→ cada módulo usa lo que construye el anterior

Para que nadie se quede esperando, en el **Sprint 0** se crean el esquema de base de datos y los **datos de prueba (seed)**. Así, por ejemplo, Dev 4 puede programar calificaciones con secciones y alumnos ficticios aunque Dev 2 todavía no haya terminado las pantallas para crearlos.

## 2. Asignación por developer

**Recomendación:** Dev 1 debe ser quien tenga más experiencia con Git y Docker. Su trabajo es la base de todo el proyecto y además actúa como **líder técnico e integrador**: aprueba los merges a develop y hace el paso de develop a main.

### Dev 1: Plataforma, autenticación y seguridad

**Rama:** `features/{dev1}`

| Requerimientos | Qué construye |
|---|---|
| RF-01 a RF-08 | Login único, Google OAuth con restricción de dominio, lista blanca, cuenta local del admin con 2FA, redirección por rol, sesiones, aceptación de política y términos, bloqueo de usuarios inactivos |
| RNF-01 a RNF-08 | HTTPS, guards de roles y pertenencia (los usan todos), archivos privados, argon2, cookies seguras, helmet y rate limiting |
| RNF-14 y RNF-15 | **Servicio de bitácora:** la función que registra eventos. La usan todos los módulos |
| RNF-20 a RNF-23 | Backups automáticos, Sentry, Uptime Kuma y logs con Pino |
| RNF-28 a RNF-30 | Monorepo, docker-compose.yml, variables de entorno, ESLint, Prettier, Husky y GitHub Actions |
| Transversal | **Layout base y sistema de diseño:** menú lateral por rol, componentes shadcn/ui compartidos, tema y logo |

**Carpetas propias:** `apps/api/src/modules/auth` · `apps/api/src/common` (guards, interceptores, bitácora) · `apps/web/app/(auth)` · `packages/ui` · `docker/` · `.github/`

Página 2

---

Plan de trabajo – Aula Virtual Institucional　　　　　　　　　　　　　　　　　　　　　　　　　13/10/2026

### Dev 2: Estructura académica y usuarios

**Rama:** `features/{dev2}`

| Requerimientos | Qué construye |
|---|---|
| RF-09 a RF-17 | Años lectivos, períodos con cierre y reapertura, grados, secciones, catálogo de cursos, asignación de docentes, clonación de estructura, promoción de año, solo lectura de años anteriores |
| RF-18 a RF-25 | Registro de estudiantes, docentes y apoderados, importación masiva desde Excel o CSV, edición, estados (activo, inactivo, retirado), traslado de sección, búsqueda y filtros |
| Seed | **Datos de prueba:** año lectivo 2026, grados, secciones, cursos, 5 docentes, 60 estudiantes y un admin |

**Carpetas propias:** `apps/api/src/modules/academic` · `apps/api/src/modules/users` · `apps/web/app/admin/estructura` · `apps/web/app/admin/usuarios` · `prisma/seed`

### Dev 3: Contenidos, entregas y archivos

**Rama:** `features/{dev3}`

| Requerimientos | Qué construye |
|---|---|
| RF-26 a RF-31 | Apartados Clases, Libros de lectura (con aviso de derechos de autor y marca de reutilizable) y Tareas asignadas (límite de MB, nota por no entrega, entregas tardías), edición, papelera, vista del estudiante |
| RF-33 a RF-40 | Subida de tareas, validación de PDF, límite de tamaño, reentrega con historial, **entregas tardías con aviso de retraso**, estados de entrega, comprobante, escaneo con ClamAV |
| RNF-03 y RNF-18 | **Servicio de almacenamiento:** MinIO/R2 y URLs firmadas para subir y descargar |

**Carpetas propias:** `apps/api/src/modules/contents` · `apps/api/src/modules/submissions` · `apps/api/src/modules/storage` · `apps/web/app/curso/[id]/(clases|lecturas|tareas)`

### Dev 4: Calificaciones y apoderados

**Rama:** `features/{dev4}`

| Requerimientos | Qué construye |
|---|---|
| RN-01 a RN-07 | **Motor de notas** en packages/shared: promedio simple, redondeo único con el .5 hacia arriba, conversión a literal, NE y exoneración. Con decimal.js |
| RF-41 a RF-51 | Calificar, retroalimentación, visor PDF, asignación automática de NE (tarea programada en BullMQ), ajuste de NE, exoneración, registro auxiliar, cálculo de promedios, dashboard del docente, bloqueo por cierre, «Mis notas» |
| RF-52 | Panel del apoderado, de solo lectura |
| RNF-31 | Tests del motor de notas con **cobertura mínima del 90 %** |

**Carpetas propias:** `packages/shared/grading` · `apps/api/src/modules/grading` · `apps/web/app/curso/[id]/registro` · `apps/web/app/mis-notas` · `apps/web/app/apoderado`

Página 3

---

Plan de trabajo – Aula Virtual Institucional　　　　　　　　　　　　　　　　　　　　　　　　　13/10/2026

### Dev 5: Administración, reportes, notificaciones y ciclo de vida

**Rama:** `features/{dev5}`

| Requerimientos | Qué construye |
|---|---|
| RF-55 a RF-63 | Acceso total, modo soporte, consulta de registros, **exportación Excel y PDF por sección**, **ZIP masivo**, dashboard institucional, configuración institucional (logo, tabla de conversión, plazo de purga), consulta de bitácora, exportación de datos personales |
| RF-32, RF-53 y RF-54 | Anuncios, notificaciones (plataforma y correo) y calendario |
| RF-64 a RF-67 | Archivado por período, respaldo anual en ZIP, purga automática, panel de almacenamiento |

**Carpetas propias:** `apps/api/src/modules/(reports|notifications|announcements|lifecycle|settings)` · `apps/web/app/admin/(reportes|configuracion|bitacora|almacenamiento)` · `apps/worker`

### Carga resultante

| Dev | RF | Complejidad principal |
|---|---|---|
| 1 | 8 + infraestructura | Seguridad, Docker, CI. Está en la ruta crítica del inicio |
| 2 | 17 | Muchos CRUD, importación masiva, promoción de año |
| 3 | 14 | Manejo de archivos, validaciones, antivirus |
| 4 | 12 | Lógica de negocio delicada, tareas programadas |
| 5 | 16 | Reportes, colas y tareas en segundo plano |

Dev 2 tiene más requerimientos, pero en su mayoría son formularios y tablas repetitivos. Dev 1 tiene menos RF, pero su trabajo es el que más pesa al inicio.

Página 4

---

Plan de trabajo – Aula Virtual Institucional　　　　　　　　　　　　　　　　　　　　　　　　　13/10/2026

## 3. Plan por sprints

Sprints sugeridos de **2 semanas**. Ajusten la duración según sus horas de práctica.

| Sprint | Dev 1 | Dev 2 | Dev 3 | Dev 4 | Dev 5 |
|---|---|---|---|---|---|
| **0. Base** (1 semana) | Monorepo, Docker Compose, CI, layout base | Seed de datos | Servicio de almacenamiento con MinIO | Motor de notas en shared con sus tests | Estructura del worker y BullMQ, Mailpit |
| **1. Núcleo** | Login con Google, lista blanca, guards de rol | Años, períodos, grados, secciones, cursos | Clases y lecturas, creación de tareas | Calificar y retroalimentación | Configuración institucional, anuncios |
| **2. Flujo completo** | 2FA del admin, bitácora, aceptación de términos | Usuarios, importación masiva, estados | Entregas, PDF, tardías, reentrega | NE automática, exoneración, registro auxiliar | Exportación Excel y PDF por sección |
| **3. Complementos** | Rate limiting, helmet, backups | Asignación de docentes, traslados | Papelera, ClamAV, comprobante | Dashboard docente, Mis notas, apoderado | ZIP masivo, notificaciones, calendario, modo soporte |
| **4. Cierre** | Monitoreo, despliegue a producción | Clonación y promoción de año | Visor de PDF (con Dev 4) | Cierre de período y bloqueo | Ciclo de vida, purga, dashboard institucional |

**Sprint 0 – todos juntos:** modelo entidad-relación y esquema Prisma inicial.  
**Sprint 5 – Estabilización (todos):** pruebas end-to-end con Playwright, corrección de errores, manuales de usuario y técnico.

**Meta de cada sprint:** al terminarlo, develop debe tener un flujo demostrable. Por ejemplo, al cerrar el Sprint 2 debe funcionar todo el recorrido: el docente crea una tarea, el alumno la entrega y el docente la califica.

## 4. Flujo de trabajo con Git

| features/{nombre} | develop | main |
|---|---|---|
| trabajo diario | pruebas · vía Pull Request revisado | producción · al final de cada sprint |

### Ciclo diario de cada developer

```bash
# 1. Al empezar el día: traer lo último de develop a tu rama
git checkout features/{nombre}
git fetch origin
git merge origin/develop          # o rebase, si el equipo lo domina

# 2. Trabajar y hacer commits pequeños
git commit -m "feat(entregas): RF-37 aviso de entrega con retraso"

# 3. Subir la rama
git push origin features/{nombre}

# 4. Abrir un Pull Request de features/{nombre} -> develop en GitHub
```

### Reglas del equipo

| Regla | Detalle |
|---|---|
| PR pequeños y frecuentes | Un PR por requerimiento o grupo pequeño, **mínimo 2 por semana**. Una rama que acumula 3 semanas sin integrarse termina en conflictos difíciles |
| Sincronizar a diario | Traer develop a tu rama todos los días |

Página 5

---

Plan de trabajo – Aula Virtual Institucional　　　　　　　　　　　　　　　　　　　　　　　　　13/10/2026

| Regla | Detalle |
|---|---|
| Revisión cruzada | Ningún PR entra a develop sin la aprobación de otro developer. Rotación: 1 → 2 → 3 → 4 → 5 → 1. Cada uno revisa el módulo que alimenta al suyo |
| CI en verde | Los PR solo se aprueban si pasan lint, tests y build |
| Ramas protegidas | En GitHub, main y develop no aceptan push directo, solo PR aprobados |
| Commits convencionales | feat, fix, refactor, test, docs + módulo + ID del requerimiento. Así se rastrea qué RF está implementado |
| develop → main | Solo al final de cada sprint, cuando todo lo de develop está probado. Lo hace Dev 1 con un PR de release y una etiqueta (v0.1.0, v0.2.0…) |

### Puntos de conflicto y cómo evitarlos

| Archivo compartido | Solución |
|---|---|
| Esquema Prisma | Dividirlo en **varios archivos**, uno por módulo (Prisma lo permite): academic.prisma, contents.prisma, grading.prisma, etc. Cada dev edita solo el suyo |
| Migraciones | Generar la migración **después** de sincronizar con develop, y una sola migración por PR. Si dos migraciones chocan, se regenera la del PR más reciente |
| packages/ui (componentes compartidos) | Lo mantiene Dev 1. Si otro necesita un componente nuevo, lo agrega en un PR separado y pequeño |
| package.json y pnpm-lock.yaml | Avisar en el grupo antes de instalar una librería nueva y subirla en su propio PR |
| Menú de navegación | Definir todas las rutas en el Sprint 0, aunque las páginas estén vacías al principio |

## 5. Definición de «terminado»

Un requerimiento solo se marca como terminado cuando cumple todo esto:

- [ ] Funciona en develop levantado con Docker, no solo en la máquina del developer.
- [ ] Respeta permisos por rol y pertenencia, validados en el backend.
- [ ] Registra en la bitácora las acciones críticas.
- [ ] Se ve bien en un celular de 360 px.
- [ ] Tiene tests de su lógica principal.
- [ ] Fue revisado y aprobado por otro developer.
- [ ] El PR menciona el ID del requerimiento (RF-xx).

Página 6
