// Títulos y descripciones de los módulos, definidos UNA sola vez.
// Los usan las páginas (para su encabezado) y el estado de carga (components/layout/route-loading):
// así, al cambiar de módulo el título ya está en pantalla y solo el contenido espera sus datos.
// Lógica pura, sin dependencias de React.

export type RouteCrumb = { label: string; href?: string };

export type RouteMeta = {
  title: string;
  description?: string;
  /** Ruta de navegación (la última no lleva enlace). Si existe, se muestra "Volver" al nivel previo. */
  crumbs?: readonly RouteCrumb[];
  /** Clases del contenedor de la página (mismo ancho y espacios que la página real). */
  container: string;
  /** Cantidad de botones de acción del encabezado (en la carga se muestran como marcadores). */
  actions?: number;
};

const ADMIN = 'max-w-5xl gap-6 p-4 sm:p-8';

export const ROUTE_META = {
  '/admin/estructura': {
    title: 'Estructura académica',
    description:
      'Años lectivos, períodos, secciones y cursos. Solo un año puede estar activo; los demás quedan de solo lectura.',
    container: ADMIN,
    actions: 2,
  },
  '/admin/usuarios': {
    title: 'Usuarios',
    description:
      'Estudiantes, docentes, administradores y apoderados. El rol de una cuenta no se puede cambiar.',
    container: ADMIN,
    actions: 4,
  },
  '/admin/anuncios': {
    title: 'Anuncios',
    description:
      'Comunicados para toda la institución o para un grado. Se avisa a los estudiantes y a sus apoderados.',
    container: 'max-w-3xl gap-6 p-4 md:p-8',
  },
  '/admin/reportes': {
    title: 'Reportes',
    description:
      'Registro de cualquier curso, exportaciones en Excel o PDF y resumen del período por grado y sección.',
    container: ADMIN,
  },
  '/admin/configuracion': {
    title: 'Configuración institucional',
    description:
      'Nombre, logo, tabla de literales y plazo de purga. Los cambios quedan en la bitácora.',
    container: ADMIN,
  },
  '/admin/bitacora': {
    title: 'Bitácora',
    description:
      'Quién hizo qué y cuándo. No se puede editar ni borrar. «Modo soporte» marca a un administrador que actuó en contenidos, entregas o notas.',
    container: ADMIN,
  },
  '/admin/almacenamiento': {
    title: 'Almacenamiento',
    description:
      'Espacio usado por los PDF, respaldos de cada año y exportación de datos personales.',
    container: ADMIN,
  },
  '/admin/estructura/anios/nuevo': {
    title: 'Nuevo año académico',
    description: 'El año se crea en preparación. Después podrás agregar secciones y activarlo.',
    crumbs: [{ label: 'Estructura académica', href: '/admin/estructura' }, { label: 'Nuevo año' }],
    container: ADMIN,
  },
  '/admin/estructura/cursos': {
    title: 'Catálogo de cursos',
    description: 'Cursos que se pueden asignar a las secciones de cualquier año.',
    crumbs: [{ label: 'Estructura académica', href: '/admin/estructura' }, { label: 'Cursos' }],
    container: ADMIN,
  },
  '/admin/usuarios/nuevo/estudiante': {
    title: 'Nuevo estudiante',
    description: 'Crea la cuenta y la matrícula en el año activo a la vez.',
    crumbs: [{ label: 'Usuarios', href: '/admin/usuarios' }, { label: 'Nuevo estudiante' }],
    container: ADMIN,
  },
  '/admin/usuarios/nuevo/docente': {
    title: 'Nuevo docente',
    description: 'Después podrás asignarlo a los cursos de cada sección en Estructura académica.',
    crumbs: [{ label: 'Usuarios', href: '/admin/usuarios' }, { label: 'Nuevo docente' }],
    container: ADMIN,
  },
  '/admin/usuarios/nuevo/apoderado': {
    title: 'Nuevo apoderado',
    description: 'Crea la cuenta y la vincula con los estudiantes a su cargo en un solo paso.',
    crumbs: [{ label: 'Usuarios', href: '/admin/usuarios' }, { label: 'Nuevo apoderado' }],
    container: ADMIN,
  },
  '/admin/usuarios/importar': {
    title: 'Importar usuarios',
    description:
      'Crea estudiantes, docentes o apoderados desde una plantilla Excel o CSV. Primero se valida el archivo; nada se crea hasta que confirmes.',
    crumbs: [{ label: 'Usuarios', href: '/admin/usuarios' }, { label: 'Importar' }],
    container: ADMIN,
  },
  '/anuncios': {
    title: 'Anuncios',
    description: 'Comunicados de la institución, del grado y de los cursos.',
    container: 'max-w-3xl gap-4 p-4 md:p-8',
  },
  '/calendario': {
    title: 'Calendario',
    description: 'Fechas de vencimiento de las tareas de tus cursos.',
    container: 'max-w-5xl gap-4 p-4 md:p-8',
  },
  '/apoderado': {
    title: 'Panel del apoderado',
    description:
      'Consulta de solo lectura de las notas de tus estudiantes. En inicial los niños no tienen cuenta propia: aquí ves sus logros.',
    container: 'max-w-4xl gap-4 p-4 md:p-8',
  },
  '/mis-notas': {
    title: 'Mis notas',
    container: 'max-w-4xl gap-4 p-4 md:p-8',
  },
} as const satisfies Record<string, RouteMeta>;

export type KnownRoute = keyof typeof ROUTE_META;

const YEARS = '/admin/estructura/anios';
const ROOT_CRUMB: RouteCrumb = { label: 'Estructura académica', href: '/admin/estructura' };
const USERS_CRUMB: RouteCrumb = { label: 'Usuarios', href: '/admin/usuarios' };

// Pantallas con un id en la ruta: el título definitivo depende de datos (p. ej. "Año académico
// 2026"), así que en la carga se muestra el genérico, que ya orienta, y luego lo reemplaza la
// página. El enlace al año sale del id de la propia ruta.
const ROUTE_PATTERNS: readonly {
  pattern: RegExp;
  make: (m: RegExpExecArray) => RouteMeta;
}[] = [
  {
    pattern: new RegExp(`^${YEARS}/([^/]+)$`),
    make: () => ({
      title: 'Año académico',
      crumbs: [ROOT_CRUMB, { label: 'Año' }],
      container: ADMIN,
    }),
  },
  {
    pattern: new RegExp(`^${YEARS}/([^/]+)/clonar$`),
    make: (m) => ({
      title: 'Copiar estructura',
      description:
        'Crea en este año las secciones y los cursos de un año anterior. Se hace una sola vez, con el año aún sin secciones.',
      crumbs: [
        ROOT_CRUMB,
        { label: 'Año', href: `${YEARS}/${m[1]}` },
        { label: 'Copiar estructura' },
      ],
      container: ADMIN,
    }),
  },
  {
    pattern: new RegExp(`^${YEARS}/([^/]+)/promocion$`),
    make: (m) => ({
      title: 'Promoción de año',
      crumbs: [ROOT_CRUMB, { label: 'Año', href: `${YEARS}/${m[1]}` }, { label: 'Promoción' }],
      container: ADMIN,
    }),
  },
  {
    pattern: new RegExp(`^${YEARS}/([^/]+)/secciones/[^/]+$`),
    make: (m) => ({
      title: 'Sección',
      crumbs: [ROOT_CRUMB, { label: 'Año', href: `${YEARS}/${m[1]}` }, { label: 'Sección' }],
      container: ADMIN,
    }),
  },
  {
    pattern: /^\/admin\/usuarios\/([^/]+)$/,
    make: () => ({
      title: 'Usuario',
      crumbs: [USERS_CRUMB, { label: 'Usuario' }],
      container: ADMIN,
    }),
  },
];

/**
 * Metadatos de una ruta: primero la exacta (ignora la barra final) y luego las que llevan un id.
 * undefined si no es una pantalla conocida.
 */
export function routeMetaFor(pathname: string): RouteMeta | undefined {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const exact = (ROUTE_META as Record<string, RouteMeta>)[clean];
  if (exact) return exact;
  for (const { pattern, make } of ROUTE_PATTERNS) {
    const m = pattern.exec(clean);
    if (m) return make(m);
  }
  return undefined;
}
