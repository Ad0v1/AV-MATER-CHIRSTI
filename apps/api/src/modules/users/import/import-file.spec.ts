import {
  BadRequestException,
  ConflictException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { MAX_FILE_BYTES } from './import.constants.js';
import { buildTemplate } from './import-template.js';
import { detectFormat, parseImportFile, sha256Of } from './import-file.js';

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const CSV = Buffer.from('correo,nombre_completo\n', 'utf8');

describe('detectFormat (extensión + bytes mágicos)', () => {
  it('xlsx con ZIP y csv sin ZIP; la extensión no distingue mayúsculas', () => {
    expect(detectFormat('Datos.XLSX', ZIP)).toBe('xlsx');
    expect(detectFormat('datos.csv', CSV)).toBe('csv');
  });

  it('.xls, .xlsm, .ods, .exe o sin extensión → 415', () => {
    for (const name of ['a.xls', 'a.xlsm', 'a.ods', 'a.exe', 'sin-extension', 'a.csv.exe']) {
      expect(() => detectFormat(name, ZIP)).toThrow(UnsupportedMediaTypeException);
    }
  });

  it('contenido que no coincide con la extensión → 415 (incluye .xlsx cifrado, que es OLE)', () => {
    expect(() => detectFormat('a.xlsx', CSV)).toThrow(UnsupportedMediaTypeException);
    expect(() => detectFormat('a.xlsx', OLE)).toThrow(UnsupportedMediaTypeException);
    expect(() => detectFormat('a.csv', ZIP)).toThrow(UnsupportedMediaTypeException);
  });
});

describe('parseImportFile', () => {
  const file = (originalname: string, buffer: Buffer) => ({
    originalname,
    size: buffer.length,
    buffer,
  });

  it('sin archivo o vacío → 400; más de 1 MiB → 413', async () => {
    await expect(parseImportFile(undefined)).rejects.toThrow(BadRequestException);
    await expect(parseImportFile(file('a.csv', Buffer.alloc(0)))).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      parseImportFile(file('a.csv', Buffer.alloc(MAX_FILE_BYTES + 1, 0x61))),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('lee CSV y XLSX y devuelve el SHA-256 en hexadecimal', async () => {
    const parsed = await parseImportFile(file('a.csv', CSV));
    expect(parsed).toEqual({
      format: 'csv',
      sha256: sha256Of(CSV),
      rows: [{ row: 1, cells: ['correo', 'nombre_completo'] }],
    });
    expect(parsed.sha256).toMatch(/^[0-9a-f]{64}$/);

    const { body } = await buildTemplate('teachers', 'xlsx');
    const xlsx = await parseImportFile(file('plantilla.xlsx', body));
    expect(xlsx.format).toBe('xlsx');
    expect(xlsx.rows[0]).toEqual({ row: 1, cells: ['correo', 'nombre_completo'] });
  });

  it('con sha256 esperado distinto → 409 antes de leer las filas', async () => {
    await expect(parseImportFile(file('a.csv', CSV), 'f'.repeat(64))).rejects.toThrow(
      ConflictException,
    );
    await expect(parseImportFile(file('a.csv', CSV), sha256Of(CSV))).resolves.toBeTruthy();
  });
});
