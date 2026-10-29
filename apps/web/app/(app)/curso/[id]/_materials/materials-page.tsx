import { Suspense } from 'react';
import { apiServer } from '@/lib/api/server';
import { toUserMessage } from '@/lib/api/errors';
import { MaterialsPanel, type MaterialItem } from './materials-panel';

// Página de materiales por curso (Dev 3, fase 3f). Lee con el BFF (D-037); el backend decide permisos.
async function Content({
  params,
  kind,
}: {
  params: Promise<{ id: string }>;
  kind: 'CLASS' | 'READING';
}) {
  const { id } = await params;
  const base = `/course-sections/${encodeURIComponent(id)}/materials`;
  let items: MaterialItem[] = [];
  let error: string | null = null;
  try {
    const all = await apiServer.get<MaterialItem[] | { items: MaterialItem[] }>(base);
    items = (Array.isArray(all) ? all : all.items).filter((m) => m.kind === kind);
  } catch (e) {
    error = toUserMessage(e);
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  // La papelera solo la ve quien puede escribir: sirve como prueba de permiso para mostrar el formulario.
  const canWrite = await apiServer.get(`${base}?includeDeleted=true`).then(
    () => true,
    () => false,
  );
  return <MaterialsPanel courseSectionId={id} kind={kind} items={items} canWrite={canWrite} />;
}

export function MaterialsPage(props: {
  params: Promise<{ id: string }>;
  kind: 'CLASS' | 'READING';
}) {
  const title = props.kind === 'CLASS' ? 'Clases' : 'Lecturas';
  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        {props.kind === 'CLASS'
          ? 'Clases del curso en PDF.'
          : 'Lecturas y libros en PDF, con aviso de derechos de autor.'}
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando materiales…</p>}>
        <Content params={props.params} kind={props.kind} />
      </Suspense>
    </div>
  );
}
