// BORRADOR de la política de privacidad y los términos de uso (RF-07). Debe ser revisado y aprobado
// por el área legal del colegio antes de publicarse. Los datos entre [corchetes] los completa la
// institución. Al cambiar el texto de fondo, sube VERSION para que se vuelva a pedir la aceptación.

export const LEGAL_VERSION = '1.0';
export const LEGAL_UPDATED = '10 de noviembre de 2026';

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
  after?: string[];
};

export type LegalPart = {
  id: string;
  title: string;
  intro: string;
  sections: LegalSection[];
};

export const LEGAL_PARTS: LegalPart[] = [
  {
    id: 'privacidad',
    title: 'Parte I. Política de privacidad',
    intro:
      'Esta política explica cómo el Colegio Mater Christi trata los datos personales de estudiantes, apoderados, docentes y personal administrativo que usan el Aula Virtual, en cumplimiento de la Ley N.° 29733, Ley de Protección de Datos Personales, y de su Reglamento aprobado por el Decreto Supremo N.° 016-2024-JUS.',
    sections: [
      {
        id: 'p-responsable',
        title: '1. Responsable del tratamiento',
        paragraphs: [
          'El titular del banco de datos y responsable del tratamiento es el Colegio Mater Christi (la «Institución»), con RUC [N.° de RUC] y domicilio en [dirección de la institución].',
          'El banco de datos «Usuarios del Aula Virtual» se encuentra inscrito ante la Autoridad Nacional de Protección de Datos Personales con el código [N.° de registro]. Puedes escribirnos a [correo de protección de datos] para cualquier consulta sobre esta política.',
        ],
      },
      {
        id: 'p-datos',
        title: '2. Datos personales que tratamos',
        paragraphs: ['Según tu rol en el Aula Virtual, tratamos los siguientes datos:'],
        items: [
          'Identificación: nombres y apellidos, DNI, código de usuario, rol, grado y sección.',
          'Contacto: correo electrónico, teléfono y dirección.',
          'Académicos: cursos, tareas entregadas, calificaciones, registro auxiliar y reportes de avance.',
          'Vínculo familiar: relación entre apoderados y estudiantes.',
          'Seguridad y uso: dirección IP, fecha y hora de acceso, navegador, intentos de ingreso y acciones relevantes registradas en la bitácora.',
        ],
        after: [
          'No solicitamos datos sensibles (salud, religión, origen racial u otros) a través del Aula Virtual. Si fuera necesario tratarlos, se hará solo con tu consentimiento expreso y por escrito.',
        ],
      },
      {
        id: 'p-finalidades',
        title: '3. Para qué usamos tus datos',
        items: [
          'Crear y administrar tu cuenta y permitirte acceder a tus cursos, clases, lecturas y tareas.',
          'Registrar, calificar y comunicar el avance académico.',
          'Comunicarnos contigo sobre el servicio, avisos académicos y recuperación de acceso.',
          'Proteger las cuentas y la plataforma: verificación en dos pasos, control de accesos y auditoría.',
          'Cumplir obligaciones legales y reportes exigidos por el Ministerio de Educación y las instancias educativas correspondientes.',
          'Elaborar estadísticas internas de uso y rendimiento, sin identificarte.',
        ],
        after: ['No vendemos tus datos ni los usamos para publicidad o perfiles comerciales.'],
      },
      {
        id: 'p-consentimiento',
        title: '4. Base legal y consentimiento',
        paragraphs: [
          'Tratamos tus datos con tu consentimiento libre, previo, expreso, informado e inequívoco, que otorgas al aceptar este documento, y cuando es necesario para prestar el servicio educativo contratado con la Institución. Puedes revocar tu consentimiento en cualquier momento, sin efecto retroactivo, aunque ello puede impedir el uso del Aula Virtual.',
        ],
      },
      {
        id: 'p-menores',
        title: '5. Datos de niñas, niños y adolescentes',
        paragraphs: [
          'Aplicamos el principio del interés superior del niño y del adolescente reconocido en el Código de los Niños y Adolescentes (Ley N.° 27337).',
          'Para estudiantes menores de 14 años, el consentimiento lo otorga su padre, madre o apoderado legal. Los estudiantes de 14 años o más reciben la información en un lenguaje claro y comprensible. Los datos de menores se usan solo con fines educativos y de seguridad, y nunca para publicidad.',
        ],
      },
      {
        id: 'p-destinatarios',
        title: '6. Quién puede ver tus datos',
        items: [
          'Docentes: solo los datos de los estudiantes de sus cursos.',
          'Apoderados: solo los datos de los estudiantes vinculados a ellos.',
          'Personal administrativo autorizado: según las funciones de su cargo.',
          'Proveedores tecnológicos (alojamiento, correo electrónico) que actúan por encargo de la Institución, bajo contrato y con deber de confidencialidad.',
          'Autoridades públicas, cuando una norma o un mandato lo exija.',
        ],
        after: [
          'Si algún proveedor almacenara datos fuera del Perú, lo haremos solo en países con un nivel adecuado de protección o con las garantías que exige la normativa sobre flujo transfronterizo.',
        ],
      },
      {
        id: 'p-conservacion',
        title: '7. Cuánto tiempo conservamos los datos',
        paragraphs: [
          'Conservamos tus datos mientras mantengas vínculo con la Institución y, luego, durante los plazos que exige la normativa educativa para los registros académicos. Cumplido el plazo, los datos se bloquean y se eliminan de forma segura.',
        ],
      },
      {
        id: 'p-seguridad',
        title: '8. Cómo protegemos tu información',
        paragraphs: [
          'Aplicamos medidas técnicas, organizativas y legales para evitar la pérdida, el acceso no autorizado o la alteración de los datos:',
        ],
        items: [
          'Las contraseñas se almacenan cifradas y nunca en texto legible.',
          'Verificación en dos pasos obligatoria para administradores.',
          'Permisos por rol: cada persona accede solo a lo que necesita.',
          'Comunicación cifrada y sesiones que se cierran al cambiar la contraseña.',
          'Bitácora de acciones importantes para detectar usos indebidos.',
        ],
        after: [
          'Si ocurriera un incidente que afecte tus datos, lo gestionaremos y lo comunicaremos conforme a la normativa vigente.',
        ],
      },
      {
        id: 'p-derechos',
        title: '9. Tus derechos',
        paragraphs: [
          'Como titular de tus datos puedes ejercer los derechos de información, acceso, rectificación, cancelación, oposición, revocación del consentimiento y tratamiento objetivo, reconocidos en la Ley N.° 29733.',
          'Para ejercerlos, envía una solicitud a [correo de protección de datos] indicando tu nombre, tu código de usuario, el derecho que ejerces y adjuntando copia de tu DNI. Si eres apoderado, acredita tu representación. Responderemos dentro de los plazos legales.',
          'Si consideras que no atendimos tu solicitud, puedes presentar un reclamo ante la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.',
        ],
      },
      {
        id: 'p-cookies',
        title: '10. Cookies y almacenamiento',
        paragraphs: [
          'El Aula Virtual usa únicamente una cookie de sesión estrictamente necesaria para mantenerte conectado. No usamos cookies de publicidad ni de seguimiento de terceros.',
        ],
      },
      {
        id: 'p-cambios',
        title: '11. Cambios en esta política',
        paragraphs: [
          'Podemos actualizar esta política por cambios normativos o del servicio. Si el cambio es relevante, te pediremos aceptar la nueva versión antes de continuar.',
        ],
      },
    ],
  },
  {
    id: 'terminos',
    title: 'Parte II. Términos de uso',
    intro:
      'Estos términos regulan el uso del Aula Virtual del Colegio Mater Christi. Complementan el reglamento interno y el contrato de servicios educativos, y se rigen por las leyes de la República del Perú.',
    sections: [
      {
        id: 't-aceptacion',
        title: '1. Aceptación y alcance',
        paragraphs: [
          'Al marcar las casillas de aceptación y continuar, declaras que leíste y aceptas esta política y estos términos. Si eres apoderado, también aceptas en nombre de los estudiantes vinculados a ti. Sin esta aceptación no es posible usar el Aula Virtual.',
        ],
      },
      {
        id: 't-cuenta',
        title: '2. Tu cuenta y tus credenciales',
        items: [
          'La cuenta es personal e intransferible. No compartas tu código ni tu contraseña.',
          'Debes cambiar la contraseña inicial en tu primer ingreso y elegir una contraseña segura.',
          'Eres responsable de lo que ocurra con tu cuenta. Si sospechas un uso no autorizado, avisa de inmediato a la Institución.',
          'Los administradores deben mantener activa la verificación en dos pasos.',
        ],
      },
      {
        id: 't-uso',
        title: '3. Uso adecuado',
        paragraphs: ['El Aula Virtual se usa solo con fines educativos. Está prohibido:'],
        items: [
          'Suplantar a otra persona o acceder a cuentas o datos que no te corresponden.',
          'Intentar vulnerar la seguridad, interrumpir el servicio o introducir programas dañinos, conductas sancionadas por la Ley N.° 30096, Ley de Delitos Informáticos.',
          'Acosar, discriminar, amenazar o humillar a otros miembros de la comunidad educativa, conforme a la Ley N.° 29719, que promueve la convivencia sin violencia en las instituciones educativas.',
          'Publicar contenido ilícito, ofensivo o que vulnere derechos de terceros.',
          'Copiar o difundir materiales del colegio o de los docentes sin autorización.',
        ],
      },
      {
        id: 't-propiedad',
        title: '4. Contenidos y propiedad intelectual',
        paragraphs: [
          'Los materiales, lecturas y recursos del Aula Virtual están protegidos por el Decreto Legislativo N.° 822, Ley sobre el Derecho de Autor. Puedes usarlos solo para tu formación. Los trabajos que entregas siguen siendo tuyos; autorizas a la Institución a usarlos únicamente para su evaluación y gestión académica.',
        ],
      },
      {
        id: 't-apoderados',
        title: '5. Apoderados',
        paragraphs: [
          'El apoderado accede a la información académica de los estudiantes vinculados a él y es responsable de acompañar el uso responsable del Aula Virtual por parte de ellos y de mantener actualizados sus datos de contacto.',
        ],
      },
      {
        id: 't-disponibilidad',
        title: '6. Disponibilidad del servicio',
        paragraphs: [
          'Procuramos que el Aula Virtual esté disponible de forma continua, pero puede haber interrupciones por mantenimiento, fallas técnicas o causas ajenas a la Institución. Informaremos con claridad los cambios relevantes del servicio, en línea con la Ley N.° 29571, Código de Protección y Defensa del Consumidor.',
        ],
      },
      {
        id: 't-suspension',
        title: '7. Suspensión de la cuenta',
        paragraphs: [
          'La Institución puede suspender o restringir una cuenta ante incumplimientos de estos términos o del reglamento interno, o por motivos de seguridad. Antes de aplicar una medida definitiva, se garantizará a la persona afectada la posibilidad de ser escuchada.',
        ],
      },
      {
        id: 't-responsabilidad',
        title: '8. Responsabilidad',
        paragraphs: [
          'La Institución no responde por fallas de conexión a internet, de dispositivos del usuario ni por el uso indebido de credenciales compartidas por el propio usuario, salvo los casos en que la ley disponga lo contrario.',
        ],
      },
      {
        id: 't-modificaciones',
        title: '9. Modificaciones',
        paragraphs: [
          'Podemos modificar estos términos. Los cambios relevantes se comunicarán a través del Aula Virtual y, cuando corresponda, se pedirá una nueva aceptación.',
        ],
      },
      {
        id: 't-ley',
        title: '10. Ley aplicable y contacto',
        paragraphs: [
          'Estos términos se rigen por las leyes del Perú. Cualquier controversia se someterá a los jueces y tribunales de [distrito judicial], sin perjuicio de los derechos que la ley reconoce a los consumidores. Para consultas, escribe a [correo de contacto institucional].',
        ],
      },
    ],
  },
];
