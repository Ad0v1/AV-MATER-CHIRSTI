import { randomBytes } from 'node:crypto';

// UUID v7 (RFC 9562) generado en la API: createMany de MySQL no devuelve los ids creados y la
// importación los necesita para las matrículas, los vínculos y la bitácora (Decisión 3).
// Mismo formato que @default(uuid(7)) de Prisma: 48 bits de milisegundos Unix, versión 7,
// 12 bits aleatorios, variante 10 y 62 bits aleatorios.

/**
 * UUID v7 en minúsculas con guiones. `now` y `random` (10 bytes) se inyectan solo en las pruebas.
 */
export function uuidv7(now: number = Date.now(), random: Buffer = randomBytes(10)): string {
  if (!Number.isSafeInteger(now) || now < 0 || now >= 2 ** 48) {
    throw new RangeError('Marca de tiempo fuera de rango para UUID v7');
  }
  if (random.length < 10) throw new RangeError('Se necesitan 10 bytes aleatorios');
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(now, 0, 6);
  random.copy(bytes, 6, 0, 10);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // versión 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 9562 (10xx)
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
