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
  // RF-54 (Dev 5): estudiante, docente y apoderado. Autorizado por el usuario (30/10/2026).
  calendario: '/calendario',
  // RF-32 (Dev 5): bandeja de anuncios y anuncios institucionales. Autorizado (06/11/2026).
  anuncios: '/anuncios',
  adminAnuncios: '/admin/anuncios',
  apoderado: '/apoderado',
  miPerfil: '/mi-perfil',
} as const;

export const COURSE_ROUTES = {
  clases: (id: string) => `/curso/${id}/clases`,
  lecturas: (id: string) => `/curso/${id}/lecturas`,
  tareas: (id: string) => `/curso/${id}/tareas`,
  registro: (id: string) => `/curso/${id}/registro`,
  // RF-32 (Dev 5): anuncios del curso (docente asignado o ADMIN).
  anuncios: (id: string) => `/curso/${id}/anuncios`,
} as const;
