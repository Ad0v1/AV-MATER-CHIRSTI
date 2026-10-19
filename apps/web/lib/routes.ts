// Mapa central de rutas de la web (Sprint 0). Cada dev implementa solo sus carpetas.
export const ROUTES = {
  login: '/login',
  adminEstructura: '/admin/estructura',
  adminUsuarios: '/admin/usuarios',
  adminReportes: '/admin/reportes',
  adminConfiguracion: '/admin/configuracion',
  adminBitacora: '/admin/bitacora',
  adminAlmacenamiento: '/admin/almacenamiento',
  misNotas: '/mis-notas',
  apoderado: '/apoderado',
} as const;

export const COURSE_ROUTES = {
  clases: (id: string) => `/curso/${id}/clases`,
  lecturas: (id: string) => `/curso/${id}/lecturas`,
  tareas: (id: string) => `/curso/${id}/tareas`,
  registro: (id: string) => `/curso/${id}/registro`,
} as const;
