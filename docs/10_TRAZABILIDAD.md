# 10 — Índice de trazabilidad ERS → módulo → documentos

La correspondencia de RF y dev reproduce el **Plan de Trabajo**. Los detalles de RF/RN/RNF deben leerse en la ERS original.

| IDs de la ERS | Desarrollador según plan | Documentos maestros relacionados |
|---|---|---|
| RF-01..08 | Dev 1 | 01, 02 (`User`, `PolicyAcceptance`), 05, 06 |
| RF-09..17 | Dev 2 | 02 (`AcademicYear`, `AcademicPeriod`, `Section`, `CourseSection`) |
| RF-18..25 | Dev 2 | 02 (`User`, `Enrollment`, `GuardianStudent`), 05 |
| **RF-26..31** | **Dev 3** | **02 (`Material`, `Assignment`), 03, 04, 05, 09** |
| RF-32 | Dev 5 | 02 (`Announcement`), 03 |
| **RF-33..40** | **Dev 3** | **02 (`Submission`, `SubmissionVersion`, `StoredFile`), 03, 04, 05, 09** |
| RF-41..51 | Dev 4 | 02 (`Grade`), 03, 04, 09 |
| RF-52 | Dev 4 | 02 (`GuardianStudent`), 05 |
| RF-53..54 | Dev 5 | 02 (`Notification`), 03 |
| RF-55..63 | Dev 5 | 02 (`InstitutionSetting`), 05 |
| RF-64..67 | Dev 5 | 02 (`StoredFile` conserva metadatos, purga coordinada), 04 |
| RN-01..07 | Dev 4 con integración Dev 3 | 02, 04, 09 |
| RN-08..09 | Dev 3 | 02, 04, 09 |
| RN-10..15 | Transversal | 02, 04, 05, 09 |
| RNF-01..08 | Dev 1; **RNF-03 además Dev 3** | 01, 03, 05 |
| RNF-09..15 | Dev 1 / transversal | 05, 06 |
| RNF-16..19 | Transversal; **RNF-18 Dev 3** | 01, 03, 07, 09 |
| RNF-20..23 | Dev 1 + Dev 5 según tareas | 01, 07 |
| RNF-24..27 | Todos | 06, 09 |
| RNF-28..30 | Dev 1 / todos | 01, 06, 07 |
| RNF-31..32 | Dev 4 / QA de todos | 06, 09 |

**Nota de avance (RN-01..07):** motor de notas implementado como funciones puras en `packages/shared/src/grading/` (`grade-value.ts`, `average.ts`, `literal-scale.ts`, `errors.ts`), con 82 casos de prueba en `grade-value.spec.ts`, `average.spec.ts` y `literal-scale.spec.ts` (`pnpm --filter @aula/shared test`). Cubre RN-01 a RN-07 a nivel de motor; QA-008 (RN-06) y QA-020 (RN-03/04) tienen casos. Pendiente: esquema `Grade`, API y pantallas (RF-41..52), y el acuerdo de D-025 y D-026. Sin PR aún.

## Fuente original por tema

| Tema | Archivo y sección/página impresa |
|---|---|
| Alcance, roles, períodos | ERS §§1-2, pp. 2-3 |
| Auth, estructura académica | ERS §3.1-3.2, pp. 4-5 |
| Usuarios, contenidos | ERS §3.3-3.4, p. 5 |
| Entregas, calificación | ERS §3.5-3.6, pp. 6-7 |
| Reportes y ciclo de vida | ERS §§3.7-3.10, pp. 7-8 |
| RN, RNF y seguridad | ERS §§4-5, pp. 9-11 |
| Stack y asuntos por confirmar | ERS §§6-8, p. 12 |
| División de módulos | Plan §2, pp. 2-4 |
| Sprints | Plan §3, p. 5 |
| Git y DoD | Plan §§4-5, pp. 5-6 |
