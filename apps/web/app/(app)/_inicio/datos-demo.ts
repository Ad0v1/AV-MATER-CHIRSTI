import {
  BookOpenText,
  Calculator,
  FlaskConical,
  Globe2,
  Languages,
  Palette,
  type LucideIcon,
} from 'lucide-react';

// Datos de ejemplo del inicio. Se reemplazan por la API cuando existan cursos, tareas y notas
// reales (RF-14); cada bloque de la pantalla recibe su lista por separado para conectarlo aparte.

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

export const CURSOS_DEMO: CursoDemo[] = [
  {
    id: 'demo',
    nombre: 'Matemática',
    seccion: '3.° A',
    docente: 'Prof. Rosa Quispe',
    alumnos: 28,
    avance: 72,
    porCalificar: 9,
    icon: Calculator,
  },
  {
    id: 'demo',
    nombre: 'Comunicación',
    seccion: '3.° A',
    docente: 'Prof. Luis Medina',
    alumnos: 28,
    avance: 64,
    porCalificar: 14,
    icon: BookOpenText,
  },
  {
    id: 'demo',
    nombre: 'Ciencia y Tecnología',
    seccion: '3.° B',
    docente: 'Prof. Carmen Rojas',
    alumnos: 30,
    avance: 55,
    porCalificar: 6,
    icon: FlaskConical,
  },
  {
    id: 'demo',
    nombre: 'Personal Social',
    seccion: '3.° B',
    docente: 'Prof. Jorge Salas',
    alumnos: 30,
    avance: 80,
    porCalificar: 4,
    icon: Globe2,
  },
  {
    id: 'demo',
    nombre: 'Inglés',
    seccion: '3.° A',
    docente: 'Prof. Ana Torres',
    alumnos: 28,
    avance: 48,
    porCalificar: 4,
    icon: Languages,
  },
  {
    id: 'demo',
    nombre: 'Arte y Cultura',
    seccion: '3.° A',
    docente: 'Prof. Marco Díaz',
    alumnos: 28,
    avance: 90,
    porCalificar: 0,
    icon: Palette,
  },
];

export type EntregaDemo = { titulo: string; curso: string; dias: number };

export const ENTREGAS_DEMO: EntregaDemo[] = [
  { titulo: 'Problemas de ecuaciones lineales', curso: 'Matemática', dias: 1 },
  { titulo: 'Ensayo: la identidad peruana', curso: 'Comunicación', dias: 3 },
  { titulo: 'Informe del experimento de densidad', curso: 'Ciencia y Tecnología', dias: 5 },
  { titulo: 'Mapa conceptual del Virreinato', curso: 'Personal Social', dias: 8 },
];

export type PorCalificarDemo = {
  titulo: string;
  curso: string;
  entregadas: number;
  total: number;
};

export const POR_CALIFICAR_DEMO: PorCalificarDemo[] = [
  {
    titulo: 'Problemas de ecuaciones lineales',
    curso: 'Matemática 3.° A',
    entregadas: 24,
    total: 28,
  },
  {
    titulo: 'Ensayo: la identidad peruana',
    curso: 'Comunicación 3.° A',
    entregadas: 19,
    total: 28,
  },
  {
    titulo: 'Informe del experimento de densidad',
    curso: 'Ciencia y Tecnología 3.° B',
    entregadas: 26,
    total: 30,
  },
];

export type NotaDemo = { curso: string; tarea: string; nota: number };

export const NOTAS_DEMO: NotaDemo[] = [
  { curso: 'Matemática', tarea: 'Práctica de fracciones', nota: 18 },
  { curso: 'Inglés', tarea: 'Reading comprehension', nota: 15 },
  { curso: 'Comunicación', tarea: 'Comentario de lectura', nota: 12 },
];

export type AvisoDemo = { titulo: string; fecha: string; texto: string };

export const AVISOS_DEMO: AvisoDemo[] = [
  {
    titulo: 'Cierre del segundo bimestre',
    fecha: '14 nov',
    texto: 'Las notas del bimestre se publican el viernes. Revisa tus tareas pendientes.',
  },
  {
    titulo: 'Simulacro institucional',
    fecha: '21 nov',
    texto: 'Se realizará en el aula de cómputo según el horario de cada sección.',
  },
];
