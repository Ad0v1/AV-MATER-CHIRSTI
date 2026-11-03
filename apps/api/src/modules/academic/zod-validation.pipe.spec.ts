import { BadRequestException } from '@nestjs/common';
import {
  closePeriodSchema,
  createSectionSchema,
  createYearSchema,
  idSchema,
  listCoursesQuerySchema,
  reopenPeriodSchema,
  updatePeriodSchema,
} from './academic.dto.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const errorBody = (fn: () => unknown): { message: { path: string; message: string }[] } => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
      message: { path: string; message: string }[];
    };
  }
  throw new Error('se esperaba un error de validación');
};

const fourPeriods = [1, 2, 3, 4].map((sequence) => ({
  sequence,
  startDate: `2095-0${sequence + 1}-01`,
  endDate: `2095-0${sequence + 1}-20`,
}));

describe('ZodValidationPipe', () => {
  it('devuelve el valor transformado si es válido', () => {
    const pipe = new ZodValidationPipe(createSectionSchema);
    expect(pipe.transform({ gradeLevel: 3, code: ' c ' })).toEqual({ gradeLevel: 3, code: 'C' });
  });

  it('400 con details [{ path, message }] en español', () => {
    const body = errorBody(() =>
      new ZodValidationPipe(createSectionSchema).transform({ gradeLevel: 9, code: 'a-b' }),
    );
    expect(body.message.map((d) => d.path)).toEqual(['gradeLevel', 'code']);
    expect(body.message[0].message).toMatch(/[áéíóúñ]|debe|esperaba/i);
  });

  it('valida ids UUID en los parámetros', () => {
    expect(() => new ZodValidationPipe(idSchema).transform('no-es-uuid')).toThrow(
      BadRequestException,
    );
  });
});

describe('esquemas del módulo académico', () => {
  it('RF-09: exige exactamente 4 períodos sin secuencias repetidas', () => {
    const pipe = new ZodValidationPipe(createYearSchema);
    expect(pipe.transform({ year: 2095, periods: fourPeriods }).periods).toHaveLength(4);
    expect(() => pipe.transform({ year: 2095, periods: fourPeriods.slice(0, 3) })).toThrow(
      BadRequestException,
    );
    const repeated = [...fourPeriods.slice(0, 3), { ...fourPeriods[3], sequence: 1 }];
    expect(() => pipe.transform({ year: 2095, periods: repeated })).toThrow(BadRequestException);
    expect(() => pipe.transform({ year: 1999, periods: fourPeriods })).toThrow(BadRequestException);
  });

  it('RF-09: las fechas son YYYY-MM-DD', () => {
    const bad = [{ ...fourPeriods[0], startDate: '01/03/2095' }, ...fourPeriods.slice(1)];
    expect(() =>
      new ZodValidationPipe(createYearSchema).transform({ year: 2095, periods: bad }),
    ).toThrow(BadRequestException);
  });

  it('RF-10: PATCH de período exige al menos un campo', () => {
    expect(() => new ZodValidationPipe(updatePeriodSchema).transform({})).toThrow(
      BadRequestException,
    );
  });

  it('RF-11 / RN-10: reabrir exige motivo de 10 a 500 caracteres', () => {
    const pipe = new ZodValidationPipe(reopenPeriodSchema);
    expect(() => pipe.transform({})).toThrow(BadRequestException);
    expect(() => pipe.transform({ reason: '   corto   ' })).toThrow(BadRequestException);
    expect(pipe.transform({ reason: 'Corrección de notas' })).toEqual({
      reason: 'Corrección de notas',
    });
  });

  it('RF-11: cerrar acepta cuerpo vacío', () => {
    expect(new ZodValidationPipe(closePeriodSchema).transform(undefined)).toEqual({});
  });

  it('RF-13: includeInactive es false por defecto', () => {
    const pipe = new ZodValidationPipe(listCoursesQuerySchema);
    expect(pipe.transform({})).toEqual({ includeInactive: false });
    expect(pipe.transform({ includeInactive: 'true' })).toEqual({ includeInactive: true });
    expect(() => pipe.transform({ includeInactive: 'si' })).toThrow(BadRequestException);
  });
});
