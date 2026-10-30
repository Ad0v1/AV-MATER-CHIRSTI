import { crc32, inflateRawSync } from 'node:zlib';
import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import { IMPORT_MSG } from '../users.errors.js';
import {
  IMPORT_LIMIT_MSG,
  XLSX_MAX_ENTRIES,
  XLSX_MAX_ENTRY_BYTES,
  XLSX_MAX_UNCOMPRESSED_BYTES,
} from './import.constants.js';
import { inspectXmlPart, isExcelJsXmlPart, newStructureBudget } from './xlsx-xml.js';

// Revisión del contenedor ZIP de un .xlsx ANTES de entregarlo a ExcelJS (Decisión 1 e INFORME 3):
// limita las entradas, rechaza ZIP64, multidisco, cifrado, métodos raros, rutas peligrosas, macros
// y DTD (XXE / "billion laughs"), y descomprime de verdad cada entrada con un presupuesto total y
// otro por entrada para cortar las bombas ZIP sin confiar en los tamaños declarados.
//
// El guard y JSZip (el lector que usa ExcelJS) tienen que ver EXACTAMENTE las mismas entradas con
// los mismos datos (H1). JSZip 3.10: busca el último EOCD; si hay bytes entre el directorio central
// y el EOCD los suma a todos los offsets; toma el nombre de la cabecera LOCAL (o del campo extra
// 0x7075 del directorio); y lee `compressedSize` bytes del directorio desde el final de la cabecera
// local. Por eso aquí se exige un ZIP "canónico": EOCD al final, directorio central pegado al EOCD,
// cabeceras locales iguales a su entrada del directorio, sin 0x7075, nombres ASCII sin duplicados
// y entradas que cubren el archivo de principio a fin sin huecos ni solapes.
// 400 = dañado o demasiado grande; 415 = característica no admitida o contenido prohibido.

const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const SIG_DATA_DESCRIPTOR = 0x08074b50;
const EOCD_SIG_BYTES = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const EOCD_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
const ZIP64_LOCATOR_SIZE = 20;

const FLAG_ENCRYPTED = 0x0001;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_STRONG_ENCRYPTION = 0x0040;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
/** Campo extra "Info-ZIP Unicode Path": JSZip lo usa como nombre real de la entrada. */
const EXTRA_UNICODE_PATH = 0x7075;

export type ZipEntryInfo = { name: string; method: number; uncompressedSize: number };

const damaged = () => new BadRequestException(IMPORT_MSG.damagedXlsx);
const unsupported = () => new UnsupportedMediaTypeException(IMPORT_MSG.xlsxUnsupported);
const tooBig = () => new BadRequestException(IMPORT_MSG.xlsxTooBig);

/**
 * Nombre de entrada admitido: ASCII imprimible, sin '\', sin ruta absoluta ni de unidad y sin
 * segmentos '.', '..' o vacíos (salvo la '/' final de una carpeta). Así el nombre que revisa el
 * guard es el mismo que deja `JSZip.utils.resolve` y no hay dos formas de escribir la misma parte.
 */
function isSafeName(raw: Buffer): boolean {
  if (raw.length === 0) return false;
  for (const byte of raw) if (byte < 0x20 || byte > 0x7e || byte === 0x5c) return false;
  const name = raw.toString('latin1');
  if (name.startsWith('/') || /^[a-z]:/i.test(name)) return false;
  const parts = name.split('/');
  return parts.every(
    (part, i) => part !== '.' && part !== '..' && (part !== '' || i === parts.length - 1),
  );
}

/**
 * Recorre un campo extra (bloques id/longitud/datos). Tiene que encajar exacto: JSZip lee los
 * bloques sin comprobar el final y uno mal formado le haría leer bytes de lo que viene después.
 * Con el nombre Unicode (0x7075) JSZip renombra la entrada → 415.
 */
function checkExtraField(buf: Buffer, start: number, length: number): void {
  const end = start + length;
  let p = start;
  while (p < end) {
    if (p + 4 > end) throw damaged();
    const id = buf.readUInt16LE(p);
    const size = buf.readUInt16LE(p + 2);
    p += 4 + size;
    if (p > end) throw damaged();
    if (id === EXTRA_UNICODE_PATH) {
      throw new UnsupportedMediaTypeException(IMPORT_LIMIT_MSG.xlsxUnicodeName);
    }
  }
}

function inflate(data: Buffer, limit: number): Buffer {
  try {
    // maxOutputLength corta la descompresión al pasar el límite (no confía en el tamaño
    // declarado). zlib exige un mínimo de 1.
    return inflateRawSync(data, { maxOutputLength: Math.max(1, limit) });
  } catch (error: unknown) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 'ERR_BUFFER_TOO_LARGE' || error instanceof RangeError) throw tooBig();
    throw damaged();
  }
}

type CentralEntry = {
  name: string;
  rawName: Buffer;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

/** EOCD: el último del archivo (como JSZip), sin ZIP64, en un solo disco y justo al final. */
function readEocd(buf: Buffer): { eocd: number; totalEntries: number; cdOffset: number } {
  if (buf.length < EOCD_SIZE || buf.readUInt32LE(0) !== SIG_LOCAL) throw damaged();
  const eocd = buf.lastIndexOf(EOCD_SIG_BYTES);
  if (eocd < 0 || eocd + EOCD_SIZE > buf.length) throw damaged();
  if (
    eocd >= ZIP64_LOCATOR_SIZE &&
    buf.readUInt32LE(eocd - ZIP64_LOCATOR_SIZE) === SIG_ZIP64_LOCATOR
  ) {
    throw unsupported();
  }
  const diskNumber = buf.readUInt16LE(eocd + 4);
  const cdDisk = buf.readUInt16LE(eocd + 6);
  const entriesOnDisk = buf.readUInt16LE(eocd + 8);
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const commentLength = buf.readUInt16LE(eocd + 20);
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw unsupported(); // ZIP64
  }
  if (diskNumber !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries) throw unsupported();
  // Nada después del comentario del EOCD.
  if (eocd + EOCD_SIZE + commentLength !== buf.length) throw damaged();
  if (totalEntries === 0) throw damaged();
  if (totalEntries > XLSX_MAX_ENTRIES) throw new BadRequestException(IMPORT_MSG.xlsxTooManyEntries);
  // Directorio central pegado al EOCD: sin hueco (JSZip lo sumaría a los offsets) ni solape.
  if (cdOffset + cdSize !== eocd) throw damaged();
  return { eocd, totalEntries, cdOffset };
}

function readCentralDirectory(buf: Buffer, cdOffset: number, eocd: number, total: number) {
  const entries: CentralEntry[] = [];
  const names = new Set<string>();
  let pos = cdOffset;
  for (let n = 0; n < total; n++) {
    if (pos + CENTRAL_SIZE > eocd || buf.readUInt32LE(pos) !== SIG_CENTRAL) throw damaged();
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const crc = buf.readUInt32LE(pos + 16);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLength = buf.readUInt16LE(pos + 28);
    const extraLength = buf.readUInt16LE(pos + 30);
    const commentLength = buf.readUInt16LE(pos + 32);
    const entryDisk = buf.readUInt16LE(pos + 34);
    const localOffset = buf.readUInt32LE(pos + 42);
    const nameStart = pos + CENTRAL_SIZE;
    const extraStart = nameStart + nameLength;
    pos = extraStart + extraLength + commentLength;
    if (pos > eocd) throw damaged();

    if (flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) throw unsupported();
    if (entryDisk !== 0) throw unsupported();
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw unsupported(); // ZIP64 por entrada
    }
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) throw unsupported();
    checkExtraField(buf, extraStart, extraLength);
    const rawName = buf.subarray(nameStart, extraStart);
    if (!isSafeName(rawName)) throw damaged();
    const name = rawName.toString('latin1');
    if (names.has(name)) throw damaged(); // JSZip se quedaría con la última
    names.add(name);
    if (name.toLowerCase() === 'xl/vbaproject.bin') {
      throw new UnsupportedMediaTypeException(IMPORT_MSG.xlsxMacros);
    }
    entries.push({
      name,
      rawName,
      flags,
      method,
      crc,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
  }
  // El directorio termina justo en el EOCD (JSZip sigue leyendo mientras haya firmas centrales).
  if (pos !== eocd) throw damaged();
  return entries;
}

/**
 * Cabecera local igual a su entrada del directorio central (nombre, método, flags, CRC y tamaños;
 * con descriptor de datos, la local puede llevar ceros). Devuelve dónde empiezan y acaban los datos
 * y dónde acaba la entrada completa (con su descriptor, si lo hay).
 */
function readLocalEntry(buf: Buffer, entry: CentralEntry, cdOffset: number) {
  const at = entry.localOffset;
  if (at + LOCAL_SIZE > cdOffset || buf.readUInt32LE(at) !== SIG_LOCAL) throw damaged();
  const flags = buf.readUInt16LE(at + 6);
  const method = buf.readUInt16LE(at + 8);
  const crc = buf.readUInt32LE(at + 14);
  const compressedSize = buf.readUInt32LE(at + 18);
  const uncompressedSize = buf.readUInt32LE(at + 22);
  const nameLength = buf.readUInt16LE(at + 26);
  const extraLength = buf.readUInt16LE(at + 28);
  if (flags !== entry.flags || method !== entry.method) throw damaged();
  const hasDescriptor = (entry.flags & FLAG_DATA_DESCRIPTOR) !== 0;
  const matches = (local: number, central: number) =>
    local === central || (hasDescriptor && local === 0);
  if (
    !matches(crc, entry.crc) ||
    !matches(compressedSize, entry.compressedSize) ||
    !matches(uncompressedSize, entry.uncompressedSize)
  ) {
    throw damaged();
  }
  const nameStart = at + LOCAL_SIZE;
  const extraStart = nameStart + nameLength;
  const dataStart = extraStart + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > cdOffset) throw damaged();
  if (!buf.subarray(nameStart, extraStart).equals(entry.rawName)) throw damaged();
  checkExtraField(buf, extraStart, extraLength);

  let end = dataEnd;
  if (hasDescriptor) {
    // Descriptor: firma opcional + CRC + tamaños, iguales a los del directorio central.
    const sig = dataEnd + 4 <= cdOffset && buf.readUInt32LE(dataEnd) === SIG_DATA_DESCRIPTOR;
    const p = sig ? dataEnd + 4 : dataEnd;
    if (p + 12 > cdOffset) throw damaged();
    if (
      buf.readUInt32LE(p) !== entry.crc ||
      buf.readUInt32LE(p + 4) !== entry.compressedSize ||
      buf.readUInt32LE(p + 8) !== entry.uncompressedSize
    ) {
      throw damaged();
    }
    end = p + 12;
  }
  return { start: at, dataStart, dataEnd, end };
}

/**
 * Revisa el .xlsx completo. Lanza 400 o 415 (mensajes fijos, sin datos del archivo) o devuelve
 * la lista de entradas revisadas. Los datos descomprimidos se borran de memoria al terminar.
 */
export function assertSafeXlsx(buf: Buffer): ZipEntryInfo[] {
  const { eocd, totalEntries, cdOffset } = readEocd(buf);
  const central = readCentralDirectory(buf, cdOffset, eocd, totalEntries);

  // Primero la estructura (barato); después se descomprime.
  const locals = central.map((entry) => ({ entry, ...readLocalEntry(buf, entry, cdOffset) }));
  // Las entradas cubren [0, directorio central) sin huecos ni solapes: no hay datos escondidos
  // fuera del directorio ni dos entradas que compartan bytes.
  const byOffset = [...locals].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const local of byOffset) {
    if (local.start !== cursor) throw damaged();
    cursor = local.end;
  }
  if (cursor !== cdOffset) throw damaged();

  const structure = newStructureBudget();
  const result: ZipEntryInfo[] = [];
  let budget = XLSX_MAX_UNCOMPRESSED_BYTES;
  for (const { entry, dataStart, dataEnd } of locals) {
    const limit = Math.min(budget, XLSX_MAX_ENTRY_BYTES);
    // Tamaño declarado mayor que el límite: se rechaza sin descomprimir.
    if (entry.uncompressedSize > limit) throw tooBig();
    if (entry.method === METHOD_STORED && entry.compressedSize !== entry.uncompressedSize) {
      throw damaged();
    }
    const raw = buf.subarray(dataStart, dataEnd);
    const data = entry.method === METHOD_STORED ? Buffer.from(raw) : inflate(raw, limit);
    try {
      if (data.length > limit) throw tooBig();
      // Lo descomprimido tiene que ser exactamente lo declarado (tamaño y CRC).
      if (data.length !== entry.uncompressedSize || crc32(data) !== entry.crc) throw damaged();
      budget -= data.length;
      if (isExcelJsXmlPart(entry.name)) inspectXmlPart(entry.name, data, structure);
    } finally {
      data.fill(0); // puede contener nombres y correos
    }
    result.push({ name: entry.name, method: entry.method, uncompressedSize: data.length });
  }
  return result;
}
