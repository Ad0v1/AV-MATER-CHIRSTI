'use server';

// Escrituras y búsquedas de /admin/usuarios (RF-18..20, 22..25; RN-13) como Server Actions
// (D-037). La API comprueba sesión, rol ADMIN, actor activo y reglas; aquí solo se valida la forma
// para dar mensajes junto al campo. Tras escribir se refresca el router (`refresh`).
//
// Búsqueda (decisión de seguridad 3 de la entrega 5a): el texto buscado llega en el cuerpo del
// POST de la Server Action y solo viaja del servidor web a la API. No va en la URL del navegador
// (ni en su historial ni en los registros de acceso de un proxy) y aquí no se registra.
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { detailMessages, toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import type { ActionState } from '../../_shared/lib/action-state';
import { isUuid, validateReason } from '../../_shared/lib/validation';
import type {
  EnrollmentView,
  GuardianLinkView,
  SearchState,
  StudentSearchState,
  UserListPage,
  UserView,
} from './types';
import {
  STATUS_LABELS,
  USERS_PATH,
  USER_REASON_LIMITS,
  buildUserListQuery,
  isStatus,
  normalizeEmail,
  normalizeFullName,
  normalizeSearch,
  parseStudentIds,
  parseUserFilters,
  searchRequest,
  toStudentChoice,
  userPathLabel,
} from './users';

const text = (fd: FormData, name: string): string => {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
};

const enc = (value: string): string => encodeURIComponent(value);

const BAD_ID = 'El identificador no es válido. Vuelve a cargar la página.';

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

const apiError = (error: unknown, values?: Record<string, string>): ActionState => ({
  status: 'error',
  message: toUserMessage(error),
  details: detailMessages(error, userPathLabel),
  values,
});

/** Ejecuta la llamada; traduce errores de la API y refresca la vista si todo salió bien. */
async function run<T>(
  call: () => Promise<T>,
  okMessage: (result: T) => string,
  values?: Record<string, string>,
): Promise<ActionState> {
  let result: T;
  try {
    result = await call();
  } catch (error) {
    return apiError(error, values);
  }
  refresh();
  return { status: 'ok', message: okMessage(result) };
}

/** Nombre y correo validados, o los errores por campo. */
function personFields(values: { fullName: string; institutionalEmail: string }) {
  const errors: Record<string, string> = {};
  const name = normalizeFullName(values.fullName);
  const email = normalizeEmail(values.institutionalEmail);
  if (!name.ok) errors.fullName = name.error;
  if (!email.ok) errors.institutionalEmail = email.error;
  if (!name.ok || !email.ok) return { errors };
  return { errors, fullName: name.value, institutionalEmail: email.value };
}

const detailHref = (userId: string) => `${USERS_PATH}/${enc(userId)}?alta=1`;

// --- Búsquedas (GET /users con q) ---------------------------------------------

export async function searchUsersAction(_prev: SearchState, fd: FormData): Promise<SearchState> {
  const raw = text(fd, 'q');
  // "Limpiar búsqueda" envía intent=limpiar; un envío vacío es un error junto al campo.
  const search = searchRequest(raw, text(fd, 'intent'));
  if (search.kind === 'clear') return { status: 'idle' };
  if (search.kind === 'error') return { status: 'error', fieldError: search.error, q: raw };
  const filters = parseUserFilters({
    role: text(fd, 'role'),
    status: text(fd, 'status'),
    gradeLevel: text(fd, 'gradeLevel'),
    sectionId: text(fd, 'sectionId'),
    page: text(fd, 'page'),
  });
  try {
    const result = await apiServer.get<UserListPage>(
      `/users?${buildUserListQuery(filters, { q: search.q })}`,
    );
    return { status: 'ok', q: search.q, result };
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), q: search.q };
  }
}

const STUDENT_SEARCH_SIZE = 20;

/** Buscador de estudiantes para vincular a un apoderado (solo lo que se muestra). */
export async function searchStudentsAction(
  _prev: StudentSearchState,
  fd: FormData,
): Promise<StudentSearchState> {
  const search = normalizeSearch(text(fd, 'q'));
  if (!search.ok) {
    return {
      status: 'error',
      fieldError: search.error ?? 'Escribe el nombre o el correo del estudiante.',
    };
  }
  try {
    const result = await apiServer.get<UserListPage>(
      `/users?${buildUserListQuery(
        { role: 'STUDENT', page: 1 },
        { q: search.q, pageSize: STUDENT_SEARCH_SIZE },
      )}`,
    );
    return { status: 'ok', choices: result.items.map(toStudentChoice), total: result.total };
  } catch (error) {
    return { status: 'error', message: toUserMessage(error) };
  }
}

// --- Altas (RF-18, RF-19, RF-25) ----------------------------------------------

export async function createStudentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = {
    fullName: text(fd, 'fullName'),
    institutionalEmail: text(fd, 'institutionalEmail'),
    sectionId: text(fd, 'sectionId'),
  };
  const person = personFields(values);
  if (!isUuid(values.sectionId)) person.errors.sectionId = 'Elige una sección.';
  if (Object.keys(person.errors).length > 0) return fieldError(person.errors, values);

  let created: { user: UserView; enrollment: EnrollmentView };
  try {
    created = await apiServer.post<{ user: UserView; enrollment: EnrollmentView }>('/students', {
      institutionalEmail: person.institutionalEmail,
      fullName: person.fullName,
      sectionId: values.sectionId,
    });
  } catch (error) {
    return apiError(error, values);
  }
  // redirect lanza: va fuera del try.
  redirect(detailHref(created.user.id));
}

export async function createTeacherAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = {
    fullName: text(fd, 'fullName'),
    institutionalEmail: text(fd, 'institutionalEmail'),
  };
  const person = personFields(values);
  if (Object.keys(person.errors).length > 0) return fieldError(person.errors, values);

  let created: UserView;
  try {
    created = await apiServer.post<UserView>('/teachers', {
      institutionalEmail: person.institutionalEmail,
      fullName: person.fullName,
    });
  } catch (error) {
    return apiError(error, values);
  }
  redirect(detailHref(created.id));
}

export async function createGuardianAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = {
    fullName: text(fd, 'fullName'),
    institutionalEmail: text(fd, 'institutionalEmail'),
  };
  const person = personFields(values);
  const ids = parseStudentIds(fd.getAll('studentIds'));
  if (!ids.ok) person.errors.studentIds = ids.error;
  if (Object.keys(person.errors).length > 0 || !ids.ok) return fieldError(person.errors, values);

  let created: { user: UserView; links: GuardianLinkView[] };
  try {
    created = await apiServer.post<{ user: UserView; links: GuardianLinkView[] }>('/guardians', {
      institutionalEmail: person.institutionalEmail,
      fullName: person.fullName,
      studentIds: ids.ids,
    });
  } catch (error) {
    return apiError(error, values);
  }
  redirect(detailHref(created.user.id));
}

// --- Edición y estado (RF-22, RF-23) ------------------------------------------

export async function updateUserAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(userId)) return invalid(BAD_ID);
  const values = {
    fullName: text(fd, 'fullName'),
    institutionalEmail: text(fd, 'institutionalEmail'),
  };
  const person = personFields(values);
  if (Object.keys(person.errors).length > 0) return fieldError(person.errors, values);
  // El rol no se edita (D-012): la API rechaza campos desconocidos y aquí no se envía.
  return run(
    () =>
      apiServer.patch<UserView>(`/users/${enc(userId)}`, {
        fullName: person.fullName,
        institutionalEmail: person.institutionalEmail,
      }),
    () => 'Datos guardados.',
    values,
  );
}

export async function changeStatusAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(userId)) return invalid(BAD_ID);
  const values = { status: text(fd, 'status'), reason: text(fd, 'reason') };
  const errors: Record<string, string> = {};
  if (!isStatus(values.status)) errors.status = 'Elige el nuevo estado.';
  const reasonError = validateReason(values.reason, USER_REASON_LIMITS.status);
  if (reasonError) errors.reason = reasonError;
  if (Object.keys(errors).length > 0 || !isStatus(values.status)) {
    return fieldError(errors, values);
  }
  const status = values.status;
  const reason = values.reason.trim();
  return run(
    () =>
      apiServer.put<{ user: UserView; closedEnrollments: EnrollmentView[] }>(
        `/users/${enc(userId)}/status`,
        reason ? { status, reason } : { status },
      ),
    (res) => {
      const closed = res.closedEnrollments.length;
      const base = `Estado cambiado a ${STATUS_LABELS[status]}.`;
      if (closed === 0) return base;
      return `${base} Se ${closed === 1 ? 'cerró 1 matrícula' : `cerraron ${closed} matrículas`}.`;
    },
    values,
  );
}

// --- Matrícula y traslado (RF-18, RF-20, RF-24) -------------------------------

export async function enrollAction(
  studentId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(studentId)) return invalid(BAD_ID);
  const values = { sectionId: text(fd, 'sectionId') };
  if (!isUuid(values.sectionId)) return fieldError({ sectionId: 'Elige una sección.' }, values);
  return run(
    () =>
      apiServer.post<EnrollmentView>(`/students/${enc(studentId)}/enrollments`, {
        sectionId: values.sectionId,
      }),
    () => 'Estudiante matriculado.',
    values,
  );
}

export async function transferAction(
  studentId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(studentId)) return invalid(BAD_ID);
  const values = { sectionId: text(fd, 'sectionId'), reason: text(fd, 'reason') };
  const errors: Record<string, string> = {};
  if (!isUuid(values.sectionId)) errors.sectionId = 'Elige la sección de destino.';
  const reasonError = validateReason(values.reason, USER_REASON_LIMITS.transfer);
  if (reasonError) errors.reason = reasonError;
  if (Object.keys(errors).length > 0) return fieldError(errors, values);
  const reason = values.reason.trim();
  return run(
    () =>
      apiServer.post(
        `/students/${enc(studentId)}/transfer`,
        reason ? { sectionId: values.sectionId, reason } : { sectionId: values.sectionId },
      ),
    () => 'Traslado registrado.',
    values,
  );
}

// --- Vínculos con apoderados (RF-25; RN-13) -----------------------------------

export async function linkStudentAction(
  guardianId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(guardianId)) return invalid(BAD_ID);
  const ids = parseStudentIds(fd.getAll('studentIds'), { min: 1, max: 1 });
  if (!ids.ok) {
    return fieldError({
      studentIds: ids.error.startsWith('Puedes') ? 'Elige un solo estudiante.' : ids.error,
    });
  }
  return run(
    () =>
      apiServer.post<GuardianLinkView>(`/guardians/${enc(guardianId)}/students`, {
        studentId: ids.ids[0],
      }),
    () => 'Estudiante vinculado.',
  );
}

export async function revokeLinkAction(
  linkId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(linkId)) return invalid(BAD_ID);
  const values = { reason: text(fd, 'reason') };
  const reasonError = validateReason(values.reason, USER_REASON_LIMITS.revoke);
  if (reasonError) return fieldError({ reason: reasonError }, values);
  return run(
    () =>
      apiServer.post<GuardianLinkView>(`/guardian-links/${enc(linkId)}/revoke`, {
        reason: values.reason.trim(),
      }),
    () => 'Vínculo revocado.',
    values,
  );
}
