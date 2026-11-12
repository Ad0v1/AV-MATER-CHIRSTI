'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnnouncementBanner } from '../../_componentes/announcement-banner';
import { cursoStyle, type CursoColor } from '../../_componentes/colores';
import { CourseCard, CourseChip } from '../../_componentes/course-card';
import { HomeBanner } from '../../_componentes/image-banner';
import { StatusChip, type EstadoEntrega } from '../../_componentes/status-chip';
import { StudentSwitcher, type Hijo } from '../../_componentes/student-switcher';
import { TaskRow } from '../../_componentes/task-row';

// Datos ficticios.
const HIJOS: Hijo[] = [
  { id: 'mateo', nombre: 'Mateo', grado: '1.° Primaria · B' },
  { id: 'lucia', nombre: 'Lucía', grado: '2.° Secundaria · B' },
];

type Nota = {
  curso: string;
  color: CursoColor;
  tarea: string;
  estado: EstadoEntrega;
  nota?: number;
};

const DATOS: Record<
  string,
  {
    pendientes: { titulo: string; curso: string; color: CursoColor; plazo: string }[];
    notas: Nota[];
    cursos: { nombre: string; color: CursoColor; docente: string; promedio: string }[];
  }
> = {
  mateo: {
    pendientes: [
      {
        titulo: 'Dibujo de los animales',
        curso: 'Arte · 1.° Primaria · B',
        color: 'oliva',
        plazo: 'Mañana, 11:59 p. m.',
      },
      {
        titulo: 'Sumas hasta 100',
        curso: 'Matemática · 1.° Primaria · B',
        color: 'terracota',
        plazo: 'Vie 14 nov, 11:59 p. m.',
      },
    ],
    notas: [
      {
        curso: 'Matemática',
        color: 'terracota',
        tarea: 'Restas con llevadas',
        estado: 'calificada',
        nota: 17,
      },
      { curso: 'Comunicación', color: 'azul', tarea: 'Mi familia', estado: 'calificada', nota: 15 },
      { curso: 'Arte', color: 'oliva', tarea: 'Collage de otoño', estado: 'ne' },
    ],
    cursos: [
      {
        nombre: 'Matemática',
        color: 'terracota',
        docente: 'Prof. Rosa Quispe',
        promedio: 'Promedio 16',
      },
      {
        nombre: 'Comunicación',
        color: 'azul',
        docente: 'Prof. Luis Paredes',
        promedio: 'Promedio 15',
      },
      { nombre: 'Arte', color: 'oliva', docente: 'Prof. Elena Cruz', promedio: 'Sin notas aún' },
    ],
  },
  lucia: {
    pendientes: [
      {
        titulo: 'Ensayo sobre el agua',
        curso: 'Comunicación · 2.° Secundaria · B',
        color: 'azul',
        plazo: 'Hoy, 11:59 p. m.',
      },
    ],
    notas: [
      {
        curso: 'Ciencia y Tecnología',
        color: 'bosque',
        tarea: 'Informe de laboratorio',
        estado: 'calificada',
        nota: 18,
      },
      { curso: 'Matemática', color: 'terracota', tarea: 'Ecuaciones', estado: 'exonerada' },
    ],
    cursos: [
      {
        nombre: 'Comunicación',
        color: 'azul',
        docente: 'Prof. Luis Paredes',
        promedio: 'Promedio 14',
      },
      {
        nombre: 'Ciencia y Tecnología',
        color: 'bosque',
        docente: 'Prof. Ana Torres',
        promedio: 'Promedio 18',
      },
    ],
  },
};

const AVISOS = [
  {
    origen: 'Colegio',
    fecha: 'Hoy',
    texto: 'La entrega de libretas del segundo bimestre será el viernes 21 de noviembre.',
    nuevo: true,
  },
  {
    origen: 'Prof. Rosa Quispe',
    fecha: 'Ayer',
    texto: 'Se recomienda repasar las tablas de multiplicar en casa.',
    nuevo: true,
  },
  {
    origen: 'Colegio',
    fecha: 'Vie 7 nov',
    texto: 'Campaña de salud: vacunación el martes en el patio.',
    nuevo: false,
  },
];

const h2 = 'font-heading text-lg leading-[1.625rem] font-semibold md:text-xl md:leading-7';

export default function InicioApoderado() {
  const [id, setId] = useState('mateo');
  const hijo = HIJOS.find((h) => h.id === id) ?? HIJOS[0];
  const datos = DATOS[hijo.id];

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <HomeBanner titulo={`Panel de ${hijo.nombre}`} texto="lunes 9 de noviembre" />
      <div className="flex flex-col gap-3">
        <StudentSwitcher hijos={HIJOS} seleccionado={id} onSeleccionar={setId} />
        <p className="text-base text-ink-2" role="status" aria-live="polite">
          Mostrando los datos de {hijo.nombre}, {hijo.grado}.
        </p>
      </div>

      <AnnouncementBanner
        titulo="Entrega de libretas"
        texto="Será el viernes 21 de noviembre, de 8:00 a. m. a 12:00 m."
        href="/maqueta/inicio/apoderado"
        enlace="Leer aviso"
      />

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section aria-labelledby="semana" className="flex flex-col gap-4">
            <h2 id="semana" className={h2}>
              Esta semana: tareas de {hijo.nombre}
            </h2>
            <ul className="flex flex-col gap-2">
              {datos.pendientes.map((p) => (
                <TaskRow
                  key={p.titulo}
                  href="/maqueta/inicio/apoderado"
                  titulo={p.titulo}
                  curso={p.curso}
                  color={p.color}
                  plazo={p.plazo}
                  estado="pendiente"
                />
              ))}
            </ul>
          </section>

          <section aria-labelledby="notas" className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="notas" className={h2}>
                Notas recientes de {hijo.nombre}
              </h2>
              <Link
                href="/maqueta"
                className="inline-flex min-h-11 items-center text-base font-semibold text-brand underline underline-offset-4"
              >
                Ver todas las notas
              </Link>
            </div>
            <ul className="flex flex-col gap-2">
              {datos.notas.map((n) => (
                <li
                  key={n.tarea}
                  style={cursoStyle(n.color)}
                  className="flex min-h-16 items-center gap-3 rounded-xl bg-surface py-3 pr-3 ring-1 ring-line"
                >
                  <span
                    aria-hidden="true"
                    className="w-1 self-stretch rounded-full bg-(--course)"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="font-heading text-[1.0625rem] leading-6 font-medium">{n.tarea}</p>
                    <p className="text-sm text-ink-2">{n.curso}</p>
                  </div>
                  <StatusChip estado={n.estado} nota={n.nota} />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section aria-labelledby="avisos-apoderado" className="flex flex-col gap-4">
          <h2 id="avisos-apoderado" className={h2}>
            Avisos
          </h2>
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
                  <span className="text-sm font-semibold text-ink">{a.origen}</span>
                  <span className="text-sm text-ink-2">{a.fecha}</span>
                </div>
                <p className="line-clamp-3 text-base text-ink">{a.texto}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="cursos-hijo" className="flex flex-col gap-4">
        <h2 id="cursos-hijo" className={h2}>
          Cursos de {hijo.nombre}
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 md:gap-6">
          {datos.cursos.map((c) => (
            <li key={c.nombre}>
              {/* Tarjeta informativa: sin enlace, el apoderado no tiene pestañas de curso. */}
              <CourseCard
                nombre={c.nombre}
                seccion={hijo.grado}
                color={c.color}
                linea={c.docente}
                pie={<CourseChip>{c.promedio}</CourseChip>}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
