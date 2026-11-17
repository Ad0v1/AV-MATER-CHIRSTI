import type { LucideIcon } from 'lucide-react';

// Listas del inicio, vacías hasta conectar la API de cursos, tareas, notas y avisos (RF-14).
// Cada bloque de la pantalla recibe su lista por separado para conectarlo aparte.

export type CursoDemo = {
  id: string;
  nombre: string;
  seccion: string;
  docente: string;
  alumnos: number;
  avance: number;
  porCalificar: number;
  icon: LucideIcon;
};

export const CURSOS_DEMO: CursoDemo[] = [];

export type EntregaDemo = { titulo: string; curso: string; dias: number };

export const ENTREGAS_DEMO: EntregaDemo[] = [];

export type PorCalificarDemo = {
  titulo: string;
  curso: string;
  entregadas: number;
  total: number;
};

export const POR_CALIFICAR_DEMO: PorCalificarDemo[] = [];

export type NotaDemo = { curso: string; tarea: string; nota: number };

export const NOTAS_DEMO: NotaDemo[] = [];

export type AvisoDemo = { titulo: string; fecha: string; texto: string };

export const AVISOS_DEMO: AvisoDemo[] = [];
