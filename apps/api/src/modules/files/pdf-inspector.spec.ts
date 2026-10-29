import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { inspectPdfStream, verdictOf } from './pdf-inspector.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n');

/** Stream que entrega el buffer en trozos del tamaño indicado (para probar los cortes). */
const chunked = (data: Buffer, size: number) => {
  const parts: Buffer[] = [];
  for (let i = 0; i < data.length; i += size) parts.push(data.subarray(i, i + size));
  return Readable.from(parts);
};

describe('inspectPdfStream (RF-34)', () => {
  it('acepta un PDF real y calcula su sha256 en stream', async () => {
    const result = await inspectPdfStream(chunked(PDF, 7), 1024);
    expect(verdictOf(result)).toBe('OK');
    expect(result.sizeBytes).toBe(PDF.length);
    expect(result.sha256).toBe(createHash('sha256').update(PDF).digest('hex'));
  });

  it('rechaza lo que no empieza con %PDF- aunque termine con %%EOF (exe renombrado)', async () => {
    const fake = Buffer.concat([Buffer.from('MZ\x90\x00'), PDF]);
    expect(verdictOf(await inspectPdfStream(chunked(fake, 3), 1024))).toBe('NOT_PDF');
  });

  it('rechaza un PDF truncado sin %%EOF', async () => {
    const truncated = PDF.subarray(0, PDF.length - 8);
    expect(verdictOf(await inspectPdfStream(chunked(truncated, 5), 1024))).toBe('NOT_PDF');
  });

  it('rechaza un archivo vacío', async () => {
    expect(verdictOf(await inspectPdfStream(Readable.from([]), 1024))).toBe('NOT_PDF');
  });

  it('detecta /Encrypt aunque quede partido entre dos trozos', async () => {
    const encrypted = Buffer.from(
      '%PDF-1.7\ntrailer\n<< /Root 1 0 R /Encrypt 5 0 R >>\n%%EOF\n',
      'latin1',
    );
    const at = encrypted.indexOf('/Encrypt');
    for (const cut of [at + 1, at + 4, at + 7]) {
      const parts = [encrypted.subarray(0, cut), encrypted.subarray(cut)];
      expect(verdictOf(await inspectPdfStream(Readable.from(parts), 1024))).toBe('ENCRYPTED_PDF');
    }
  });

  it('corta la lectura al pasar maxBytes (RF-35)', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(2048)]);
    const result = await inspectPdfStream(chunked(big, 256), 1024);
    expect(verdictOf(result)).toBe('TOO_LARGE');
    expect(result.sha256).toBeNull();
  });

  it('acepta exactamente maxBytes', async () => {
    const result = await inspectPdfStream(chunked(PDF, 10), PDF.length);
    expect(verdictOf(result)).toBe('OK');
  });

  it('RF-34: un byte más que maxBytes es TOO_LARGE y sin sha256', async () => {
    const result = await inspectPdfStream(chunked(PDF, 7), PDF.length - 1);
    expect(verdictOf(result)).toBe('TOO_LARGE');
    expect(result.sha256).toBeNull();
  });

  it('RF-34: PDF con /Encrypt pero sin %%EOF se rechaza como NOT_PDF', async () => {
    const data = Buffer.from('%PDF-1.7\ntrailer\n<< /Encrypt 2 0 R >>\n');
    expect(verdictOf(await inspectPdfStream(chunked(data, 5), 1024))).toBe('NOT_PDF');
  });

  it('RF-34: %%EOF fuera de los últimos 1024 bytes no cuenta', async () => {
    const data = Buffer.concat([PDF, Buffer.alloc(1500, 0x20)]);
    expect(verdictOf(await inspectPdfStream(chunked(data, 300), 4096))).toBe('NOT_PDF');
  });

  it('RF-34: %%EOF con basura corta al final y trozos de 1 byte sigue siendo OK', async () => {
    const data = Buffer.concat([PDF, Buffer.alloc(100, 0x0a)]);
    expect(verdictOf(await inspectPdfStream(chunked(data, 1), 4096))).toBe('OK');
  });

  it('RF-34: /Encrypt entregado en trozos de 1 byte se detecta', async () => {
    const data = Buffer.from('%PDF-1.7\ntrailer\n<< /Encrypt 2 0 R >>\n%%EOF\n');
    expect(verdictOf(await inspectPdfStream(chunked(data, 1), 1024))).toBe('ENCRYPTED_PDF');
  });
});
