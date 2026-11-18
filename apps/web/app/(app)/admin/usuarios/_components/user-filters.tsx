'use client';

// Filtros de la lista (RF-22): estado, contraseña, correo y, con la pestaña Estudiantes, nivel,
// grado y sección del año activo. Son controlados: al elegir una opción cambian el estado de la
// pantalla (users-explorer.tsx) y la lista se actualiza al instante, sin recargar la página.
// La búsqueda por nombre o correo NO va aquí: ver users-explorer.tsx.
//
// Las secciones del año activo (dos llamadas a la API) llegan en segundo plano como una promesa y
// solo las necesita el filtro de sección; mientras llegan, ese selector aparece deshabilitado.
import { Suspense, use } from 'react';
import {
  EDUCATION_LEVELS,
  LEVEL_LABELS,
  gradeLabel,
  gradesForLevel,
  isEducationLevel,
} from '../../estructura/_lib/levels';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/ui/filter-bar';
import { cn } from '@/lib/utils';
import { SelectField } from '../../_shared/components/form-bits';
import { SOFT_FIELDS, TOUCH } from '../../_shared/components/styles';
import { sectionLabel } from '../../estructura/_lib/format';
import type { SectionOption } from '../_lib/types';
import {
  CREDENTIAL_LABELS,
  CREDENTIAL_STATUSES,
  STATUSES,
  STATUS_LABELS,
  enrollTargets,
} from '../_lib/users';

/** Valores de los filtros como texto ('' = sin filtro). */
export type FilterValues = {
  status: string;
  credentials: string;
  emailVerified: string;
  level: string;
  gradeLevel: string;
  sectionId: string;
};

export const NO_FILTERS: FilterValues = {
  status: '',
  credentials: '',
  emailVerified: '',
  level: '',
  gradeLevel: '',
  sectionId: '',
};

export function UserFilters({
  values,
  isStudent,
  sections,
  onChange,
}: {
  values: FilterValues;
  /** Nivel, grado y sección solo aplican a la pestaña Estudiantes. */
  isStudent: boolean;
  /** Secciones del año activo; nunca rechaza (si falla, llega vacía). */
  sections: Promise<SectionOption[]>;
  onChange: (patch: Partial<FilterValues>) => void;
}) {
  const level = isEducationLevel(values.level) ? values.level : '';
  const hasFilters = Object.values(values).some((v) => v !== '');

  return (
    <div
      className={`flex flex-col gap-3 ${SOFT_FIELDS}`}
      role="group"
      aria-label="Filtros de la lista"
    >
      <FilterBar
        actions={
          hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange({ ...NO_FILTERS })}
              className={cn(
                TOUCH,
                'px-3 text-ink-2 hover:bg-foreground/5 hover:text-foreground md:min-h-9',
              )}
            >
              Quitar filtros
            </Button>
          ) : null
        }
      >
        <SelectField
          name="status"
          label="Estado"
          value={values.status}
          onValueChange={(v) => onChange({ status: v })}
          options={[
            { value: '', label: 'Todos los estados' },
            ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          ]}
        />
        <SelectField
          name="credentials"
          label="Contraseña"
          value={values.credentials}
          onValueChange={(v) => onChange({ credentials: v })}
          options={[
            { value: '', label: 'Todas' },
            ...CREDENTIAL_STATUSES.map((c) => ({ value: c, label: CREDENTIAL_LABELS[c] })),
          ]}
        />
        <SelectField
          name="emailVerified"
          label="Correo"
          value={values.emailVerified}
          onValueChange={(v) => onChange({ emailVerified: v })}
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
              // Cambiar el nivel reinicia grado y sección (dependen de él).
              onValueChange={(v) => onChange({ level: v, gradeLevel: '', sectionId: '' })}
              options={[
                { value: '', label: 'Todos los niveles' },
                ...EDUCATION_LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] })),
              ]}
            />
            {level !== '' ? (
              <SelectField
                name="gradeLevel"
                label="Grado"
                value={values.gradeLevel}
                onValueChange={(v) => onChange({ gradeLevel: v, sectionId: '' })}
                options={[
                  { value: '', label: 'Todos los grados' },
                  ...gradesForLevel(level).map((g) => ({
                    value: String(g),
                    label: gradeLabel(level, g),
                  })),
                ]}
              />
            ) : null}
            <Suspense
              fallback={<SectionSelect options={[]} value="" loading onChange={() => {}} />}
            >
              <LoadedSectionSelect
                sections={sections}
                level={level}
                grade={values.gradeLevel}
                value={values.sectionId}
                onChange={(sectionId) => onChange({ sectionId })}
              />
            </Suspense>
          </>
        ) : null}
      </FilterBar>
    </div>
  );
}

function LoadedSectionSelect({
  sections,
  level,
  grade,
  value,
  onChange,
}: {
  sections: Promise<SectionOption[]>;
  level: string;
  grade: string;
  value: string;
  onChange: (sectionId: string) => void;
}) {
  const all = use(sections);
  const options = enrollTargets(all)
    .filter(
      (s) =>
        (level === '' || (s.level ?? 'SECUNDARIA') === level) &&
        (grade === '' || String(s.gradeLevel) === grade),
    )
    .map((s) => ({ value: s.id, label: sectionLabel(s.gradeLevel, s.code, s.level) }));
  return (
    <SectionSelect
      options={options}
      value={options.some((o) => o.value === value) ? value : ''}
      onChange={onChange}
    />
  );
}

function SectionSelect({
  options,
  value,
  loading = false,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  loading?: boolean;
  onChange: (sectionId: string) => void;
}) {
  return (
    <SelectField
      name="sectionId"
      label="Sección (año activo)"
      value={value}
      onValueChange={onChange}
      disabled={loading}
      options={[
        { value: '', label: loading ? 'Cargando secciones…' : 'Todas las secciones' },
        ...options,
      ]}
    />
  );
}
