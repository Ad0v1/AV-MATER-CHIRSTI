# 11 — Anexo a la ERS: inicio de sesión por código de usuario (RF-68 a RF-88)

**Estado: PROPUESTA** (05/11/2026), pendiente de aprobación del equipo y de la institución. Este anexo **modifica** la ERS v1.0 (13/10/2026) y no la reemplaza. Decisiones asociadas: D-058 a D-063 en `08_DECISIONES.md`.

## 1. Cambio de fondo

- El inicio de sesión con Google Workspace **queda descartado** (RF-02 y RF-03 de la ERS, sección 2.3 y la parte de Passport/Google de la sección 6).
- Todos los perfiles inician sesión con **código de usuario y contraseña**.
- El correo deja de ser la identidad del usuario: pasa a ser un dato de contacto **obligatorio y verificado**, que se registra en el primer ingreso.
- Todo alumno tiene al menos un apoderado con cuenta propia.

## 2. Requerimientos de la ERS que se modifican

| ID | Cambio |
|---|---|
| RF-01 | Una sola pantalla de inicio de sesión con código y contraseña |
| RF-02 | **Reemplazado:** autenticación por código de usuario y contraseña |
| RF-03 | Solo ingresan usuarios creados por el administrador. El rol sale de la base de datos |
| RF-04 | El administrador usa el mismo login, con 2FA obligatorio (RF-85). Deja de ser "cuenta de respaldo" |
| RF-07 | La política de privacidad y los términos de uso se aceptan con **dos casillas separadas** que hay que marcar para continuar. El apoderado tiene una tercera casilla: "acepto en nombre de los alumnos vinculados a mí". Se guardan versión, fecha e IP, y se vuelve a pedir ante cada versión nueva |
| RF-08 | Se completa con el cierre de sesiones (RF-78) |
| RF-18, RF-19, RF-20 | El alta exige el DNI. El alumno lleva al menos un apoderado. El apoderado se crea o se reutiliza por su DNI (RF-86) |
| RF-21 | La importación masiva usa el DNI y el apoderado, y genera las credenciales (RF-77) |
| RNF-04, RNF-05 | Aplican a todos los usuarios, no solo al administrador |
| RNF-09, RNF-11 | Se actualizan con el DNI cifrado y los datos de contacto (sección 5) |
| ERS §8 | Quedan resueltos el punto 3 (DNI: ahora obligatorio) y el punto 4 (acceso del apoderado: cuenta propia con código) |

## 3. Requerimientos nuevos

| ID | Requerimiento | Descripción y criterio de aceptación | Actor | Prior. |
|---|---|---|---|---|
| RF-68 | Código de usuario | 10 dígitos: 2 del año de alta, 7 aleatorios (generador criptográfico) y 1 verificador (sección 4). Es único (restricción de base de datos; si hay colisión se sortea de nuevo) y **no cambia** mientras el usuario exista en el colegio | Sistema | Alta |
| RF-69 | DNI | 8 dígitos. El administrador lo escribe dos veces. Se guarda cifrado, con un hash aparte solo para impedir repetidos. Solo lo ve el administrador. Lleva una marca "verificado contra documento", que pone el administrador | Admin | Alta |
| RF-70 | Contraseña inicial | Aleatoria y distinta por usuario. Se muestra una sola vez y se guarda con argon2id | Sistema | Alta |
| RF-71 | Primer ingreso | Pasos obligatorios, en este orden: (1) cambiar la contraseña, (2) aceptar las casillas de la política y los términos, (3) registrar y verificar el correo, (4) completar los datos de contacto. No se usa el sistema hasta terminarlos | Todos | Alta |
| RF-72 | Cambio de contraseña | Desde "Mi perfil", pidiendo la contraseña actual | Todos | Alta |
| RF-73 | Política de contraseñas | Mínimo 8 caracteres; no puede ser el DNI, el código ni la contraseña inicial; se rechazan claves de una lista de comunes | Sistema | Alta |
| RF-74 | Restablecimiento por el administrador | Genera una contraseña temporal nueva, que obliga a cambiarla en el siguiente ingreso | Admin | Alta |
| RF-75 | Bloqueo temporal | 5 fallos seguidos bloquean la cuenta 15 minutos; un ingreso correcto reinicia el contador. Se suma el límite por IP. El mensaje de error es siempre genérico: no revela si el código existe ni si la cuenta está bloqueada | Sistema | Alta |
| RF-76 | Hoja de credenciales | El administrador descarga las credenciales iniciales por sección (PDF o Excel), una sola vez. El sistema no las conserva | Admin | Media |
| RF-77 | Importación con credenciales | La importación masiva (RF-21) usa DNI y apoderado, y devuelve la hoja de credenciales de RF-76 | Admin | Alta |
| RF-78 | Cierre de sesiones | Al cambiar o restablecer la contraseña, o al desactivar al usuario, se cierran todas sus sesiones | Sistema | Alta |
| RF-79 | Bitácora de credenciales | Se registran generación de códigos, restablecimientos, cambios de contraseña, bloqueos, intentos fallidos, verificaciones manuales y correcciones de DNI. Nunca se guarda una contraseña ni un DNI en claro | Sistema | Alta |
| RF-80 | Correo verificado | Se envía un código de 6 dígitos, vigente 5 minutos, con 5 intentos; tras 5 fallos el código se invalida. Reenvío: 1 por minuto y 3 por hora. El acceso queda bloqueado hasta verificar. Cambiar el correo exige verificar de nuevo | Todos | Alta |
| RF-81 | Correo del apoderado | Si el alumno no tiene correo, registra el de su apoderado y el código de verificación llega a ese correo | Alumno | Alta |
| RF-82 | Recuperación de contraseña | "Olvidé mi contraseña": se pide el código de usuario y se envía un código al correo verificado, con las mismas reglas que RF-80 | Todos | Alta |
| RF-83 | Datos de contacto y "Mi perfil" | Apoderado: teléfono obligatorio (9 dígitos) y dirección opcional. Alumno: teléfono y dirección opcionales. Solo el administrador los ve. El usuario los corrige en "Mi perfil". El propósito de cada dato se declara en la política de privacidad | Todos | Alta |
| RF-84 | Corrección de DNI | Con motivo. Genera un código nuevo, conserva el historial del anterior, cierra las sesiones y obliga a restablecer la contraseña | Admin | Media |
| RF-85 | 2FA del administrador | Obligatorio desde su primer ingreso (TOTP), con códigos de recuperación de un solo uso | Admin | Alta |
| RF-86 | Vínculo apoderado-alumno | Mínimo 1 y máximo 2 apoderados por alumno; uno es el **principal** y recibe los avisos. Un apoderado puede tener varios alumnos en distintos grados y secciones. Al crear un apoderado se busca por DNI: si ya existe, solo se crea el vínculo | Admin | Alta |
| RF-87 | Estado de credenciales | El administrador ve, por usuario y por sección, si ya ingresó, si cambió su contraseña, si verificó su correo o si está bloqueado, con filtros. Nunca se muestra una contraseña | Admin | Alta |
| RF-88 | Verificación manual de correo | En una emergencia (por ejemplo, falla del servidor de correo) el administrador puede marcar un correo como verificado, indicando el motivo. Queda en la bitácora | Admin | Media |

## 4. Código de usuario

- **Formato:** `AA` + 7 dígitos aleatorios + 1 dígito verificador, en total 10 dígitos. `AA` son los dos últimos dígitos del año de alta (alta en 2027, prefijo `27`). Es el año de la primera matrícula y no cambia hasta que el alumno termine el colegio.
- **Verificador:** algoritmo de Luhn calculado sobre los 9 primeros dígitos. Detecta errores de digitación antes de consultar la base. No aporta seguridad.
- **Espacio:** 10 millones de combinaciones por año. La seguridad no depende del secreto del código (está en las hojas impresas): depende de la contraseña, del bloqueo temporal (RF-75) y del límite por IP.
- **Relación con el DNI:** ninguna. El código no se deriva del DNI y el DNI no se deduce del código.
- Un código mal escrito (verificador inválido) responde con el mismo mensaje genérico de credenciales inválidas hacia afuera; el aviso "código mal escrito" solo aparece en el formulario, antes de enviarlo, con validación en el cliente.

## 5. Datos personales

| Dato | Quién lo ingresa | Almacenamiento | Quién lo ve |
|---|---|---|---|
| DNI (alumno, apoderado, docente, administrador) | Administrador | Cifrado + hash de unicidad | Administrador |
| Correo | El propio usuario (o el apoderado, RF-81) | Normal, verificado | Administrador |
| Teléfono | El propio usuario | Normal | Administrador |
| Dirección | El propio usuario | Normal | Administrador |
| Contraseña | Generada / el usuario | argon2id | Nadie |

- Los docentes no ven DNI, teléfono ni dirección de nadie.
- Ningún dato de esta tabla va a logs, colas, URLs, bitácora ni exportaciones CSV/Excel generales (RNF-09, RNF-11).
- La **fecha de nacimiento no se recoge**: ya no hace falta distinguir menores de 14 años.
- Para la institución: el propósito de cada dato debe quedar escrito en la política de privacidad y en el registro del banco de datos (ERS §8, punto 6). El texto legal de las casillas lo revisa el asesor de la institución.

## 6. Reglas de negocio nuevas

| ID | Regla |
|---|---|
| RN-16 | El código de usuario es único e inmutable. Solo una corrección de DNI (RF-84) genera uno nuevo, y el anterior queda en el historial |
| RN-17 | Todo alumno tiene entre 1 y 2 apoderados vigentes; uno de ellos es el principal |
| RN-18 | Un usuario no usa el sistema hasta completar el primer ingreso (RF-71) |
| RN-19 | Una contraseña, un código de verificación o un DNI nunca se muestran después de la creación, ni se escriben en logs o bitácora |

## 7. Impacto en el sistema actual

- **Datos:** `User` gana `code` (único), `dniEncrypted`, `dniHash` (único), `mustChangePassword`, `contactEmail`/`emailVerifiedAt`, `phone`, `address`; `institutionalEmail` deja de ser obligatorio. `LocalCredential` existe para todos los usuarios. `GuardianStudent` gana `isPrimary` y el límite de 2 por alumno. Nuevas tablas para intentos y bloqueos si no se usa Redis.
- **API:** se generaliza `AuthService.login`; se quitan los supuestos de "solo ADMIN"; se agregan primer ingreso, correo, recuperación, perfil y estado de credenciales. `ActiveActorGuard`, la importación de F4, el módulo `users` y el seed cambian.
- **Web:** se elimina `GoogleSignIn`; el login pide código y contraseña; nuevas pantallas de primer ingreso, "Mi perfil" y estado de credenciales.
- **Infraestructura:** SMTP de producción es ahora un requisito para que los usuarios completen el primer ingreso (RF-80).
- **Documentos:** `02`, `03`, `04`, `05`, `10`, manuales y `INSTITUTION_EMAIL_DOMAIN` (se retira) deben actualizarse al implementar cada fase.

## 8. Pendientes de la institución

- Texto legal de la política, los términos y las casillas (RF-07).
- Propósito declarado de teléfono y dirección (RF-83).
- Si el acuerdo del apoderado en nombre de los alumnos basta como consentimiento (RNF-11).
