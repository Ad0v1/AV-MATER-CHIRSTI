# Manual del docente

> **Estado: PROPUESTA.** Cubre materiales, tareas y entregas (Dev 3), y calificaciones (Dev 4).

Solo puedes crear y cambiar materiales y tareas de los cursos donde eres el docente asignado.

## Subir una clase o una lectura (RF-26, RF-27)

1. Entra al curso y pulsa **Clases** o **Lecturas**.
2. Elige el PDF (hasta 50 MiB) y escribe el título. Puedes añadir una descripción.
3. Pulsa **Publicar**.

Las lecturas muestran un aviso sobre derechos de autor. La marca de "reutilizable" todavía no aparece en la pantalla.

## Crear una tarea (RF-28)

1. Entra al curso, pulsa **Tareas** y completa el formulario de nueva tarea.
2. Escribe el título y las instrucciones.
3. Elige el plazo. Se usa la hora de Lima.
4. Indica el tamaño máximo en MiB (de 1 a 50; por defecto, 20).
5. Indica la **nota si no entrega (NE)**. Por defecto es 0. Es la nota que recibe quien no entrega (NE = no entregó).
6. Marca si se permiten entregas tardías. Si no lo marcas, nadie puede entregar después del plazo.
7. Pulsa **Publicar tarea**.

No puedes crear tareas en un período cerrado.

## Ver las entregas (RF-36, RF-38, RF-39)

Al abrir una tarea ves la lista de estudiantes con su estado: **Pendiente**, **Entregada** o **Entregada con retraso**. Cada estudiante puede reentregar; la última versión es la oficial.

Los estados **Calificada**, **No entregó** y **Exonerada** se registran en el registro de calificaciones (ver más abajo). La lista de entregas de esta pantalla todavía no los muestra.

## Registro de calificaciones (RF-47, RF-48, RF-49)

1. En el menú, entra a **Curso de ejemplo** y pulsa **Registro auxiliar**. El curso de ejemplo se usa hasta que haya una lista real de cursos.
2. Elige el período con las pestañas (I Bimestre, II Bimestre, III y IV Trimestre). Se abre el período actual.
3. La tabla tiene un estudiante por fila y una tarea por columna. Cada celda muestra la nota. Al final de cada fila está el **Promedio** del estudiante (por ejemplo, `15 · A (logro esperado)`), y debajo de la tabla, el promedio de cada tarea.
4. El panel **Estudiantes por nivel de logro** muestra cuántos estudiantes hay en cada literal, cuántos están **Sin notas** y cuántas entregas llegaron **Con retraso**. "Sin notas" significa que no hay notas que cuenten; no es un cero.
5. Para calificar una tarea, pulsa su nombre en la lista **Notas por tarea**.

## Calificar una entrega (RF-41, RF-42, RF-43)

1. En la tarea, cada estudiante aparece con su entrega. Si no entregó, dice **Sin entrega**.
2. Pulsa **Ver PDF de la entrega** para leerla en la página. Si no carga, pulsa **Abrir el PDF en una pestaña nueva**.
3. Pulsa **Calificar**, o **Editar calificación** si ya tiene nota.
4. Elige **Nota** y escribe un número de 0 a 20 con hasta 2 decimales (`13.5` o `13,5`). Si quieres, escribe un **Comentario para el estudiante** (hasta 2000 caracteres).
5. Pulsa **Guardar**. La pantalla confirma el cambio.

Solo se pone nota a una tarea entregada. Si el estudiante no entregó, usa **No entregó (NE)**.

## No entregó (NE) (RF-44, RF-45)

- Si la tarea venció y el estudiante no entregó, la nota **No entregó (NE)** aparece sola. Es la nota NE de la tarea (por defecto, 0). Se fija al abrir el registro, con el período abierto, y al cerrar el período.
- Para ponerla tú, elige **No entregó (NE)**. Puedes escribir otra nota NE; si la dejas vacía, se usa la de la tarea. Solo se puede con el período abierto.
- Si el estudiante entrega tarde, su NE queda marcada para recalificar: pon una **Nota** con la entrega.
- Mensajes frecuentes:
  - "La tarea todavía no vence": la NE solo se pone después del plazo.
  - "El estudiante entregó la tarea": califícala con nota.
  - "El estudiante no estaba matriculado en la sección cuando venció la tarea": no se le puede poner NE.

## Exonerar (RF-46)

1. Elige **Exonerar** y escribe el **Motivo de la exoneración** (de 10 a 500 caracteres).
2. Pulsa **Guardar**.

- Un exonerado no tiene nota y no cuenta en el promedio.
- El motivo lo ven solo el docente y el administrador. El estudiante y el apoderado no lo ven.
- No escribas datos de salud, personales ni de la familia en el motivo ni en el comentario. La pantalla lo recuerda.

## Período cerrado (RF-50)

- Con el período cerrado, el registro y la tarea están en solo lectura: el formulario no aparece y la pantalla lo indica.
- Si aun así intentas guardar, la API no lo acepta y no se cambia nada.

## Pendiente en pantalla

- Editar o borrar una tarea. Hoy se hace solo desde la API. Una tarea con entregas no se puede borrar.
- Descargar el PDF de una entrega.
- Restaurar un material de la papelera (la API lo permite durante 30 días).
