'use server';

// Escrituras de /admin/estructura (RF-09..14, RF-17) como Server Actions (D-037).
// La API comprueba sesión, rol ADMIN y reglas (RN-10/11); aquí solo se valida la forma para
// dar mensajes junto al campo. Tras escribir se refresca el router (`refresh`).
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, detailMessages, toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { cloneSuccessMessage, parseCloneForm, type CloneStructureResult } from './clone';
import { parseCommitInput, type PromotionResult } from './promotion-machine';
import type { ActionState, YearDetail } from './types';
import {
  PERIOD_COUNT,
  REASON_LIMITS,
  isDateOnly,
  isStrictBoolean,
  isUuid,
  normalizeCourseName,
  normalizeSectionCode,
  parseYear,
  periodPathLabel,
  validatePeriodDrafts,
  validateReason,
  type PeriodDraft,
} from './validation';

const text = (fd: FormData, name: string): string => {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
};

const enc = (value: string): string => encodeURIComponent(value);

const invalid = (message: string): ActionState => ({ status: 'error', message });

const fieldError = (
  fieldErrors: Record<string, string>,
  values?: Record<string, string>,
): ActionState => ({
  status: 'error',
  message: 'Revisa los campos marcados.',
  fieldErrors,
  values,
});

/** Ejecuta la llamada; traduce errores de la API y refresca la vista si todo salió bien. */
async function run(
  call: () => Promise<unknown>,
  okMessage: string,
  values?: Record<string, string>,
): Promise<ActionState> {
  try {
    await call();
  } catch (error) {
    return {
      status: 'error',
      message: toUserMessage(error),
      details: detailMessages(error, periodPathLabel),
      values,
    };
  }
  refresh();
  return { status: 'ok', message: okMessage };
}

const BAD_ID = 'El identificador no es válido. Vuelve a cargar la página.';

// --- Años (RF-09, RF-10, RF-12) ---------------------------------------------

export async function createYearAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values: Record<string, string> = { year: text(fd, 'year') };
  const periods: PeriodDraft[] = [];
  for (let s = 1; s <= PERIOD_COUNT; s++) {
    values[`p${s}_start`] = text(fd, `p${s}_start`);
    values[`p${s}_end`] = text(fd, `p${s}_end`);
    periods.push({ sequence: s, startDate: values[`p${s}_start`], endDate: values[`p${s}_end`] });
  }
  const year = parseYear(values.year);
  if (year === null) return fieldError({ year: 'Ingresa un año entre 2000 y 2100.' }, values);
  const errors = validatePeriodDrafts(year, periods);
  if (Object.keys(errors).length > 0) return fieldError(errors, values);

  let created: YearDetail;
  try {
    created = await apiServer.post<YearDetail>('/academic-years', { year, periods });
  } catch (error) {
    return {
      status: 'error',
      message: toUserMessage(error),
      details: detailMessages(error, periodPathLabel),
      values,
    };
  }
  // redirect lanza: va fuera del try.
  redirect(`/admin/estructura/anios/${enc(created.id)}`);
}

export async function updateYearAction(
  yearId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(yearId)) return invalid(BAD_ID);
  const values = { year: text(fd, 'year') };
  const year = parseYear(values.year);
  if (year === null) return fieldError({ year: 'Ingresa un año entre 2000 y 2100.' }, values);
  return run(
    () => apiServer.patch(`/academic-years/${enc(yearId)}`, { year }),
    'Año actualizado.',
    values,
  );
}

export async function activateYearAction(yearId: string): Promise<ActionState> {
  if (!isUuid(yearId)) return invalid(BAD_ID);
  return run(
    () => apiServer.post(`/academic-years/${enc(yearId)}/activate`),
    'El año quedó como año activo.',
  );
}

export async function closeYearAction(yearId: string): Promise<ActionState> {
  if (!isUuid(yearId)) return invalid(BAD_ID);
  return run(() => apiServer.post(`/academic-years/${enc(yearId)}/close`), 'El año quedó cerrado.');
}

// --- Clonar estructura (RF-15) ----------------------------------------------

/** Estado de la acción de clonar: además del mensaje, el resultado para mostrarlo en pantalla. */
export type CloneActionState = ActionState & { result?: CloneStructureResult };

export async function cloneStructureAction(
  targetYearId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<CloneActionState> {
  if (!isUuid(targetYearId)) return invalid(BAD_ID);
  const raw = fd.get('copyTeachers');
  const input = parseCloneForm(text(fd, 'sourceYearId'), typeof raw === 'string' ? raw : null);
  if (!input.ok) return invalid(input.error);
  let result: CloneStructureResult;
  try {
    result = await apiServer.post<CloneStructureResult>(
      `/academic-years/${enc(targetYearId)}/clone-structure`,
      { sourceYearId: input.sourceYearId, copyTeachers: input.copyTeachers },
    );
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), details: detailMessages(error) };
  }
  refresh();
  return { status: 'ok', message: cloneSuccessMessage(result), result };
}

// --- Promoción en bloque (RF-16, RN-15) -------------------------------------

/** Mayor que los 25 s de la transacción de promoción (20 s + 5 s de espera). */
const PROMOTION_TIMEOUT_MS = 30_000;

export type PromotionCommitOutcome =
  | { ok: true; result: PromotionResult }
  | { ok: false; status: number; message: string; details: { path: string; message: string }[] };

/**
 * Confirma la promoción (todo o nada). Los argumentos llegan del navegador: se validan antes de
 * llamar a la API, que vuelve a validar todo y compara la huella (409 si la propuesta cambió).
 */
export async function promotionCommitAction(
  targetYearId: string,
  sourceYearId: string,
  fingerprint: string,
  decisions: unknown,
): Promise<PromotionCommitOutcome> {
  const input = parseCommitInput(sourceYearId, fingerprint, decisions);
  if (!isUuid(targetYearId) || !input.ok) {
    return {
      ok: false,
      status: 400,
      message: input.ok ? BAD_ID : input.error,
      details: [],
    };
  }
  let result: PromotionResult;
  try {
    result = await apiServer.post<PromotionResult>(
      `/academic-years/${enc(targetYearId)}/promotion`,
      {
        sourceYearId: input.sourceYearId,
        fingerprint: input.fingerprint,
        decisions: input.decisions,
      },
      // La transacción admite hasta 20 s más 5 s de espera: la web espera 30 s.
      { timeoutMs: PROMOTION_TIMEOUT_MS },
    );
  } catch (error) {
    return {
      ok: false,
      status: error instanceof ApiError ? error.status : 0,
      message: toUserMessage(error),
      details: error instanceof ApiError ? error.details : [],
    };
  }
  refresh();
  return { ok: true, result };
}

// --- Períodos (RF-10, RF-11) ------------------------------------------------

export async function updatePeriodAction(
  periodId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(periodId)) return invalid(BAD_ID);
  const values = { startDate: text(fd, 'startDate'), endDate: text(fd, 'endDate') };
  const errors: Record<string, string> = {};
  if (!isDateOnly(values.startDate)) errors.startDate = 'Ingresa una fecha válida.';
  if (!isDateOnly(values.endDate)) errors.endDate = 'Ingresa una fecha válida.';
  if (!errors.startDate && !errors.endDate && values.endDate < values.startDate) {
    errors.endDate = 'El fin no puede ser anterior al inicio.';
  }
  if (Object.keys(errors).length > 0) return fieldError(errors, values);
  return run(
    () => apiServer.patch(`/academic-periods/${enc(periodId)}`, values),
    'Fechas del período actualizadas.',
    values,
  );
}

export async function closePeriodAction(
  periodId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(periodId)) return invalid(BAD_ID);
  const values = { reason: text(fd, 'reason') };
  const error = validateReason(values.reason, REASON_LIMITS.closePeriod);
  if (error) return fieldError({ reason: error }, values);
  const reason = values.reason.trim();
  return run(
    () => apiServer.post(`/academic-periods/${enc(periodId)}/close`, reason ? { reason } : {}),
    'El período quedó cerrado.',
    values,
  );
}

export async function reopenPeriodAction(
  periodId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(periodId)) return invalid(BAD_ID);
  const values = { reason: text(fd, 'reason') };
  const error = validateReason(values.reason, REASON_LIMITS.reopenPeriod);
  if (error) return fieldError({ reason: error }, values);
  return run(
    () =>
      apiServer.post(`/academic-periods/${enc(periodId)}/reopen`, {
        reason: values.reason.trim(),
      }),
    'El período quedó reabierto.',
    values,
  );
}

// --- Secciones (RF-13) ------------------------------------------------------

export async function createSectionAction(
  yearId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(yearId)) return invalid(BAD_ID);
  const values = { gradeLevel: text(fd, 'gradeLevel'), code: text(fd, 'code') };
  const errors: Record<string, string> = {};
  const gradeLevel = Number(values.gradeLevel);
  if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 5) {
    errors.gradeLevel = 'Elige un grado del 1.º al 5.º.';
  }
  const code = normalizeSectionCode(values.code);
  if (!code) errors.code = 'Usa de 1 a 8 letras (sin tildes ni ñ) o dígitos.';
  if (Object.keys(errors).length > 0) return fieldError(errors, values);
  return run(
    () => apiServer.post(`/academic-years/${enc(yearId)}/sections`, { gradeLevel, code }),
    'Sección creada.',
    values,
  );
}

export async function updateSectionCodeAction(
  sectionId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(sectionId)) return invalid(BAD_ID);
  const values = { code: text(fd, 'code') };
  const code = normalizeSectionCode(values.code);
  if (!code)
    return fieldError({ code: 'Usa de 1 a 8 letras (sin tildes ni ñ) o dígitos.' }, values);
  return run(
    () => apiServer.patch(`/sections/${enc(sectionId)}`, { code }),
    'Código de sección actualizado.',
    values,
  );
}

export async function setSectionActiveAction(
  sectionId: string,
  isActive: boolean,
): Promise<ActionState> {
  if (!isUuid(sectionId) || !isStrictBoolean(isActive)) return invalid(BAD_ID);
  return run(
    () => apiServer.patch(`/sections/${enc(sectionId)}`, { isActive }),
    isActive ? 'Sección activada.' : 'Sección desactivada.',
  );
}

// --- Cursos (RF-14) ---------------------------------------------------------

const COURSE_NAME_ERROR = 'Escribe un nombre de 1 a 120 caracteres.';

export async function createCourseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = { name: text(fd, 'name') };
  const name = normalizeCourseName(values.name);
  if (!name) return fieldError({ name: COURSE_NAME_ERROR }, values);
  return run(() => apiServer.post('/courses', { name }), 'Curso creado.', values);
}

export async function updateCourseNameAction(
  courseId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(courseId)) return invalid(BAD_ID);
  const values = { name: text(fd, 'name') };
  const name = normalizeCourseName(values.name);
  if (!name) return fieldError({ name: COURSE_NAME_ERROR }, values);
  return run(
    () => apiServer.patch(`/courses/${enc(courseId)}`, { name }),
    'Nombre del curso actualizado.',
    values,
  );
}

export async function setCourseActiveAction(
  courseId: string,
  isActive: boolean,
): Promise<ActionState> {
  if (!isUuid(courseId) || !isStrictBoolean(isActive)) return invalid(BAD_ID);
  return run(
    () => apiServer.patch(`/courses/${enc(courseId)}`, { isActive }),
    isActive ? 'Curso activado.' : 'Curso desactivado.',
  );
}

// --- Curso-sección y docente (RF-17, D-029) ---------------------------------

/** '' → null (sin docente); un uuid → el id; otra cosa → undefined (no válido). */
const teacherIdOf = (raw: string): string | null | undefined =>
  raw === '' ? null : isUuid(raw) ? raw : undefined;

export async function createCourseSectionAction(
  sectionId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(sectionId)) return invalid(BAD_ID);
  const values = { courseId: text(fd, 'courseId'), teacherId: text(fd, 'teacherId') };
  const errors: Record<string, string> = {};
  if (!isUuid(values.courseId)) errors.courseId = 'Elige un curso.';
  const teacherId = teacherIdOf(values.teacherId);
  if (teacherId === undefined) errors.teacherId = 'Elige un docente de la lista o “Sin docente”.';
  if (Object.keys(errors).length > 0) return fieldError(errors, values);
  return run(
    () =>
      apiServer.post(`/sections/${enc(sectionId)}/course-sections`, {
        courseId: values.courseId,
        teacherId,
      }),
    'Curso agregado a la sección.',
    values,
  );
}

export async function assignTeacherAction(
  courseSectionId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(courseSectionId)) return invalid(BAD_ID);
  const values = { teacherId: text(fd, 'teacherId') };
  const teacherId = teacherIdOf(values.teacherId);
  if (teacherId === undefined) {
    return fieldError({ teacherId: 'Elige un docente de la lista o “Sin docente”.' }, values);
  }
  return run(
    () => apiServer.put(`/course-sections/${enc(courseSectionId)}/teacher`, { teacherId }),
    teacherId ? 'Docente asignado.' : 'Se quitó el docente.',
    values,
  );
}

export async function setCourseSectionActiveAction(
  courseSectionId: string,
  isActive: boolean,
): Promise<ActionState> {
  if (!isUuid(courseSectionId) || !isStrictBoolean(isActive)) return invalid(BAD_ID);
  return run(
    () => apiServer.patch(`/course-sections/${enc(courseSectionId)}`, { isActive }),
    isActive ? 'Curso de la sección activado.' : 'Curso de la sección desactivado.',
  );
}
