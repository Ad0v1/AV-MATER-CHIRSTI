# Reporte — Motor de notas de Dev 4 (RN-01..07)

> Reporte retroactivo, escrito el 26/10/2026 cuando el usuario pidió reportes por tarea. Los prompts son los literales que usó el orquestador.

## Pedido

- **Usuario:** "No dupliques a David. Pasa a mi tarea: el motor de notas de Dev 4 (RN-01 a RN-07) con los agentes."
- **Fecha:** 26/10/2026 · **Flujo:** completo · **Rama:** `features/adolfo` · **Commit:** `6ebe46f` (subido a `mio`)

## Resultado

Motor de notas como funciones puras en `packages/shared/src/grading/`: valida notas 0..20 con hasta 2 decimales, promedio simple, un solo redondeo .5 hacia arriba, NE por defecto 0 que cuenta, exoneradas fuera, sin descuento por tardía, tabla AD/A/B/C configurable y validada. Sin notas que cuenten devuelve "sin nota" (`NO_GRADES`), nunca 0. Vitest configurado en `@aula/shared` con 82 tests. (El cálculo se cambió después a `decimal.js`: ver `20261026-motor-notas-decimaljs.md`.)

## Agentes que participaron

| #   | Agente                  | Modelo | Qué hizo                                                                  | Estado                      |
| --- | ----------------------- | ------ | ------------------------------------------------------------------------- | --------------------------- |
| 1   | `arquitecto-integrador` | Opus   | API pública, cálculo exacto, validación de la tabla, archivos compartidos | LISTO                       |
| 2   | `dev4-calificaciones`   | Opus   | Implementación + 33 tests + configuración de Vitest                       | LISTO                       |
| 3   | `qa-tester`             | Sonnet | Amplió a 82 tests; sin bugs                                               | LISTO                       |
| 4   | `revisor-pr`            | Sonnet | Revisión del código contra el plan                                        | APROBADO                    |
| 5   | `documentador`          | Haiku  | D-025, D-026, contrato del motor, trazabilidad                            | LISTO (con 1 hallazgo ALTO) |

No participaron `seguridad-cumplimiento` ni `ux-accesibilidad`: sin endpoints, datos personales ni pantallas.

## Prompts usados

### 1. arquitecto-integrador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-motor-notas.md (léelo completo, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: planificar el motor de notas de Dev 4 (RN-01..07; relacionados RF-41..52 y RF-38) como funciones puras en packages/shared/src/grading/. Revisa docs/00, 02 (Grade), 03, 04, 08 (D-014 y otras de notas), 10, y docs/fuentes si hay texto de la ERS en formato legible (los PDF no; usa los .md). Revisa también packages/shared (package.json, tsconfig.json, src/index.ts) y cómo están configurados Vitest y el build en apps/api (vitest.config, versión de vitest en apps/api/package.json) para reutilizar la misma versión.

Define en Decisiones:
1. API pública del motor: tipos (p. ej. GradeEntry con estado GRADED/NE/EXEMPT y valor, LiteralScale), funciones (validar nota RN-01, nota NE por defecto RN-05, promedio simple con exoneradas excluidas RN-02/07, redondeo único .5 hacia arriba RN-03, literal según tabla configurable RN-04, y si corresponde un helper de displayStatus de RF-38 o dejarlo fuera). Qué devuelve el promedio si todas están exoneradas o no hay notas.
2. Cómo lograr cálculo decimal exacto sin dependencias (p. ej. trabajar en enteros/centésimas, o aritmética racional suma/cantidad y redondear al final) y si las notas admiten decimales (RN-01 dice 0..20; ¿enteros o con decimales? si la ERS no lo dice, propone y márcalo como decisión abierta).
3. RN-06: el motor no aplica descuento por tardía; qué parámetro o garantía lo refleja.
4. Validación de la tabla de literales configurable (rangos contiguos, sin huecos ni solapes, cubren 0..20).
5. Archivos compartidos a tocar: packages/shared/package.json (vitest + script test), packages/shared/src/index.ts (export), pnpm-lock.yaml. Di exactamente qué cambio y que lo autorice el orquestador.
6. Estructura de archivos dentro de packages/shared/src/grading/ y nombres.
No modifiques archivos. Termina con el INFORME del protocolo, Para: dev4-calificaciones.
```

### 2. dev4-calificaciones

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-motor-notas.md (léelo completo: INFORME 1 y la "Decisión del orquestador"; y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo.

Tu encargo: implementar P1..P5 del INFORME 1 tal cual las Decisiones 1–6. El orquestador YA autorizó los 5 cambios compartidos del punto 5 (packages/shared/package.json, tsconfig.build.json, vitest.config.mts, src/index.ts y pnpm-lock.yaml vía `pnpm --filter @aula/shared add -D vitest@^4.1.2`). Nada más fuera de packages/shared/src/grading/.

Escribe también los specs de P2–P4 con los casos mínimos del plan, con el ID de la regla en el nombre (`it('RN-03: ...')`); qa-tester los ampliará después. Sin dependencias de producción, sin Date, sin floats para promediar. Comentarios JSDoc breves en español en la API pública (incluye la garantía de RN-06).

Al terminar corre `pnpm --filter @aula/shared lint`, `pnpm --filter @aula/shared test`, `pnpm --filter @aula/shared build` (comprueba que dist no contiene .spec), `pnpm --filter api build` (consume @aula/shared) y `pnpm exec prettier --check packages/shared`. No hagas commit. Termina con el INFORME del protocolo.
```

### 3. qa-tester

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-motor-notas.md (léelo completo, INFORMES 1 y 2, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md).

Tu encargo: revisar y ampliar los specs de C:\Proyectos\AV-MATER-CHIRSTI\packages\shared\src\grading\*.spec.ts (RN-01..07). Lee también docs/09_QA_BASE.md y usa los códigos QA-xxx que correspondan (p. ej. QA-008, QA-020). Cubre lo que falte, como:
- parseGrade en bordes: '20.00' vs '20.01', '00.5', '5.0', '0', number 13.45, '13.', '.5', '-0'.
- Un solo redondeo: casos donde redondear antes cambiaría el resultado (p. ej. tres notas que sumen x.5 exacto, x.49).
- Promedios largos (p. ej. 100 notas, muchos NE) sin error de coma flotante y con Number.isSafeInteger.
- Propiedad: añadir EXEMPT a cualquier lista no cambia el resultado (salvo el contador exempt).
- RN-06: una nota de entrega tardía cuenta igual (QA-008).
- Tablas: tramos anidados (OVERLAP), tabla con un solo tramo 0..20, literales duplicados por mayúsculas/espacios, tabla personalizada en desorden, y que validateLiteralScale/calculateAverage no mutan la entrada.
- toLiteral con la tabla por defecto en todos los bordes (10/11, 13/14, 17/18).
Solo archivos de test. Si encuentras un bug, NO lo corrijas: CAMBIOS_PEDIDOS con el caso. Corre `pnpm --filter @aula/shared test`, `pnpm --filter @aula/shared lint` y `pnpm exec prettier --check packages/shared`. No hagas commit. Termina con el INFORME del protocolo.
```

### 4. revisor-pr

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-motor-notas.md (léelo completo, INFORMES 1–3, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). Trabaja en C:\Proyectos\AV-MATER-CHIRSTI, rama features/adolfo.

Tu encargo: revisión final según tu archivo de agente. Alcance esperado: packages/shared/src/grading/ (código y specs), los archivos compartidos autorizados (packages/shared/package.json, tsconfig.build.json, vitest.config.mts, src/index.ts, pnpm-lock.yaml) y .claude/tareas/ (lo escribe el orquestador). Ignora .agents/ y skills-lock.json. Revisa también el código del motor contra las Decisiones del INFORME 1 (no solo que los tests pasen): un solo redondeo, sin floats ni Date ni dependencias de producción, NO_GRADES en vez de 0, RN-06.
Corre pnpm lint, pnpm test, pnpm build y pnpm format:check (si format:check falla solo por .agents/ o por el expediente, indícalo sin contarlo como fallo). Este trabajo es de Dev 4 y sí irá al equipo: indica qué archivos irían en la rama limpia para el PR al equipo (sin .claude/) y propón el mensaje de commit con la convención. Termina con el INFORME del protocolo.
```

### 5. documentador

```text
Expediente: C:\Proyectos\AV-MATER-CHIRSTI\.claude\tareas\20261026-motor-notas.md (léelo completo, INFORMES 1–4, y C:\Proyectos\AV-MATER-CHIRSTI\.claude\PROTOCOLO_AGENTES.md). La tarea está aprobada. Verifica la API real leyendo C:\Proyectos\AV-MATER-CHIRSTI\packages\shared\src\grading\index.ts y sus módulos antes de escribir.

Tu encargo, solo en C:\Proyectos\AV-MATER-CHIRSTI\docs\, con el estilo de esos documentos:
1. docs/08_DECISIONES.md: D-025 (PROPUESTA) notas con hasta 2 decimales 0.00..20.00 — incluye la nota sobre ceros a la izquierda ('05' aceptado, '020' rechazado) como punto a confirmar; D-026 (PROPUESTA) cálculo en centésimas enteras sin decimal.js, un solo redondeo .5 hacia arriba, promedio sin notas = "sin nota" (NO_GRADES), no 0. Aprobadores: equipo; relación con D-014. Comprueba que los números D-025/D-026 estén libres.
2. docs/01_ARQUITECTURA.md línea ~6 y docs/07_PLAN_SPRINT0.md línea ~19: donde dicen "decimal.js para calificaciones", cámbialo por la referencia a D-026 (centésimas enteras en @aula/shared/grading), sin reescribir el resto.
3. docs/03_CONTRATOS.md: sección "Motor de notas (`@aula/shared` → grading, Dev 4)" como contrato interno que consumirán la API grading (Dev 4) y los reportes (Dev 5): tipos, constantes y funciones públicas con una línea cada una, las reglas RN que cumple, y que los reportes no recalculan (usan el motor).
4. docs/10_TRAZABILIDAD.md: si la tabla lo permite, indicar que RN-01..07 están implementadas en `packages/shared/src/grading/` con sus specs (82 casos). Si el formato no admite ese detalle, añade una nota breve.
No hagas commit. Termina con el INFORME del protocolo.
```

## Decisiones del orquestador

- Autorizó los 5 cambios compartidos de `packages/shared` (Vitest, `tsconfig.build.json`, export y lock) por ser la configuración mínima de pruebas.
- Omitió `seguridad-cumplimiento` y `ux-accesibilidad` (sin endpoints, datos personales ni pantallas).
- **Revirtió** las ediciones de `documentador` en `docs/01` y `docs/07`: esa lista dice "Stack obligatorio en la ERS (sección 6)" y quitar `decimal.js` habría tergiversado la fuente. Llevó la decisión al usuario, que eligió cambiar a `decimal.js`.

## Archivos

- `packages/shared/src/grading/{index,errors,grade-value,average,literal-scale}.ts` + 3 specs
- `packages/shared/{package.json, tsconfig.build.json, vitest.config.mts, src/index.ts}`, `pnpm-lock.yaml`
- `docs/03_CONTRATOS.md`, `docs/08_DECISIONES.md`, `docs/10_TRAZABILIDAD.md`
- `.claude/tareas/20261026-motor-notas.md`

## Verificación

- `pnpm --filter @aula/shared test`: 82/82. `pnpm lint`, `pnpm test` (shared 82 + api 23), `pnpm build`: ok.
- `format:check`: ok en el alcance (solo falla `.agents/`, fuera de alcance).

## Pendientes

- D-025 (decimales; '05' aceptado y '020' rechazado) por confirmar. D-014 (promedio anual) pendiente de institución.
- `displayStatus` (RF-38), esquema `Grade`, API `grading` y `@aula/shared` en `apps/api`: siguiente tarea de Dev 4.

## Expediente

[.claude/tareas/20261026-motor-notas.md](../tareas/20261026-motor-notas.md)
