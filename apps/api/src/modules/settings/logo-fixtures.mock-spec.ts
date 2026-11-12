// Imágenes mínimas para los .spec.ts de settings y los e2e. Termina en "-spec.ts": el build lo
// excluye y vitest no lo ejecuta como suite.
import { crc32 } from 'node:zlib';

/** Bytes de pngBytes() sin relleno: firma (8) + IHDR (25) + IEND (12). */
export const PNG_BASE_BYTES = 45;

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * PNG con estructura de chunks válida: firma, IHDR con ancho y alto, un IDAT de relleno si
 * `extra` > 0 (suma exactamente `extra` bytes; mínimo 12) e IEND al final.
 */
export function pngBytes(width = 64, height = 32, extra = 0): Buffer {
  if (extra > 0 && extra < 12) throw new Error('extra debe ser 0 o al menos 12');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(extra > 0 ? [chunk('IDAT', Buffer.alloc(extra - 12))] : []),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** JPEG mínimo: SOI, APP0 y SOF0 con alto y ancho, luego EOI (FF D9) al final. */
export function jpegBytes(width = 80, height = 40): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.alloc(14)]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}
