import { describe, expect, it } from 'vitest';
import {
  FILE_FORMAT_MESSAGE,
  FILE_TOO_LARGE_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
  canValidate,
  checkFile,
  columnLabel,
  commitAnnouncement,
  commitRowErrors,
  countsText,
  importErrorMessage,
  importReducer,
  initialImportState,
  parseCommitResult,
  sheetBlob,
  parseImportReport,
  parseRowErrors,
  previewAnnouncement,
  templateHref,
  typeChangeMessage,
  type ImportEvent,
  type ImportReport,
  type ImportState,
} from './import-machine';

const SHEET = {
  filename: 'credenciales-students-2026-11-05.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  base64: 'aG9sYQ==',
};

const SHA = 'a'.repeat(64);

const report = (over: Partial<ImportReport> = {}): ImportReport => ({
  type: 'students',
  format: 'csv',
  sha256: SHA,
  totalRows: 2,
  validRows: 2,
  errorRows: 0,
  errors: [],
  errorsTruncated: false,
  summary: { users: 2, enrollments: 2, links: 0 },
  canConfirm: true,
  ...over,
});

const badReport = report({
  validRows: 1,
  errorRows: 1,
  canConfirm: false,
  errors: [{ row: 3, column: 'dni', code: 'INVALID_DNI', message: 'El DNI no es válido' }],
  summary: { users: 1, enrollments: 1, links: 0 },
});

const run = (events: ImportEvent[], from: ImportState = initialImportState()) =>
  events.reduce(importReducer, from);

const okFile = { type: 'FILE_CHANGED', file: { size: 100, name: 'a.csv' } } as const;

describe('checkFile', () => {
  it('rechaza más de 1 MiB, extensión no admitida y vacío', () => {
    expect(checkFile({ size: 1_048_576, name: 'a.xlsx' })).toBeNull();
    expect(checkFile({ size: 1_048_577, name: 'a.xlsx' })).toBe(FILE_TOO_LARGE_MESSAGE);
    expect(checkFile({ size: 10, name: 'A.CSV' })).toBeNull();
    expect(checkFile({ size: 10, name: 'a.xls' })).toBe(FILE_FORMAT_MESSAGE);
    expect(checkFile({ size: 10, name: 'a.csv.exe' })).toBe(FILE_FORMAT_MESSAGE);
    expect(checkFile({ size: 10, name: 'csv' })).toBe(FILE_FORMAT_MESSAGE);
    expect(checkFile({ size: 0, name: 'a.csv' })).toBe('El archivo está vacío');
  });
});

describe('importReducer', () => {
  it('idle → validando → confirmable → confirmando → hecho', () => {
    let s = run([okFile]);
    expect(s).toMatchObject({ phase: 'idle', hasFile: true, fileError: null });
    expect(canValidate(s)).toBe(true);
    s = importReducer(s, { type: 'VALIDATE' });
    expect(s.phase).toBe('validando');
    s = importReducer(s, { type: 'PREVIEW_OK', report: report() });
    expect(s.phase).toBe('confirmable');
    s = importReducer(s, { type: 'CONFIRM' });
    expect(s.phase).toBe('confirmando');
    const result = {
      type: 'students' as const,
      created: { users: 2, enrollments: 2, links: 0 },
      credentialsSheet: SHEET,
    };
    s = importReducer(s, { type: 'COMMIT_OK', result });
    expect(s).toMatchObject({ phase: 'hecho', result });
    expect(canValidate(s)).toBe(false);
  });

  it('un reporte con errores queda en reporte y no se puede confirmar', () => {
    const s = run([okFile, { type: 'VALIDATE' }, { type: 'PREVIEW_OK', report: badReport }]);
    expect(s.phase).toBe('reporte');
    expect(s.rowErrors).toHaveLength(1);
    expect(importReducer(s, { type: 'CONFIRM' })).toBe(s);
    expect(canValidate(s)).toBe(true);
  });

  it('archivo > 1 MiB o de otra extensión se rechaza sin subirlo', () => {
    const big = run([{ type: 'FILE_CHANGED', file: { size: 2_000_000, name: 'a.xlsx' } }]);
    expect(big).toMatchObject({ phase: 'idle', hasFile: false, fileError: FILE_TOO_LARGE_MESSAGE });
    expect(canValidate(big)).toBe(false);
    expect(importReducer(big, { type: 'VALIDATE' })).toBe(big);
    const ods = run([{ type: 'FILE_CHANGED', file: { size: 10, name: 'a.ods' } }]);
    expect(ods.fileError).toBe(FILE_FORMAT_MESSAGE);
  });

  it('sin archivo no valida', () => {
    const s = initialImportState();
    expect(importReducer(s, { type: 'VALIDATE' })).toBe(s);
  });

  it('cambiar el archivo o el tipo descarta el reporte', () => {
    const withReport = run([
      okFile,
      { type: 'VALIDATE' },
      { type: 'PREVIEW_OK', report: report() },
    ]);
    const otherFile = importReducer(withReport, okFile);
    expect(otherFile).toMatchObject({ phase: 'idle', report: null, rowErrors: [], hasFile: true });
    const otherType = importReducer(withReport, { type: 'TYPE_CHANGED', importType: 'teachers' });
    expect(otherType).toMatchObject({
      phase: 'idle',
      report: null,
      type: 'teachers',
      hasFile: true,
    });
    // Mismo tipo: no cambia nada.
    expect(importReducer(withReport, { type: 'TYPE_CHANGED', importType: 'students' })).toBe(
      withReport,
    );
    // Quitar el archivo.
    expect(importReducer(withReport, { type: 'FILE_CHANGED', file: null })).toMatchObject({
      phase: 'idle',
      hasFile: false,
      report: null,
    });
  });

  it('no cambia tipo ni archivo mientras valida o confirma', () => {
    const busy = run([okFile, { type: 'VALIDATE' }]);
    expect(importReducer(busy, { type: 'TYPE_CHANGED', importType: 'guardians' })).toBe(busy);
    expect(importReducer(busy, okFile)).toBe(busy);
    expect(importReducer(busy, { type: 'VALIDATE' })).toBe(busy);
  });

  it('error de la vista previa vuelve a idle con el mensaje', () => {
    const s = run([okFile, { type: 'VALIDATE' }, { type: 'PREVIEW_FAILED', message: 'x' }]);
    expect(s).toMatchObject({ phase: 'idle', message: 'x', hasFile: true, report: null });
    expect(canValidate(s)).toBe(true);
  });

  it('ignora respuestas fuera de fase', () => {
    const idle = run([okFile]);
    expect(importReducer(idle, { type: 'PREVIEW_OK', report: report() })).toBe(idle);
    expect(importReducer(idle, { type: 'PREVIEW_FAILED', message: 'x' })).toBe(idle);
    expect(
      importReducer(idle, {
        type: 'COMMIT_OK',
        result: {
          type: 'students',
          created: { users: 1, enrollments: 1, links: 0 },
          credentialsSheet: SHEET,
        },
      }),
    ).toBe(idle);
    expect(importReducer(idle, { type: 'COMMIT_FAILED', status: 409, message: 'x' })).toBe(idle);
  });

  const confirming = () =>
    run([
      okFile,
      { type: 'VALIDATE' },
      { type: 'PREVIEW_OK', report: report() },
      { type: 'CONFIRM' },
    ]);

  it('409 en el commit vuelve a reporte (hay que validar otra vez)', () => {
    const s = importReducer(confirming(), { type: 'COMMIT_FAILED', status: 409, message: 'sha' });
    expect(s).toMatchObject({ phase: 'reporte', message: 'sha' });
    expect(s.report).not.toBeNull();
    expect(importReducer(s, { type: 'CONFIRM' })).toBe(s);
    expect(importReducer(s, { type: 'VALIDATE' }).phase).toBe('validando');
  });

  it('422 en el commit muestra los details en la tabla', () => {
    const details = [{ row: 2, column: 'dni', code: 'DNI_TAKEN', message: 'Ya existe' }];
    const s = importReducer(confirming(), {
      type: 'COMMIT_FAILED',
      status: 422,
      message: 'no',
      rowErrors: details,
    });
    expect(s).toMatchObject({ phase: 'reporte', rowErrors: details, rowErrorsTruncated: false });
  });

  it('429, 401, 403, 5xx o red dejan reintentar la confirmación', () => {
    for (const status of [0, 401, 403, 429, 500, 502]) {
      const s = importReducer(confirming(), { type: 'COMMIT_FAILED', status, message: 'm' });
      expect(s).toMatchObject({ phase: 'confirmable', message: 'm' });
      expect(importReducer(s, { type: 'CONFIRM' }).phase).toBe('confirmando');
    }
  });

  it('RESET vuelve al inicio conservando el tipo', () => {
    const s = importReducer(run([{ type: 'TYPE_CHANGED', importType: 'guardians' }, okFile]), {
      type: 'RESET',
    });
    expect(s).toEqual(initialImportState('guardians'));
  });
});

describe('parseImportReport', () => {
  it('acepta un reporte válido', () => {
    expect(parseImportReport(report())).toEqual(report());
    expect(parseImportReport(badReport)).toEqual(badReport);
  });

  it('rechaza formas incorrectas', () => {
    for (const bad of [
      null,
      'x',
      [],
      { ...report(), type: 'admins' },
      { ...report(), format: 'xls' },
      { ...report(), sha256: 'A'.repeat(64) },
      { ...report(), sha256: 'a'.repeat(63) },
      { ...report(), totalRows: -1 },
      { ...report(), validRows: 1.5 },
      { ...report(), errorRows: '0' },
      { ...report(), canConfirm: 'true' },
      { ...report(), errors: null },
      { ...report(), summary: { users: 1, enrollments: 1 } },
    ]) {
      expect(parseImportReport(bad)).toBeNull();
    }
  });

  it('no permite confirmar si hay errores aunque la API diga canConfirm', () => {
    expect(parseImportReport({ ...badReport, canConfirm: true })?.canConfirm).toBe(false);
    expect(parseImportReport({ ...report(), errorRows: 1 })?.canConfirm).toBe(false);
  });
});

describe('parseRowErrors / commitRowErrors', () => {
  it('descarta entradas mal formadas y limita a 500', () => {
    expect(
      parseRowErrors([
        { row: 2, column: null, code: 'EXTRA_CELLS', message: 'm' },
        { row: 0, column: 'x', code: 'c', message: 'm' },
        { row: 2, column: 5, code: 'c', message: 'm' },
        { row: 2, code: 'c', message: 'm' },
        { row: 2, column: 'x', code: 'c', message: '' },
        { row: 2, column: 'x', message: 'sin código' },
        'texto',
      ]),
    ).toEqual([
      { row: 2, column: null, code: 'EXTRA_CELLS', message: 'm' },
      { row: 2, column: 'x', code: 'ERROR', message: 'sin código' },
    ]);
    const many = Array.from({ length: 600 }, (_, i) => ({
      row: i + 2,
      column: 'c',
      code: 'X',
      message: 'm',
    }));
    expect(parseRowErrors(many)).toHaveLength(500);
    expect(parseRowErrors('no')).toEqual([]);
  });

  it('lee los details del 422', () => {
    const body = {
      error: {
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Solicitud invalida',
        details: [{ row: 4, column: 'dni', code: 'DNI_TAKEN', message: 'Ya existe' }],
      },
    };
    expect(commitRowErrors(body)).toEqual([
      { row: 4, column: 'dni', code: 'DNI_TAKEN', message: 'Ya existe' },
    ]);
    expect(commitRowErrors(null)).toEqual([]);
    expect(commitRowErrors({ error: 'x' })).toEqual([]);
  });
});

describe('parseCommitResult', () => {
  it('valida la forma', () => {
    const ok = {
      type: 'guardians',
      created: { users: 1, enrollments: 0, links: 2 },
      credentialsSheet: SHEET,
    };
    expect(parseCommitResult(ok)).toEqual(ok);
    expect(parseCommitResult({ ...ok, type: 'x' })).toBeNull();
    expect(parseCommitResult({ ...ok, created: { users: 1, enrollments: 0 } })).toBeNull();
    expect(parseCommitResult(null)).toBeNull();
  });

  it('RF-76: sin cuentas nuevas la hoja es nula; con cuentas nuevas es obligatoria y valida', () => {
    const none = { type: 'guardians', created: { users: 0, enrollments: 0, links: 1 } };
    expect(parseCommitResult({ ...none, credentialsSheet: null })).toEqual({
      ...none,
      credentialsSheet: null,
    });
    expect(parseCommitResult(none)).toMatchObject({ credentialsSheet: null });
    const some = { type: 'teachers', created: { users: 1, enrollments: 0, links: 0 } };
    expect(parseCommitResult(some)).toBeNull();
    expect(parseCommitResult({ ...some, credentialsSheet: null })).toBeNull();
    for (const bad of [
      { ...SHEET, filename: '../x.xlsx' },
      { ...SHEET, filename: 'hoja.exe' },
      { ...SHEET, contentType: 'text/html' },
      { ...SHEET, base64: 'no es base64!' },
      { ...SHEET, base64: '' },
      'texto',
    ]) {
      expect(parseCommitResult({ ...some, credentialsSheet: bad })).toBeNull();
    }
  });

  it('RF-76: sheetBlob decodifica la hoja desde la memoria', async () => {
    const blob = sheetBlob(SHEET);
    expect(blob?.type).toBe(SHEET.contentType);
    expect(await blob?.text()).toBe('hola');
    expect(sheetBlob({ ...SHEET, base64: '%%%' })).toBeNull();
  });
});

describe('importErrorMessage', () => {
  const env = (message: string, code = 'CONFLICT') => ({ error: { code, message, details: [] } });

  it('textos propios para 413 y 429', () => {
    expect(importErrorMessage(413, env('File too large'))).toBe('El archivo supera 1 MiB');
    expect(importErrorMessage(429, env('ThrottlerException', 'ERROR'))).toBe(
      TOO_MANY_REQUESTS_MESSAGE,
    );
    expect(TOO_MANY_REQUESTS_MESSAGE).toBe('Demasiados intentos; espera un minuto');
  });

  it('409, 400 y 415 usan el mensaje fijo de la API', () => {
    const sha = 'El archivo no coincide con el de la vista previa; vuelve a validarlo';
    expect(importErrorMessage(409, env(sha))).toBe(sha);
    expect(importErrorMessage(400, env('El archivo está vacío', 'VALIDATION_ERROR'))).toBe(
      'El archivo está vacío',
    );
    expect(importErrorMessage(415, env('No se admiten archivos con macros'))).toBe(
      'No se admiten archivos con macros',
    );
    expect(importErrorMessage(415, null)).toBe(FILE_FORMAT_MESSAGE);
  });

  it('422 con el genérico de la API da un texto propio', () => {
    expect(importErrorMessage(422, env('Solicitud invalida', 'BUSINESS_RULE_VIOLATION'))).toBe(
      'El archivo tiene errores; no se importó nada. Revisa la tabla.',
    );
  });

  it('401, 403, 5xx y red sin texto del servidor', () => {
    expect(importErrorMessage(401, env('Unauthorized'), { isProduction: true })).toMatch(
      /Inicia sesión/,
    );
    expect(importErrorMessage(401, null, { isProduction: false })).toMatch(/dev-session/);
    expect(importErrorMessage(403, env('Forbidden resource'))).toBe(
      'No tienes permiso para realizar esta acción.',
    );
    expect(importErrorMessage(502, env('secreto'))).not.toMatch(/secreto/);
    expect(importErrorMessage(0, null)).toMatch(/conectar/);
  });
});

describe('casos límite adicionales (QA 5c)', () => {
  const confirming = () =>
    run([
      okFile,
      { type: 'VALIDATE' },
      { type: 'PREVIEW_OK', report: report() },
      { type: 'CONFIRM' },
    ]);

  it('RF-21: 422 sin details conserva los errores del reporte; con 500 details marca truncado', () => {
    const noDetails = importReducer(confirming(), {
      type: 'COMMIT_FAILED',
      status: 422,
      message: 'm',
    });
    expect(noDetails.phase).toBe('reporte');
    expect(noDetails.rowErrorsTruncated).toBe(false);
    const many = Array.from({ length: 500 }, (_, i) => ({
      row: i + 2,
      column: 'c',
      code: 'X',
      message: 'm',
    }));
    const s = importReducer(confirming(), {
      type: 'COMMIT_FAILED',
      status: 422,
      message: 'm',
      rowErrors: many,
    });
    expect(s.rowErrorsTruncated).toBe(true);
  });

  it('RF-21: 400, 413 y 415 en el commit vuelven a reporte', () => {
    for (const status of [400, 413, 415]) {
      expect(
        importReducer(confirming(), { type: 'COMMIT_FAILED', status, message: 'm' }).phase,
      ).toBe('reporte');
    }
  });

  it('RF-21: tras hecho, elegir otro archivo reinicia y RESET se permite', () => {
    const done = importReducer(confirming(), {
      type: 'COMMIT_OK',
      result: {
        type: 'students',
        created: { users: 2, enrollments: 2, links: 0 },
        credentialsSheet: SHEET,
      },
    });
    expect(importReducer(done, okFile)).toMatchObject({ phase: 'idle', result: null });
    expect(importReducer(done, { type: 'RESET' }).phase).toBe('idle');
    expect(importReducer(done, { type: 'CONFIRM' })).toBe(done);
  });

  it('RF-21: no se confirma dos veces ni durante confirmando', () => {
    const s = confirming();
    expect(importReducer(s, { type: 'CONFIRM' })).toBe(s);
    expect(canValidate(s)).toBe(false);
  });

  it('RF-21: un archivo inválido tras un reporte descarta el reporte y bloquea validar', () => {
    const withReport = run([
      okFile,
      { type: 'VALIDATE' },
      { type: 'PREVIEW_OK', report: report() },
    ]);
    const s = importReducer(withReport, {
      type: 'FILE_CHANGED',
      file: { size: 5_000_000, name: 'x.csv' },
    });
    expect(s).toMatchObject({ phase: 'idle', report: null, hasFile: false });
    expect(s.fileError).toBe(FILE_TOO_LARGE_MESSAGE);
  });

  it('RF-21: parseImportReport conserva errorsTruncated y limita errores a 500', () => {
    const errors = Array.from({ length: 600 }, (_, i) => ({
      row: i + 2,
      column: 'c',
      code: 'X',
      message: 'm',
    }));
    const r = parseImportReport({ ...badReport, errors, errorsTruncated: true });
    expect(r?.errors).toHaveLength(500);
    expect(r?.errorsTruncated).toBe(true);
    expect(
      parseImportReport({ ...badReport, errors: [], errorRows: 1, canConfirm: true })?.canConfirm,
    ).toBe(false);
  });

  it('RF-21: sha256 con mayúsculas o 65 caracteres se rechaza', () => {
    expect(parseImportReport({ ...report(), sha256: 'a'.repeat(65) })).toBeNull();
  });

  it('RNF-24: mensajes de error por fila con texto demasiado largo se descartan', () => {
    expect(parseRowErrors([{ row: 2, column: 'x', code: 'c', message: 'a'.repeat(301) }])).toEqual(
      [],
    );
    expect(parseRowErrors([{ row: 2, column: 'x'.repeat(65), code: 'c', message: 'm' }])).toEqual(
      [],
    );
  });

  it('RF-21: concordancia de singular y plural en los anuncios', () => {
    expect(
      previewAnnouncement(
        report({ totalRows: 1, summary: { users: 1, enrollments: 1, links: 0 } }),
      ),
    ).toBe(
      'Validación terminada: 1 fila sin errores. Se creará 1 usuario y 1 matrícula al confirmar.',
    );
    expect(
      commitAnnouncement({
        type: 'guardians',
        created: { users: 2, enrollments: 0, links: 1 },
        credentialsSheet: SHEET,
      }),
    ).toBe(
      'Importación terminada. Se crearon 2 usuarios y 1 vínculo. Descarga la hoja de credenciales: no se vuelve a mostrar.',
    );
  });
});

describe('textos', () => {
  it('countsText según el tipo', () => {
    const c = { users: 1, enrollments: 1, links: 3 };
    expect(countsText('students', c)).toBe('1 usuario y 1 matrícula');
    expect(countsText('teachers', { ...c, users: 2 })).toBe('2 usuarios');
    expect(countsText('guardians', c)).toBe('1 usuario y 3 vínculos');
  });

  it('anuncios de vista previa y commit', () => {
    expect(previewAnnouncement(report())).toBe(
      'Validación terminada: 2 filas sin errores. Se crearán 2 usuarios y 2 matrículas al confirmar.',
    );
    expect(previewAnnouncement(badReport)).toMatch(/1 con errores/);
    expect(
      commitAnnouncement({
        type: 'teachers',
        created: { users: 1, enrollments: 0, links: 0 },
        credentialsSheet: null,
      }),
    ).toBe('Importación terminada. Se creó 1 usuario.');
  });

  it('columnLabel y templateHref', () => {
    expect(columnLabel(null)).toBe('Toda la fila');
    expect(columnLabel('dni')).toBe('dni');
    expect(templateHref('guardians', 'csv')).toBe(
      '/admin/usuarios/importar/archivo/plantilla?type=guardians&format=csv',
    );
  });
});

describe('typeChangeMessage', () => {
  it('avisa solo si se descarta un reporte', () => {
    const withReport = run([
      okFile,
      { type: 'VALIDATE' },
      { type: 'PREVIEW_OK', report: report() },
    ]);
    expect(typeChangeMessage(withReport, 'teachers')).toMatch(/docentes.*Vuelve a validar/);
    expect(typeChangeMessage(withReport, 'students')).toBeNull();
    expect(typeChangeMessage(run([okFile]), 'teachers')).toBeNull();
    expect(typeChangeMessage(run([okFile, { type: 'VALIDATE' }]), 'teachers')).toBeNull();
  });
});
