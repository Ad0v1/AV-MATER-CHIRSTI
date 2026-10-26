# Reporte — Motor de notas con decimal.js (ERS §6)

> Reporte retroactivo, escrito el 26/10/2026 cuando el usuario pidió reportes por tarea. Los prompts son los literales que usó el orquestador.

## Pedido

- **Usuario:** "Cambia el motor a decimal.js para cumplir la ERS §6, con los agentes, manteniendo la misma API y los 82 tests."
- **Fecha:** 26/10/2026 · **Flujo:** corto · **Rama:** `features/adolfo` · **Commit:** `4534265` (subido a `mio`)

## Resultado

La aritmética del promedio usa `decimal.js` con un constructor propio (`Decimal.clone`, precisión 64, `ROUND_HALF_UP`) que no toca la configuración global. Un solo redondeo .5 hacia arriba. API pública y 82 tests sin cambios. Una prueba diferencial de unas 64 000 entradas no encontró diferencias con la versión anterior. D-026 ahora cumple la ERS §6.

## Agentes que participaron

| #   | Agente                | Modelo | Qué hizo                                                       | Estado   |
| --- | --------------------- | ------ | -------------------------------------------------------------- | -------- |
| 1   | `dev4-calificaciones` | Opus   | Migró el cálculo a `decimal.js` sin tocar specs ni la API      | LISTO    |
| 2   | `qa-tester`           | Sonnet | Prueba diferencial contra el commit `6ebe46f` (fuera del repo) | LISTO    |
| 3   | `revisor-pr`          | Sonnet | Revisó los 6 requisitos del expediente                         | APROBADO |

No participó `arquitecto-integrador` (flujo corto: cambio interno de un módulo), ni `documentador` (lo hizo el orquestador: dos líneas).

## Prompts usados

### 1. dev4-calificaciones

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-motor-notas-decimaljs.md (léelo completo; revisa también el expediente previo .claude/tareas/20261026-motor-notas.md y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo.

Tu encargo: cambiar la implementación interna del motor de packages/shared/src/grading/ para que la aritmética use decimal.js, cumpliendo los 6 requisitos del expediente. Antes de editar, anota la salida de `pnpm --filter @aula/shared test` (deben ser 82 tests) y guarda una copia de la API pública (lee index.ts).
Pasos:
1. `pnpm --filter @aula/shared add decimal.js` (dependencies de producción; autorizado). Comprueba que el lock solo añade decimal.js a @aula/shared.
2. Implementa con un constructor propio `Decimal.clone({ precision: ..., rounding: Decimal.ROUND_HALF_UP })` en un módulo interno (p. ej. grading/decimal.ts, no exportado en el barrel). El promedio: suma de las notas como Decimal / cantidad, redondeado una sola vez a entero con ROUND_HALF_UP (toDecimalPlaces(0) o similar). sumCents se sigue exponiendo como entero (suma ×100). Mantén GradeCents/parseGrade con la misma semántica (pueden apoyarse en Decimal para convertir).
3. NO modifiques ningún archivo .spec.ts. Si un test falla y crees que el test está mal, detente y devuelve BLOQUEADO explicando cuál.
4. Comprueba que la API pública exportada es idéntica (mismos nombres y firmas en el .d.ts de dist antes/después: compáralos).
Al terminar corre `pnpm --filter @aula/shared lint`, `test` (82 en verde), `build`, `pnpm --filter api build` y `pnpm exec prettier --check packages/shared`. No hagas commit. Termina con el INFORME del protocolo.
```

### 2. qa-tester

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-motor-notas-decimaljs.md (léelo completo, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI.

Tu encargo: verificar que el motor con decimal.js se comporta EXACTAMENTE igual que la versión anterior (commit 6ebe46f), sin modificar los .spec.ts (el usuario pidió mantener los 82 tests tal cual).
1. Corre `pnpm --filter @aula/shared test` (82 en verde) y `lint`.
2. Prueba diferencial: extrae la versión anterior con `git show 6ebe46f:packages/shared/src/grading/<archivo>.ts` a una carpeta temporal en C:\Users\Laptop\AppData\Local\Temp\claude\C--Proyectos-AV-MATER-CHIRSTI\d111556e-64dd-44a4-b5f2-177ecf4c5a23\scratchpad\ (NO dentro del repo), y compara contra la versión actual con un script temporal (puedes ejecutarlo con `pnpm exec vitest run --root <scratchpad>` o con tsx/node si está disponible; elige lo que funcione) sobre muchas entradas: miles de listas aleatorias con semilla fija de GRADED/NE/EXEMPT con valores 0.00..20.00 (strings y numbers), casos .5/.49 exactos, listas largas, entradas inválidas (mismo GradingError y mismo code), parseGrade/formatGrade/isValidGrade/resolveNoSubmissionGrade/toLiteral. Todos los resultados deben coincidir (incluido sumCents, counted, exempt, status).
3. Comprueba que el Decimal global no cambia tras importar el motor.
No dejes archivos nuevos en el repo. Si hay diferencias, CAMBIOS_PEDIDOS con la entrada concreta. Termina con el INFORME del protocolo.
```

### 3. revisor-pr

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-motor-notas-decimaljs.md (léelo completo, INFORMES 1 y 2, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo.

Tu encargo: revisión final del flujo corto. Alcance esperado: packages/shared/src/grading/{decimal.ts (nuevo), average.ts, grade-value.ts}, packages/shared/package.json, pnpm-lock.yaml y el expediente. Ningún .spec.ts debe aparecer modificado. Revisa el código contra los 6 requisitos del expediente (API idéntica, specs intactos, decimal.js con un solo redondeo ROUND_HALF_UP, sin floats/Math.round/toFixed nativos ni Date en el cálculo, Decimal.clone sin Decimal.set, decimal.js en dependencies de producción). Revisa que en el lock solo se añada decimal.js para @aula/shared.
Corre pnpm lint, pnpm test, pnpm build y pnpm format:check (los fallos solo por .agents/ o expedientes no cuentan). Propón el mensaje de commit. Termina con el INFORME del protocolo.
```

## Decisiones del orquestador

- Flujo corto: cambio interno de un solo módulo, sin esquema ni contrato nuevo.
- Autorizó `decimal.js` como dependencia de producción en `packages/shared/package.json` y la regeneración del lock.
- Verificó por su cuenta que ningún `.spec.ts` cambió y que los 82 tests pasan.
- Actualizó él mismo D-026 (`docs/08`) y la fila RN-03 del contrato (`docs/03`).

## Archivos

- `packages/shared/src/grading/decimal.ts` (nuevo), `average.ts`, `grade-value.ts`
- `packages/shared/package.json`, `pnpm-lock.yaml`
- `docs/03_CONTRATOS.md`, `docs/08_DECISIONES.md`
- `.claude/tareas/20261026-motor-notas-decimaljs.md`

## Verificación

- 82/82 antes y después, sin tocar specs. `.d.ts` públicos idénticos salvo texto de JSDoc.
- Prueba diferencial (~64 000 entradas): sin diferencias.
- `pnpm lint` 5/5, `pnpm test`, `pnpm build` 5/5: ok. `format:check`: ok en el alcance.

## Pendientes

- D-025 (decimales en notas) por confirmar. D-014 pendiente de institución.

## Expediente

[.claude/tareas/20261026-motor-notas-decimaljs.md](../tareas/20261026-motor-notas-decimaljs.md)
