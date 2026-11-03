import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { createDecryptStream, createEncryptStream } from './crypto-stream.js';

const newKey = () => randomBytes(32);

async function run(input: Buffer[], transform: NodeJS.ReadWriteStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await pipeline(
    Readable.from(input),
    transform,
    new Writable({
      write(chunk: Buffer, _enc, cb) {
        chunks.push(chunk);
        cb();
      },
    }),
  );
  return Buffer.concat(chunks);
}

const encrypt = (data: Buffer[], key: Buffer) => run(data, createEncryptStream(key));
const decrypt = (data: Buffer[], key: Buffer) => run(data, createDecryptStream(key));

describe('cifrado de respaldos', () => {
  it('descifra exactamente lo que cifra, incluso en varios trozos', async () => {
    const key = newKey();
    const original = randomBytes(100_000);
    const encrypted = await encrypt([original.subarray(0, 40_000), original.subarray(40_000)], key);

    expect(await decrypt([encrypted], key)).toEqual(original);
  });

  it('no deja el contenido en claro', async () => {
    const encrypted = await encrypt([Buffer.from('INSERT INTO User VALUES (secreto)')], newKey());
    expect(encrypted.toString('utf8')).not.toContain('secreto');
  });

  it('resiste que el archivo llegue en trozos diminutos', async () => {
    const key = newKey();
    const original = Buffer.from('contenido de prueba '.repeat(500));
    const encrypted = await encrypt([original], key);
    const tiny = Array.from({ length: encrypted.length }, (_, i) => encrypted.subarray(i, i + 1));

    expect(await decrypt(tiny, key)).toEqual(original);
  });

  it('maneja un respaldo vacio', async () => {
    const key = newKey();
    expect((await decrypt([await encrypt([], key)], key)).length).toBe(0);
  });

  it('detecta un byte alterado', async () => {
    const key = newKey();
    const encrypted = await encrypt([Buffer.from('datos importantes '.repeat(100))], key);
    encrypted[encrypted.length - 40] = encrypted[encrypted.length - 40]! ^ 0xff;

    await expect(decrypt([encrypted], key)).rejects.toThrow(/alterado|clave/);
  });

  it('detecta un archivo truncado', async () => {
    const key = newKey();
    const encrypted = await encrypt([Buffer.from('datos '.repeat(1000))], key);

    await expect(decrypt([encrypted.subarray(0, encrypted.length - 20)], key)).rejects.toThrow();
  });

  it('rechaza una clave incorrecta', async () => {
    const encrypted = await encrypt([Buffer.from('datos')], newKey());
    await expect(decrypt([encrypted], newKey())).rejects.toThrow(/alterado|clave/);
  });

  it('rechaza un archivo que no es un respaldo', async () => {
    await expect(
      decrypt([Buffer.from('esto no es un respaldo cifrado')], newKey()),
    ).rejects.toThrow(/valido/);
  });
});
