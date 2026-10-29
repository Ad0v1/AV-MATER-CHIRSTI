import { MaterialsPage } from '../_materials/materials-page';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <MaterialsPage params={params} kind="READING" />;
}
