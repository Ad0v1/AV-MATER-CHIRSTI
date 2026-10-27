// Mensajes fijos en español del módulo users (el filtro global pone el código según el status).
// Nunca incluyen correos ni nombres: solo describen la regla incumplida.
export const USERS_MSG = {
  userNotFound: 'El usuario no existe',
  studentNotFound: 'El estudiante no existe',
  guardianNotFound: 'El apoderado no existe',
  linkNotFound: 'El vínculo no existe',
  sectionNotFound: 'La sección no existe',
  emailTaken: 'Ya existe un usuario con ese correo',
  emailDomain: 'El correo no pertenece al dominio institucional',
  notStudent: 'El usuario no es un estudiante',
  notGuardian: 'El usuario no es un apoderado',
  studentWithdrawn: 'El estudiante está retirado',
  guardianWithdrawn: 'El apoderado está retirado',
  sameUser: 'El apoderado y el estudiante deben ser personas distintas',
  noActiveYear: 'No hay un año académico activo',
  yearClosed: 'El año académico está cerrado',
  sectionOtherYear: 'La sección no pertenece al año académico activo',
  sectionInactive: 'La sección está inactiva',
  alreadyEnrolled: 'El estudiante ya tiene una matrícula vigente en el año',
  noCurrentEnrollment: 'El estudiante no tiene una matrícula vigente en el año activo',
  sameSection: 'El estudiante ya está matriculado en esa sección',
  otherGrade: 'El traslado debe ser a una sección del mismo grado',
  linkDuplicate: 'El apoderado ya tiene un vínculo vigente con ese estudiante',
  linkRevoked: 'El vínculo ya está revocado',
  ownStatus: 'No puedes cambiar tu propio estado',
  lastAdmin: 'Debe quedar al menos un administrador activo',
  inactiveActor: 'Tu cuenta no está activa',
} as const;

/**
 * Mensajes de la importación masiva (RF-21) a nivel de archivo. Fijos: nunca repiten el nombre del
 * archivo, celdas, correos ni nombres, ni el mensaje de la librería que lee el archivo.
 */
export const IMPORT_MSG = {
  fileRequired: 'Debes adjuntar el archivo en el campo file',
  emptyFile: 'El archivo está vacío',
  unsupportedFormat: 'Formato no admitido: usa un archivo .xlsx o .csv',
  formatMismatch: 'El contenido del archivo no coincide con su extensión',
  notUtf8: 'Guarda el archivo como CSV UTF-8',
  binaryCsv: 'El archivo CSV contiene datos binarios',
  unclosedQuote: 'El archivo CSV tiene una comilla sin cerrar',
  damagedXlsx: 'El archivo está dañado o no es un Excel válido',
  xlsxTooBig: 'El contenido del Excel descomprimido supera el límite permitido',
  xlsxTooManyEntries: 'El Excel tiene demasiadas partes internas',
  xlsxUnsupported: 'El Excel usa una característica no admitida (cifrado, ZIP64 o varios discos)',
  xlsxMacros: 'No se admiten archivos con macros',
  xlsxDoctype: 'El Excel contiene declaraciones XML no permitidas',
  noSheet: 'El archivo no tiene hojas',
  missingHeader: 'La primera fila debe tener los encabezados de la plantilla',
  headerMissing: 'Falta una columna obligatoria de la plantilla',
  headerUnknown: 'Hay una columna que no pertenece a la plantilla',
  headerDuplicate: 'Hay una columna repetida en los encabezados',
  headerInvalid: 'Los encabezados deben ser texto',
  noRows: 'El archivo no tiene filas de datos',
  tooManyRows: 'El archivo supera el máximo de 1000 filas de datos',
  hashMismatch: 'El archivo no coincide con el de la vista previa; vuelve a validarlo',
} as const;
