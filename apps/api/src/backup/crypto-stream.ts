import { createCipheriv, createDecipheriv, randomBytes, type DecipherGCM } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';

// Formato del respaldo cifrado: "AVBK1" + iv (12 bytes) + datos cifrados + etiqueta GCM (16 bytes).
// La etiqueta va al final, asi que el cifrado funciona en streaming sin cargar todo en memoria.
const MAGIC = Buffer.from('AVBK1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + IV_LENGTH;

export function createEncryptStream(key: Buffer): Transform {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let headerSent = false;

  const header = (stream: Transform) => {
    if (headerSent) return;
    headerSent = true;
    stream.push(Buffer.concat([MAGIC, iv]));
  };

  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      header(this);
      callback(null, cipher.update(chunk));
    },
    flush(callback: TransformCallback) {
      header(this);
      this.push(cipher.final());
      this.push(cipher.getAuthTag());
      callback();
    },
  });
}

// Descifra reteniendo siempre los ultimos 16 bytes (la etiqueta). Si el archivo fue alterado,
// esta truncado o la clave es otra, falla al final del flujo. Por eso quien restaura debe
// escribir primero a un archivo temporal y usarlo solo cuando el flujo termino sin error.
export function createDecryptStream(key: Buffer): Transform {
  let pending = Buffer.alloc(0);
  let decipher: DecipherGCM | undefined;

  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      try {
        pending = Buffer.concat([pending, chunk]);
        if (!decipher) {
          if (pending.length < HEADER_LENGTH) return callback();
          if (!pending.subarray(0, MAGIC.length).equals(MAGIC)) {
            return callback(new Error('El archivo no es un respaldo valido'));
          }
          const iv = pending.subarray(MAGIC.length, HEADER_LENGTH);
          decipher = createDecipheriv('aes-256-gcm', key, iv);
          pending = pending.subarray(HEADER_LENGTH);
        }
        if (pending.length > TAG_LENGTH) {
          const data = pending.subarray(0, pending.length - TAG_LENGTH);
          pending = pending.subarray(pending.length - TAG_LENGTH);
          this.push(decipher.update(data));
        }
        callback();
      } catch (err) {
        callback(err as Error);
      }
    },
    flush(callback: TransformCallback) {
      try {
        if (!decipher || pending.length !== TAG_LENGTH) {
          return callback(new Error('El respaldo esta incompleto'));
        }
        decipher.setAuthTag(pending);
        this.push(decipher.final());
        callback();
      } catch {
        callback(new Error('El respaldo esta alterado o la clave es incorrecta'));
      }
    },
  });
}
