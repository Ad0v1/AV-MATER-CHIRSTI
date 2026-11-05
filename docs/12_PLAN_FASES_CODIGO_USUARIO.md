# 12 — Plan por fases: inicio de sesión por código de usuario

**Estado: PROPUESTA** (05/11/2026). Implementa `11_ANEXO_ERS_CODIGO_USUARIO.md` (RF-68 a RF-88) y las decisiones D-058 a D-063. Cada fase es un PR pequeño con una sola migración (D-020) y deja el sistema funcionando.

## Punto de partida (código actual)

- El login (`POST /auth/login`) solo acepta ADMIN con correo; `LocalCredential` solo existe para el administrador.
- `User.institutionalEmail` es obligatorio y único, y aparece en unos 42 archivos (API, web, pruebas, seed, importación). **Para no tocar todo a la vez:** en la Fase A el campo se mantiene y pasa a ser opcional; el cambio de nombre a `email` se hace en un PR mecánico aparte, al final.
- Ya existen y se reutilizan: sesiones en Redis con cookie `aula_sid`, `PasswordService` (argon2id), `SecretBox` (cifrado AES-256), `TotpService`, `AuditService`, `GuardianStudent` revocable y la importación F4.
- La parte de Google (`GoogleSignIn`) es solo un botón deshabilitado.

## Fase A — Código de usuario y login (Dev 1)

**RF:** 68, 70, 72, 73, 75, 78, 79 y la parte de servidor de 69.

- Migración `20261105120000_auth_codigo_usuario`: `User` gana `code` (único, nulo hasta la Fase C), `dniEncrypted` y `dniHash` (único); `LocalCredential` gana `mustChangePassword` y `passwordChangedAt` y sirve para todos los roles. **Ajuste respecto al plan original:** `institutionalEmail` sigue obligatorio hasta la Fase C (que cambia las altas de usuario), y `emailVerifiedAt`, `phone` y `address` se agregan en las Fases B y C, cada uno con su migración.
- `UserCodeService`: genera el código (año + 7 aleatorios + Luhn) con reintento ante colisión.
- `DniService`: cifra con `SecretBox` y calcula un hash con clave (HMAC) para unicidad.
- `AuthService.login` por código y contraseña para todos los roles; bloqueo de 15 min tras 5 fallos (contador en Redis); mensaje genérico; cierre de sesiones al cambiar la contraseña o desactivar al usuario.
- Cambio de contraseña con política de claves (RF-72/73) y guard que obliga a completarlo cuando `mustChangePassword` es verdadero.
- Web: el formulario de login pide código y contraseña; se elimina `GoogleSignIn`.
- Script y seed: `create-admin` y el seed generan código y contraseña aleatoria (impresa una sola vez, solo en local).
- **Listo cuando:** cualquier rol entra con código y contraseña, 5 fallos bloquean 15 min, un código mal escrito no consulta la base, y el e2e de login pasa.

## Fase B — Primer ingreso y correo (Dev 1)

> **Estado (05/11/2026): implementada** salvo el paso 4 del asistente (datos de contacto), que pertenece a la Fase C. El correo verificado se guarda en `User.contactEmail` (no único, para que dos hermanos compartan el del apoderado) con `emailVerifiedAt`; `institutionalEmail` se retira en la Fase F. Contrato en `docs/03_CONTRATOS.md`, sección "API de autenticación".

**RF:** 07 (casillas), 71, 80, 81, 82, 88.

- SMTP con Nodemailer (Mailpit en local; las variables de producción son el pendiente de Dev 1 y bloquean el despliegue).
- Códigos de verificación de 6 dígitos guardados con hash en Redis: 5 min de vigencia, 5 intentos, reenvío 1 por minuto y 3 por hora.
- Asistente de primer ingreso en orden: contraseña, casillas (política y términos; apoderado con casilla extra), correo y verificación, datos de contacto (esto último se completa en la Fase C).
- Recuperación de contraseña por correo verificado; verificación manual de emergencia por el administrador, con motivo y bitácora.
- **Listo cuando:** un usuario nuevo no puede usar nada hasta terminar los pasos, la recuperación funciona con Mailpit y las pruebas de caducidad e intentos pasan.

## Fase C — Usuarios y apoderados (Dev 2)

**RF:** 18, 19, 20, 69 (pantalla), 74, 83, 84, 86, 87.

- Altas de alumno, docente, apoderado y administrador con DNI (doble digitación y marca "verificado").
- `GuardianStudent`: marca de principal, mínimo 1 y máximo 2 apoderados por alumno, y búsqueda del apoderado por hash del DNI para reutilizarlo.
- Contraseña inicial devuelta una sola vez al crear; restablecimiento por el administrador; corrección de DNI con código nuevo.
- Pantalla de estado de credenciales (quién ya ingresó, cambió su contraseña, verificó su correo o está bloqueado) y "Mi perfil" con teléfono y dirección.
- Se actualizan `users.service`, `guardian-links`, `active-actor.guard`, las vistas y las pantallas de `admin/usuarios`.
- **Listo cuando:** se crea un alumno solo con apoderado, un apoderado con dos hijos ve ambos, un tercer apoderado se rechaza y los datos sensibles no aparecen en la bitácora.

## Fase D — Importación y hojas de credenciales (Dev 2)

**RF:** 21, 76, 77.

- La plantilla de importación cambia: DNI, apoderado (hasta 2), sin correo obligatorio. Se conservan las defensas ya hechas (SHA-256, todo o nada, límites, escape de fórmulas).
- La confirmación devuelve la hoja de credenciales por sección (Excel primero; PDF cuando exista Gotenberg), generada en memoria, descargable una vez y no almacenada.
- **Listo cuando:** una importación de prueba crea usuarios, apoderados y vínculos, y la hoja se descarga una sola vez.

## Fase E — 2FA obligatorio del administrador (Dev 1)

**RF:** 85. Puede hacerse en paralelo a la Fase B.

- El administrador no entra al sistema hasta activar el TOTP; se agregan códigos de recuperación de un solo uso, guardados con hash.
- **Listo cuando:** un administrador sin 2FA queda en la pantalla de activación y los códigos de recuperación sirven una sola vez.

## Fase F — Cierre

- Actualizar `02`, `03`, `04`, `05`, `10`, el manual técnico y los manuales por perfil.
- Cambio de nombre `institutionalEmail` a `email` (PR mecánico) y retiro de `INSTITUTION_EMAIL_DOMAIN`.
- Pruebas e2e de los recorridos completos (alumno nuevo, apoderado con dos hijos, recuperación, bloqueo) y revisión de seguridad.
- Revisión de accesibilidad de las pantallas nuevas (360 px y teclado).

## Orden y dependencias

```
A ──► B ──► C ──► D ──► F
A ──► E ───────────────┘
```

- C necesita el modelo y el login de A, y los correos de B para la parte de contacto.
- D necesita C.
- Todas las fases requieren que el equipo apruebe antes la migración, porque `User` es una tabla compartida.

## Riesgos del plan

- **SMTP de producción** pendiente: sin él no se puede cerrar la Fase B.
- **Pruebas existentes:** `users-api`, `users-import` y el seed dependen de `institutionalEmail`. Se actualizan en la fase que las toca.
- **Texto legal** de casillas y política: lo entrega la institución antes de la Fase B.
- **Datos ya sembrados** en bases locales: se recrean con el nuevo seed. No hay usuarios reales todavía.
