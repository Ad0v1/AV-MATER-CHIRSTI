# 07 — Plan de Sprint 0: base sólida y entregables

**Duración según Plan de Trabajo:** 1 semana sugerida. **Estado:** hoja de ruta pendiente de iniciar; no representa avance real.

## Resultado esperado

Un proyecto reproducible con `docker compose up`, estructura monorepo acordada, esquema base migrable, seed ficticio, contrato de comunicación y pruebas mínimas; cada módulo comienza desde un mismo punto.

| Orden | Tarea | Responsable de coordinación | Evidencia de aceptación |
|---|---|---|---|
| 1 | Revisión de ERS/Plan y mapa RF→Dev | Todos; coordina Dev 1 | Documento aprobado en PR |
| 2 | Decidir IDs, fechas, periodos, roles, errores y contratos | Todos | ADR en `08_DECISIONES.md` |
| 3 | Modelo ER lógico con ownership por entidad | Dev 2/3/4 + Dev 1 | Diagrama y diccionario aprobados |
| 4 | Monorepo pnpm/Turborepo; scaffolds Nest/Next | Dev 1 | `pnpm install` y scripts de arranque pasan |
| 5 | Docker Compose para MySQL/Redis/MinIO y servicios del stack | Dev 1 (coordina) | Servicios saludables en equipo ajeno |
| 6 | Prisma base/migración inicial coordinada | Dev 2 con cada dueño | Migrate + `seed` sobre DB vacía |
| 7 | Seed ficticio: año 2026, cuatro periodos, grados, secciones, cursos, 5 docentes, 60 estudiantes y admin | Dev 2 | Comando repetible e idempotente |
| 8 | Servicio de almacenamiento MinIO inicial y tests | **Dev 3** | Upload privado + metadata + descarga autorizada (sin afirmar RF-40 completo) |
| 9 | Motor notas `decimal.js` con pruebas | Dev 4 | Casos redondeo y NE/Exoneración pasan |
| 10 | Base de worker, BullMQ y Mailpit | Dev 5 | Worker procesando job falso y correo local de prueba |
| 11 | GitHub Actions CI y ramas protegidas | Dev 1 | PR falla si test/lint/build falla |
| 12 | Ensayo de integración y README de instalación | Todos | Nuevo clon y bootstrap reproducible |

## Qué puede comenzar Dev 3 **hoy** sin bloquear a nadie

1. Proponer entidades `Material`, `Assignment`, `StoredFile`, `Submission`, `SubmissionVersion` y sus relaciones.
2. Documentar `UploadIntent` (opcional) y el ciclo de cuarentena, validación y publicación.
3. Acordar con Dev 2 la lectura de `Enrollment` y `CourseSection`.
4. Acordar con Dev 4 el ownership de NE, `Grade`, versión vigente y `displayStatus`.
5. Definir 8–12 tests de contrato/seguridad con fixtures antes de que exista infraestructura real.
6. Tras aprobarse scaffolding, implementar servicio MinIO + pruebas en `features/juica`.

## Dependencias y mitigaciones

- **Sin Dev 1:** avanzar documentación, prototipos y tests de contrato, no crear un segundo monorepo.
- **Sin Dev 2:** usar seed JSON ficticio que respete `Enrollment`/`CourseSection` aprobados.
- **Sin Dev 4:** publicar evento/documento `submission.accepted`; nunca escribir `Grade` directamente.
- **Sin Dev 5:** levantar MinIO y prototipar antivirus/cola local solo tras alinear el contrato; no declarar RF-40 terminado sin escaneo real.

## Demostración mínima de Sprint 0

Nuevo desarrollador clona, levanta stack local, ejecuta seed, consulta usuario/cursos ficticios y prueba guardar/recuperar un PDF privado de prueba por API de Dev 3 con guard simulado. Esto es una **meta propuesta** de Sprint 0, no una funcionalidad actualmente existente.
