import { MaterialsPage } from '../_materials/materials-page';

export const metadata = { title: 'Lecturas' };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <MaterialsPage params={params} kind="READING" />;
}
