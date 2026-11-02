# Pendientes por desarrollador (corte al 02/11/2026)

Estado del proyecto y lo que le falta a cada dev para cerrar la v1. Los IDs (RF, RN, RNF y D) remiten a la ERS y a `docs/08`. Antes de empezar, revisa `docs/03_CONTRATOS.md`, porque ahí están los contratos que ya se usan.

> **Leyenda:** ✅ hecho · 🟡 parcial · ⬜ sin empezar

## Resumen

| Dev | Área | Estado |
|---|---|---|
| Dev 1 | Plataforma (auth, guards, bitácora, layout, CI) | 🟡 base lista, faltan ajustes transversales |
| Dev 2 | Estructura académica y usuarios | ✅ completo (F1–F6) |
| Dev 3 | Contenidos, entregas y almacenamiento | 🟡 lo principal está hecho, faltan detalles de pantalla |
| Dev 4 | Calificaciones y apoderados | 🟡 lo principal está hecho, faltan pruebas y una decisión |
| Dev 5 | Anuncios, notificaciones, reportes y ciclo de vida | 🟡 4 de 7 fases |

---

## Dev 1 — Plataforma

Ya funcionan:
- Login del ADMIN con 2FA.
- Sesión `aula_sid`.
- Guards de rol y pertenencia.
- Bitácora inmutable.
- Política de privacidad.
- Layout por rol.

Pendientes:
1. **`AuditService.record(event, tx)` dentro de la transacción.** Hoy contenidos, entregas, calificaciones y configuración escriben la bitácora *después* del commit (D-047). Hace falta una variante que reciba el `tx` de Prisma.
2. **Limpieza de `incoming/` en el bucket:** regla de ciclo de vida de 1 día en MinIO y R2.
3. **CORS de Cloudflare R2** para la subida directa con URL firmada (producción).
4. **SMTP de producción:** agregar `SMTP_USER`, `SMTP_PASS` y `requireTLS`, y que `env.ts` falle al arrancar en producción si faltan.
5. **Redis de producción con contraseña** en `REDIS_URL`, también validada en `env.ts`.
6. **CSP global** con `img-src 'self' <host-del-bucket>`, para que cargue el logo institucional desde la URL firmada.
7. **Logo y nombre institucional en la cabecera o el sidebar.** La API ya expone `GET /institution/branding`.
8. **Menú (`apps/web/lib/nav.ts`):**
   - Agregar el enlace del "Registro de notas" para ADMIN.
   - Agregar la campana de notificaciones en `(app)/layout.tsx`. Dev 5 entrega el componente.
9. **Revisar los archivos tuyos que otros devs tocaron con permiso:**
   - `app.module.ts`, por el registro de módulos;
   - `config/env.ts` y `.env.example`, por las variables S3, ClamAV, SMTP, Gotenberg y colas;
   - `docker-compose.yml`, por ClamAV con `StreamMaxLength 64M`;
   - el filtro de errores, por la respuesta 413;
   - `app.setup.ts`, por el límite JSON de 512 KB.
10. **`tsconfig.json` de la API:** ampliar `rootDir` para quitar dos `@ts-ignore` en tests que importan `prisma/seed`.
11. **CI:** ajustar turbo para que el `dev` del worker no compile la API al mismo tiempo que `api start:dev`.

## Dev 2 — Estructura académica y usuarios

Completo: años, períodos, grados, secciones, cursos, asignación de docentes, usuarios, importación masiva, cierre de año y seed.

Pendientes menores:
- **Exportar `CourseSectionsService` o un método de lectura de asignaciones.** El calendario de Dev 5 hoy lee `Assignment` directo.
- **Confirmar el nombre y el payload del evento `academic-year.closed.v1`.** Dev 5 lo usará para el respaldo anual (RF-65).

## Dev 3 — Contenidos, entregas y almacenamiento

Hecho: materiales, tareas, entregas en PDF, reentregas, entregas tardías, cuarentena en `incoming/`, ClamAV y URLs firmadas. También `FileLifecycleService`, con la expiración de intents y la purga, que se creó para Dev 5.

Pendientes:
1. **`gradeState` en las entregas** (`submissions.service.ts`). Hoy se pasa `null`, así que la lista del docente no muestra el estado de la nota. Leerlo del modelo `Grade` de Dev 4.
2. **En pantalla:** botón para descargar el PDF y opciones para editar o borrar tareas.
3. **Texto legal del aviso de derechos de autor.** Lo redacta la institución.
4. **`complete()` de la subida:** cortar cuando venció `intentExpiresAt`. Hoy lo cubre un margen de 15 min en el barrido.
5. **`StorageService`:** aceptar claves que no sean PDF, como XLSX, ZIP y JSON. Así Dev 5 deja de usar su `JobResultStorage` propio.
6. **Prueba en un navegador real:**
   - subida a MinIO;
   - vista a 360 px;
   - lector de pantalla.

## Dev 4 — Calificaciones y apoderados

Hecho:
- **Modelo `Grade`:** estados GRADED, NE y EXEMPT, con NE automática.
- **Motor de notas** en `packages/shared/src/grading`, con 100 % de cobertura.
- **API:** registro auxiliar, dashboard, Mis notas y apoderado.
- **Escala literal configurable**, que viene de Dev 5.

Pendientes:
1. **D-014, promedio anual.** Hay que definir cómo se calcula. Hasta que se decida, no aparece en pantallas ni en reportes.
2. **RNF-31:** subir la cobertura de ramas de la API de grading del 81 % al 90 %.
3. **Prueba en un navegador real:**
   - Mis notas, apoderado y registro del docente;
   - visor PDF por iframe;
   - vista a 360 px;
   - lector de pantalla.
   Para esto, cada cuenta de prueba tiene que aceptar la política.
4. **Bitácora dentro de la transacción**, cuando Dev 1 publique `record(event, tx)`.

## Dev 5 — Anuncios, notificaciones, reportes y ciclo de vida

Hecho y aprobado:
- **5a. Esquema `admin.prisma`:** Announcement, Notification, InstitutionSettings y BackgroundJob, con 11 CHECK.
- **5b. Colas BullMQ y worker.** El worker arranca con `worker.main.ts` y se lanza con `pnpm --filter worker dev`. También incluye:
  - BackgroundJob con descarga firmada de 60 s;
  - correo mínimo a Mailpit;
  - barridos de NE, intents vencidos y exportaciones caducadas.
- **5c. RF-61, configuración institucional** en `/admin/configuracion`:
  - nombre;
  - logo PNG o JPEG validado y pasado por ClamAV;
  - tabla de literales;
  - plazo de purga.
- **5e. RF-54, calendario de plazos** en `/calendario`, con FullCalendar en hora de Lima.

Pendientes:
1. **5d. RF-32 y RF-53, anuncios y notificaciones.** 🟡 La API está a medias en el repo privado y la web falta.
   - Anuncios: el docente publica por curso-sección y el ADMIN para la institución o por grado. Los leen el estudiante y el apoderado.
   - Notificaciones de tarea nueva, de tarea que vence en 24 h, de nota publicada (solo las MANUAL) y de anuncio. Se envían por la cola, con `dedupeKey` por destinatario y correos en lotes de 50 a 100.
   - Campana con contador y "marcar como leída".
   - Retención de notificaciones:
     - las leídas se borran a los 90 días;
     - las no leídas, a los 180;
     - ninguna pasa de 365 días;
     - los correos pendientes se reintentan como máximo 7 días.
2. **5f. RF-57 a RF-60, reportes.** ⬜
   - Registro por docente y curso-sección.
   - XLSX y PDF por sección, con logo. El PDF se arma con Gotenberg; hay que agregar `gotenberg/gotenberg:8` a docker-compose.
   - ZIP masivo en segundo plano.
   - Dashboard institucional.
   - Límite de 3 trabajos activos por usuario (429 JOB_LIMIT).
   - WorkerModule debe importar LiteralScaleModule.
3. **5g. RF-55/56 y RF-62 a RF-67.** 🟡 Está a medias en el repo privado.
   - Bitácora con filtros y la marca de modo soporte.
   - Exportación de datos personales (RF-63). La descarga del ADMIN se registra en la bitácora como `job.download`.
   - Respaldo ZIP al cerrar el año (RF-65).
   - Purga (RF-66). Solo con el año cerrado, los respaldos en SUCCEEDED y el plazo cumplido.
   - Panel de uso de almacenamiento (RF-67).
   - Barrido de trabajos colgados en RUNNING.
4. **Documentar:**
   - docs/02, con InstitutionSettings tipada;
   - docs/03, con los contratos de jobs, settings, branding, calendar, anuncios y notificaciones;
   - D-031, con la entrega de eventos por la cola.

## Decisiones abiertas (para la institución o el equipo)

- **D-013:** si el apoderado recibe los correos de las notificaciones.
- **D-014:** el promedio anual.
- **D-015:** el plazo de purga. Por defecto son 60 días y el ADMIN lo puede cambiar.
- **Texto legal** del aviso de derechos de autor.
- **Nombre oficial de la institución.** Hoy dice "I.E. Mater Christi" de forma provisional y el ADMIN lo cambia en `/admin/configuracion`.

## Cómo probar en local

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm --filter api start:dev
pnpm --filter web dev
pnpm --filter worker dev
```

- Correo de prueba: Mailpit en http://localhost:8025.
- En Windows con WSL, exporta antes `NODE_OPTIONS=--dns-result-order=ipv4first`.
