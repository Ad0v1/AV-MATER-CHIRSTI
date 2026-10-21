'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { DEV_ROLE_COOKIE } from '@/lib/session';
import { isRole } from '@/lib/roles';

export async function setDevRole(role: string): Promise<void> {
  if (process.env.NODE_ENV === 'production' || !isRole(role)) return;
  (await cookies()).set(DEV_ROLE_COOKIE, role, { path: '/', sameSite: 'lax' });
  revalidatePath('/', 'layout');
}
