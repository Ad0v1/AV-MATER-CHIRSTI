import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import { decodeCsv, detectSeparator, parseCsv } from './csv-parser.js';
import { EXTRA_CELLS_MARKER } from './import.constants.js';

const csv = (text: string) => Buffer.from(text, 'utf8');
const cells = (text: string) => parseCsv(csv(text)).map((r) => r.cells);

describe('parseCsv (RFC 4180, Decisión 1)', () => {
  it('separa por coma con LF o CRLF y numera las filas físicas (encabezado = 1)', () => {
    const rows = parseCsv(csv('a,b\r\n1,2\n3,4\n'));
    expect(rows).toEqual([
      { row: 1, cells: ['a', 'b'] },
      { row: 2, cells: ['1', '2'] },
      { row: 3, cells: ['3', '4'] },
    ]);
  });

  it('usa ; si el encabezado lo usa más que la coma', () => {
    expect(detectSeparator('correo;nombre_completo\n')).toBe(';');
    expect(detectSeparator('"a;b",c\n')).toBe(',');
    expect(cells('correo;nombre\nx@y.z;"Pérez, Ana"')).toEqual([
      ['correo', 'nombre'],
      ['x@y.z', 'Pérez, Ana'],
    ]);
  });

  it('respeta comillas, "" dentro de comillas y saltos de línea dentro de un campo', () => {
    expect(cells('a,b\n"di ""hola""","línea 1\nlínea 2"\n')).toEqual([
      ['a', 'b'],
      ['di "hola"', 'línea 1\nlínea 2'],
    ]);
  });

  it('último registro sin salto final y campos vacíos', () => {
    expect(cells('a,b,c\nx,,')).toEqual([
      ['a', 'b', 'c'],
      ['x', '', ''],
    ]);
    expect(cells('a,b\n,"z"')).toEqual([
      ['a', 'b'],
      ['', 'z'],
    ]);
  });

  it('no guarda las filas vacías, pero conserva la numeración física (H3)', () => {
    expect(parseCsv(csv('a\n\n1\n,,\n""\n2'))).toEqual([
      { row: 1, cells: ['a'] },
      { row: 3, cells: ['1'] },
      { row: 6, cells: ['2'] },
    ]);
  });

  it('descarta el BOM UTF-8', () => {
    expect(cells('﻿correo,nombre\n')[0]).toEqual(['correo', 'nombre']);
    expect(decodeCsv(Buffer.from([0xef, 0xbb, 0xbf, 0x61]))).toBe('a');
  });

  it('comilla sin cerrar → 400', () => {
    expect(() => parseCsv(csv('a,b\n"sin cerrar,2\n'))).toThrow(BadRequestException);
  });

  it('no UTF-8 (Latin-1) → 400 con mensaje fijo', () => {
    const latin1 = Buffer.from('nombre\nPérez\n', 'latin1');
    expect(() => parseCsv(latin1)).toThrow('Guarda el archivo como CSV UTF-8');
  });

  it('byte NUL (binario, p. ej. un .exe renombrado) → 415', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(16), Buffer.from('a,b')]);
    expect(() => parseCsv(exe)).toThrow(UnsupportedMediaTypeException);
  });

  it('más filas de datos no vacías que el máximo → 400 (las vacías no cuentan)', () => {
    const text = `a\n${'x\n\n'.repeat(3)}`;
    expect(parseCsv(csv(text), 3)).toHaveLength(4);
    expect(() => parseCsv(csv(`a\n${'x\n'.repeat(4)}`), 3)).toThrow(BadRequestException);
  });

  it('1001 filas con el máximo por defecto → 400', () => {
    expect(() => parseCsv(csv(`a\n${'x\n'.repeat(1001)}`))).toThrow(
      'El archivo supera el máximo de 1000 filas de datos',
    );
    expect(parseCsv(csv(`a\n${'x\n'.repeat(1000)}`))).toHaveLength(1001);
  });

  it('más de 5000 registros físicos, aunque estén vacíos → 400 sin acumular nada (H3)', () => {
    expect(parseCsv(csv(`a\n${'\n'.repeat(4998)}x`))).toEqual([
      { row: 1, cells: ['a'] },
      { row: 5000, cells: ['x'] },
    ]);
    expect(() => parseCsv(csv(`a\n${'\n'.repeat(4999)}x`))).toThrow(
      'El archivo supera el máximo de 5000 filas, contando las vacías',
    );
    // 1 MiB de saltos de línea: corta en el registro 5001, rápido.
    const started = performance.now();
    expect(() => parseCsv(Buffer.alloc(1_048_576, 0x0a))).toThrow(BadRequestException);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('guarda como máximo 30 campos; datos más allá → marcador de EXTRA_CELLS (H3)', () => {
    const wide = (last: string) => [...Array.from({ length: 34 }, () => ''), last].join(',');
    const [, row] = parseCsv(csv(`a\nx,${wide('dato')}`));
    expect(row.cells).toHaveLength(31);
    expect(row.cells[30]).toBe(EXTRA_CELLS_MARKER);
    // Campos vacíos de sobra (p. ej. exportados por Excel) no cuentan como datos.
    const [, plain] = parseCsv(csv(`a\nx,${wide('')}`));
    expect(plain.cells).toHaveLength(30);
    expect(plain.cells).not.toContain(EXTRA_CELLS_MARKER);
  });

  it('más de 16384 campos en un registro → 400 (H3)', () => {
    expect(parseCsv(csv(`a\nx${','.repeat(16_383)}`))).toHaveLength(2);
    expect(() => parseCsv(csv(`a\nx${','.repeat(16_384)}`))).toThrow(
      'Una fila del archivo tiene demasiadas columnas',
    );
  });
});
