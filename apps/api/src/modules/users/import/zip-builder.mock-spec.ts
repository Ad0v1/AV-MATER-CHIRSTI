// Constructor de ZIP para las pruebas del guard (sin archivos binarios en el repo). El nombre
// termina en "-spec.ts": el build lo excluye y vitest no lo ejecuta como suite.
import { crc32, deflateRawSync } from 'node:zlib';

export type ZipEntrySpec = {
  name: string;
  data: Buffer | string;
  /** 0 = sin compresión, 8 = deflate (por defecto); otro valor se escribe tal cual. */
  method?: number;
  flags?: number;
  /** Tamaño descomprimido declarado (por defecto, el real): para simular cabeceras mentirosas. */
  declaredSize?: number;
  /** Nombre de la cabecera local si debe ser distinto del del directorio central. */
  localName?: string;
  /** Campos extra (bloques ya armados) del directorio central y de la cabecera local. */
  centralExtra?: Buffer;
  localExtra?: Buffer;
  /** Escribe la cabecera local con CRC y tamaños a cero y un descriptor de datos (flag 0x0008). */
  dataDescriptor?: boolean;
  /** CRC declarado (por defecto, el real). */
  declaredCrc?: number;
};

export type ZipOptions = {
  zip64Locator?: boolean;
  diskNumber?: number;
  /** Bytes sin referenciar entre las entradas y el directorio central. */
  gapBeforeCd?: Buffer;
  /** Bytes sin referenciar entre el directorio central y el EOCD. */
  gapAfterCd?: Buffer;
  /** Bytes después del EOCD. */
  trailing?: Buffer;
  /** Comentario del EOCD. */
  comment?: Buffer;
};

/** Bloque de campo extra: id, longitud y datos. */
export function extraBlock(id: number, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt16LE(id, 0);
  head.writeUInt16LE(data.length, 2);
  return Buffer.concat([head, data]);
}

/** Campo extra 0x7075 (Info-ZIP Unicode Path) que JSZip usa como nombre de la entrada. */
export function unicodePathExtra(realName: string, unicodeName: string): Buffer {
  const head = Buffer.alloc(5);
  head.writeUInt8(1, 0);
  head.writeUInt32LE(crc32(Buffer.from(realName, 'utf8')), 1);
  return extraBlock(0x7075, Buffer.concat([head, Buffer.from(unicodeName, 'utf8')]));
}

/** Cabecera local, nombre y datos de una entrada. */
export function localPart(entry: ZipEntrySpec): { bytes: Buffer; central: Buffer } {
  const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
  const method = entry.method ?? 8;
  const body = method === 8 ? deflateRawSync(raw) : raw;
  const name = Buffer.from(entry.name, 'utf8');
  const localName = Buffer.from(entry.localName ?? entry.name, 'utf8');
  const flags = (entry.flags ?? 0) | (entry.dataDescriptor ? 0x0008 : 0);
  const size = entry.declaredSize ?? raw.length;
  const crc = entry.declaredCrc ?? crc32(raw);
  const localExtra = entry.localExtra ?? Buffer.alloc(0);
  const centralExtra = entry.centralExtra ?? Buffer.alloc(0);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(method, 8);
  if (!entry.dataDescriptor) {
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(size, 22);
  }
  local.writeUInt16LE(localName.length, 26);
  local.writeUInt16LE(localExtra.length, 28);
  const parts = [local, localName, localExtra, body];
  if (entry.dataDescriptor) {
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(body.length, 8);
    descriptor.writeUInt32LE(size, 12);
    parts.push(descriptor);
  }

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(centralExtra.length, 30);
  return { bytes: Buffer.concat(parts), central: Buffer.concat([central, name, centralExtra]) };
}

/** EOCD con el número de entradas, el tamaño y el offset del directorio central. */
export function eocdRecord(
  entries: number,
  cdSize: number,
  cdOffset: number,
  options: Pick<ZipOptions, 'diskNumber' | 'comment'> = {},
): Buffer {
  const comment = options.comment ?? Buffer.alloc(0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(options.diskNumber ?? 0, 4);
  eocd.writeUInt16LE(entries, 8);
  eocd.writeUInt16LE(entries, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(comment.length, 20);
  return Buffer.concat([eocd, comment]);
}

export function buildZip(entries: ZipEntrySpec[], options: ZipOptions = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const { bytes, central } = localPart(entry);
    central.writeUInt32LE(offset, 42);
    locals.push(bytes);
    centrals.push(central);
    offset += bytes.length;
  }
  const gapBefore = options.gapBeforeCd ?? Buffer.alloc(0);
  const cdOffset = offset + gapBefore.length;
  const cd = Buffer.concat(centrals);
  const parts = [...locals, gapBefore, cd, options.gapAfterCd ?? Buffer.alloc(0)];
  if (options.zip64Locator) {
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    parts.push(locator);
  }
  parts.push(eocdRecord(entries.length, cd.length, cdOffset, options));
  if (options.trailing) parts.push(options.trailing);
  return Buffer.concat(parts);
}

/** Partes mínimas con nombres de un .xlsx (el guard no exige que sea un libro válido). */
export const minimalParts = (): ZipEntrySpec[] => [
  { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
  { name: '_rels/.rels', data: '<?xml version="1.0"?><Relationships/>' },
  { name: 'xl/workbook.xml', data: '<?xml version="1.0"?><workbook/>' },
];

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * Libro mínimo que ExcelJS sí carga, con el XML de la hoja (lo que va dentro de <worksheet>) y lo
 * que se añada dentro de <workbook> (p. ej. <definedNames>), para las pruebas de estructura.
 * `sheets` reemplaza la lista de hojas del libro (por defecto, una con sheetId="1" y r:id="rId1").
 * `extraParts` añade partes al final del ZIP.
 */
export function rawXlsx(
  sheetBody: string,
  workbookExtra = '',
  sheets = '<sheet name="Datos" sheetId="1" r:id="rId1"/>',
  extraParts: ZipEntrySpec[] = [],
): Buffer {
  return buildZip([
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0"?><workbook xmlns="${MAIN_NS}" xmlns:r="${DOC_REL}"><sheets>${sheets}</sheets>${workbookExtra}</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${DOC_REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: `<?xml version="1.0"?><worksheet xmlns="${MAIN_NS}">${sheetBody}</worksheet>`,
    },
    ...extraParts,
  ]);
}

/** Celda de texto en línea. */
export const inlineCell = (ref: string, text: string): string =>
  `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
