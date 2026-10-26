# Motor de notas de Dev 4 (RN-01..07)

Pedido por el usuario: "No dupliques a David. Pasa a mi tarea: el motor de notas de Dev 4 (RN-01 a RN-07) con los agentes."
Flujo: completo
Vueltas de corrección: 0/2
Entorno: local, rama `features/adolfo`; el avance se sube solo a `mio`. Trabajo propio de Dev 4: **sí** irá al equipo por PR (rama limpia, sin `.claude/`).

## Alcance

Motor de notas como **funciones puras** en `packages/shared/src/grading/` (sin NestJS, sin Prisma, sin fecha del sistema), probado con Vitest y sin base de datos.

| Regla | Criterio (docs/04)                                                                  |
| ----- | ----------------------------------------------------------------------------------- |
| RN-01 | Nota numérica 0..20                                                                 |
| RN-02 | Promedio simple, sin ponderación                                                    |
| RN-03 | Redondear **una sola vez**, .5 hacia arriba, cálculo decimal exacto                 |
| RN-04 | Tabla de literales configurable; por defecto AD 18..20, A 14..17, B 11..13, C 0..10 |
| RN-05 | Nota NE por tarea, 0..20, predeterminada 0; cuenta en el promedio                   |
| RN-06 | Tardía solo si la tarea lo permite; **sin descuento automático**                    |
| RN-07 | Exoneración no cuenta en el promedio                                                |

Relacionado: estados de evaluación propuestos en docs/04 (`Grade.state`: `GRADED` / `NE` / `EXEMPT`) y `displayStatus` de RF-38.

**Fuera de alcance:** esquema Prisma de `Grade`, API `grading` y pantallas (tareas siguientes); promedio anual (D-014, pendiente institución); ponderación (ERS §7).

## Situación conocida

- `packages/shared/package.json` tiene `"test": "echo \"sin tests aun\""` y no tiene Vitest: hace falta configurarlo (archivo compartido).
- `packages/shared/src/index.ts` (compartido) dice que el motor vivirá en `./grading`.

---

## Informes

### INFORME 1 — arquitecto-integrador

Estado: LISTO
Resumen: Tarea de Dev 4, en alcance v1, sin cambio de esquema ni de contratos. Funciones puras y deterministas (sin Date, I/O, NestJS ni Prisma; sin dependencias de producción). Cálculo en centésimas enteras y un solo redondeo con aritmética entera.
Hallazgos:

- [MEDIO] docs/01:6 y docs/07:19 dicen "decimal.js para calificaciones" → D-026 propuesta (centésimas enteras); documentador actualiza.
- [MEDIO] ERS solo en PDF → D-025 abierta: notas con hasta 2 decimales (0.00..20.00), respaldado por `Decimal(4,2)`, docs/03 (`"0.00"`) y QA-020.
- [BAJO] tsconfig de shared incluye specs en el build → `tsconfig.build.json` que los excluya.
- [BAJO] Vitest 4 no excluye `dist/` → `vitest.config.mts` con `include: ['src/**/*.spec.ts']`.
  Decisiones:

1. API pública (barrel `grading/index.ts`):
   - Tipos: `GradeInput = string | number`; `GradeCents` (entero 0..2000, branded); `GradeState = 'GRADED' | 'NE' | 'EXEMPT'`; `GradeEntry` (GRADED y NE con `value` obligatorio, EXEMPT sin valor); `AverageResult` (`{status:'OK', rounded, sumCents, counted, exempt}` | `{status:'NO_GRADES', counted:0, exempt}`); `LiteralBand {literal,min,max}`; `LiteralScale`; `LiteralScaleIssue` (EMPTY, NOT_INTEGER, OUT_OF_RANGE, MIN_GT_MAX, EMPTY_LITERAL, DUPLICATE_LITERAL, GAP, OVERLAP, NOT_FROM_0, NOT_TO_20); `GradingError` (INVALID_GRADE, INVALID_STATE, INVALID_SCALE).
   - Constantes: `GRADE_MIN=0`, `GRADE_MAX=20`, `DEFAULT_NO_SUBMISSION_GRADE='0.00'`, `DEFAULT_LITERAL_SCALE` congelada (AD 18..20, A 14..17, B 11..13, C 0..10).
   - Funciones: `parseGrade` (RN-01, lanza), `isValidGrade`, `formatGrade` (2 decimales), `resolveNoSubmissionGrade(configured?)` (RN-05, null → 0), `calculateAverage(entries)` (RN-02/03/06/07), `validateLiteralScale` (lista de problemas), `assertLiteralScale`, `toLiteral(rounded, scale = DEFAULT)` (RN-04; exige entero 0..20).
   - `calculateAverage`: EXEMPT no suma ni cuenta; GRADED y NE suman igual; estado desconocido → INVALID_STATE; no muta la entrada; vacío o todo EXEMPT → `NO_GRADES` (nunca 0); no expone el promedio en coma flotante.
   - `displayStatus` (RF-38) fuera de esta tarea.
2. Exactitud: regex `^\d{1,2}(\.\d{1,2})?$` + `cents <= 2000`; redondeo único `num = 2*sumCents + 100*count`, `den = 200*count`, `rounded = (num - num % den) / den`.
3. RN-06: `GradeEntry` no tiene `isLate` ni penalización; JSDoc + test (QA-008).
4. Tabla: no vacía; enteros `0 <= min <= max <= 20`; literal no vacío; sin duplicados (trim + mayúsculas); ordenada por copia: empieza en 0, termina en 20, `next.min === prev.max + 1` (si no, OVERLAP o GAP); no muta la entrada.
5. Archivos compartidos/infra de `packages/shared` (requieren autorización): `package.json` (test `vitest run`, `test:watch`, build con `tsconfig.build.json`, devDep vitest ^4.1.2 vía `pnpm --filter @aula/shared add -D vitest@^4.1.2`), `tsconfig.build.json` (nuevo), `vitest.config.mts` (nuevo), `src/index.ts` (`export * from './grading'`), `pnpm-lock.yaml` (regenerado, no a mano).
6. Archivos: `grading/{index,errors,grade-value,average,literal-scale}.ts` + `grade-value.spec.ts`, `average.spec.ts`, `literal-scale.spec.ts`.
   Plan P1..P5 con criterios: ver casos mínimos (13.50→14 y 13.40→13; [12.50,12.40]→12; [17.50]→18 y [17.49]→17; [0.10,0.20] sumCents 30; [20,NE 0]→10; [20,EXEMPT]→20; []/todo EXEMPT → NO_GRADES; literales en bordes; toLiteral(13.5) y (21) lanzan; detección de GAP/OVERLAP/NOT_FROM_0/NOT_TO_20/DUPLICATE/NOT_INTEGER; tabla en desorden válida).
   Pendientes: D-025, D-026 a confirmar por el equipo; D-014 abierta; displayStatus a la tarea de la API.
   Para: dev4-calificaciones

### Decisión del orquestador

Autorizo los 5 cambios del punto 5: son la configuración mínima de pruebas del paquete donde vive el motor, locales y reversibles. Riesgo anotado: `pnpm-lock.yaml` también lo cambia la rama de David (Dev 1); si hay conflicto al integrar, se regenera con `pnpm install`.

### INFORME 2 — dev4-calificaciones

Estado: LISTO
Archivos: `packages/shared/src/grading/{index,errors,grade-value,average,literal-scale}.ts` + 3 specs (33 casos con ID de regla); compartidos autorizados: `packages/shared/{package.json,tsconfig.build.json,vitest.config.mts,src/index.ts}`, `pnpm-lock.yaml` (solo añade vitest 4.1.12 a shared).
Comandos: shared lint/test (33)/build ok (dist sin specs); api build ok; prettier ok.
Decisiones: `parseGrade` estricta (sin trim; number vía `String(n)`, rechaza 1e1/NaN/Infinity; -0 → 0). `formatGrade` y `resolveNoSubmissionGrade` devuelven string de 2 decimales. `GradingError` con `code` e `issues`. Cobertura de la tabla solo si cada tramo es válido; usa el máximo alcanzado (`reach`), detecta tramos anidados. EXEMPT con `value` se ignora; entrada null/sin estado → INVALID_STATE.
Hallazgos: [BAJO] apps/api no declara `@aula/shared` (`workspace:*`) → en la tarea de la API grading.
Verificado por el orquestador: `pnpm --filter @aula/shared test` en verde.
Para: qa-tester

### INFORME 3 — qa-tester

Estado: LISTO
Archivos: `packages/shared/src/grading/{grade-value,average,literal-scale}.spec.ts`.
Resumen: de 33 a 82 casos; sin bugs. Bordes de parseGrade; un solo redondeo (QA-020; [10.5,10.4,10.5,10.4] → 10); 300 casos aleatorios contra referencia BigInt; promedios largos (10000 × 0.07 exacto; 100000 × 19.99 → 20) con `Number.isSafeInteger`; propiedades (EXEMPT, orden, GRADED = NE); QA-008/RN-06; entradas inválidas sin resultados parciales; toLiteral en 0..20; tablas (anidados, duplicados por mayúsculas/espacios, desorden, congeladas).
Comandos: shared test (82) ok; shared lint ok; prettier ok.
Hallazgos: [BAJO] `parseGrade` acepta `'05'` y `'00.5'` y rechaza `'020'` (coherente con el regex) → decisión del equipo.
Decisión del orquestador: se omite `seguridad-cumplimiento` (sin endpoints, permisos, archivos ni datos personales) y `ux-accesibilidad` (sin pantallas).
Para: revisor-pr

### INFORME 4 — revisor-pr

Estado: APROBADO
Resumen: El código cumple las Decisiones del INFORME 1 (un solo redondeo con aritmética entera; sin floats, Date ni dependencias; NO_GRADES; sin descuento por tardía; EXEMPT no cuenta; NE = GRADED). Alcance correcto.
Comandos: lint ok; test ok (shared 82, api 23); build ok; format:check falla solo por `.agents/` y este expediente.
Hallazgos: [BAJO] regex acepta `'05'`/`'00.5'` (D-025); [BAJO] apps/api sin `@aula/shared`; riesgo de choque de `pnpm-lock.yaml` y `packages/shared/package.json` con la rama de David (se regenera con `pnpm install`).
Archivos para la rama limpia al equipo: `packages/shared/src/grading/*` (5 + 3 specs), `packages/shared/{package.json,tsconfig.build.json,vitest.config.mts,src/index.ts}`, `pnpm-lock.yaml`.
Commit propuesto: `feat(grading): RN-01..07 motor de notas puro en shared (promedio, redondeo unico, NE, exoneracion, literales)`.
Para: documentador

### INFORME 5 — documentador

Estado: LISTO
Archivos: `docs/08_DECISIONES.md` (D-025, D-026 PROPUESTA), `docs/03_CONTRATOS.md` (sección "Motor de notas"), `docs/10_TRAZABILIDAD.md` (nota RN-01..07, 82 casos). También editó `docs/01` y `docs/07`.
Hallazgo: [ALTO] `docs/01_ARQUITECTURA.md:3-6` — la lista "Stack obligatorio en la ERS (sección 6)" incluye `decimal.js`; el motor no lo usa.

### Decisión del orquestador

Revierto las ediciones de `docs/01` y `docs/07`: reescribir una lista atribuida a la ERS la tergiversaría. La desviación queda registrada solo en D-026 (PROPUESTA, a confirmar con el equipo y la institución). **Decisión abierta para el usuario:** mantener centésimas enteras (pedir la excepción) o cambiar el motor a `decimal.js` para cumplir la ERS §6.

## Cierre

Tarea terminada. Commit en `features/adolfo`, subido solo a `mio`.
