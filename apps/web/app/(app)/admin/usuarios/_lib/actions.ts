'use server';

// Escrituras y búsquedas de /admin/usuarios (RF-18..20, 22..25; RN-13) como Server Actions
// (D-037). La API comprueba sesión, rol ADMIN, actor activo y reglas; aquí solo se valida la forma
// para dar mensajes junto al campo. Tras escribir se refresca el router (`refresh`).
//
// Búsqueda (decisión de seguridad 3 de la entrega 5a): el texto buscado llega en el cuerpo del
// POST de la Server Action y solo viaja del servidor web a la API. No va en la URL del navegador
// (ni en su historial ni en los registros de acceso de un proxy) y aquí no se registra.
import { refresh } from 'next/cache';
import { detailMessages, toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import type { ActionState } from '../../_shared/lib/action-state';
import { isUuid, validateReason } from '../../_shared/lib/validation';
import type { IssuedAccount } from '../../_shared/lib/action-state';
import type {
  CreatedGuardian,
  CreatedStudent,
  CreatedTeacher,
  EnrollmentView,
  GuardianLinkView,
  IssuedCredentials,
  ReissuedCredentials,
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
  dniPair,
  isStatus,
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

/** Nombre validado, o el error por campo. El correo del colegio ya no se pide (D-058). */
function personFields(values: { fullName: string }) {
  const errors: Record<string, string> = {};
  const name = normalizeFullName(values.fullName);
  if (!name.ok) errors.fullName = name.error;
  return { errors, fullName: name.ok ? name.value : '' };
}

/** DNI y confirmación de un formulario, con el prefijo de sus campos ('' o 'guardian1'). */
function dniFromForm(fd: FormData, prefix: string, errors: Record<string, string>) {
  const key = (name: string) =>
    prefix ? `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}` : name;
  const pair = dniPair(text(fd, key('dni')), text(fd, key('dniConfirm')));
  if (!pair.ok) {
    if (pair.errors.dni) errors[key('dni')] = pair.errors.dni;
    if (pair.errors.dniConfirm) errors[key('dniConfirm')] = pair.errors.dniConfirm;
    return null;
  }
  return pair.value;
}

const checked = (fd: FormData, name: string): boolean => text(fd, name) === 'on';

/** Valores del formulario que se devuelven si algo falla (para no perder lo escrito). */
function formValues(fd: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of fd.entries()) if (typeof value === 'string') values[name] = value;
  return values;
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
    credentials: text(fd, 'credentials'),
    emailVerified: text(fd, 'emailVerified'),
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
      fieldError: search.error ?? 'Escribe el nombre o el código del estudiante.',
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

// --- Altas (RF-18, RF-19, RF-20, RF-86) ----------------------------------------
//
// El alta devuelve el código y la contraseña inicial una sola vez (RF-70). No se redirige con ellos
// en la URL: viajan en el estado de la acción y solo viven en la memoria de esta pantalla.

const issuedOf = (label: string, c: IssuedCredentials): IssuedAccount => ({
  label,
  code: c.code,
  password: c.initialPassword,
});

/** Un apoderado del formulario del alumno (DNI dos veces y nombre si es nuevo). */
function guardianFromForm(fd: FormData, n: 1 | 2, errors: Record<string, string>) {
  const prefix = `guardian${n}`;
  const dni = dniFromForm(fd, prefix, errors);
  const fullName = text(fd, `${prefix}Name`).trim();
  if (dni === null) return null;
  if (fullName) {
    const name = normalizeFullName(fullName);
    if (!name.ok) {
      errors[`${prefix}Name`] = name.error;
      return null;
    }
    return {
      dni,
      dniConfirm: dni,
      fullName: name.value,
      dniVerified: checked(fd, `${prefix}Verified`),
    };
  }
  return { dni, dniConfirm: dni, dniVerified: checked(fd, `${prefix}Verified`) };
}

export async function createStudentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const person = personFields({ fullName: text(fd, 'fullName') });
  const errors = person.errors;
  if (!isUuid(text(fd, 'sectionId'))) errors.sectionId = 'Elige una sección.';
  const dni = dniFromForm(fd, '', errors);
  const guardians: Array<Record<string, unknown>> = [];
  const first = guardianFromForm(fd, 1, errors);
  if (first) guardians.push(first);
  // El segundo apoderado es opcional: solo cuenta si se escribió algo.
  const secondTouched =
    text(fd, 'guardian2Dni').trim() !== '' || text(fd, 'guardian2Name').trim() !== '';
  if (secondTouched) {
    const second = guardianFromForm(fd, 2, errors);
    if (second) guardians.push(second);
  }
  if (Object.keys(errors).length > 0 || dni === null) return fieldError(errors, values);

  let created: CreatedStudent;
  try {
    created = await apiServer.post<CreatedStudent>('/students', {
      fullName: person.fullName,
      sectionId: text(fd, 'sectionId'),
      dni,
      dniConfirm: dni,
      dniVerified: checked(fd, 'dniVerified'),
      guardians,
    });
  } catch (error) {
    return apiError(error, values);
  }
  const issued = [
    issuedOf(`Estudiante: ${created.user.fullName}`, created.credentials),
    ...created.guardians.flatMap((g) =>
      g.credentials ? [issuedOf(`Apoderado: ${g.user.fullName}`, g.credentials)] : [],
    ),
  ];
  const reused = created.guardians.filter((g) => !g.created).length;
  return {
    status: 'ok',
    message:
      `Estudiante creado y matriculado.${reused > 0 ? ' Se vinculó a un apoderado que ya existía.' : ''}` +
      ' Entrega las credenciales ahora: no se pueden volver a ver.',
    issued,
    nextHref: detailHref(created.user.id),
  };
}

export async function createTeacherAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const person = personFields({ fullName: text(fd, 'fullName') });
  const dni = dniFromForm(fd, '', person.errors);
  if (Object.keys(person.errors).length > 0 || dni === null)
    return fieldError(person.errors, values);

  let created: CreatedTeacher;
  try {
    created = await apiServer.post<CreatedTeacher>('/teachers', {
      fullName: person.fullName,
      dni,
      dniConfirm: dni,
      dniVerified: checked(fd, 'dniVerified'),
    });
  } catch (error) {
    return apiError(error, values);
  }
  return {
    status: 'ok',
    message: 'Docente creado. Entrega las credenciales ahora: no se pueden volver a ver.',
    issued: [issuedOf(`Docente: ${created.user.fullName}`, created.credentials)],
    nextHref: detailHref(created.user.id),
  };
}

export async function createGuardianAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const person = personFields({ fullName: text(fd, 'fullName') });
  const dni = dniFromForm(fd, '', person.errors);
  const ids = parseStudentIds(fd.getAll('studentIds'));
  if (!ids.ok) person.errors.studentIds = ids.error;
  if (Object.keys(person.errors).length > 0 || !ids.ok || dni === null) {
    return fieldError(person.errors, values);
  }

  let created: CreatedGuardian;
  try {
    created = await apiServer.post<CreatedGuardian>('/guardians', {
      fullName: person.fullName,
      dni,
      dniConfirm: dni,
      dniVerified: checked(fd, 'dniVerified'),
      studentIds: ids.ids,
    });
  } catch (error) {
    return apiError(error, values);
  }
  return {
    status: 'ok',
    message: 'Apoderado creado. Entrega las credenciales ahora: no se pueden volver a ver.',
    issued: [issuedOf(`Apoderado: ${created.user.fullName}`, created.credentials)],
    nextHref: detailHref(created.user.id),
  };
}

// --- Edición y estado (RF-22, RF-23) ------------------------------------------

export async function updateUserAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(userId)) return invalid(BAD_ID);
  const values = { fullName: text(fd, 'fullName') };
  const person = personFields(values);
  if (Object.keys(person.errors).length > 0) return fieldError(person.errors, values);
  // El rol no se edita (D-012) y el correo ya no es la identidad (D-058): solo el nombre.
  return run(
    () => apiServer.patch<UserView>(`/users/${enc(userId)}`, { fullName: person.fullName }),
    () => 'Datos guardados.',
    values,
  );
}

// --- Credenciales (RF-69, RF-74, RF-84) y apoderado principal (RF-86) -----------

export async function resetPasswordAction(
  userId: string,
  _prev: ActionState,
  _fd: FormData,
): Promise<ActionState> {
  void _prev; // useActionState exige la firma (estado, formulario) aunque no se usen
  void _fd;
  if (!isUuid(userId)) return invalid(BAD_ID);
  let result: ReissuedCredentials;
  try {
    result = await apiServer.post<ReissuedCredentials>(`/users/${enc(userId)}/reset-password`, {});
  } catch (error) {
    return apiError(error);
  }
  refresh();
  return {
    status: 'ok',
    message: 'Contraseña restablecida. Entrégala ahora: no se puede volver a ver.',
    issued: [issuedOf(`Contraseña temporal: ${result.user.fullName}`, result.credentials)],
  };
}

// RF-85: reinicia el 2FA de otro administrador que perdió su teléfono y sus códigos. Sus sesiones
// se cierran y en su próximo ingreso debe activarlo de nuevo.
export async function resetTwoFactorAction(
  userId: string,
  _prev: ActionState,
  _fd: FormData,
): Promise<ActionState> {
  void _prev; // useActionState exige la firma (estado, formulario) aunque no se usen
  void _fd;
  if (!isUuid(userId)) return invalid(BAD_ID);
  return run(
    () => apiServer.post<void>(`/auth/users/${enc(userId)}/2fa/reset`, {}),
    () => 'Verificación en dos pasos reiniciada. Deberá activarla de nuevo al ingresar.',
  );
}

export async function correctDniAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isUuid(userId)) return invalid(BAD_ID);
  const values = formValues(fd);
  const errors: Record<string, string> = {};
  const dni = dniFromForm(fd, '', errors);
  const reasonError = validateReason(text(fd, 'reason'), USER_REASON_LIMITS.revoke);
  if (reasonError) errors.reason = reasonError;
  if (Object.keys(errors).length > 0 || dni === null) return fieldError(errors, values);

  let result: ReissuedCredentials;
  try {
    result = await apiServer.post<ReissuedCredentials>(`/users/${enc(userId)}/correct-dni`, {
      dni,
      dniConfirm: dni,
      reason: text(fd, 'reason').trim(),
    });
  } catch (error) {
    return apiError(error, values);
  }
  refresh();
  return {
    status: 'ok',
    message:
      'DNI corregido. Tiene un código y una contraseña nuevos; el código anterior ya no sirve. Entrégalos ahora.',
    issued: [issuedOf(`Credenciales nuevas: ${result.user.fullName}`, result.credentials)],
  };
}

export async function verifyDniAction(
  userId: string,
  _prev: ActionState,
  _fd: FormData,
): Promise<ActionState> {
  void _prev; // useActionState exige la firma (estado, formulario) aunque no se usen
  void _fd;
  if (!isUuid(userId)) return invalid(BAD_ID);
  return run(
    () => apiServer.post<UserView>(`/users/${enc(userId)}/verify-dni`, {}),
    () => 'DNI marcado como verificado contra el documento.',
  );
}

export async function makePrimaryAction(
  linkId: string,
  _prev: ActionState,
  _fd: FormData,
): Promise<ActionState> {
  void _prev; // useActionState exige la firma (estado, formulario) aunque no se usen
  void _fd;
  if (!isUuid(linkId)) return invalid(BAD_ID);
  return run(
    () => apiServer.post<GuardianLinkView>(`/guardian-links/${enc(linkId)}/make-primary`, {}),
    () => 'Apoderado principal cambiado.',
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
