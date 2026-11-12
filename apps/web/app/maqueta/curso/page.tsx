'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import {
  BookText,
  ChevronDown,
  Download,
  FileText,
  Info,
  Megaphone,
  Presentation,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';
import { cursoStyle } from '../_componentes/colores';
import { CourseHeader } from '../_componentes/course-header';
import { EmptyState } from '../_componentes/empty-state';
import { TaskRow } from '../_componentes/task-row';

// Datos ficticios. Curso: Matemática, 3.° Primaria · A (color terracota; imagen del area).
const PESTANAS = [
  { id: 'clases', etiqueta: 'Clases' },
  { id: 'lecturas', etiqueta: 'Lecturas' },
  { id: 'tareas', etiqueta: 'Tareas' },
  { id: 'avisos', etiqueta: 'Avisos' },
] as const;
type PestanaId = (typeof PESTANAS)[number]['id'];

const BIMESTRES = [
  {
    nombre: 'Bimestre IV',
    vigente: true,
    clases: [
      {
        titulo: 'Fracciones equivalentes',
        texto:
          'Cómo reconocer y construir fracciones que valen lo mismo, con ejemplos en la recta numérica.',
        fecha: 'Publicada el lun 3 nov',
      },
      {
        titulo: 'Suma y resta de fracciones',
        texto: 'Pasos para sumar fracciones con igual y distinto denominador.',
        fecha: 'Publicada el lun 27 oct',
      },
    ],
  },
  {
    nombre: 'Bimestre III',
    vigente: false,
    clases: [
      {
        titulo: 'Perímetro y área',
        texto: 'Fórmulas básicas y problemas de la vida diaria.',
        fecha: 'Publicada el lun 8 sep',
      },
    ],
  },
];

const LECTURAS = [
  {
    titulo: 'Las fracciones en la cocina',
    texto: 'Lectura corta con recetas para practicar medidas.',
    fecha: 'Publicada el mié 29 oct',
  },
  {
    titulo: 'Historia de los números',
    texto: 'Un recorrido por cómo se contaba en distintas culturas.',
    fecha: 'Publicada el vie 10 oct',
  },
];

const AVISOS = [
  {
    fecha: 'Hoy',
    nuevo: true,
    autor: 'Prof. Rosa Quispe',
    texto: 'La prueba escrita del jueves se mueve al viernes. Traigan su calculadora y su regla.',
  },
  {
    fecha: 'Vie 31 oct',
    nuevo: false,
    autor: 'Prof. Rosa Quispe',
    texto: 'Las prácticas calificadas ya tienen nota publicada. Revisen sus comentarios.',
  },
];

const h2 = 'font-heading text-lg leading-[1.625rem] font-semibold md:text-xl md:leading-7';

function FilaMaterial({
  titulo,
  texto,
  fecha,
  icono: Icono,
}: {
  titulo: string;
  texto: string;
  fecha: string;
  icono: typeof FileText;
}) {
  return (
    <li className="flex min-h-16 flex-col gap-3 rounded-xl bg-surface p-4 ring-1 ring-line sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--course-soft) text-(--course)"
        >
          <Icono className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-heading text-[1.0625rem] leading-6 font-medium text-ink">{titulo}</h3>
          <p className="line-clamp-2 text-base text-ink-2">{texto}</p>
          <p className="mt-1 text-sm text-ink-2">{fecha}</p>
        </div>
      </div>
      <Button variant="outline" className="h-11 gap-1.5 px-4 text-base">
        <Download aria-hidden="true" />
        Descargar PDF
        <span className="sr-only">de {titulo}</span>
      </Button>
    </li>
  );
}

function PanelClases() {
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({ 'Bimestre IV': true });
  return (
    <div className="flex flex-col gap-4">
      {BIMESTRES.map((b) => {
        const abierto = !!abiertos[b.nombre];
        const idPanel = `panel-${b.nombre.replaceAll(' ', '-')}`;
        return (
          <section key={b.nombre} className="flex flex-col gap-2">
            <h2 className={h2}>
              <button
                type="button"
                aria-expanded={abierto}
                aria-controls={idPanel}
                onClick={() => setAbiertos((a) => ({ ...a, [b.nombre]: !a[b.nombre] }))}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-1 text-left"
              >
                <span>
                  {b.nombre}
                  {b.vigente ? (
                    <span className="ml-2 text-sm font-medium text-ink-2">(vigente)</span>
                  ) : null}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn('size-5 transition-transform', abierto && 'rotate-180')}
                />
              </button>
            </h2>
            <ul id={idPanel} hidden={!abierto} className="flex flex-col gap-2">
              {b.clases.map((c) => (
                <FilaMaterial key={c.titulo} {...c} icono={Presentation} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function PanelLecturas() {
  return (
    <div className="flex flex-col gap-4">
      <Alert
        role="status"
        className="rounded-xl border-0 bg-info-soft px-4 py-3 text-info has-[>svg]:gap-x-3"
      >
        <Info aria-hidden="true" className="size-5!" />
        <AlertDescription className="text-base text-ink md:col-start-2">
          Estas lecturas son material de apoyo. Texto legal sobre derechos de autor pendiente de
          validación.
        </AlertDescription>
      </Alert>
      <ul className="flex flex-col gap-2">
        {LECTURAS.map((l) => (
          <FilaMaterial key={l.titulo} {...l} icono={BookText} />
        ))}
      </ul>
    </div>
  );
}

function PanelTareas() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="t-pendientes" className="flex flex-col gap-2">
        <h2 id="t-pendientes" className={h2}>
          Pendientes
        </h2>
        <ul className="flex flex-col gap-2">
          <TaskRow
            href="/maqueta/curso"
            titulo="Problemas de geometría"
            color="terracota"
            plazo="Hoy, 11:59 p. m."
            urgencia="hoy"
            estado="pendiente"
          />
          <TaskRow
            href="/maqueta/curso"
            titulo="Práctica de fracciones"
            color="terracota"
            plazo="Vie 14 nov, 11:59 p. m."
            estado="pendiente"
          />
        </ul>
      </section>
      <section aria-labelledby="t-entregadas" className="flex flex-col gap-2">
        <h2 id="t-entregadas" className={h2}>
          Entregadas
        </h2>
        <ul className="flex flex-col gap-2">
          <TaskRow
            href="/maqueta/curso"
            titulo="Ejercicios de simetría"
            color="terracota"
            plazo="Venció el lun 3 nov"
            estado="tarde"
          />
          <TaskRow
            href="/maqueta/curso"
            titulo="Tabla de proporciones"
            color="terracota"
            plazo="Venció el vie 31 oct"
            estado="entregada"
          />
        </ul>
      </section>
      <section aria-labelledby="t-calificadas" className="flex flex-col gap-2">
        <h2 id="t-calificadas" className={h2}>
          Calificadas
        </h2>
        <ul className="flex flex-col gap-2">
          <TaskRow
            href="/maqueta/curso"
            titulo="Prueba de números enteros"
            color="terracota"
            plazo="Venció el vie 24 oct"
            estado="calificada"
            nota={16}
          />
        </ul>
      </section>
    </div>
  );
}

function PanelAvisos() {
  if (AVISOS.length === 0) {
    return (
      <EmptyState
        icono={Megaphone}
        titulo="Aún no hay avisos"
        texto="Cuando tu docente publique un aviso, lo verás aquí."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {AVISOS.map((a) => (
        <li key={a.texto} className="rounded-xl bg-surface p-4 ring-1 ring-line">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {a.nuevo ? (
              <>
                <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
                <span className="sr-only">Nuevo: </span>
              </>
            ) : null}
            <span className="text-sm font-semibold text-ink">{a.autor}</span>
            <span className="text-sm text-ink-2">{a.fecha}</span>
          </div>
          <p className="line-clamp-3 text-base text-ink">{a.texto}</p>
        </li>
      ))}
    </ul>
  );
}

export default function CursoPagina() {
  const [activa, setActiva] = useState<PestanaId>('clases');
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Teclado de pestañas: flechas, Inicio y Fin (patron WAI-ARIA).
  function alTeclear(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let destino = -1;
    if (e.key === 'ArrowRight') destino = (indice + 1) % PESTANAS.length;
    if (e.key === 'ArrowLeft') destino = (indice - 1 + PESTANAS.length) % PESTANAS.length;
    if (e.key === 'Home') destino = 0;
    if (e.key === 'End') destino = PESTANAS.length - 1;
    if (destino < 0) return;
    e.preventDefault();
    const id = PESTANAS[destino].id;
    setActiva(id);
    refs.current[id]?.focus();
  }

  return (
    <div style={cursoStyle('terracota')} className="flex flex-col gap-4 md:gap-6">
      <CourseHeader
        nombre="Matemática"
        meta="3.° Primaria · A · Prof. Rosa Quispe · 2026"
        color="terracota"
        className="-mx-4 -mt-4 rounded-b-2xl md:mx-0 md:mt-0 md:rounded-2xl"
      />

      <div className="sticky top-14 z-10 -mx-4 bg-canvas px-4 md:top-12 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <div
          role="tablist"
          aria-label="Secciones del curso"
          className="flex overflow-x-auto border-b border-line"
        >
          {PESTANAS.map((p, i) => {
            const esActiva = p.id === activa;
            return (
              <button
                key={p.id}
                ref={(el) => {
                  refs.current[p.id] = el;
                }}
                id={`tab-${p.id}`}
                type="button"
                role="tab"
                aria-selected={esActiva}
                aria-controls={`panel-${p.id}`}
                tabIndex={esActiva ? 0 : -1}
                onClick={() => setActiva(p.id)}
                onKeyDown={(e) => alTeclear(e, i)}
                className={cn(
                  '-mb-px min-h-11 shrink-0 border-b-[3px] px-4 text-base transition-colors',
                  esActiva
                    ? 'border-(--course) font-semibold text-ink'
                    : 'border-transparent font-medium text-ink-2 hover:text-ink',
                )}
              >
                {p.etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      {PESTANAS.map((p) => (
        <div
          key={p.id}
          id={`panel-${p.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${p.id}`}
          hidden={p.id !== activa}
          tabIndex={0}
          className="aparecer mx-auto w-full max-w-3xl rounded-lg"
        >
          {p.id === 'clases' ? <PanelClases /> : null}
          {p.id === 'lecturas' ? <PanelLecturas /> : null}
          {p.id === 'tareas' ? <PanelTareas /> : null}
          {p.id === 'avisos' ? <PanelAvisos /> : null}
        </div>
      ))}
    </div>
  );
}
