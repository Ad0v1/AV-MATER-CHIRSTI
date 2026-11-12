import { describe, expect, it } from 'vitest';
import {
  gradeLabel,
  gradesForLevel,
  isValidGradeForLevel,
  nextGrade,
  scaleForLevel,
} from './levels';

describe('levels', () => {
  it('valida el rango por nivel', () => {
    expect(isValidGradeForLevel('INICIAL', 3)).toBe(true);
    expect(isValidGradeForLevel('INICIAL', 2)).toBe(false);
    expect(isValidGradeForLevel('PRIMARIA', 6)).toBe(true);
    expect(isValidGradeForLevel('SECUNDARIA', 6)).toBe(false);
    expect(isValidGradeForLevel('SECUNDARIA', 1.5)).toBe(false);
    expect(gradesForLevel('INICIAL')).toEqual([3, 4, 5]);
  });
  it('arma etiquetas legibles', () => {
    expect(gradeLabel('INICIAL', 5)).toBe('5 años');
    expect(gradeLabel('PRIMARIA', 3)).toBe('3.° Primaria');
    expect(gradeLabel('SECUNDARIA', 2)).toBe('2.° Secundaria');
  });
  it('promueve entre niveles y egresa al final de secundaria', () => {
    expect(nextGrade('INICIAL', 4)).toEqual({ level: 'INICIAL', gradeLevel: 5 });
    expect(nextGrade('INICIAL', 5)).toEqual({ level: 'PRIMARIA', gradeLevel: 1 });
    expect(nextGrade('PRIMARIA', 6)).toEqual({ level: 'SECUNDARIA', gradeLevel: 1 });
    expect(nextGrade('SECUNDARIA', 5)).toBeNull();
  });
  it('resuelve la escala por nivel', () => {
    expect(scaleForLevel('INICIAL')).toBe('LITERAL_ADABC');
    expect(scaleForLevel('PRIMARIA')).toBe('LITERAL_ADABC');
    expect(scaleForLevel('SECUNDARIA')).toBe('NUMERIC_0_20');
  });
});
