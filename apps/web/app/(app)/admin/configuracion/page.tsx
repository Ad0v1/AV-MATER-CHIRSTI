// /admin/configuracion — configuración institucional (RF-61, Dev 5): datos, tabla de literales,
// plazo de purga y logo. Solo ADMIN (layout de /admin y la API).
import { Suspense } from 'react';
import {
  LoadError,
  LoadingBlock,
  PageHeader,
  PageShell,
  Section,
} from '@/app/(app)/admin/_shared/components/page-bits';
import { LogoForm } from './_components/logo-form';
import { SettingsForm } from './_components/settings-form';
import { getSettings } from './_lib/data';
import type { SettingsView } from './_lib/settings-form';

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title="Configuración institucional"
        description="Nombre, logo, tabla de literales y plazo de purga. Los cambios quedan en la bitácora."
      />
      <Suspense fallback={<LoadingBlock rows={4} label="Cargando configuración…" />}>
        <Content />
      </Suspense>
    </PageShell>
  );
}

async function Content() {
  let settings: SettingsView;
  try {
    settings = await getSettings();
  } catch (error) {
    return <LoadError error={error} />;
  }
  return (
    <>
      <Section id="datos" title="Datos y calificación">
        <SettingsForm settings={settings} />
      </Section>
      <Section id="logo" title="Logo">
        <LogoForm logo={settings.logo} name={settings.name} />
      </Section>
    </>
  );
}
