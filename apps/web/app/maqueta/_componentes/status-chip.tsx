import {
  Award,
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  MinusCircle,
  TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from 'cn';

export type EstadoEntrega = 'pendiente' | 'entregada' | 'tarde' | 'ne' | 'calificada' | 'exonerada';

const ESTADOS: Record<EstadoEntrega, { texto: string; icono: LucideIcon; clases: string }> = {
  pendiente: { texto: 'Pendiente', icono: Circle, clases: 'bg-info-soft text-info' },
  entregada: { texto: 'Entregada', icono: CircleCheck, clases: 'bg-success-soft text-success' },
  tarde: {
    texto: 'Entregada con retraso',
    icono: Clock,
    clases: 'bg-warning-soft text-warning',
  },
  ne: { texto: 'No entregada', icono: CircleX, clases: 'bg-danger-soft text-danger' },
  calificada: { texto: 'Calificada', icono: Award, clases: 'bg-brand-soft text-brand' },
  exonerada: { texto: 'Exonerada', icono: MinusCircle, clases: 'bg-surface-2 text-ink-2' },
};

/** Chip de estado de entrega (guia 2.1.4): siempre icono + texto. */
export function StatusChip({
  estado,
  nota,
  className,
}: {
  estado: EstadoEntrega;
  /** Solo para "calificada": nota sobre 20. */
  nota?: number;
  className?: string;
}) {
  const { texto, icono: Icono, clases } = ESTADOS[estado];
  return (
    <Badge
      variant="secondary"
      className={cn('h-6 px-2.5 text-xs font-semibold', clases, className)}
    >
      <Icono aria-hidden="true" data-icon="inline-start" />
      {texto}
      {estado === 'calificada' && nota !== undefined ? (
        <span className="tabular-nums"> · {nota}/20</span>
      ) : null}
    </Badge>
  );
}

export type Urgencia = 'hoy' | 'manana' | 'vencida';

const URGENCIAS: Record<Urgencia, { texto: string; clases: string }> = {
  hoy: { texto: 'Vence hoy', clases: 'bg-warning-soft text-warning' },
  manana: { texto: 'Vence mañana', clases: 'bg-warning-soft text-warning' },
  vencida: { texto: 'Vencida', clases: 'bg-danger-soft text-danger' },
};

/** Modificador de urgencia sobre una tarea pendiente. */
export function UrgencyChip({ urgencia }: { urgencia: Urgencia }) {
  const { texto, clases } = URGENCIAS[urgencia];
  return (
    <Badge variant="secondary" className={cn('h-6 px-2.5 text-xs font-semibold', clases)}>
      <TriangleAlert aria-hidden="true" data-icon="inline-start" />
      {texto}
    </Badge>
  );
}
