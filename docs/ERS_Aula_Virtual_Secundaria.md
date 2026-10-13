# ESPECIFICACIÓN DE REQUERIMIENTOS DE SOFTWARE

## Aula Virtual Institucional

### Nivel Secundaria

Requerimientos funcionales, reglas de negocio y requerimientos no funcionales

| | |
| --- | --- |
| Institución | [Nombre de la institución educativa] |
| Elaborado por | Walter David Santos Mendieta Napan |
| Versión | 1.0 |
| Fecha | 13 de octubre de 2026 |
| Estado | Borrador para revisión con la institución |

## 1. Introducción

### 1.1 Propósito

Este documento especifica los requerimientos del Aula Virtual Institucional para un colegio de nivel secundaria. Sirve como base acordada entre la institución y el equipo de desarrollo para el diseño, la construcción, las pruebas y la aceptación del sistema.

### 1.2 Alcance

El sistema permite organizar la enseñanza por año lectivo, grado, sección, curso y docente; publicar materiales; recibir entregas de tareas en PDF; calificar con escala numérica y convertir los promedios a la escala literal del Minedu; y administrar usuarios, estructura académica, reportes y el ciclo de vida de los archivos. Incluye cuatro perfiles: Estudiante, Docente, Administrador y Apoderado.

### 1.3 Definiciones

| Término | Definición |
| --- | --- |
| Año lectivo | Contenedor temporal (por ejemplo, 2026) que agrupa períodos, matrículas, cursos dictados y notas. |
| Grado | Nivel académico fijo: 1.º a 5.º de secundaria. |
| Sección | Grupo de estudiantes de un grado en un año lectivo (por ejemplo, 3.º A – 2026). |
| Curso-sección | Unión de un curso, una sección, un año lectivo y un docente asignado. De ella dependen materiales, actividades y notas. |
| Período | Subdivisión del año lectivo: I Bimestre, II Bimestre, III Trimestre y IV Trimestre. |
| Actividad / Tarea | Trabajo asignado por el docente que el estudiante entrega en PDF y que recibe una nota. |
| NE | No entregó: estado y nota automática asignada cuando vence el plazo de una tarea sin entrega. |
| Exonerado | Estudiante liberado de una actividad por motivo justificado; la actividad no cuenta en su promedio. |
| Registro auxiliar | Matriz de estudiantes por actividades con notas y promedios de un curso-sección en un período. |
| Modo soporte | Uso por parte del administrador de las funciones del docente, con registro en bitácora. |

### 1.4 Perfiles de usuario

| Perfil | Descripción |
| --- | --- |
| Estudiante | Consulta materiales, entrega tareas en PDF y revisa sus notas y retroalimentación de los cursos de su sección. |
| Docente | Publica materiales y tareas en sus cursos-sección, califica entregas y consulta el registro auxiliar y su dashboard. |
| Administrador | Gestiona la estructura académica, los usuarios, los períodos y la configuración; accede a todo el contenido, actúa en modo soporte y exporta los registros de notas. |
| Apoderado | Consulta en modo solo lectura las notas, entregas y avisos de los estudiantes a su cargo. |

## 2. Descripción general

### 2.1 Estructura académica

La información se organiza en la jerarquía: Año lectivo → Período y Año lectivo → Grado → Sección → Curso-sección (con docente asignado) → Materiales y Actividades → Entregas y Notas. Solo un año lectivo está activo a la vez; los años anteriores quedan en solo lectura.

### 2.2 Períodos académicos

| Período | Meses |
| --- | --- |
| I Bimestre | Marzo – Abril |
| II Bimestre | Mayo – Junio |
| III Trimestre | Julio – Agosto – Setiembre |
| IV Trimestre | Octubre – Noviembre – Diciembre |

### 2.3 Supuestos y dependencias

- La institución cuenta con un dominio propio y con Google Workspace for Education, y cada estudiante, docente y administrador tiene una cuenta institucional.

- La institución define en su reglamento interno la tabla de conversión de nota numérica a literal; el sistema la aplica de forma configurable.

- La institución es responsable legal del tratamiento de datos personales; el sistema provee los mecanismos técnicos para cumplir la normativa.

## 3. Requerimientos funcionales

Prioridad: Alta = indispensable para la primera versión; Media = incluida en la primera versión, pero puede liberarse en una entrega posterior sin bloquear la operación.

### 3.1 Autenticación y acceso

| ID | Requerimiento | Descripción | Actor | Prioridad |
| --- | --- | --- | --- | --- |
| RF-01 | Inicio de sesión único | Una sola pantalla de inicio de sesión para todos los perfiles. | Todos | Alta |
| RF-02 | Login con Google Workspace | Todos los usuarios inician sesión con su cuenta institucional de Google. Solo se aceptan cuentas del dominio de la institución (validado en el servidor). | Todos | Alta |
| RF-03 | Lista blanca de usuarios | Solo pueden ingresar los correos registrados previamente por el administrador. El rol se obtiene de la base de datos del sistema, no de Google. | Sistema | Alta |
| RF-04 | Cuenta local de respaldo | El administrador cuenta además con usuario y contraseña propios del sistema, protegidos con doble factor (TOTP), para acceder si falla la integración con Google. | Admin | Alta |
| RF-05 | Redirección por rol | Tras autenticarse, el usuario es dirigido al panel de su perfil. | Todos | Alta |
| RF-06 | Cierre y expiración de sesión | Cierre de sesión manual y expiración automática por inactividad. | Todos | Alta |
| RF-07 | Aceptación de política y términos | En el primer ingreso (y ante cada nueva versión) el usuario acepta la política de privacidad y los términos de uso. Se registra la fecha y la versión aceptada. | Todos | Alta |
| RF-08 | Bloqueo de usuarios no activos | Los usuarios en estado inactivo o retirado no pueden iniciar sesión. | Sistema | Alta |

### 3.2 Estructura académica

| ID | Requerimiento | Descripción | Actor | Prioridad |
| --- | --- | --- | --- | --- |
| RF-09 | Gestión de años lectivos | Crear, editar y activar años lectivos. Solo uno puede estar activo. | Admin | Alta |
| RF-10 | Gestión de períodos | Definir los cuatro períodos del año lectivo con sus fechas de inicio y fin. | Admin | Alta |
| RF-11 | Cierre y reapertura de períodos | Cerrar un período bloquea la edición de notas. Solo el administrador puede reabrirlo, indicando un motivo que queda en la bitácora. | Admin | Alta |
| RF-12 | Gestión de grados y secciones | Crear, editar y desactivar secciones de cada grado (1.º a 5.º) dentro de un año lectivo. | Admin | Alta |
| RF-13 | Catálogo de cursos | Crear, editar y desactivar los cursos que dicta la institución. | Admin | Alta |
| RF-14 | Asignación de docentes | Asignar y reasignar el docente a cargo de cada curso-sección. | Admin | Alta |
| RF-15 | Clonación de estructura | Copiar secciones y cursos de un año lectivo al siguiente para luego ajustarlos. | Admin | Media |
| RF-16 | Promoción de año | Proponer el paso de los estudiantes al grado siguiente en bloque, permitiendo corregir casos puntuales (repitentes, cambios de sección) antes de aplicar. | Admin | Media |
| RF-17 | Años anteriores en solo lectura | Los años lectivos no activos se pueden consultar pero no editar. | Sistema | Alta |

### 3.3 Gestión de usuarios

| ID | Requerimiento | Descripción | Actor | Prioridad |
| --- | --- | --- | --- | --- |
| RF-18 | Registro de estudiantes | Registrar estudiantes y matricularlos en una sección del año lectivo activo. | Admin | Alta |
| RF-19 | Registro de docentes | Registrar docentes con su correo institucional. | Admin | Alta |
| RF-20 | Registro de apoderados | Registrar apoderados y vincularlos con uno o más estudiantes. | Admin | Media |
| RF-21 | Importación masiva | Importar estudiantes, docentes y apoderados desde Excel o CSV, con validación previa y reporte de filas con error. | Admin | Alta |
| RF-22 | Edición de usuarios | Modificar los datos de cualquier usuario. | Admin | Alta |
| RF-23 | Estados de usuario | Cambiar el estado entre activo, inactivo y retirado. No existe eliminación física; el historial se conserva. | Admin | Alta |
| RF-24 | Traslado de sección | Cambiar a un estudiante de sección conservando sus notas y entregas previas. | Admin | Media |
| RF-25 | Búsqueda y filtros | Buscar usuarios por nombre, correo, rol, grado, sección y estado. | Admin | Alta |

### 3.4 Contenidos del curso

| ID | Requerimiento | Descripción | Actor | Prioridad |
| --- | --- | --- | --- | --- |
| RF-26 | Apartado Clases | Publicar materiales de clase (PDF) en un curso-sección, con título y descripción. | Docente | Alta |
| RF-27 | Apartado Libros de lectura | Publicar libros o lecturas en PDF. Al subir se muestra un aviso sobre derechos de autor. El material puede marcarse como reutilizable para copiarlo al año siguiente y excluirlo de la purga. | Docente | Alta |
| RF-28 | Apartado Tareas asignadas | Crear tareas con: título, instrucciones, adjunto opcional, período, fecha y hora límite, límite de tamaño (20 MB por defecto, ampliable hasta 50 MB), nota por no entrega (0 a 20, por defecto 0) y opción de permitir entregas tardías. | Docente | Alta |
| RF-29 | Edición de contenidos | Editar materiales y tareas, incluidos el límite de tamaño, la nota por no entrega y la opción de entregas tardías, mientras el período esté abierto. | Docente | Alta |
| RF-30 | Papelera | Los contenidos eliminados pasan a una papelera y pueden recuperarse durante 30 días. | Docente, Admin | Media |
| RF-31 | Vista del estudiante | El estudiante ve solo los contenidos de los cursos de su sección. | Estudiante | Alta |
| RF-32 | Anuncios | Publicar anuncios por curso-sección (docente) y anuncios generales para toda la institución o por grado (administrador). | Docente, Admin | Media |

### 3.5 Entrega de tareas

| ID | Requerimiento | Descripción | Actor | Prioridad |
| --- | --- | --- | --- | --- |
| RF-33 | Subida de tareas | El estudiante sube su tarea en la actividad correspondiente de su curso y sección. | Estudiante | Alta |
| RF-34 | Solo formato PDF | Se aceptan únicamente archivos PDF, verificados por extensión, tipo MIME y contenido real del archivo. | Sistema | Alta |
| RF-35 | Límite de tamaño | Se rechaza todo archivo que supere el límite definido en la actividad (20 MB por defecto, máximo 50 MB). | Sistema | Alta |
| RF-36 | Reentrega | Antes de la fecha límite, el estudiante puede reemplazar su archivo. Se conserva el historial de versiones. | Estudiante | Alta |
| RF-37 | Entregas tardías | Si la actividad permite entregas tardías, el sistema acepta la entrega después del plazo y muestra un aviso de entrega con retraso: al estudiante antes de confirmar y en su comprobante, y al docente en la lista de entregas y en el registro auxiliar, indicando el tiempo de retraso. Si no lo permite, la subida se bloquea al vencer el plazo. | Sistema | Alta |
| RF-38 | Estados de entrega | Pendiente, Entregada, Entregada con retraso, No entregada (NE), Calificada y Exonerada. | Sistema | Alta |
| RF-39 | Comprobante de entrega | Al entregar, el estudiante recibe una constancia con fecha, hora, nombre del archivo y estado. | Estudiante | Alta |
| RF-40 | Escaneo de seguridad | Todo archivo subido se analiza con antivirus; si está infectado se rechaza y se notifica al usuario. | Sistema | Alta |

### 3.6 Calificaciones

| ID | Requerimiento | Descripción | Actor | Prioridad |
| --- | --- | --- | --- | --- |
| RF-41 | Calificación de entregas | El docente asigna una nota numérica de 0 a 20 a cada entrega. | Docente | Alta |
| RF-42 | Retroalimentación | El docente puede escribir un comentario junto a la nota. | Docente | Alta |
| RF-43 | Visor de PDF integrado | El docente revisa la entrega dentro de la plataforma sin descargarla. | Docente | Media |
| RF-44 | Asignación automática de NE | Al vencer el plazo, a cada estudiante sin entrega se le asigna el estado NE y la nota por no entrega configurada en la actividad. | Sistema | Alta |
| RF-45 | Ajuste de NE | Mientras el período esté abierto, el docente puede modificar una NE. Si el estudiante entrega tarde (y está permitido), la NE se reemplaza por la nota que asigne el docente. | Docente | Alta |
| RF-46 | Exoneración | El docente puede exonerar a un estudiante de una actividad indicando el motivo; la actividad no se considera en su promedio. | Docente | Alta |
| RF-47 | Registro auxiliar | Matriz de estudiantes por actividades del período, con promedio por estudiante y por actividad. Distingue visualmente NE, entregas con retraso y exonerados. | Docente | Alta |
| RF-48 | Cálculo de promedios | Calcula el promedio simple del período por estudiante y curso, y lo convierte a escala literal según las reglas RN-03 y RN-04. | Sistema | Alta |
| RF-49 | Dashboard del docente | Muestra promedios por actividad, distribución de niveles AD/A/B/C, entregas a tiempo, con retraso y no entregadas, y estudiantes con promedio en riesgo. | Docente | Alta |
| RF-50 | Bloqueo por cierre | Al cerrar el período, las notas quedan bloqueadas para edición. | Sistema | Alta |
| RF-51 | Mis notas (estudiante) | El estudiante consulta sus notas, comentarios, promedio y literal por curso y período. | Estudiante | Alta |

### 3.7 Apoderados

| ID | Requerimiento | Descripción | Actor | Prioridad |
| --- | --- | --- | --- | --- |
| RF-52 | Consulta del apoderado | El apoderado consulta, en solo lectura, las notas, el estado de entregas, los promedios y los anuncios de los estudiantes vinculados. | Apoderado | Media |

### 3.8 Notificaciones y calendario

| ID | Requerimiento | Descripción | Actor | Prioridad |
| --- | --- | --- | --- | --- |
| RF-53 | Notificaciones | Avisos dentro de la plataforma y por correo: nueva tarea, tarea por vencer (24 horas antes), tarea calificada, nuevo anuncio. | Sistema | Media |
| RF-54 | Calendario de entregas | Vista de calendario con las fechas límite de las tareas del estudiante y de las tareas creadas por el docente. | Estudiante, Docente | Media |

### 3.9 Administración, supervisión y reportes

| ID | Requerimiento | Descripción | Actor | Prioridad |
| --- | --- | --- | --- | --- |
| RF-55 | Acceso total a contenidos | El administrador accede a todos los materiales, tareas y entregas de todos los cursos. | Admin | Alta |
| RF-56 | Modo soporte | El administrador puede ejecutar todas las funciones del docente en cualquier curso-sección. Cada acción queda registrada en la bitácora. | Admin | Alta |
| RF-57 | Consulta de registros de notas | Ver el registro de notas de cada docente y curso-sección. | Admin | Alta |
| RF-58 | Exportación por sección | Descargar el registro de notas de una sección en Excel y en PDF, con logo, curso, docente, sección y período. | Admin | Alta |
| RF-59 | Exportación masiva | Descargar los registros de todas las secciones a la vez en un archivo ZIP, generado en segundo plano. | Admin | Alta |
| RF-60 | Dashboard institucional | Indicadores generales: promedios por sección y curso, porcentaje de entregas a tiempo, con retraso y NE, y docentes con calificaciones pendientes. | Admin | Media |
| RF-61 | Configuración institucional | Datos y logo de la institución, tabla de conversión a literal y plazo de purga de archivos. | Admin | Alta |
| RF-62 | Consulta de bitácora | Consultar la bitácora con filtros por usuario, acción, módulo y fecha. | Admin | Alta |
| RF-63 | Exportación de datos personales | Exportar en un formato estándar los datos de un estudiante, para atender solicitudes de acceso y portabilidad. | Admin | Media |

### 3.10 Ciclo de vida de archivos

| ID | Requerimiento | Descripción | Actor | Prioridad |
| --- | --- | --- | --- | --- |
| RF-64 | Archivado por período | Al cerrar un período, sus entregas pasan a solo lectura para atender reclamos. | Sistema | Alta |
| RF-65 | Respaldo anual | Al cerrar el año lectivo, el sistema genera un ZIP por sección con entregas y materiales, disponible para descarga del administrador. | Sistema | Alta |
| RF-66 | Purga automática | Cumplido el plazo configurado (60 días después del cierre del año, por defecto), se eliminan los archivos PDF. Se conservan notas, promedios, literales, actividades y bitácora. Los libros marcados como reutilizables no se purgan. | Sistema | Alta |
| RF-67 | Panel de almacenamiento | Muestra el espacio usado por año lectivo, grado y curso. | Admin | Media |

## 4. Reglas de negocio

| ID | Regla | Descripción |
| --- | --- | --- |
| RN-01 | Escala numérica interna | Toda nota se registra en escala vigesimal de 0 a 20. |
| RN-02 | Promedio simple | Todas las actividades tienen el mismo peso. No existe ponderación. |
| RN-03 | Redondeo | El promedio se calcula con precisión decimal completa y se redondea una sola vez al entero más cercano, antes de convertir. El .5 sube: 13.50 → 14 (A); 13.40 → 13 (B). Los cálculos usan aritmética decimal exacta, no de coma flotante. |
| RN-04 | Conversión a literal | El entero redondeado se convierte según la tabla configurada por la institución. Valores por defecto: AD 18–20, A 14–17, B 11–13, C 0–10. |
| RN-05 | Nota por no entrega | Se define por actividad: el docente fija un valor entre 0 y 20 al crear o editar la tarea (por defecto 0). Se asigna automáticamente al vencer el plazo y cuenta en el promedio. |
| RN-06 | Entrega tardía | Solo se acepta si la actividad lo permite. Queda marcada como «Entregada con retraso» con aviso visible al estudiante y al docente. No se aplica penalización automática: el docente califica según su criterio. |
| RN-07 | Exoneración | Una actividad exonerada no se incluye en el promedio del estudiante. |
| RN-08 | Formato y tamaño | Solo PDF. Límite de 20 MB por defecto; el docente puede ampliarlo por actividad hasta 50 MB. |
| RN-09 | Reentrega | Permitida solo antes de la fecha límite; se conserva la última versión como entrega oficial. |
| RN-10 | Cierre de período | Con el período cerrado no se pueden crear, editar ni calificar actividades de ese período. Solo el administrador puede reabrirlo, con motivo registrado. |
| RN-11 | Año lectivo activo | Solo existe un año lectivo activo; los demás son de solo lectura. |
| RN-12 | Acceso por pertenencia | El docente solo accede a sus cursos-sección; el estudiante, a los de su sección; el apoderado, a los estudiantes vinculados. El administrador accede a todo. |
| RN-13 | Baja lógica | Los usuarios no se eliminan físicamente; se cambian a inactivo o retirado, conservando su historial. |
| RN-14 | Conservación de datos | Notas, promedios y bitácora se conservan de forma permanente. Los archivos PDF se purgan según RF-66. |
| RN-15 | Promoción de grado | La promoción la confirma el administrador; el sistema solo la propone. |

## 5. Requerimientos no funcionales

### 5.1 Seguridad

| ID | Requerimiento | Descripción / criterio de aceptación |
| --- | --- | --- |
| RNF-01 | Comunicación cifrada | Todo el tráfico usa HTTPS con TLS 1.2 o superior. |
| RNF-02 | Control de acceso en el servidor | Los permisos por rol y pertenencia se validan en el backend en cada petición, no solo en la interfaz. |
| RNF-03 | Archivos privados | Los archivos no son accesibles por URL pública; se sirven mediante enlaces firmados de corta duración tras verificar permisos. Se almacenan con nombre aleatorio (UUID). |
| RNF-04 | Credenciales | Contraseñas locales con hash argon2; doble factor obligatorio para la cuenta local del administrador. |
| RNF-05 | Sesiones | Cookies httpOnly, Secure y SameSite; expiración tras 60 minutos de inactividad; posibilidad de cerrar sesiones de forma remota. |
| RNF-06 | Protección contra ataques | Protección frente a inyección SQL, XSS y CSRF; cabeceras de seguridad HTTP; límite de intentos de inicio de sesión. |
| RNF-07 | Cifrado en reposo | Archivos y copias de seguridad cifrados en el almacenamiento. |
| RNF-08 | Herramientas administrativas | phpMyAdmin y demás herramientas de administración no se exponen públicamente en producción; acceso solo por túnel seguro. |

### 5.2 Protección de datos y cumplimiento legal

| ID | Requerimiento | Descripción / criterio de aceptación |
| --- | --- | --- |
| RNF-09 | Ley 29733 y su Reglamento (D.S. 016-2024-JUS) | El sistema registra el consentimiento informado, aplica minimización de datos (solo los necesarios), permite atender derechos de acceso, rectificación, cancelación, oposición y portabilidad, y declara la transferencia internacional de datos cuando los servidores estén fuera del Perú. |
| RNF-10 | Gestión de incidentes | Existe un procedimiento documentado y alertas para detectar incidentes de seguridad, que permitan a la institución notificar a la Autoridad Nacional de Protección de Datos Personales y a los afectados dentro de las 48 horas, y al Centro Nacional de Seguridad Digital cuando corresponda. |
| RNF-11 | Protección de menores (Ley 27337) | No existen perfiles públicos ni exposición de datos o imágenes de estudiantes a otros estudiantes. El consentimiento de padres para menores de 14 años se registra según lo recabe la institución. |
| RNF-12 | Derechos de autor (D. Leg. 822) | Los términos de uso responsabilizan al docente del material que publica; se muestra un aviso al subir libros de lectura. |
| RNF-13 | Delitos informáticos (Ley 30096) | Los registros de acceso y la bitácora se conservan como evidencia ante accesos indebidos. |

### 5.3 Auditoría

| ID | Requerimiento | Descripción / criterio de aceptación |
| --- | --- | --- |
| RNF-14 | Bitácora | Se registran: inicios de sesión, creación y modificación de notas, cambios de NE, exoneraciones, cierres y reaperturas de período, gestión de usuarios y toda acción en modo soporte; con usuario, fecha, hora, IP, valor anterior y nuevo. |
| RNF-15 | Integridad de la bitácora | La bitácora no puede ser editada ni eliminada desde la aplicación por ningún perfil. |

### 5.4 Rendimiento y capacidad

| ID | Requerimiento | Descripción / criterio de aceptación |
| --- | --- | --- |
| RNF-16 | Tiempo de respuesta | El 95 % de las páginas responde en menos de 2 segundos en condiciones normales. |
| RNF-17 | Concurrencia | Soporta al menos 300 usuarios concurrentes y los picos de entrega cercanos a las fechas límite sin degradación significativa. |
| RNF-18 | Subida de archivos | Los PDF se suben directamente al almacenamiento mediante URL firmadas, sin pasar por el servidor de aplicación. |
| RNF-19 | Procesos pesados en segundo plano | Exportaciones, ZIP, escaneo antivirus, asignación de NE, notificaciones y purga se ejecutan en colas, sin bloquear al usuario. |

### 5.5 Disponibilidad, respaldo y recuperación

| ID | Requerimiento | Descripción / criterio de aceptación |
| --- | --- | --- |
| RNF-20 | Disponibilidad | 99 % mensual, excluyendo mantenimientos programados fuera del horario escolar, con página de mantenimiento. |
| RNF-21 | Copias de seguridad | Respaldo diario automático y cifrado de la base de datos, almacenado fuera del servidor, con retención de 30 días. |
| RNF-22 | Recuperación | Pérdida máxima de datos (RPO) de 24 horas; tiempo máximo de restauración (RTO) de 8 horas. Prueba de restauración trimestral. |
| RNF-23 | Monitoreo | Registro centralizado de errores, logs estructurados y monitoreo de disponibilidad con alertas. |

### 5.6 Usabilidad y compatibilidad

| ID | Requerimiento | Descripción / criterio de aceptación |
| --- | --- | --- |
| RNF-24 | Diseño adaptable | Interfaz responsive, utilizable desde pantallas de 360 px de ancho (celulares). |
| RNF-25 | Facilidad de uso | Interfaz en español, simple y consistente, adecuada para estudiantes de 11 a 17 años y docentes con poca experiencia digital; mensajes de error claros. |
| RNF-26 | Accesibilidad | Cumplimiento básico de WCAG 2.1 nivel AA: contraste, navegación por teclado y textos alternativos. |
| RNF-27 | Navegadores | Últimas dos versiones de Chrome, Edge, Firefox y Safari, en escritorio y móvil. |

### 5.7 Mantenibilidad y portabilidad

| ID | Requerimiento | Descripción / criterio de aceptación |
| --- | --- | --- |
| RNF-28 | Ejecución local con Docker | Todo el sistema se levanta en cualquier laptop con un único comando (docker compose up) e incluye datos de prueba. |
| RNF-29 | Configuración por entorno | Toda configuración sensible se gestiona mediante variables de entorno; existen entornos de desarrollo, pruebas y producción. |
| RNF-30 | Calidad de código | TypeScript en modo estricto, linters y formateo automático; control de versiones en Git con integración continua. |
| RNF-31 | Pruebas | Pruebas unitarias para las reglas de calificación (cobertura mínima del 90 % en ese módulo) y pruebas end-to-end de los flujos críticos: crear tarea, entregar, calificar y exportar. |
| RNF-32 | Documentación | Manual de usuario por perfil, manual técnico de instalación y despliegue, y documentación de la API. |

## 6. Restricciones técnicas (stack definido)

| Capa | Tecnología |
| --- | --- |
| Lenguaje y runtime | TypeScript sobre Node.js 24 LTS |
| Backend (API) | NestJS, Prisma ORM, Zod, Passport (Google OAuth 2.0 y local), argon2, otplib (2FA), decimal.js |
| Frontend | Next.js, Tailwind CSS, shadcn/ui, TanStack Table y Query, React Hook Form, Recharts, react-pdf, FullCalendar |
| Base de datos | MySQL 8.4 LTS, administrada con phpMyAdmin |
| Colas, caché y sesiones | Redis con BullMQ |
| Almacenamiento de archivos | Compatible con S3: MinIO en local, Cloudflare R2 en producción |
| Documentos y reportes | ExcelJS (Excel), Gotenberg (PDF), archiver (ZIP) |
| Seguridad de archivos | file-type y pdf-lib (validación de PDF), ClamAV (antivirus) |
| Correo | Nodemailer con relay SMTP de Google Workspace; Mailpit en local |
| Contenedores y despliegue | Docker y Docker Compose; Caddy como proxy inverso con SSL; GitHub Actions |
| Calidad y monitoreo | pnpm y Turborepo, ESLint, Prettier, Vitest, Playwright, Pino, Sentry, Uptime Kuma |

## 7. Fuera del alcance de la versión 1

- Exámenes o cuestionarios en línea.

- Registro de asistencia.

- Exportación compatible con SIAGIE.

- Integración con Google Drive o Google Classroom.

- Detección de entregas duplicadas entre estudiantes.

- Ponderación de actividades (descartada por decisión de la institución).

## 8. Puntos pendientes de confirmar

| # | Tema | Supuesto actual |
| --- | --- | --- |
| 1 | Promedio final anual | Se asume que, además del promedio por período, se requiere un promedio anual (promedio simple de los cuatro períodos). |
| 2 | Plazo de purga de archivos | 60 días después del cierre del año lectivo. |
| 3 | Registro del DNI del estudiante | Opcional; solo si la institución lo necesita (por ejemplo, para cruzar datos con SIAGIE). |
| 4 | Acceso de los apoderados | Definir si tendrán cuenta de Google Workspace institucional o credenciales locales del sistema. |
| 5 | Número estimado de usuarios | Necesario para dimensionar servidor y almacenamiento. |
| 6 | Obligaciones de la institución fuera del software | Registro del banco de datos personales ante la Autoridad, evaluación de la designación de un Oficial de Datos Personales y revisión legal de la política de privacidad y los términos de uso. |

## Aprobación

|  |  |
| --- | --- |
| ______________________________ | ______________________________ |
| Representante de la institución | Walter David Santos Mendieta Napan |
|  | Responsable del desarrollo |
