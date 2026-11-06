'use client';

// Filtros de la lista (RF-22): rol, estado y, solo con rol Estudiante, grado y sección del año
// activo. Van en la URL (no son datos personales) con un formulario GET y navegación del cliente
// (`next/form`). La búsqueda por nombre o correo NO va aquí: ver user-search.tsx.
import Form from 'next/form';
import Link from 'next/link';
import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SelectField, SubmitButton } from '../../_shared/components/form-bits';
import { TOUCH } from '../../_shared/components/styles';
import { sectionLabel } from '../../_shared/lib/format';
import type { SectionOption } from '../_lib/types';
import {
  CREDENTIAL_LABELS,
  CREDENTIAL_STATUSES,
  ROLES,
  ROLE_LABELS,
  STATUSES,
  STATUS_LABELS,
  USERS_PATH,
  enrollTargets,
  type UserFilters as Filters,
} from '../_lib/users';

const GRADES = [1, 2, 3, 4, 5];

export function UserFilters({
  filters,
  sections,
}: {
  filters: Filters;
  /** Secciones del año activo (vacío si no hay año activo). */
  sections: SectionOption[];
}) {
  const [role, setRole] = useState<string>(filters.role ?? '');
  const [grade, setGrade] = useState<string>(
    filters.gradeLevel !== undefined ? String(filters.gradeLevel) : '',
  );
  const isStudent = role === 'STUDENT';
  const sectionOptions = enrollTargets(sections).filter(
    (s) => grade === '' || String(s.gradeLevel) === grade,
  );
  const hasFilters =
    filters.role !== undefined ||
    filters.status !== undefined ||
    filters.credentials !== undefined ||
    filters.emailVerified !== undefined ||
    filters.gradeLevel !== undefined ||
    filters.sectionId !== undefined;

  return (
    <Form
      action={USERS_PATH}
      aria-label="Filtros de la lista"
      className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          name="role"
          label="Rol"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          hint="Con Estudiante aparecen los filtros de grado y sección."
          options={[
            { value: '', label: 'Todos los roles' },
            ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
          ]}
        />
        <SelectField
          name="status"
          label="Estado"
          defaultValue={filters.status ?? ''}
          options={[
            { value: '', label: 'Todos los estados' },
            ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          ]}
        />
        <SelectField
          name="credentials"
          label="Contraseña"
          defaultValue={filters.credentials ?? ''}
          hint="Quién aún no cambió la contraseña inicial."
          options={[
            { value: '', label: 'Todas' },
            ...CREDENTIAL_STATUSES.map((c) => ({ value: c, label: CREDENTIAL_LABELS[c] })),
          ]}
        />
        <SelectField
          name="emailVerified"
          label="Correo"
          defaultValue={filters.emailVerified ?? ''}
          options={[
            { value: '', label: 'Todos' },
            { value: 'true', label: 'Verificado' },
            { value: 'false', label: 'Sin verificar' },
          ]}
        />
        {isStudent ? (
          <>
            <SelectField
              name="gradeLevel"
              label="Grado"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              options={[
                { value: '', label: 'Todos los grados' },
                ...GRADES.map((g) => ({ value: String(g), label: `${g}.º` })),
              ]}
            />
            <SelectField
              key={grade}
              name="sectionId"
              label="Sección (año activo)"
              defaultValue={
                sectionOptions.some((s) => s.id === filters.sectionId) ? filters.sectionId : ''
              }
              options={[
                { value: '', label: 'Todas las secciones' },
                ...sectionOptions.map((s) => ({
                  value: s.id,
                  label: sectionLabel(s.gradeLevel, s.code),
                })),
              ]}
            />
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Aplicando…">Aplicar filtros</SubmitButton>
        {hasFilters ? (
          <Link
            href={USERS_PATH}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              TOUCH,
              'inline-flex items-center',
            )}
          >
            Quitar filtros
          </Link>
        ) : null}
      </div>
    </Form>
  );
}
