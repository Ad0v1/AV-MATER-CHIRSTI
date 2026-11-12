// Plugin de zona horaria de FullCalendar solo para America/Lima, con @fullcalendar/core (sin
// Luxon ni moment: U10 limita el calendario a daygrid y list). Con él, timeZone="America/Lima"
// muestra las horas de Perú y el rango que se pide a la API lleva el desfase -05:00.
import { createPlugin } from '@fullcalendar/core';
import { NamedTimeZoneImpl } from '@fullcalendar/core/internal';
import { LIMA_OFFSET_MINUTES, limaArrayFromTimestamp } from '../_lib/lima-time';

class LimaTimeZone extends NamedTimeZoneImpl {
  offsetForArray(): number {
    return LIMA_OFFSET_MINUTES;
  }

  timestampToArray(ms: number): number[] {
    return limaArrayFromTimestamp(ms);
  }
}

export const limaTimeZonePlugin = createPlugin({
  name: 'aula-lima-time-zone',
  namedTimeZonedImpl: LimaTimeZone,
});
