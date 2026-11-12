# Manual del administrador

> **Estado: PROPUESTA.** Cubre copiar la estructura a un año nuevo, promover a los estudiantes (Dev 2, fase 6) y tareas y materiales (Dev 3). Las demás pantallas de administración se documentarán cuando estén aprobadas.

## Copiar la estructura a un año nuevo (RF-15)

1. Crea el año nuevo en **Estructura**, con sus cuatro períodos.
2. Entra en el año nuevo. Si no tiene secciones, verás el enlace **Copiar la estructura de un año anterior**.
3. Elige el año de origen. Solo aparecen los años anteriores que tienen secciones activas.
4. Marca **Copiar también los docentes** si quieres conservarlos. Solo se copian los docentes que siguen activos.
5. Pulsa **Copiar estructura** y confirma con **Copiar**.

Se copian las secciones activas y sus cursos activos. No se copian períodos, matrículas ni contenidos: las matrículas se hacen después, con las altas o la importación. Un año que ya tiene secciones no admite una nueva copia.

## Promover a los estudiantes al año siguiente (RF-16)

Antes de empezar, cierra los cuatro períodos del año de origen. El año nuevo debe ser el siguiente al de origen, no estar cerrado y tener secciones activas.

1. Entra en el año nuevo y pulsa **Promover estudiantes de {año anterior} a {año}**.
2. Revisa la propuesta. Cada estudiante tiene una acción: **Promueve**, **Repite**, **Egresa** o **Se excluye (sigue en el año de origen)**.
3. Corrige lo que haga falta. Elige la sección de destino en las filas que la piden. Puedes cambiar varias filas de una sección a la vez.
4. Para dejar a alguien para después, márcalo como **Se excluye**. Seguirá en el año de origen y aparecerá en la siguiente propuesta.
5. Revisa el resumen, pulsa **Confirmar promoción** y luego **Confirmar** en el diálogo.

Reglas de la pantalla:

- La confirmación es **todo o nada**. Si algo no cuadra, no se guarda nada y la pantalla marca las filas afectadas.
- Si la propuesta cambió mientras la revisabas (por ejemplo, otra persona ya la confirmó), aparece el aviso "La propuesta cambió". Pulsa **Volver a cargar la propuesta**.
- Los estudiantes retirados, o que ya están matriculados en el año nuevo, solo se pueden excluir.
- Promover no borra las notas ni los contenidos del año anterior.
- Los de quinto grado que egresan dejan de estar matriculados en el año, pero su cuenta sigue activa. Esto está pendiente de decisión.

## Tareas y materiales (RF-26..31)

> **Estado: PROPUESTA.** Como administrador puedes crear y cambiar tareas y materiales de cualquier curso. Cada cambio queda en la bitácora.

- **Períodos:** las tareas se crean y cambian solo en períodos abiertos. Si el período o el año están cerrados, la pantalla no guarda nada.
- **Materiales:** las clases y las lecturas son PDF de hasta 50 MiB. Un material puede no tener período.
- **Tamaños:** cada tarea admite 20 MiB por defecto y 50 MiB como máximo. Los archivos con virus o protegidos con contraseña se rechazan.
- **Entregas:** la pantalla de la tarea lista a cada estudiante con su estado (pendiente, entregada o entregada con retraso). Las notas llegarán con el módulo de calificaciones.
- **Papelera:** un material borrado se puede restaurar durante 30 días. La API lo permite; la pantalla todavía no tiene el botón.
- **Pendiente en pantalla:** editar o borrar una tarea y descargar el PDF de una entrega. Hoy se hace solo desde la API.
