'use client';

// Filtros de la lista (RF-22): rol, estado y, solo con rol Estudiante, nivel, grado y sección del año
// activo. Van en la URL (no son datos personales) con un formulario GET y navegación del cliente
// (`next/form`). La búsqueda por nombre o correo NO va aquí: ver user-search.tsx.
import Form from 'next/form';
import Link from 'next/link';
import { useState } from 'react';
import {
  EDUCATION_LEVELS,
  LEVEL_LABELS,
  gradeLabel,
  gradesForLevel,
  isEducationLevel,
  type EducationLevel,
} from '../../estructura/_lib/levels';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SelectField, SubmitButton } from '../../_shared/components/form-bits';
import { TOUCH } from '../../_shared/components/styles';
import { sectionLabel } from '../../estructura/_lib/format';
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
  const [level, setLevel] = useState<EducationLevel | ''>(filters.level ?? '');
  const isStudent = role === 'STUDENT';
  const sectionOptions = enrollTargets(sections).filter(
    (s) =>
      (level === '' || (s.level ?? 'SECUNDARIA') === level) &&
      (grade === '' || String(s.gradeLevel) === grade),
  );
  const hasFilters =
    filters.role !== undefined ||
    filters.status !== undefined ||
    filters.credentials !== undefined ||
    filters.emailVerified !== undefined ||
    filters.level !== undefined ||
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
          hint="Con Estudiante aparecen los filtros de nivel, grado y sección."
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
              name="level"
              label="Nivel"
              value={level}
              onChange={(e) => {
                const next = e.target.value;
                setLevel(isEducationLevel(next) ? next : '');
                setGrade('');
              }}
              options={[
                { value: '', label: 'Todos los niveles' },
                ...EDUCATION_LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] })),
              ]}
            />
            {level !== '' ? (
              <SelectField
                name="gradeLevel"
                label="Grado"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                options={[
                  { value: '', label: 'Todos los grados' },
                  ...gradesForLevel(level).map((g) => ({
                    value: String(g),
                    label: gradeLabel(level, g),
                  })),
                ]}
              />
            ) : null}
            <SelectField
              key={`${level}-${grade}`}
              name="sectionId"
              label="Sección (año activo)"
              defaultValue={
                sectionOptions.some((s) => s.id === filters.sectionId) ? filters.sectionId : ''
              }
              options={[
                { value: '', label: 'Todas las secciones' },
                ...sectionOptions.map((s) => ({
                  value: s.id,
                  label: sectionLabel(s.gradeLevel, s.code, s.level),
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
