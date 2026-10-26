# Motor de notas: cambiar el cálculo a decimal.js (ERS §6)

Pedido por el usuario: "Cambia el motor a decimal.js para cumplir la ERS §6, con los agentes, manteniendo la misma API y los 82 tests."
Flujo: corto (cambio interno de un solo módulo, sin esquema ni contrato nuevo)
Vueltas de corrección: 0/2
Entorno: local, rama `features/adolfo`; se sube solo a `mio`.

## Contexto

- Tarea previa: `.claude/tareas/20261026-motor-notas.md` (commit `6ebe46f`). El motor calcula en centésimas enteras (D-026, PROPUESTA).
- `docs/01_ARQUITECTURA.md:6` lista `decimal.js` en el **stack obligatorio de la ERS §6**. El usuario decide cumplirlo.

## Requisitos del cambio

1. **API pública idéntica**: mismos tipos, constantes, funciones, firmas, valores de retorno y errores exportados desde `packages/shared/src/grading/index.ts`. `AverageResult` sigue exponiendo `rounded`, `sumCents`, `counted`, `exempt`.
2. **Los 82 tests pasan sin modificarlos.** Si alguno tuviera que cambiar, el agente se detiene y lo reporta.
3. Usar `decimal.js` para la aritmética del promedio y el redondeo único (RN-03: `ROUND_HALF_UP`, una sola vez). Validación de entrada (RN-01) puede seguir con el regex actual; la conversión a decimal usa `Decimal`.
4. Sin floats ni `Math.round`/`toFixed` nativos en el cálculo. Sin `Date`.
5. **No cambiar la configuración global de `Decimal`** (`Decimal.set`): usar un constructor propio (`Decimal.clone({...})`) para no afectar a otros módulos.
6. `decimal.js` es dependencia de **producción** de `@aula/shared` (`dependencies`, no `devDependencies`).

## Archivos compartidos autorizados por el orquestador

- `packages/shared/package.json` (añadir `decimal.js` a `dependencies`) y `pnpm-lock.yaml` (regenerado con `pnpm --filter @aula/shared add decimal.js`, no a mano).

---

## Informes

### INFORME 1 — dev4-calificaciones

Estado: LISTO
Archivos: `packages/shared/src/grading/decimal.ts` (nuevo, interno: `Decimal.clone({ precision: 64, rounding: ROUND_HALF_UP })`), `average.ts`, `grade-value.ts`; compartidos autorizados: `packages/shared/package.json` (`dependencies: decimal.js ^10.6.0`), `pnpm-lock.yaml`.
Resumen: Promedio = suma Decimal / cantidad, un solo `toDecimalPlaces(0, ROUND_HALF_UP)`; `sumCents` entero; `parseGrade` mantiene el regex y convierte con Decimal; `formatGrade` usa `Decimal#toFixed(2)`. Sin `Decimal.set`.
Comandos: 82/82 antes y después sin tocar specs; shared lint/build ok; api build ok; prettier ok; `.d.ts` públicos idénticos salvo texto de JSDoc; `decimal.ts` no se reexporta; `Decimal` global intacto.
Hallazgos: [BAJO] `literal-scale.ts:110` usa `Math.max` sobre límites enteros (no interviene en notas).
Verificado por el orquestador: ningún `.spec.ts` modificado; 82 tests en verde.
Para: qa-tester

### INFORME 2 — qa-tester

Estado: LISTO
Resumen: Sin diferencias frente al commit `6ebe46f`. 82/82 con specs intactos; lint ok. Prueba diferencial (fuera del repo, en el scratchpad): ~24.000 entradas de parseGrade/formatGrade/isValidGrade/resolveNoSubmissionGrade; ~40.000 listas de calculateAverage (aleatorias, largas hasta 3.050, límites .5/.49, vacías, solo NE/EXEMPT, inválidas); toLiteral, tablas, constantes y exports del barrel. Coinciden valores, `sumCents`, `counted`, `exempt`, estado y errores (clase, code, message, issues). `Decimal` global intacto (precision 20, rounding 4).
Hallazgo: [BAJO] la comprobación del `Decimal` global importó `decimal.mjs`; no se verificó que sea la misma instancia que usa el motor (el diseño con `Decimal.clone` y sin `Decimal.set` lo respalda).
Para: revisor-pr

### INFORME 3 — revisor-pr

Estado: APROBADO
Resumen: Cumple los 6 requisitos. Alcance: `package.json`, `average.ts`, `grade-value.ts`, `pnpm-lock.yaml` (solo decimal.js@10.6.0 para shared) y `decimal.ts` nuevo; ningún spec modificado. lint 5/5, test 82/82, build 5/5; format:check falla solo por `.agents/`.
Commit propuesto: `refactor(grading): RN-01..07 motor de notas con decimal.js (ERS §6), API y tests sin cambios`.

### Cierre (orquestador)

Documentador no necesario (sin cambio visible ni de API). El orquestador actualizó D-026 en `docs/08` (ahora con `decimal.js`, cumple ERS §6) y la fila RN-03 de `docs/03`. Commit en `features/adolfo`, subido solo a `mio`.
