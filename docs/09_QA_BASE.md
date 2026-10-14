# 09 — Base de pruebas y aceptación por contratos

Esta matriz propone pruebas concretas para Dev 3 y transversales. No sustituye los criterios de aceptación en la ERS y no implica que las pruebas ya se ejecutaron.

| ID de prueba | RF/RN/RNF | Escenario de prueba | Resultado esperado |
|---|---|---|---|
| QA-001 | RF-26/31, RN-12 | Docente de curso A publica PDF; alumno de B intenta verlo | Alumno B recibe denegación; A ve el material |
| QA-002 | RF-27, RNF-12 | Publicar lectura | Aviso copyright visible y dato reutilizable persistido |
| QA-003 | RF-28, RN-05 | Crear tarea sin nota NE explícita | Se registra valor predeterminado 0 |
| QA-004 | RF-28/35, RN-08 | Tarea con límite >50 MB | Rechazo de configuración |
| QA-005 | RF-34 | `.exe` renombrado `.pdf` | Rechazo por contenido/MIME real |
| QA-006 | RF-35 | Archivo sobre máximo establecido | Rechazo antes de publicarlo |
| QA-007 | RF-36, RN-09 | Entregar y reentregar antes del plazo | Dos versiones históricas, última limpia oficial |
| QA-008 | RF-37, RN-06 | Tardía habilitada | Se acepta, atraso y duración informados; sin descuento automático |
| QA-009 | RF-37 | Tardía NO habilitada | Se bloquea subida posterior al plazo |
| QA-010 | RF-38/39 | Consultar comprobante | Fecha/hora, archivo, estado y referencia de entrega correcta |
| QA-011 | RF-40 | Virus de prueba EICAR (solo entorno controlado) | Archivo rechazado; jamás descargable como material válido |
| QA-012 | RNF-03/18 | Abrir URL sin permiso | No se emite firma válida; archivo privado |
| QA-013 | RN-10 | Editar tarea en período cerrado | Rechazo, sin modificar registros |
| QA-014 | RF-45/RN-05 | Alumno entrega tarde cuando hubo NE | Dev 4 recibe evento; nota cambia solo según regla autorizada |
| QA-015 | RF-30 | Restaurar material de papelera dentro de 30 días | Recuperación permitida |
| QA-016 | RN-12 | Cambiar ID de entrega por otro estudiante (IDOR) | Backend deniega acceso |
| QA-017 | RF-24 | Alumno trasladado de sección | Notas y entregas antiguas se preservan |
| QA-018 | RNF-24/26 | UI en 360 px y navegación teclado | Accesible, sin elementos esenciales ocultos |
| QA-019 | RNF-31 | Flow E2E crear tarea → entregar → calificar → exportar | Flujo completo tras integración |
| QA-020 | RN-03/04 | 13.50 frente 13.40 | 14→A y 13→B sin redondeo intermedio |

## Fixtures compartidos de Sprint 0

- Año lectivo 2026 activo, cuatro períodos en secuencia acordada.
- Grados 1..5; secciones y cursos; 5 docentes; 60 estudiantes y un administrador según Plan §2.
- Usuario estudiante matriculado en la sección A, otro en B; docente A, docente B; admin y apoderado vinculado.
- Dos tareas ficticias: una permite tardías y otra no; una lectura reusable y otra no.
- Archivo PDF pequeño válido y muestra **no PDF** disfrazada. No usar documentos de alumnos reales.

## Evidencia a conservar en los PR

`RF-xx`, nombre de test, entorno, resultado, captura/log **sin datos reales**, endpoint, commit; para fallo: resultado esperado vs actual y pasos reproducibles.
