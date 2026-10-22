import type { SupabaseClient, Session } from '@supabase/supabase-js';

const ADMIN_ROLES = new Set(['admin', 'organization_admin', 'platform_admin']);

type ProfileRoleClient = Pick<SupabaseClient, 'from'>;

export function isAdminRole(role: unknown): role is string {
  return typeof role === 'string' && ADMIN_ROLES.has(role);
}

export async function resolveAdminRole(
  session: Session | null | undefined,
  supabase?: ProfileRoleClient | null,
): Promise<string | null> {
  if (!session?.user) return null;

  // A profile backed by trusted DB controls is the only authorization source.
  if (!supabase) return null;

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', session.user.id)
    .maybeSingle();

  return isAdminRole(data?.role) ? data.role : null;
}
