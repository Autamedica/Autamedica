import { createAdminClient, createRouteHandlerClient } from '@autamedica/auth/server';
import { headers } from 'next/headers';

export async function getUserIdFromRequest(): Promise<string | null> {
  const supabase = await createRouteHandlerClient();
  const headerList = await headers();
  const authHeader = headerList.get('authorization');

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7);
    try {
      const admin = createAdminClient();
      const { data: userRes } = await admin.auth.getUser(token);
      if (userRes?.user) return userRes.user.id;
    } catch { return null; }
  }

  const { data: userData } = await supabase.auth.getUser();
  return userData.user?.id ?? null;
}

