import { createRequire } from 'node:module';
import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import { MIB } from './import.constants.js';
import { buildTemplate } from './import-template.js';
import { assertSafeXlsx } from './xlsx-guard.js';
import {
  buildZip,
  eocdRecord,
  extraBlock,
  inlineCell,
  localPart,
  minimalParts,
  rawXlsx,
  unicodePathExtra,
} from './zip-builder.mock-spec.js';

// Archivos maliciosos generados en la prueba (Decisión 7.1): nada binario en el repo.

// JSZip es el lector ZIP que usa ExcelJS (no es dependencia directa de la API): se carga desde
// exceljs para comprobar que los ataques del INFORME 3 (H1) existen de verdad contra él.
type JSZipFile = { name: string; async(type: 'string'): Promise<string> };
type JSZipLike = { loadAsync(data: Buffer): Promise<{ files: Record<string, JSZipFile> }> };
const requireHere = createRequire(import.meta.url);
const JSZip = createRequire(requireHere.resolve('exceljs'))('jszip') as JSZipLike;

/** Nombre → contenido de cada entrada, tal como las ve ExcelJS. */
async function jszipView(zip: Buffer): Promise<Record<string, string>> {
  const loaded = await JSZip.loadAsync(zip);
  const view: Record<string, string> = {};
  for (const file of Object.values(loaded.files)) view[file.name] = await file.async('string');
  return view;
}

const status = (fn: () => unknown): number | 'ok' => {
  try {
    fn();
    return 'ok';
  } catch (error: unknown) {
    if (error instanceof BadRequestException || error instanceof UnsupportedMediaTypeException) {
      return error.getStatus();
    }
    throw error;
  }
};
const guard = (zip: Buffer) => status(() => assertSafeXlsx(zip));

const XXE = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><sst>&a;</sst>';

describe('assertSafeXlsx (guard del ZIP)', () => {
  it('acepta las plantillas generadas por ExcelJS', async () => {
    for (const type of ['students', 'teachers', 'guardians'] as const) {
      const { body } = await buildTemplate(type, 'xlsx');
      const entries = assertSafeXlsx(body);
      expect(entries.map((e) => e.name)).toContain('xl/workbook.xml');
    }
  });

  it('acepta entradas sin compresión (método 0) y con descriptor de datos (flag 0x0008)', async () => {
    expect(guard(buildZip(minimalParts().map((p) => ({ ...p, method: 0 }))))).toBe('ok');
    const withDescriptor = buildZip(minimalParts().map((p) => ({ ...p, dataDescriptor: true })));
    expect(guard(withDescriptor)).toBe('ok');
    expect(Object.keys(await jszipView(withDescriptor))).toContain('xl/workbook.xml');
  });

  it('bomba ZIP de 30 MiB → 400 (descompresión real con presupuesto)', () => {
    const bomb = buildZip([
      ...minimalParts(),
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(30 * MIB, 0x41) },
    ]);
    expect(bomb.length).toBeLessThan(MIB);
    expect(guard(bomb)).toBe(400);
  });

  it('bomba con tamaño declarado mentiroso (1 byte) → 400 igual', () => {
    const bomb = buildZip([
      ...minimalParts(),
      { name: 'xl/sharedStrings.xml', data: Buffer.alloc(30 * MIB, 0x20), declaredSize: 1 },
    ]);
    expect(guard(bomb)).toBe(400);
  });

  it('una entrada de más de 4 MiB o varias que juntas superan 8 MiB → 400 (H2)', () => {
    const big = { name: 'xl/media/image1.png', data: Buffer.alloc(4 * MIB + 1, 0) };
    expect(guard(buildZip([...minimalParts(), big]))).toBe(400);
    const parts = Array.from({ length: 3 }, (_, i) => ({
      name: `xl/media/image${i}.png`,
      data: Buffer.alloc(3 * MIB, 0),
    }));
    expect(guard(buildZip([...minimalParts(), ...parts]))).toBe(400);
    expect(guard(buildZip([...minimalParts(), ...parts.slice(0, 2)]))).toBe('ok');
  });

  it('macros (xl/vbaProject.bin) → 415', () => {
    expect(guard(buildZip([...minimalParts(), { name: 'xl/vbaProject.bin', data: 'vba' }]))).toBe(
      415,
    );
  });

  it('DOCTYPE o ENTITY en un .xml o .rels → 415 (XXE)', () => {
    expect(guard(buildZip([...minimalParts(), { name: 'xl/sharedStrings.xml', data: XXE }]))).toBe(
      415,
    );
    const rels = { name: 'xl/_rels/workbook.xml.rels', data: '<!entity a "b">' };
    expect(guard(buildZip([...minimalParts(), rels]))).toBe(415);
    const utf16 = Buffer.from('<?xml version="1.0"?><!DOCTYPE x>', 'utf16le');
    expect(guard(buildZip([...minimalParts(), { name: 'xl/styles.xml', data: utf16 }]))).toBe(415);
  });

  it('el filtro XML cubre las partes que ExcelJS procesa con sus expresiones sin anclar', () => {
    for (const name of [
      'xl/worksheets/sheet1.xml.bin',
      'xl/drawings/vmlDrawing1.vmlx',
      'xl/media/xl/worksheets/sheet1.xml',
      'x/xl/comments1.xml',
      'xl/worksheets/_rels/sheet1.xml_rels',
      'xl/theme/theme1.xml',
      'xl/tables/table1.xml',
      'xl/drawings/drawing1.xml',
      'xl/drawings/_rels/drawing1.xml.rels',
      'docProps/app.xml',
      'docProps/core.xml',
      'XL/STYLES.XML',
    ]) {
      expect(guard(buildZip([...minimalParts(), { name, data: XXE }]))).toBe(415);
    }
    const others = minimalParts().filter((part) => part.name !== '_rels/.rels');
    expect(guard(buildZip([...others, { name: '_rels/.rels', data: XXE }]))).toBe(415);
  });

  it('H11: las partes que ExcelJS no procesa solo pasan tamaño y CRC (UTF-16 o DOCTYPE se aceptan)', () => {
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('<?xml version="1.0" encoding="UTF-16"?><ds:datastoreItem/>', 'utf16le'),
    ]);
    for (const name of [
      'customXml/item1.xml',
      'customXml/_rels/item1.xml.rels',
      'docProps/custom.xml',
    ]) {
      expect(guard(buildZip([...minimalParts(), { name, data: utf16 }]))).toBe('ok');
      expect(guard(buildZip([...minimalParts(), { name, data: XXE }]))).toBe('ok');
    }
    // Una hoja en UTF-16 sigue dando 415.
    expect(
      guard(buildZip([...minimalParts(), { name: 'xl/worksheets/sheet1.xml', data: utf16 }])),
    ).toBe(415);
    // El tamaño y el CRC se siguen comprobando en esas partes.
    const bad = { name: 'customXml/item1.xml', data: utf16, declaredCrc: 1 };
    expect(guard(buildZip([...minimalParts(), bad]))).toBe(400);
  });

  it('H4: parte XML que no empieza por BOM UTF-8, espacios o "<", con NUL o no UTF-8 → 415', () => {
    const part = (data: Buffer | string) =>
      guard(buildZip([...minimalParts(), { name: 'xl/styles.xml', data }]));
    expect(part('\uFEFF<?xml version="1.0"?><styleSheet/>')).toBe('ok');
    expect(part(' \r\n\t<styleSheet/>')).toBe('ok');
    expect(part('x<styleSheet/>')).toBe(415);
    expect(part('')).toBe(415);
    // UTF-16 con y sin BOM, UTF-32, y bytes que no son UTF-8.
    expect(part(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<a/>', 'utf16le')]))).toBe(
      415,
    );
    expect(part(Buffer.from('<a/>', 'utf16le'))).toBe(415);
    expect(part(Buffer.from([0x3c, 0, 0, 0]))).toBe(415);
    expect(
      part(Buffer.concat([Buffer.from('<a>'), Buffer.from([0xc3, 0x28]), Buffer.from('</a>')])),
    ).toBe(415);
    // EBCDIC: '<' es 0x4C.
    expect(part(Buffer.from([0x4c, 0x6f, 0x6e]))).toBe(415);
  });

  it('entrada cifrada (bit 0 del flag) → 415', () => {
    expect(
      guard(buildZip([...minimalParts(), { name: 'xl/secret.xml', data: 'x', flags: 1 }])),
    ).toBe(415);
  });

  it('ZIP64, multidisco o método de compresión no admitido → 415', () => {
    expect(guard(buildZip(minimalParts(), { zip64Locator: true }))).toBe(415);
    expect(guard(buildZip(minimalParts(), { diskNumber: 1 }))).toBe(415);
    expect(guard(buildZip([...minimalParts(), { name: 'xl/a.xml', data: 'x', method: 12 }]))).toBe(
      415,
    );
  });

  it('más de 100 entradas → 400', () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ name: `xl/p${i}.bin`, data: 'x' }));
    expect(guard(buildZip(many))).toBe(400);
  });

  it('rutas con .., ., segmentos vacíos, absolutas, con \\ o no ASCII → 400', () => {
    for (const name of [
      '../evil.xml',
      'xl/../../evil.xml',
      'xl/./workbook.xml',
      'xl//workbook.xml',
      '/etc/passwd',
      'C:/x.xml',
      'xl\\a.xml',
      'xl/hoja-ñ.xml',
    ]) {
      expect(guard(buildZip([...minimalParts(), { name, data: '<a/>' }]))).toBe(400);
    }
  });

  it('no es un ZIP, está truncado o los datos están corruptos → 400', () => {
    expect(guard(Buffer.from('hola, no soy un zip'))).toBe(400);
    const zip = buildZip(minimalParts());
    expect(guard(zip.subarray(0, zip.length - 30))).toBe(400);
    const corrupt = buildZip([...minimalParts(), { name: 'xl/a.xml', data: 'x'.repeat(200) }]);
    // Corrompe el flujo deflate de la última entrada (justo antes del directorio central).
    const cdStart = corrupt.readUInt32LE(corrupt.length - 6);
    corrupt.fill(0xff, cdStart - 8, cdStart);
    expect(guard(corrupt)).toBe(400);
  });

  it('CRC o tamaño descomprimido distintos de los declarados → 400', () => {
    expect(
      guard(buildZip([...minimalParts(), { name: 'xl/a.xml', data: '<a/>', declaredCrc: 1 }])),
    ).toBe(400);
    expect(
      guard(buildZip([...minimalParts(), { name: 'xl/a.xml', data: '<a/>', declaredSize: 3 }])),
    ).toBe(400);
  });

  describe('H1: el guard y JSZip ven las mismas entradas', () => {
    it('hueco entre el directorio central y el EOCD con offsets desplazados → 400 (JSZip leería otra entrada)', async () => {
      // Dos cabeceras locales del mismo tamaño con el mismo nombre: la inofensiva en 0 y la
      // maliciosa justo después. Dos directorios centrales: el declarado (que apunta a la
      // inofensiva) y otro desplazado tantos bytes como el hueco, que es el que lee JSZip.
      const name = 'xl/sharedStrings.xml';
      const evil = XXE;
      const safe = `<?xml version="1.0"?><sst>${'a'.repeat(evil.length - 32)}</sst>`;
      expect(safe.length).toBe(evil.length);
      const a = localPart({ name, data: safe, method: 0 });
      const b = localPart({ name, data: evil, method: 0 });
      const k = a.bytes.length;
      const cd1 = Buffer.from(a.central);
      cd1.writeUInt32LE(0, 42);
      const cd2 = Buffer.from(b.central);
      cd2.writeUInt32LE(0, 42); // JSZip le suma k → apunta a la maliciosa
      const filler = Buffer.alloc(k - cd1.length);
      const zip = Buffer.concat([
        a.bytes,
        b.bytes,
        cd1,
        filler,
        cd2,
        eocdRecord(1, cd1.length, 2 * k),
      ]);
      expect((await jszipView(zip))[name]).toBe(evil);
      expect(guard(zip)).toBe(400);
    });

    it('hueco simple entre el directorio central y el EOCD, datos sin referenciar o basura final → 400', () => {
      expect(guard(buildZip(minimalParts(), { gapAfterCd: Buffer.alloc(8) }))).toBe(400);
      expect(guard(buildZip(minimalParts(), { gapBeforeCd: Buffer.from('oculto') }))).toBe(400);
      expect(guard(buildZip(minimalParts(), { trailing: Buffer.from('x') }))).toBe(400);
      // Un EOCD falso dentro del comentario: JSZip tomaría el último.
      const fake = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
      expect(guard(buildZip(minimalParts(), { comment: fake }))).toBe(400);
      expect(guard(buildZip(minimalParts(), { comment: Buffer.from('ok') }))).toBe('ok');
    });

    it('campo extra 0x7075 (nombre Unicode) en el directorio o en la cabecera local → 415', async () => {
      const disguised = {
        name: 'xl/media/a.bin',
        data: XXE,
        centralExtra: unicodePathExtra('xl/media/a.bin', 'xl/sharedStrings.xml'),
      };
      const zip = buildZip([...minimalParts(), disguised]);
      // JSZip renombra la entrada y ExcelJS la leería como sharedStrings.
      expect((await jszipView(zip))['xl/sharedStrings.xml']).toBe(XXE);
      expect(guard(zip)).toBe(415);
      const local = { ...disguised, centralExtra: undefined, localExtra: disguised.centralExtra };
      expect(guard(buildZip([...minimalParts(), local]))).toBe(415);
    });

    it('campo extra mal formado → 400; otros campos extra bien formados se aceptan', () => {
      const ok = {
        name: 'xl/a.xml',
        data: '<a/>',
        centralExtra: extraBlock(0x5455, Buffer.alloc(5)),
      };
      expect(guard(buildZip([...minimalParts(), ok]))).toBe('ok');
      const bad = { ...ok, centralExtra: Buffer.from([0x55, 0x54, 0x09, 0x00, 0x01]) };
      expect(guard(buildZip([...minimalParts(), bad]))).toBe(400);
    });

    it('cabecera local con otro nombre que el directorio → 400 (JSZip usa el local)', async () => {
      const entry = { name: 'xl/media/a.bin', localName: 'xl/styles.xml1', data: XXE };
      const zip = buildZip([...minimalParts(), entry]);
      expect(Object.keys(await jszipView(zip))).toContain('xl/styles.xml1');
      expect(guard(zip)).toBe(400);
    });

    it('cabecera local con otro método, flags o tamaños → 400', () => {
      const base = buildZip([...minimalParts(), { name: 'xl/a.xml', data: '<a/>' }]);
      const cd = base.readUInt32LE(base.length - 6);
      const last = base.lastIndexOf(Buffer.from('xl/a.xml'), cd) - 30;
      for (const [offset, value] of [
        [6, 0x0800], // flags
        [8, 0], // método
        [18, 1], // tamaño comprimido
        [14, 7], // CRC
      ] as const) {
        const copy = Buffer.from(base);
        if (offset === 6 || offset === 8) copy.writeUInt16LE(value, last + offset);
        else copy.writeUInt32LE(value, last + offset);
        expect(guard(copy)).toBe(400);
      }
    });

    it('nombres repetidos → 400', () => {
      const dup = [...minimalParts(), { name: 'xl/workbook.xml', data: '<workbook/>' }];
      expect(guard(buildZip(dup))).toBe(400);
    });

    it('entradas que se solapan (bomba no recursiva) → 400', () => {
      const zip = buildZip(minimalParts());
      // Las tres entradas del directorio apuntan a la primera cabecera local.
      const cdStart = zip.readUInt32LE(zip.length - 6);
      let pos = cdStart;
      for (let i = 0; i < 3; i++) {
        zip.writeUInt32LE(0, pos + 42);
        pos += 46 + zip.readUInt16LE(pos + 28) + zip.readUInt16LE(pos + 30);
      }
      expect(guard(zip)).toBe(400);
    });
  });

  describe('H2: límites de estructura antes de ExcelJS', () => {
    const rows = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `<row r="${i + 1}">${inlineCell(`A${i + 1}`, 'x')}</row>`,
      ).join('');
    const sheet = (body: string, extra = '') => rawXlsx(`<sheetData>${body}</sheetData>${extra}`);

    it('5000 filas se aceptan; 5001 filas o una fila/celda después de la 5000 → 400', () => {
      expect(guard(sheet(rows(5000)))).toBe('ok');
      expect(guard(sheet(rows(5001)))).toBe(400);
      expect(guard(sheet(`<row r="5001">${inlineCell('A5001', 'x')}</row>`))).toBe(400);
      expect(guard(sheet(`<row r="1">${inlineCell('A5001', 'x')}</row>`))).toBe(400);
      expect(guard(sheet('<row r="1048576"/>'))).toBe(400);
    });

    it('más de 50 000 celdas → 400; referencias fuera de Excel o mal formadas → 400', () => {
      const wide = (lastRowExtra: string) =>
        Array.from({ length: 5000 }, (_, r) => {
          const cells = Array.from(
            { length: 10 },
            (_, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}"/>`,
          );
          return `<row r="${r + 1}">${cells.join('')}${r === 4999 ? lastRowExtra : ''}</row>`;
        }).join('');
      expect(guard(sheet(wide('')))).toBe('ok');
      expect(guard(sheet(wide('<c r="K5000"/>')))).toBe(400);
      expect(guard(sheet(`<row r="1">${inlineCell('XFE1', 'x')}</row>`))).toBe(400);
      expect(guard(sheet(`<row r="1">${inlineCell('a1', 'x')}</row>`))).toBe(400);
      expect(guard(sheet(`<row r="1">${inlineCell('XFD1', 'x')}</row>`))).toBe('ok');
      // El atributo se busca respetando comillas y entidades.
      expect(guard(sheet(`<row r="1"><c x=">" r="A9999"/></row>`))).toBe(400);
      expect(guard(sheet(`<row r="1"><c r="A&#57;999"/></row>`))).toBe(400);
      expect(guard(sheet(`<row r="1"><c r="A1&bogus;"/></row>`))).toBe(400);
    });

    it('<col> con max fuera de Excel → 400 (ExcelJS crea un objeto por columna)', () => {
      expect(guard(rawXlsx(`<cols><col min="1" max="16384" width="9"/></cols><sheetData/>`))).toBe(
        'ok',
      );
      expect(
        guard(rawXlsx(`<cols><col min="1" max="10000000" width="9"/></cols><sheetData/>`)),
      ).toBe(400);
    });

    it('combinaciones: una sobre toda la hoja, demasiadas o mal formadas → 400', () => {
      const merges = (refs: string[]) =>
        `<mergeCells>${refs.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`;
      expect(guard(sheet(rows(2), merges(['A1:B2'])))).toBe('ok');
      expect(guard(sheet(rows(1), merges(['A1:XFD5000'])))).toBe(400);
      expect(
        guard(sheet(rows(1), merges(Array.from({ length: 501 }, (_, i) => `A${i + 1}:B${i + 1}`)))),
      ).toBe(400);
      expect(guard(sheet(rows(1), merges(['A:B'])))).toBe(400);
    });

    it('validaciones de datos sobre columnas completas → 400; la de la plantilla pasa', () => {
      const dv = (sqref: string) =>
        `<dataValidations count="1"><dataValidation type="list" sqref="${sqref}"><formula1>"1,2"</formula1></dataValidation></dataValidations>`;
      expect(guard(sheet(rows(1), dv('C2:C1001')))).toBe('ok');
      expect(guard(sheet(rows(1), dv('C1:C1048576')))).toBe(400);
      expect(guard(sheet(rows(1), dv('A1:A2 C1:XFD9')))).toBe(400);
    });

    it('nombres definidos del libro: rangos enormes, fórmulas o contenido raro → 400', () => {
      const names = (content: string) =>
        rawXlsx(
          `<sheetData>${rows(1)}</sheetData>`,
          `<definedNames><definedName name="x">${content}</definedName></definedNames>`,
        );
      expect(guard(names('Datos!$A$1:$D$1001'))).toBe('ok');
      expect(guard(names(`'Hoja, 1'!$A$1,Datos!$1:$1,Datos!$A:$A,#REF!`))).toBe('ok');
      expect(guard(names('Datos!$A$1:$XFD$1048576'))).toBe(400);
      expect(guard(names('Datos!&#36;A&#36;1:&#36;XFD&#36;5000'))).toBe(400);
      expect(guard(names('OFFSET(Datos!$A$1,0,0,10,1)'))).toBe(400);
      expect(guard(names('<![CDATA[Datos!$A$1]]>'))).toBe(400);
    });
  });

  describe('ancho de filas: ExcelJS recorre el arreglo de celdas de cada fila hasta su última columna', () => {
    const sheetRows = (n: number, cells: (row: number) => string) =>
      rawXlsx(
        `<sheetData>${Array.from({ length: n }, (_, i) => `<row r="${i + 1}">${cells(i + 1)}</row>`).join('')}</sheetData>`,
      );

    it('5000 filas hasta la columna CV (100) se aceptan; hasta CW (101) → 400', () => {
      expect(guard(sheetRows(5000, (n) => `<c r="CV${n}"/>`))).toBe('ok');
      expect(guard(sheetRows(5000, (n) => `<c r="CW${n}"/>`))).toBe(400);
      expect(guard(sheetRows(31, (n) => `<c r="XFD${n}"/>`))).toBe(400);
    });

    it('las celdas sin r suman una columna cada una', () => {
      expect(guard(sheetRows(5000, (n) => `<c r="CU${n}"/><c/>`))).toBe('ok');
      expect(guard(sheetRows(5000, (n) => `<c r="CV${n}"/><c/>`))).toBe(400);
      // Una "fila" dentro de un comentario no reinicia la cuenta a la baja.
      expect(guard(sheetRows(5000, (n) => `<c r="CV${n}"/><!-- <row> --><c/>`))).toBe(400);
    });

    it('cada combinación cuenta sus filas hasta su columna derecha', () => {
      const merges = (refs: string[]) =>
        rawXlsx(
          `<sheetData/><mergeCells>${refs.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`,
        );
      expect(guard(merges(Array.from({ length: 30 }, (_, i) => `XFC${i + 1}:XFD${i + 1}`)))).toBe(
        'ok',
      );
      expect(guard(merges(Array.from({ length: 31 }, (_, i) => `XFC${i + 1}:XFD${i + 1}`)))).toBe(
        400,
      );
    });
  });

  describe('H9: hojas del libro (sheetId y localSheetId)', () => {
    const book = (sheets: string, extra = '') => guard(rawXlsx(`<sheetData/>`, extra, sheets));
    const sheetTag = (id: string, n = 1) => `<sheet name="H${n}" sheetId="${id}" r:id="rId1"/>`;

    it('sheetId de 1 a 1000 se acepta; mayor, no numérico, ausente o repetido → 400', () => {
      expect(book(sheetTag('1'))).toBe('ok');
      expect(book(sheetTag('1000'))).toBe('ok');
      for (const id of ['1001', '4294967294', '99999', '-1', '1e9', '12abc', ' 1', '0x10', '']) {
        expect(book(sheetTag(id))).toBe(400);
      }
      expect(book('<sheet name="H" r:id="rId1"/>')).toBe(400);
      expect(book('<sheet name="H" sheetId="1" sheetId="2" r:id="rId1"/>')).toBe(400);
      expect(book(`${sheetTag('1', 1)}${sheetTag('01', 2)}`)).toBe(400);
      // Con prefijo, mayúsculas, comillas simples o entidades también se revisa.
      expect(book(`<x:sheet name="H" x:sheetId='4294967294' r:id="rId1"/>`)).toBe(400);
      expect(book('<SHEET name="H" SHEETID="5000" r:id="rId1"/>')).toBe(400);
      expect(book('<sheet name="H" sheetId="&#52;294967294" r:id="rId1"/>')).toBe(400);
    });

    it('hasta 50 hojas; 51 → 400', () => {
      const many = (n: number) =>
        Array.from({ length: n }, (_, i) => sheetTag(String(i + 1), i + 1)).join('');
      expect(book(many(50))).toBe('ok');
      expect(book(many(51))).toBe(400);
    });

    it('localSheetId de los nombres definidos: de cifras y ≤ 1000', () => {
      const name = (attrs: string) =>
        book(
          sheetTag('1'),
          `<definedNames><definedName name="_xlnm.Print_Area" ${attrs}>Datos!$A$1:$B$2</definedName><definedName name="y" ${attrs}/></definedNames>`,
        );
      expect(name('localSheetId="0"')).toBe('ok');
      expect(name('localSheetId="1000"')).toBe('ok');
      expect(name('')).toBe('ok');
      for (const id of ['1001', '4294967294', 'x', '1.5']) {
        expect(name(`localSheetId="${id}"`)).toBe(400);
      }
    });
  });

  describe('H10: presupuesto global de columnas', () => {
    const SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const extraSheets = (n: number, body: string) =>
      Array.from({ length: n }, (_, i) => ({
        name: `xl/worksheets/sheet${i + 2}.xml`,
        data: `<?xml version="1.0"?><worksheet xmlns="${SHEET_NS}">${body}</worksheet>`,
      }));
    const wideCols = '<cols><col min="1" max="16384" width="9"/></cols><sheetData/>';

    it('3 hojas con 16 384 columnas se aceptan; 4 → 400 (aunque ninguna hoja pase el tope)', () => {
      expect(guard(rawXlsx(wideCols, '', undefined, extraSheets(2, wideCols)))).toBe('ok');
      expect(guard(rawXlsx(wideCols, '', undefined, extraSheets(3, wideCols)))).toBe(400);
      // 90 hojas con <col max="16384"> (INFORME 7): ~1,5 millones de columnas en ExcelJS.
      expect(
        guard(
          rawXlsx(
            wideCols,
            '',
            undefined,
            extraSheets(89, '<cols><col min="16384" max="16384"/></cols>'),
          ),
        ),
      ).toBe(400);
    });

    it('también cuentan las celdas y las combinaciones en columnas lejanas', () => {
      const farCell = `<sheetData><row r="1">${inlineCell('XFD1', 'x')}</row></sheetData>`;
      const farMerge = '<sheetData/><mergeCells><mergeCell ref="XFC1:XFD1"/></mergeCells>';
      expect(guard(rawXlsx(farCell, '', undefined, extraSheets(2, farCell)))).toBe('ok');
      expect(guard(rawXlsx(farCell, '', undefined, extraSheets(3, farCell)))).toBe(400);
      expect(guard(rawXlsx(farMerge, '', undefined, extraSheets(3, farMerge)))).toBe(400);
      // Columnas cercanas en muchas hojas: sin problema.
      const near = `<sheetData><row r="1">${inlineCell('J1', 'x')}</row></sheetData>`;
      expect(guard(rawXlsx(near, '', undefined, extraSheets(90, near)))).toBe('ok');
    });
  });
});
