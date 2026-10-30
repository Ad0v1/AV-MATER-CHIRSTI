// Logo institucional (U5): solo PNG o JPEG de hasta 512 KiB. El tipo sale de los bytes, nunca del
// nombre ni del Content-Type que manda el cliente; un SVG (texto, puede llevar scripts) o cualquier
// otro formato se rechaza. Además de la firma se revisan la cabecera de dimensiones y el final
// (IEND en PNG, EOI en JPEG) para no aceptar un archivo que solo empieza como imagen ni uno con
// datos pegados al final.

export const LOGO_MAX_BYTES = 512 * 1024;
/** Lado máximo en píxeles (un logo no necesita más; evita imágenes enormes al decodificar). */
export const LOGO_MAX_SIDE = 4096;

export type LogoFormat = 'png' | 'jpg';
export const LOGO_MIME: Record<LogoFormat, 'image/png' | 'image/jpeg'> = {
  png: 'image/png',
  jpg: 'image/jpeg',
};

export type LogoCheck =
  | { ok: true; format: LogoFormat; width: number; height: number }
  | { ok: false; reason: 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED' | 'INVALID' };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Marcadores SOF de JPEG que traen alto y ancho (todos menos DHT C4, JPG C8 y DAC CC).
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function sizeOk(width: number, height: number): boolean {
  return width > 0 && height > 0 && width <= LOGO_MAX_SIDE && height <= LOGO_MAX_SIDE;
}

/**
 * PNG: firma de 8 bytes, primer chunk IHDR de 13 bytes con ancho y alto, chunks con longitudes
 * dentro del archivo y el último exactamente IEND (vacío) en el final: nada pegado detrás
 * (políglotas, hallazgo MEDIO de seguridad 5c). El CRC no se revisa: ClamAV lee el archivo entero.
 */
function checkPng(buf: Buffer): LogoCheck {
  if (buf.length < 8 + 25 + 12) return { ok: false, reason: 'INVALID' };
  if (buf.readUInt32BE(8) !== 13 || buf.toString('latin1', 12, 16) !== 'IHDR') {
    return { ok: false, reason: 'INVALID' };
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!sizeOk(width, height)) return { ok: false, reason: 'INVALID' };
  let i = 8;
  while (i + 12 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const end = i + 12 + length;
    if (length > 0x7fffffff || end > buf.length) return { ok: false, reason: 'INVALID' };
    if (buf.toString('latin1', i + 4, i + 8) === 'IEND') {
      return length === 0 && end === buf.length
        ? { ok: true, format: 'png', width, height }
        : { ok: false, reason: 'INVALID' };
    }
    i = end;
  }
  return { ok: false, reason: 'INVALID' };
}

/**
 * JPEG: SOI (FF D8), un segmento SOF con dimensiones antes del final y EOI (FF D9) como últimos
 * dos bytes: nada pegado detrás del fin de imagen.
 */
function checkJpeg(buf: Buffer): LogoCheck {
  if (buf.length < 4 || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
    return { ok: false, reason: 'INVALID' };
  }
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return { ok: false, reason: 'INVALID' };
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1; // relleno
      continue;
    }
    // Marcadores sin longitud: TEM y RSTn. SOS o EOI antes de un SOF: no hay dimensiones.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return { ok: false, reason: 'INVALID' };
    const length = buf.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > buf.length) return { ok: false, reason: 'INVALID' };
    if (SOF_MARKERS.has(marker)) {
      if (length < 7) return { ok: false, reason: 'INVALID' };
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      if (!sizeOk(width, height)) return { ok: false, reason: 'INVALID' };
      return { ok: true, format: 'jpg', width, height };
    }
    i += 2 + length;
  }
  return { ok: false, reason: 'INVALID' };
}

/** Clasifica el archivo por sus bytes. Función pura. */
export function checkLogo(buf: Buffer): LogoCheck {
  if (buf.length === 0) return { ok: false, reason: 'EMPTY' };
  if (buf.length > LOGO_MAX_BYTES) return { ok: false, reason: 'TOO_LARGE' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return checkPng(buf);
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return checkJpeg(buf);
  }
  return { ok: false, reason: 'UNSUPPORTED' };
}
