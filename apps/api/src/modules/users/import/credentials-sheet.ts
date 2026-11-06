import ExcelJS from 'exceljs';
import { XLSX_CONTENT_TYPE, type CredentialsSheet } from './import.constants.js';

// Hoja de credenciales de una importacion (RF-76). Se arma en memoria con lo recien creado y viaja
// solo en la respuesta del commit: no se guarda en disco, en Redis ni en el almacenamiento.

export type IssuedRow = {
  role: 'STUDENT' | 'TEACHER' | 'GUARDIAN';
  fullName: string;
  /** Grado y seccion (solo estudiantes), por ejemplo `3.º A`. */
  section: string | null;
  code: string;
  password: string;
};

const ROLE_LABEL = { STUDENT: 'Estudiante', TEACHER: 'Docente', GUARDIAN: 'Apoderado' } as const;
const ROLE_ORDER = { STUDENT: 0, GUARDIAN: 1, TEACHER: 2 } as const;

const NOTICE = [
  'Hoja de credenciales: confidencial.',
  'Entrega a cada persona su código de usuario y su contraseña inicial, en mano.',
  'No se guarda en el sistema: si se pierde, restablece la contraseña de cada usuario desde su ficha.',
  'Cada persona debe cambiar su contraseña en su primer ingreso.',
  'Después de entregarla, borra o destruye este archivo.',
];

export async function buildCredentialsSheet(
  rows: IssuedRow[],
  type: string,
  now: Date,
): Promise<CredentialsSheet> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Credenciales');
  sheet.columns = [
    { header: 'Perfil', key: 'role', width: 14 },
    { header: 'Nombre', key: 'name', width: 44 },
    { header: 'Grado y sección', key: 'section', width: 18 },
    { header: 'Código de usuario', key: 'code', width: 20 },
    { header: 'Contraseña inicial', key: 'password', width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  // Sin celdas numericas: el codigo es un identificador, no un numero.
  sheet.getColumn('code').numFmt = '@';

  const sorted = [...rows].sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      (a.section ?? '').localeCompare(b.section ?? '', 'es') ||
      a.fullName.localeCompare(b.fullName, 'es'),
  );
  for (const r of sorted) {
    sheet.addRow({
      role: ROLE_LABEL[r.role],
      name: r.fullName,
      section: r.section ?? '',
      code: r.code,
      password: r.password,
    });
  }

  const notice = workbook.addWorksheet('Aviso');
  notice.getColumn(1).width = 100;
  for (const line of NOTICE) notice.addRow([line]);
  notice.getRow(1).font = { bold: true };

  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  const day = now.toISOString().slice(0, 10);
  return {
    filename: `credenciales-${type}-${day}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    base64: body.toString('base64'),
  };
}
