import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

// Validación del contenido real del PDF (RF-34) en una sola lectura del stream, sin cargar el
// archivo entero en memoria: sha256, firma `%PDF-` al inicio, `%%EOF` cerca del final y
// ausencia de `/Encrypt` (PDF protegido con contraseña, que el docente no podría abrir).

const MAGIC = Buffer.from('%PDF-', 'latin1');
const EOF_MARK = Buffer.from('%%EOF', 'latin1');
const ENCRYPT_MARK = Buffer.from('/Encrypt', 'latin1');
/** La especificación pide `%%EOF` en los últimos 1024 bytes; se tolera basura final corta. */
const TAIL_BYTES = 1024;

export type PdfInspection = {
  /** Bytes leídos. Si tooLarge, es el conteo hasta cortar la lectura. */
  sizeBytes: number;
  /** null si la lectura se cortó por tamaño. */
  sha256: string | null;
  tooLarge: boolean;
  hasMagic: boolean;
  hasEof: boolean;
  encrypted: boolean;
};

const lastBytes = (buf: Buffer, n: number): Buffer => buf.subarray(Math.max(0, buf.length - n));

export type PdfVerdict = 'OK' | 'TOO_LARGE' | 'NOT_PDF' | 'ENCRYPTED_PDF';

export function verdictOf(inspection: PdfInspection): PdfVerdict {
  if (inspection.tooLarge) return 'TOO_LARGE';
  if (!inspection.hasMagic || !inspection.hasEof || inspection.sizeBytes === 0) return 'NOT_PDF';
  if (inspection.encrypted) return 'ENCRYPTED_PDF';
  return 'OK';
}

/**
 * Lee el stream completo. Si supera maxBytes deja de leer (destruye el stream) y devuelve
 * tooLarge. Los errores del stream se propagan tal cual (el llamador los traduce a 503).
 */
export async function inspectPdfStream(stream: Readable, maxBytes: number): Promise<PdfInspection> {
  const hash = createHash('sha256');
  let size = 0;
  let head: Buffer = Buffer.alloc(0);
  let tail: Buffer = Buffer.alloc(0);
  let carry: Buffer = Buffer.alloc(0);
  let encrypted = false;

  for await (const raw of stream) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
    size += chunk.length;
    if (size > maxBytes) {
      stream.destroy();
      return {
        sizeBytes: size,
        sha256: null,
        tooLarge: true,
        hasMagic: false,
        hasEof: false,
        encrypted: false,
      };
    }
    hash.update(chunk);
    if (head.length < MAGIC.length) {
      head = Buffer.concat([head, chunk.subarray(0, MAGIC.length - head.length)]);
    }
    // `/Encrypt` puede quedar partido entre dos trozos: se busca en el final del anterior + este.
    if (!encrypted) {
      const seam = Buffer.concat([carry, chunk.subarray(0, ENCRYPT_MARK.length - 1)]);
      encrypted = chunk.includes(ENCRYPT_MARK) || seam.includes(ENCRYPT_MARK);
      carry = lastBytes(
        Buffer.concat([carry, lastBytes(chunk, ENCRYPT_MARK.length - 1)]),
        ENCRYPT_MARK.length - 1,
      );
    }
    tail = lastBytes(Buffer.concat([tail, lastBytes(chunk, TAIL_BYTES)]), TAIL_BYTES);
  }

  return {
    sizeBytes: size,
    sha256: hash.digest('hex'),
    tooLarge: false,
    hasMagic: head.equals(MAGIC),
    hasEof: tail.includes(EOF_MARK),
    encrypted,
  };
}
