# Protocolo de comunicación entre agentes

Lo leen **todos** los agentes antes de empezar. Lo aplica el orquestador (sesión principal, `CLAUDE.md`).

## 1. Quién habla con quién

- Los agentes **no se llaman entre sí**. Un subagente no puede lanzar a otro.
- Toda la comunicación pasa por el **orquestador**, que:
  1. abre un **expediente** por tarea en `.claude/tareas/<AAAAMMDD>-<slug>.md`;
  2. lanza a cada agente pasándole la ruta del expediente y su encargo;
  3. pega en el expediente el INFORME que devuelve cada agente;
  4. decide a quién le toca después según el `Estado` y el campo `Para`.
- **El orquestador es el único que escribe en `.claude/tareas/`.** Los agentes solo lo leen. Así no hay conflictos.

## 2. Antes de empezar

1. Lee el expediente completo: el encargo y los informes de los agentes anteriores.
2. Lee los documentos de `docs/` que te indique tu archivo de agente.
3. Si falta información para hacer tu parte, no adivines: devuelve `Estado: BLOQUEADO` y di qué necesitas y de quién.

## 3. Formato del INFORME (obligatorio)

Tu **última respuesta** debe ser exactamente este bloque y nada después:

```
## INFORME — <nombre-del-agente>
Estado: LISTO | BLOQUEADO | CAMBIOS_PEDIDOS | APROBADO | RECHAZADO
Requisitos: <IDs: RF-xx, RN-xx, RNF-xx>
Resumen: <2-4 líneas de qué hiciste o qué encontraste>
Archivos: <rutas creadas o modificadas, o "ninguno">
Comandos: <comandos ejecutados y su resultado: ok / falla + causa>
Hallazgos:
- [CRÍTICO|ALTO|MEDIO|BAJO] <archivo:línea> — <problema> → <corrección>
Decisiones: <decisiones tomadas que otro agente debe respetar, o "ninguna">
Pendientes: <lo que quedó sin hacer, o "ninguno">
Para: <agente siguiente> — <qué necesita saber de ti>
```

Usa solo los estados que te corresponden:

| Estado            | Lo usan                 | Significa                                             |
| ----------------- | ----------------------- | ----------------------------------------------------- |
| `LISTO`           | agentes que construyen  | Terminé mi parte                                      |
| `BLOQUEADO`       | cualquiera              | No puedo seguir sin algo de otro agente o del usuario |
| `CAMBIOS_PEDIDOS` | revisores               | Hay que corregir; lista los cambios en Hallazgos      |
| `APROBADO`        | revisores               | Sin hallazgos CRÍTICO ni ALTO                         |
| `RECHAZADO`       | `arquitecto-integrador` | La tarea contradice ERS, contratos o alcance v1       |

## 4. Reglas comunes

- **Solo modificas las carpetas de tu archivo de agente.** Si necesitas tocar otra, devuelve `BLOQUEADO` con `Para: <dueño>`.
- **Archivos compartidos** (nadie los edita por su cuenta): `prisma/schema/base.prisma`, `prisma/migrations/`, `apps/api/src/app.module.ts`, `apps/api/src/app.setup.ts`, `package.json` de raíz y de cada app, `pnpm-lock.yaml`, `turbo.json`, `apps/web/app/layout.tsx`, `packages/shared/src/index.ts`. Si los necesitas, pídelo en `Para:` y el orquestador decide.
- **Contratos:** los nombres de endpoints, DTOs, eventos y entidades salen de `docs/02_MODELO_ENTIDADES.md` y `docs/03_CONTRATOS.md`. No inventes otros; si falta uno, pídeselo a `arquitecto-integrador`.
- **Secretos:** no leas `.env`. Usa `.env.example` y valores de prueba.
- **Git:** no hagas `commit`, `push`, `merge`, `rebase` ni cambies de rama. Eso lo hace el usuario.
- **Alcance v1:** nada de asistencia, exámenes, cuestionarios, SIAGIE, Google Drive/Classroom ni ponderación de actividades.
- Escribe en español, igual que el resto del proyecto.

## 5. Comandos del proyecto

Monorepo con pnpm y Turborepo (Node ≥ 24).

| Para qué                          | Comando                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| Lint de todo                      | `pnpm lint`                                                    |
| Tests de todo                     | `pnpm test`                                                    |
| Build de todo                     | `pnpm build`                                                   |
| Solo un paquete                   | `pnpm --filter <api\|web\|worker\|shared> <lint\|test\|build>` |
| Formato                           | `pnpm format:check`                                            |
| Cliente Prisma                    | `pnpm db:generate`                                             |
| Migración (solo local con Docker) | `pnpm db:migrate`                                              |

En la nube no hay Docker ni MySQL: si un comando necesita la base de datos, anótalo en `Pendientes` como "verificar en local".
