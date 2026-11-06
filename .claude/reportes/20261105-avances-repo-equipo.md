# Avances del repo del equipo (`sxxntoz/AV-MATER-CHIRSTI`)

## Pedido

- **Texto del usuario:** "se ha visto avances en la reo santxxxs entonces carga el avance que esta en la rama develop a mi pc local para ver lo avances y dame un reporte de lo modificado en .md"
- **Fecha:** 05/11/2026
- **Flujo:** lo hizo el orquestador, sin agentes (solo lectura de git y este reporte)
- **Rama de trabajo:** `features/adolfo` (sin cambios, sin merge, sin commit)

## Resultado

1. Traje el repo del equipo (`git fetch origin`) y actualicé las ramas locales **sin cambiarme de rama** y sin tocar tu trabajo sin commitear:
   - `develop`: `2fe9cdb` → `e1e908e` (12 commits; ahora igual a `origin/develop`)
   - `main`: `832ba93` → `c71e562` (ahora igual a `origin/main`)
2. **Hallazgo principal:** `develop` no tiene nada nuevo de tus compañeros. Está parada desde el **29/10**, y lo que trae ya lo tenías:
   - PR #10: **tu propio avance** (Dev 2, Dev 3 parcial y Dev 4), subido como un solo commit `035d57e`.
   - PR #3: el storage de Luchito, que ya juntaste en `features/adolfo` (`9f2a99d`).
3. **El avance nuevo de verdad está en `main`** (03/11), que va 6 commits por delante de `develop`. Todo es de **David (Dev 1)**: el rediseño del login y la marca institucional, más un arreglo en la carga del `.env`.

## Estado de las ramas del equipo

| Rama                      | Último cambio | Autor          | Qué tiene                                                     |
| ------------------------- | ------------- | -------------- | ------------------------------------------------------------- |
| `origin/main`             | 03/11         | David / Walter | PR #12 (login rediseñado) y PR #11 (merge de Luchito)         |
| `origin/features/david`   | 03/11         | David          | "Mejorando diseño de interfaz del login" (ya está en `main`)  |
| `origin/features/adolfo`  | 02/11         | Ad0v1          | Tu rama en el repo del equipo (merge de `develop` en `envio`) |
| `origin/develop`          | 29/10         | Walter         | PR #10 (tu avance) y PR #3 (storage de Luchito)               |
| `origin/features/luchito` | 29/10         | Walter         | Sin cambios nuevos                                            |
| `origin/features/juica`   | 14/10         | Juicaa         | Sin cambios nuevos                                            |
| `origin/features/azael`   | 09/10         | Juicaa         | Sin cambios nuevos                                            |

> Nota: en el repo del equipo se está mezclando a `main` directamente, sin pasar por `develop`. Conviene preguntarle a Walter cuál es la rama de integración que usa el equipo.

## Lo nuevo en `main` (lo que aún no está en `features/adolfo`)

Comparación: `origin/develop..origin/main`, 50 archivos, +372 / −65 líneas.

### 1. API: carga del `.env` en desarrollo (`f399668`, David, 29/10)

- **Nuevo** `apps/api/src/config/dotenv.ts`: `loadDotenv()` carga `.env` (o `../../.env`, el de la raíz) sin pisar variables que ya existan. En producción no hace nada.
- Lo llaman `apps/api/src/main.ts`, `scripts/backup.ts` y `scripts/create-admin.ts`. Antes, `pnpm --filter api start:dev` ignoraba el `.env` y usaba solo los valores por defecto. Por eso no funcionaban `TRUST_PROXY`, `SESSION_TTL_SECONDS` y otras variables.
- `apps/api/package.json`: nueva dependencia `dotenv ^18.0.9`.
- `.env.example`: `TOTP_ISSUER` ahora va entre comillas, porque con el espacio fallaba al cargarlo en bash.

### 2. Web: paleta institucional y rediseño del login (`f196889`, 29/10)

- **Nuevo** `apps/web/app/tokens.css` (112 líneas): tokens de color de la marca.
  - Marca: `--brand #592719` (marrón), `--brand-dark`, `--brand-soft`.
  - Dorado: `--gold #ffcc00`, `--gold-dark`, `--gold-soft`.
  - Superficies y texto: `--canvas`, `--surface`, `--ink`, `--line`, `--line-field`, etc.
  - Estados: `--success`, `--warning`, `--danger`, `--info` (cada uno con su versión `-soft`).
  - Todos expuestos a Tailwind como `bg-brand`, `text-ink`, `border-line-field`, etc.
- `globals.css` simplificado (−38 líneas), ahora usa los tokens.
- `components/ui/button.tsx`: el botón `default` usa la marca, el `outline` también, y hay una **variante nueva `gold`** para botones destacados ("Ingresar al aula").
- `components/ui/sidebar.tsx`: un ajuste de color.
- `login/page.tsx` y `login-form.tsx` rediseñados: botón para ver u ocultar la contraseña (iconos `Eye`/`EyeOff`), spinner al enviar, ícono de alerta en errores y campos más altos (`h-11`).
- `next.config.ts`: `devIndicators: false` oculta el círculo "N" de Next en desarrollo.
- **Nuevo** `public/brand/escudo.webp`.

### 3. Web: Google como acceso principal (`7419698`, 29/10)

- **Nuevo** `components/auth/google-sign-in.tsx`: botón "Continuar con Google". **Está deshabilitado** hasta que el colegio entregue las credenciales OAuth y el dominio. Muestra "Disponible próximamente".
- El login local del admin queda "plegado", como acceso secundario.

### 4. Web: pulido final de la interfaz del login (`69bae60`, 03/11)

- Iconos del sitio: `app/favicon.ico` (reemplazado), `app/icon.png` y `app/apple-icon.png` (nuevos).
- Logos en `apps/web/assets/` (`logo-mater-christi.png/.webp`, "Emblema escolar sobre fondo azul marino.png") y en `public/brand/logo-mater-christi.webp`.
- `layout.tsx`: plantilla de títulos `"%s | Aula Virtual - Mater Christi"`.
- **Las ~25 páginas** de `(app)` (admin, curso, mis-notas, apoderado, inicio) ganaron `export const metadata = { title: '...' }`: un cambio de 2 líneas en cada una.
- `proxy.ts`: el matcher ya no exige sesión para `icon.png`, `apple-icon.png` y `/brand`, así el login puede mostrar el logo.
- `politica/page.tsx`: el título se acortó a "Política y términos".

## Lo más nuevo: PR #13 de David (abierto el 05/11, aún sin aceptar)

Rama `origin/features/david` (`29b5bb5`), copiada en tu PC como la rama local `features/david`. Son 4 commits sobre `main`: 114 archivos, +7162 / −614 líneas.

**Es un cambio grande en el login.** **Se descarta Google:** todos los roles entran con **código de usuario + contraseña**.

### Fase 0 — Documentación (`d74cfca`)

- Nuevos: `docs/11_ANEXO_ERS_CODIGO_USUARIO.md` (RF-68 a RF-88) y `docs/12_PLAN_FASES_CODIGO_USUARIO.md`, con el plan en fases A a F.
- Decisiones nuevas D-058 a D-063 en `docs/08`.

### Fase A — Login por código (`279067d`)

- **Código de usuario de 10 dígitos:** 2 del año de alta, 7 aleatorios y 1 verificador Luhn.
- **`User` gana tres campos:**
  - `code`;
  - `dniEncrypted`: el DNI cifrado con AES-256-GCM;
  - `dniHash`: un hash con clave del DNI.
- **`LocalCredential` sirve ahora a todos los roles.** Gana `mustChangePassword` y `passwordChangedAt`.
- **Bloqueo** de 15 min tras 5 fallos por cuenta, además del límite por IP.
- **`POST /auth/password`** con política de claves. Al cambiar la clave cierra las demás sesiones.
- **Guard global:** si hay un cambio de clave pendiente, solo deja ver la sesión, cerrarla o cambiar la clave.
- **Web:**
  - login por código;
  - `/cambiar-clave`;
  - ya no hay botón de Google.
- **Seed y `create-admin`:** generan el código y una contraseña aleatoria del administrador.

### Fase B — Correo verificado y política (`3f55470`)

- **Correo de contacto verificado con un código de 6 dígitos:**
  - el código dura 5 minutos y admite 5 intentos;
  - el reenvío está limitado a 1 por minuto y 3 por hora;
  - el alumno sin correo usa el de su apoderado.
- **Primer ingreso por pasos obligatorios** (RN-18): contraseña, política y correo.
- **Política con dos casillas.** El apoderado también acepta en nombre de sus alumnos.
- **Recuperación de contraseña** por correo.
- **Verificación manual del correo por el ADMIN**, con motivo (RF-88).
- **Servicio de correo con Nodemailer.** Es otro distinto al `MailerService` de tu Dev 5.
- **Web:** `/verificar-correo` y `/recuperar`.

### Fase C — Altas con DNI y apoderados (`29b5bb5`)

- **Altas de alumno, docente y apoderado:**
  - el DNI se escribe dos veces;
  - se generan el código y una contraseña inicial aleatoria, que se muestra **una sola vez**.
- **Apoderados:**
  - cada alumno tiene 1 o 2 apoderados; el primero es el principal;
  - un apoderado que ya existe se reutiliza por DNI.
- **Acciones del ADMIN:**
  - restablecer la contraseña;
  - corregir el DNI, lo que genera un código nuevo;
  - verificar el DNI.
- **Mi perfil (`/mi-perfil`):** teléfono, obligatorio para el apoderado, y dirección. Es el cuarto paso del primer ingreso.
- **Sesiones:** desactivar o retirar a un usuario cierra sus sesiones.
- **4 migraciones nuevas** (`20261105120000` a `20261105230000`). **`institutionalEmail` pasa a ser opcional.**
- **Pendiente según David:** la importación masiva (fase D) todavía no genera credenciales.

### Qué cambia para ti

- **Tu forma de entrar en local cambia.** Ya no sería `admin@colegio.example` con contraseña: el seed nuevo genera un **código** y una contraseña aleatoria. La sesión de desarrollo (`dev-session.ts`) dejaría de hacer falta.
- **Choca con tu `prisma/seed/credentials.ts`.** David creó un archivo con el mismo nombre (`add/add`); hay que quedarse con el suyo.
- **Correo:** David trae su propio servicio de correo y tu Dev 5 tiene `MailerService`. Conviene unificarlos.
- **Conflictos reales entre `origin/features/adolfo` y `origin/features/david`:** son **8**, según una simulación sin cambios:
  - `users-prisma.mock-spec.ts`;
  - `apoderado/page.tsx`;
  - `curso/[id]/registro/page.tsx` y `curso/[id]/tareas/page.tsx`;
  - `docs/03` y `docs/08`;
  - `prisma/seed/credentials.ts` y `prisma/seed/index.ts`.
- **Tu último avance no tiene PR abierto en el equipo.** Lo subiste a `features/adolfo` el 02/11 (Dev 3 completo, Dev 4 y Dev 5 hasta la fase 5e), pero nadie lo ha integrado: `main` solo tiene tu PR #10 viejo. Conviene abrir un PR de `features/adolfo` hacia `main` (o hacia `develop`, si el equipo lo confirma) antes de que entre el PR #13, para resolver los 8 conflictos una sola vez.

## Impacto en tu rama `features/adolfo`

- `main` tiene **10 commits** que `features/adolfo` no tiene. Los 6 de arriba son contenido nuevo, y el resto son merges y tu PR #10 aplastado en un solo commit.
- Hice una simulación de merge (`git merge-tree`, que **no modifica nada**) de `origin/main` sobre `features/adolfo`: da **45 conflictos**.
  - **30 son `add/add`**: archivos que tú creaste y que el equipo también tiene, porque tu PR #10 entró aplastado en un solo commit (`035d57e`). Git no reconoce que es el mismo trabajo. Casi todos se resuelven quedándote con tu versión, que es la más nueva.
  - **15 son de contenido**: entre otros, `apps/api/package.json`, `apps/api/src/app.module.ts`, `files/*`, `submissions/*`, tests e2e, y las páginas de `admin/estructura` y `admin/usuarios`. Ahí David añadió las 2 líneas de `metadata`.
- Además tienes cambios **sin commitear** en `features/adolfo` (`.agents/`, `docs.zip`, `docs/criterios.rar`, `skills-lock.json`). Habría que commitearlos o guardarlos antes de cualquier merge.

## Cómo ver los avances en tu PC

Las ramas ya están actualizadas localmente. Sin cambiar de rama puedes:

```bash
git log --oneline develop..main
```

```bash
git diff develop main --stat
```

Para **ver la web de David funcionando** sin tocar tu rama, lo más seguro es una carpeta aparte:

```bash
git worktree add ../AV-MATER-CHIRSTI-main main
```

Luego, en esa carpeta: `pnpm install`, `docker compose up -d`, `pnpm --filter api start:dev` y `pnpm --filter web dev`. Para borrarla después: `git worktree remove ../AV-MATER-CHIRSTI-main`.

## Verificación

| Comando                                                       | Resultado                               |
| ------------------------------------------------------------- | --------------------------------------- |
| `git fetch origin`                                            | OK (`features/david` 7419698 → 69bae60) |
| `git fetch origin develop:develop`                            | OK, avance rápido 2fe9cdb → e1e908e     |
| `git fetch origin main:main`                                  | OK, avance rápido 832ba93 → c71e562     |
| `git merge-tree features/adolfo origin/main`                  | 45 conflictos (simulación, sin cambios) |
| `git fetch origin features/david:features/david`              | OK, rama local en 29b5bb5 (PR #13)      |
| `git merge-tree origin/features/adolfo origin/features/david` | 8 conflictos reales (simulación)        |

No se corrieron lint, test ni build, porque no se modificó código.

## Pendientes y decisiones abiertas

- Decidir si traes `main` a `features/adolfo` (merge con los 45 conflictos de arriba) o solo los 6 commits de David con `cherry-pick`, que es más limpio.
- Confirmar con el equipo si la rama de integración es `develop` o `main`.
- El login con Google sigue deshabilitado hasta que el colegio entregue las credenciales OAuth.

## Expediente

No aplica: es una tarea de consulta, sin agentes ni cambios de código.
