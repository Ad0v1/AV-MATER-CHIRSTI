// /admin/usuarios/[id] — ficha de un usuario: datos (RF-22), estado (RF-23) y, según el rol,
// matrículas y traslado (RF-18, RF-20, RF-24) o vínculos con apoderados (RF-25; RN-13).
// Solo ADMIN (lo exige la API).
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import {
  LoadError,
  LoadingBlock,
  PageHeader,
  PageShell,
  ReadOnlyNotice,
  Section,
  StatusBadge,
} from '../../_shared/components/page-bits';
import { FOCUS_HEADING } from '../../_shared/lib/focus';
import { formatInstant, sectionLabel } from '../../_shared/lib/format';
import { isUuid } from '../../_shared/lib/validation';
import { CreatedNotice } from '../_components/created-notice';
import {
  CorrectDniForm,
  EditUserForm,
  EnrollForm,
  LinkStudentForm,
  MakePrimaryForm,
  ResetPasswordForm,
  ResetTwoFactorForm,
  RevokeLinkAction,
  StatusAction,
  TransferAction,
  VerifyDniForm,
} from '../_components/user-panels';
import {
  getActiveYearSections,
  getUser,
  listEnrollments,
  listGuardiansOf,
  listStudentsOf,
} from '../_lib/data';
import type {
  ActiveYearSections,
  EnrollmentView,
  GuardianLinkView,
  List,
  UserDetail,
} from '../_lib/types';
import {
  CREATED_FLAG,
  CREDENTIAL_LABELS,
  CREDENTIAL_TONES,
  END_REASON_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  USERS_PATH,
  createdDetail,
  enrollTargets,
  studentPlan,
  transferTargets,
  userFocusIds,
} from '../_lib/users';

const CRUMB_ROOT = { href: USERS_PATH, label: 'Usuarios' };

export const metadata = { title: 'Usuario' };

export default function Page({ params, searchParams }: PageProps<'/admin/usuarios/[id]'>) {
  return (
    <PageShell>
      <Suspense fallback={<LoadingBlock rows={6} label="Cargando el usuario…" />}>
        <UserPage params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

function NotFound({ error }: { error: unknown }) {
  return (
    <>
      <PageHeader title="Usuario" crumbs={[CRUMB_ROOT, { label: 'Usuario' }]} />
      <LoadError error={error} backHref={USERS_PATH} />
    </>
  );
}

async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) {
    return <NotFound error={new ApiError(404, 'NOT_FOUND', 'El usuario no existe')} />;
  }
  let user: UserDetail;
  try {
    user = await getUser(id);
  } catch (error) {
    return <NotFound error={error} />;
  }
  const justCreated = query[CREATED_FLAG] === '1';

  return (
    <>
      <PageHeader
        title={user.fullName}
        crumbs={[CRUMB_ROOT, { label: user.fullName }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{ROLE_LABELS[user.role]}</span>
            <StatusBadge tone={STATUS_TONES[user.status]}>{STATUS_LABELS[user.status]}</StatusBadge>
          </span>
        }
      />
      {justCreated ? (
        <CreatedNotice
          detail={createdDetail(
            user.role,
            user.role === 'STUDENT' && user.currentEnrollment
              ? sectionLabel(
                  user.currentEnrollment.section.gradeLevel,
                  user.currentEnrollment.section.code,
                )
              : null,
          )}
        />
      ) : null}

      <Section id={userFocusIds.data} title="Datos" focusable>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Código de usuario">
            <span className="tabular-nums">{user.code ?? 'Aún no tiene'}</span>
          </Item>
          <Item label="Rol">{ROLE_LABELS[user.role]}</Item>
          <Item label="Correo de contacto">
            {user.contactEmail ? (
              <span className="break-all">
                {user.contactEmail}{' '}
                <span className="font-normal text-muted-foreground">
                  ({user.emailVerified ? 'verificado' : 'sin verificar'})
                </span>
              </span>
            ) : (
              <span className="font-normal text-muted-foreground">
                Aún no lo registra (lo hace en su primer ingreso)
              </span>
            )}
          </Item>
          {user.institutionalEmail ? (
            <Item label="Correo del colegio">
              <span className="break-all">{user.institutionalEmail}</span>
            </Item>
          ) : null}
          <Item label="Teléfono">{user.phone ?? '—'}</Item>
          <Item label="Dirección">{user.address ?? '—'}</Item>
          <Item label="Creado">{formatInstant(user.createdAt)}</Item>
          <Item label="Última modificación">{formatInstant(user.updatedAt)}</Item>
        </dl>
        <EditUserForm userId={user.id} fullName={user.fullName} />
      </Section>

      <Section
        id={userFocusIds.access}
        title="Acceso"
        description="El usuario entra con su código y su contraseña. Las contraseñas no se pueden ver: solo se restablecen."
        focusable
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Contraseña">
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={CREDENTIAL_TONES[user.credentialStatus]}>
                {CREDENTIAL_LABELS[user.credentialStatus]}
              </StatusBadge>
              {user.locked ? (
                <StatusBadge tone="closed">Bloqueada por intentos fallidos</StatusBadge>
              ) : null}
            </span>
          </Item>
          <Item label="DNI">
            {user.dniVerified
              ? 'Verificado contra el documento'
              : 'Sin verificar contra el documento'}
          </Item>
        </dl>
        {!user.dniVerified ? <VerifyDniForm userId={user.id} /> : null}
        <ResetPasswordForm userId={user.id} />
        {user.role === 'ADMIN' ? <ResetTwoFactorForm userId={user.id} /> : null}
        <CorrectDniForm userId={user.id} />
      </Section>

      <Section
        id={userFocusIds.status}
        title="Estado de la cuenta"
        description={`Ahora: ${STATUS_LABELS[user.status]}. No se borran cuentas: se desactivan o se marcan como retiradas.`}
        focusable
      >
        <div>
          <StatusAction userId={user.id} role={user.role} status={user.status} />
        </div>
      </Section>

      {user.role === 'STUDENT' ? (
        <Suspense fallback={<LoadingBlock rows={4} label="Cargando matrículas y apoderados…" />}>
          <StudentSections user={user} />
        </Suspense>
      ) : null}
      {user.role === 'GUARDIAN' ? (
        <Suspense fallback={<LoadingBlock rows={3} label="Cargando estudiantes vinculados…" />}>
          <GuardianSections user={user} />
        </Suspense>
      ) : null}
    </>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

// --- Estudiante ---------------------------------------------------------------

async function StudentSections({ user }: { user: UserDetail }) {
  let enrollments: List<EnrollmentView>;
  let guardians: List<GuardianLinkView>;
  let active: ActiveYearSections | null;
  try {
    [enrollments, guardians, active] = await Promise.all([
      listEnrollments(user.id),
      listGuardiansOf(user.id),
      getActiveYearSections(),
    ]);
  } catch (error) {
    return <LoadError error={error} />;
  }
  const current = user.currentEnrollment ?? null;
  const plan = studentPlan(user.status, current, active);
  const currentLabel = current
    ? sectionLabel(current.section.gradeLevel, current.section.code)
    : null;

  return (
    <>
      <Section
        id={userFocusIds.enrollments}
        title="Matrícula"
        description={
          current
            ? `Vigente en ${currentLabel} (año ${current.academicYear.year}) desde el ${formatInstant(current.effectiveFrom)}.`
            : active
              ? `Sin matrícula vigente en el año activo (${active.year}).`
              : 'Sin matrícula vigente.'
        }
        focusable
      >
        {plan.notice ? <ReadOnlyNotice title="Aviso">{plan.notice}</ReadOnlyNotice> : null}
        {plan.canEnroll && active ? (
          <EnrollForm
            studentId={user.id}
            sections={enrollTargets(active.sections)}
            year={active.year}
          />
        ) : null}
        {plan.canTransfer && active && currentLabel ? (
          <div>
            <TransferAction
              studentId={user.id}
              currentLabel={currentLabel}
              targets={transferTargets(active.sections, current)}
            />
          </div>
        ) : null}
        <EnrollmentHistory items={enrollments.items} />
      </Section>

      <Section
        id={userFocusIds.guardians}
        title="Apoderados"
        description="Cada estudiante tiene de 1 a 2 apoderados vigentes; el principal recibe los avisos. Incluye los vínculos revocados. Para vincular otro apoderado, ábrelo y vincula al estudiante."
        focusable
      >
        <LinkList links={guardians.items} side="guardian" />
      </Section>
    </>
  );
}

function EnrollmentHistory({ items }: { items: EnrollmentView[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aún no tiene matrículas.</p>;
  }
  const sorted = [...items].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const status = (e: EnrollmentView) =>
    e.isCurrent ? 'Vigente' : e.endReason ? END_REASON_LABELS[e.endReason] : 'Cerrada';
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">Historial de matrículas</h3>
      <ul className="flex flex-col gap-2 sm:hidden" aria-label="Historial de matrículas">
        {sorted.map((e) => (
          <li
            key={e.id}
            className="flex flex-col gap-1 rounded-xl p-3 text-sm ring-1 ring-foreground/10"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {e.academicYear.year} · {sectionLabel(e.section.gradeLevel, e.section.code)}
              </span>
              <StatusBadge tone={e.isCurrent ? 'active' : 'closed'}>{status(e)}</StatusBadge>
            </div>
            <span className="text-muted-foreground">Desde: {formatInstant(e.effectiveFrom)}</span>
            {e.effectiveTo ? (
              <span className="text-muted-foreground">Hasta: {formatInstant(e.effectiveTo)}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <Table>
          <TableCaption className="sr-only">
            Historial de matrículas, de la más reciente a la más antigua
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Año</TableHead>
              <TableHead scope="col">Sección</TableHead>
              <TableHead scope="col">Desde</TableHead>
              <TableHead scope="col">Hasta</TableHead>
              <TableHead scope="col">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.academicYear.year}</TableCell>
                <TableCell>{sectionLabel(e.section.gradeLevel, e.section.code)}</TableCell>
                <TableCell className="whitespace-normal">
                  {formatInstant(e.effectiveFrom)}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {e.effectiveTo ? formatInstant(e.effectiveTo) : '—'}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={e.isCurrent ? 'active' : 'closed'}>{status(e)}</StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// --- Apoderado ----------------------------------------------------------------

async function GuardianSections({ user }: { user: UserDetail }) {
  let links: List<GuardianLinkView>;
  try {
    links = await listStudentsOf(user.id);
  } catch (error) {
    return <LoadError error={error} />;
  }
  return (
    <Section
      id={userFocusIds.students}
      title="Estudiantes vinculados"
      description="Incluye los vínculos revocados. El apoderado solo ve la información de los vínculos vigentes con estudiantes no retirados."
      focusable
    >
      <LinkList links={links.items} side="student" />
      {user.status === 'WITHDRAWN' ? (
        <ReadOnlyNotice title="Aviso">
          El apoderado está retirado: no se le pueden vincular estudiantes.
        </ReadOnlyNotice>
      ) : (
        <LinkStudentForm guardianId={user.id} />
      )}
    </Section>
  );
}

// --- Vínculos (los dos lados) -------------------------------------------------

function LinkList({ links, side }: { links: GuardianLinkView[]; side: 'guardian' | 'student' }) {
  if (links.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {side === 'guardian'
          ? 'No tiene apoderados vinculados.'
          : 'No tiene estudiantes vinculados.'}
      </p>
    );
  }
  // Vigentes primero; después los revocados, del más reciente al más antiguo.
  const sorted = [...links].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      (b.revokedAt ?? b.createdAt).localeCompare(a.revokedAt ?? a.createdAt),
  );
  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((l) => {
        const other = side === 'guardian' ? l.guardian : l.student;
        return (
          <li key={l.id} className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                id={userFocusIds.link(l.id)}
                tabIndex={-1}
                className={cn('font-semibold break-words', FOCUS_HEADING)}
              >
                <Link
                  href={`${USERS_PATH}/${encodeURIComponent(other.id)}`}
                  className="underline underline-offset-4"
                >
                  {other.fullName}
                </Link>
              </h3>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={l.isActive ? 'active' : 'closed'}>
                  {l.isActive ? 'Vínculo vigente' : 'Vínculo revocado'}
                </StatusBadge>
                {l.isActive && l.isPrimary ? (
                  <StatusBadge tone="future">Apoderado principal</StatusBadge>
                ) : null}
                {other.status !== 'ACTIVE' ? (
                  <StatusBadge tone={STATUS_TONES[other.status]}>
                    {side === 'guardian' ? 'Apoderado' : 'Estudiante'}{' '}
                    {STATUS_LABELS[other.status].toLowerCase()}
                  </StatusBadge>
                ) : null}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Vinculado el {formatInstant(l.createdAt)}
              {l.revokedAt ? `. Revocado el ${formatInstant(l.revokedAt)}.` : '.'}
            </p>
            {l.isActive && side === 'guardian' && !l.isPrimary ? (
              <MakePrimaryForm linkId={l.id} name={other.fullName} />
            ) : null}
            {l.isActive ? (
              <div>
                <RevokeLinkAction
                  linkId={l.id}
                  otherName={other.fullName}
                  focusSection={userFocusIds.link(l.id)}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
