// B1 (Dev 1, RF-08): /curso/:id lleva a la primera pestaña (Clases).
import { redirect } from 'next/navigation';
import { COURSE_ROUTES } from '@/lib/routes';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(COURSE_ROUTES.clases(encodeURIComponent(id)));
}
