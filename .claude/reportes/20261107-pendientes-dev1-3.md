# Reporte — Pendientes Dev 1 a 3, fase A1 (bitácora en transacción) y A5

## Pedido

- Textos del usuario:
  - "lo que puedes ir realizando es la del Dev 1 en adelante";
  - "todo lo que se avanza debe de llegar tanto para la repo del grupo (santxxxs) y mi repo privada";
  - "Sí, empieza".
- Fecha: 07/11/2026.
- Flujo: completo.
- Rama: `features/adolfo`.

## Resultado

- `AuditService.record(event, tx?)`: si recibe `tx`, la bitácora se guarda dentro de la misma transacción, y si falla se revierte la acción (D-047 RESUELTA).
- Se migraron a esta forma:
  - tareas y materiales;
  - versión de entrega;
  - nota y NE automática;
  - configuración y logo.
- Anuncios y archivos siguen escribiendo la bitácora después, porque no usan transacción.
- A5: se corrigieron los tipos de la cookie en `journeys.e2e`.

## Agentes que participaron

| Agente          | Qué hizo                          | Estado   |
| --------------- | --------------------------------- | -------- |
| dev1-plataforma | Implementó A1                     | LISTO    |
| qa-tester       | 23 tests de rollback y A5         | LISTO    |
| revisor-pr      | Revisión final y seguridad ligera | APROBADO |

## Prompts usados (literales)

Los prompts literales están en el expediente: el encargo de cada agente se copió íntegro en la conversación y se resume en sus INFORMES. Ver [.claude/tareas/20261107-pendientes-dev1-3.md](../tareas/20261107-pendientes-dev1-3.md).

## Decisiones del orquestador

- A1 fue sola y primero, porque toca módulos de todos los devs.
- Seguridad la cubrió el revisor, porque no hay endpoints nuevos.
- Se revirtió un cambio de solo formato en `storage/README.md`.
- El orquestador corrigió los docstrings "Nunca lanza" (hallazgo BAJO del revisor).

## Verificación

| Comando                              | Resultado            |
| ------------------------------------ | -------------------- |
| lint, tsc y build (api, web, worker) | ok                   |
| api test                             | 1140 ok              |
| web test                             | 465 ok               |
| e2e completo                         | 34 archivos / 698 ok |

## Pendientes

- Fases A2 a A4, B1 a B4 y C.
- Migrar anuncios y archivos a transacciones, si se decide.
