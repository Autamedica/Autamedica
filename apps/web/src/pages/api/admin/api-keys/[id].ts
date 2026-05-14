import { jsonOk, jsonFail, notFound } from '@/lib/api-helpers'
import { withAuth, ADMIN_ROLES } from '@/lib/api-auth'

type ApiKeysRevokeTable = {
  update: (patch: { revoked_at: string }) => {
    eq: (column: string, value: string) => {
      is: (column: string, value: null) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>
        }
      }
    }
  }
}

// DELETE /api/admin/api-keys/:id — revoke a key
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = await withAuth(request)
  if (auth instanceof Response) return auth

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('role')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (!profile || !(ADMIN_ROLES as string[]).includes(profile.role)) {
    return jsonFail('FORBIDDEN', 'admin access required', 403)
  }

  const apiKeys = auth.supabase.from('api_keys' as never) as unknown as ApiKeysRevokeTable
  const { data: key, error } = await apiKeys
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('revoked_at', null)
    .select('id, name, revoked_at')
    .single()

  if (error || !key) {
    return notFound('api key not found or already revoked')
  }

  return jsonOk({ revoked: key })
}
