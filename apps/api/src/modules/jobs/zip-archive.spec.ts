import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { uploadZip, zipPath, zipSegment } from './zip-archive.js';
import { readZip } from './zip-reader.mock-spec.js';

/** Almacenamiento falso: junta lo que se sube y devuelve el tamaño. */
function memoryStorage(failWith?: Error) {
  const uploads = new Map<string, Buffer>();
  return {
    uploads,
    upload: vi.fn(async (key: string, body: Buffer | Readable) => {
      const chunks: Buffer[] = [];
      if (failWith) {
        (body as Readable).resume();
        throw failWith;
      }
      for await (const c of body as Readable) chunks.push(c as Buffer);
      const all = Buffer.concat(chunks);
      uploads.set(key, all);
      return all.length;
    }),
  };
}

const KEY = 'backups/2026/12/0192f0c4-0000-7000-8000-000000000001.zip';

describe('zipSegment y zipPath', () => {
  it('quita separadores, control, prefijos de punto (zip slip) y recorta', () => {
    expect(zipSegment('../../etc/passwd')).toBe('__.._etc_passwd');
    expect(zipSegment('a\u0000b\u0007c')).toBe('abc');
    expect(zipSegment('C:\\temp\\x')).toBe('C__temp_x');
    expect(zipSegment('   ')).toBe('sin-nombre');
    expect(zipSegment('..')).toBe('_');
    expect(zipSegment('nombre.')).toBe('nombre');
    expect(Array.from(zipSegment('ñ'.repeat(200)))).toHaveLength(80);
  });

  it('zipPath une tramos limpios y nunca empieza con /', () => {
    expect(zipPath('/abs', 'Matemática', 'Tarea 1: álgebra')).toBe(
      '_abs/Matemática/Tarea 1_ álgebra',
    );
  });
});

describe('uploadZip', () => {
  it('escribe buffers y streams en orden, abre cada stream justo antes y renombra duplicados', async () => {
    const storage = memoryStorage();
    const opened: string[] = [];
    const open = (text: string) => () => {
      opened.push(text);
      return Promise.resolve(Readable.from([Buffer.from(text)]));
    };
    const bytes = await uploadZip(storage, KEY, async (zip) => {
      await zip.addStream('a/doc.pdf', open('uno'));
      expect(opened).toEqual(['uno']);
      expect(await zip.addStream('a/doc.pdf', open('dos'))).toBe('a/doc (2).pdf');
      expect(await zip.addStream('A/DOC.pdf', open('tres'))).toBe('A/DOC (3).pdf');
      await zip.addBuffer('indice.csv', 'ruta\r\n');
      expect(zip.count).toBe(4);
    });
    const zip = storage.uploads.get(KEY)!;
    expect(bytes).toBe(zip.length);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual([
      'a/doc.pdf',
      'a/doc (2).pdf',
      'A/DOC (3).pdf',
      'indice.csv',
    ]);
    expect(files.get('a/doc (2).pdf')!.toString()).toBe('dos');
    expect(files.get('indice.csv')!.toString()).toBe('ruta\r\n');
  });

  it('un error de la fuente aborta el ZIP y se relanza', async () => {
    const storage = memoryStorage();
    const broken = new Readable({
      read() {
        this.destroy(new Error('S3_DOWN'));
      },
    });
    await expect(
      uploadZip(storage, KEY, async (zip) => {
        await zip.addStream('x.pdf', () => Promise.resolve(broken));
      }),
    ).rejects.toThrow('S3_DOWN');
  });

  it('si abrir la fuente falla, se relanza ese error', async () => {
    const storage = memoryStorage();
    await expect(
      uploadZip(storage, KEY, async (zip) => {
        await zip.addStream('x.pdf', () => Promise.reject(new Error('NO_KEY')));
      }),
    ).rejects.toThrow('NO_KEY');
  });

  it('un error del constructor aborta y se relanza', async () => {
    const storage = memoryStorage();
    await expect(
      uploadZip(storage, KEY, async (zip) => {
        await zip.addBuffer('a.txt', 'x');
        throw new Error('BUILD');
      }),
    ).rejects.toThrow('BUILD');
  });

  it('si la subida falla, no se queda esperando y relanza', async () => {
    const storage = memoryStorage(new Error('UPLOAD'));
    await expect(
      uploadZip(storage, KEY, async (zip) => {
        await zip.addBuffer('a.txt', Buffer.alloc(1024 * 1024, 1));
        await zip.addBuffer('b.txt', Buffer.alloc(1024 * 1024, 2));
      }),
    ).rejects.toThrow('UPLOAD');
  });
});
