import { describe, expect, it } from 'vitest';
import {
  calendarQuery,
  formatDue,
  isUuid,
  summaryText,
  toEvents,
  validRange,
  type CalendarItem,
} from './calendar';

const item = (over: Partial<CalendarItem> = {}): CalendarItem => ({
  assignmentId: 'a1',
  title: 'Informe de laboratorio',
  dueAt: '2026-03-11T04:59:00.000Z',
  allowLate: false,
  courseSectionId: 'cs1',
  course: { id: 'c1', name: 'Ciencia y Tecnología' },
  section: { id: 's1', gradeLevel: 3, code: 'A' },
  ...over,
});

describe('validRange (RF-54)', () => {
  it('acepta el rango de FullCalendar (42 días) y hasta 62', () => {
    expect(validRange('2026-02-23T00:00:00-05:00', '2026-04-06T00:00:00-05:00')).toBe(true);
    expect(validRange('2026-01-01T00:00:00Z', '2026-03-04T00:00:00Z')).toBe(true);
  });

  it('rechaza más de 62 días, al revés, sin zona o con otra cosa', () => {
    expect(validRange('2026-01-01T00:00:00Z', '2026-03-04T00:00:01Z')).toBe(false);
    expect(validRange('2026-03-02T00:00:00Z', '2026-03-01T00:00:00Z')).toBe(false);
    expect(validRange('2026-03-01T00:00:00', '2026-03-02T00:00:00')).toBe(false);
    expect(validRange('2026-03-01', '2026-03-02')).toBe(false);
    // Igual que la API: sin segundos se rechaza (QA 5e, vuelta 1/2).
    expect(validRange('2026-03-01T00:00-05:00', '2026-03-02T00:00-05:00')).toBe(false);
    expect(validRange('2026-03-01T00:00Z', '2026-03-02T00:00:00Z')).toBe(false);
    expect(validRange(1, '2026-03-02T00:00:00Z')).toBe(false);
    expect(validRange('2026-03-01T00:00:00Z&x=1', '2026-03-02T00:00:00Z')).toBe(false);
  });

  it('isUuid y calendarQuery codifican la consulta', () => {
    expect(isUuid('0192f0c4-0000-7000-8000-000000000001')).toBe(true);
    expect(isUuid('x')).toBe(false);
    expect(calendarQuery('2026-03-01T00:00:00+01:00', '2026-03-02T00:00:00Z', 'abc')).toBe(
      'from=2026-03-01T00%3A00%3A00%2B01%3A00&to=2026-03-02T00%3A00%3A00Z&studentId=abc',
    );
  });
});

describe('toEvents', () => {
  it('título corto y enlace a las tareas del curso', () => {
    const [e] = toEvents([item()], { taskHref: (id) => `/curso/${id}/tareas` });
    expect(e).toMatchObject({
      id: 'a1',
      title: 'Ciencia y Tecnología: Informe de laboratorio',
      start: '2026-03-11T04:59:00.000Z',
      allDay: false,
      url: '/curso/cs1/tareas',
    });
    expect(e.extendedProps.label).toContain('3.° A');
    expect(e.extendedProps.label).toContain('Vence');
  });

  it('apoderado: sin enlace y con el nombre de pila si tiene varios estudiantes', () => {
    const items = [
      item({ students: [{ id: 's', fullName: 'Ana María Quispe' }], allowLate: true }),
    ];
    const [e] = toEvents(items, { showStudents: true });
    expect(e.url).toBeUndefined();
    expect(e.title).toBe('Ciencia y Tecnología: Informe de laboratorio (Ana)');
    expect(e.title).not.toContain('Quispe');
    expect(e.extendedProps.label).toContain('acepta entregas tardías');
    expect(toEvents(items)[0].title).not.toContain('Ana');
  });

  it('formatDue usa la hora de Lima', () => {
    expect(formatDue('2026-03-11T04:59:00.000Z')).toMatch(/10 de marzo/);
  });

  it('summaryText', () => {
    expect(summaryText(0, false)).toBe('No hay plazos en este período.');
    expect(summaryText(1, false)).toBe('1 plazo en este período.');
    expect(summaryText(500, true)).toContain('Hay más');
  });
});

// --- QA de 5e: casos límite del calendario (RF-54) -------------------------------------------

describe('validRange: límites (QA 5e)', () => {
  it('62 días justos valen y 62 días + 1 ms no; igual a from no', () => {
    expect(validRange('2026-01-01T00:00:00.000Z', '2026-03-04T00:00:00.000Z')).toBe(true);
    expect(validRange('2026-01-01T00:00:00.000Z', '2026-03-04T00:00:00.001Z')).toBe(false);
    expect(validRange('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(false);
    expect(validRange('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.001Z')).toBe(true);
  });

  it('63 días no valen (la regla del API)', () => {
    expect(validRange('2026-01-01T00:00:00Z', '2026-03-05T00:00:00Z')).toBe(false);
  });

  it('el desfase de zona cuenta: el mismo instante en otra zona vale igual', () => {
    expect(validRange('2026-03-01T00:00:00-05:00', '2026-03-01T05:00:01Z')).toBe(true);
    expect(validRange('2026-03-01T00:00:00-05:00', '2026-03-01T04:59:59Z')).toBe(false);
  });

  it('rechaza fechas imposibles, valores no texto y espacios', () => {
    expect(validRange('2026-13-01T00:00:00Z', '2026-13-02T00:00:00Z')).toBe(false);
    expect(validRange('2026-02-30T00:00:00Z', '2026-03-02T00:00:00Z')).toBe(false);
    expect(validRange(undefined, undefined)).toBe(false);
    expect(validRange(null, '2026-03-02T00:00:00Z')).toBe(false);
    expect(validRange({}, [])).toBe(false);
    expect(validRange(' 2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z')).toBe(false);
    expect(validRange('2026-03-01T00:00:00Z\n', '2026-03-02T00:00:00Z')).toBe(false);
  });

  it('acepta milisegundos de 1 a 3 dígitos pero no de 4', () => {
    expect(validRange('2026-03-01T00:00:00.5Z', '2026-03-02T00:00:00.123Z')).toBe(true);
    expect(validRange('2026-03-01T00:00:00.1234Z', '2026-03-02T00:00:00Z')).toBe(false);
  });
});

describe('isUuid y calendarQuery: límites (QA 5e)', () => {
  it('isUuid: mayúsculas valen; valores no texto, vacíos o con sobrante no', () => {
    expect(isUuid('0192F0C4-0000-7000-8000-000000000001')).toBe(true);
    expect(isUuid('')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid('0192f0c4-0000-7000-8000-000000000001 ')).toBe(false);
    expect(isUuid('0192f0c4-0000-7000-8000-000000000001\n')).toBe(false);
    expect(isUuid('0192f0c4000070008000000000000001')).toBe(false);
  });

  it('calendarQuery omite studentId vacío o ausente y codifica caracteres especiales', () => {
    expect(calendarQuery('a', 'b')).toBe('from=a&to=b');
    expect(calendarQuery('a', 'b', '')).toBe('from=a&to=b');
    expect(calendarQuery('a&x=1', 'b#', 'c d')).toBe('from=a%26x%3D1&to=b%23&studentId=c+d');
  });
});

describe('toEvents y textos: límites (QA 5e)', () => {
  it('lista vacía → sin eventos; conserva el orden recibido', () => {
    expect(toEvents([])).toEqual([]);
    const evs = toEvents([item({ assignmentId: 'b' }), item({ assignmentId: 'a' })]);
    expect(evs.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('apoderado: varios estudiantes separados por coma, nombre de pila solamente', () => {
    const [e] = toEvents(
      [
        item({
          students: [
            { id: '1', fullName: 'Ana Quispe Rojas' },
            { id: '2', fullName: '  Luis   Mamani ' },
          ],
        }),
      ],
      { showStudents: true },
    );
    expect(e.title).toBe('Ciencia y Tecnología: Informe de laboratorio (Ana, Luis)');
  });

  it('apoderado: sin estudiantes o con lista vacía no agrega paréntesis', () => {
    expect(toEvents([item()], { showStudents: true })[0].title).toBe(
      'Ciencia y Tecnología: Informe de laboratorio',
    );
    expect(toEvents([item({ students: [] })], { showStudents: true })[0].title).not.toContain('(');
  });

  it('no filtra instrucciones ni notas aunque lleguen en el objeto', () => {
    const leaky = { ...item(), instructions: 'SECRETO', grade: '19' } as CalendarItem;
    const out = JSON.stringify(toEvents([leaky]));
    expect(out).not.toContain('SECRETO');
    expect(out).not.toContain('grade');
  });

  it('el título con HTML se deja como texto (el escape lo hace React/FullCalendar)', () => {
    const [e] = toEvents([item({ title: '<img src=x onerror=alert(1)>' })]);
    expect(e.title).toContain('<img');
    expect(e).not.toHaveProperty('html');
  });

  it('el enlace usa el curso-sección de cada tarea', () => {
    const evs = toEvents([item({ courseSectionId: 'x1' }), item({ courseSectionId: 'x2' })], {
      taskHref: (id) => `/t/${id}`,
    });
    expect(evs.map((e) => e.url)).toEqual(['/t/x1', '/t/x2']);
  });

  it('formatDue: 23:59 y 00:00 de Lima caen en días distintos (UTC-5 fijo)', () => {
    expect(formatDue('2026-03-11T04:59:00.000Z')).toMatch(/10 de marzo/);
    expect(formatDue('2026-03-11T05:00:00.000Z')).toMatch(/11 de marzo/);
  });

  it('summaryText: con tope y 0 plazos, o 1 plazo truncado', () => {
    expect(summaryText(0, true)).toBe('No hay plazos en este período.');
    expect(summaryText(1, true)).toBe(
      '1 plazo en este período. Hay más: acorta el rango para verlos todos.',
    );
    expect(summaryText(2, false)).toBe('2 plazos en este período.');
  });
});
