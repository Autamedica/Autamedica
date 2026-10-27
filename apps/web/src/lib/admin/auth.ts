import type { SupabaseClient, Session } from '@supabase/supabase-js';

const ADMIN_ROLES = new Set(['admin', 'organization_admin', 'platform_admin']);

type ProfileRoleClient = Pick<SupabaseClient, 'from'>;

function metadataRole(metadata: Record<string, unknown> | undefined): string | null {
  const role = metadata?.role;
  return typeof role === 'string' ? role : null;
}

export function isAdminRole(role: unknown): role is string {
  return typeof role === 'string' && ADMIN_ROLES.has(role);
}

export async function resolveAdminRole(
  session: Session | null | undefined,
  supabase?: ProfileRoleClient | null,
): Promise<string | null> {
  if (!session?.user) return null;

  const appRole = metadataRole(session.user.app_metadata as Record<string, unknown> | undefined);
  if (isAdminRole(appRole)) return appRole;

  if (!supabase) return null;

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', session.user.id)
    .maybeSingle();

  return isAdminRole(data?.role) ? data.role : null;
}
