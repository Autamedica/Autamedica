import { jsonOk, jsonFail, badRequest } from '@/lib/api-helpers'
import { withAuth, ADMIN_ROLES } from '@/lib/api-auth'
import { createHash, randomBytes } from 'node:crypto'

const KEY_PREFIX = 'akm_live_' as const
const KEY_PREFIX_LENGTH = KEY_PREFIX.length
const RAW_KEY_LENGTH = 32
const VISIBLE_PREFIX_LENGTH = 12
const DEFAULT_SCOPES = ['read:evaluations'] as const
const ALLOWED_SCOPES = new Set<string>([
  '*',
  'read:evaluations',
  'openclaw:send',
  'openclaw:dispatch',
  'appointments:read',
  'appointments:write',
  'prescriptions:read',
])

type ApiKeyPayload = Record<string, unknown>

type ApiKeysTable = {
  select: (columns: string) => {
    is: (column: string, value: null) => {
      order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>
    }
  }
  insert: (row: Record<string, unknown>) => {
    select: (columns: string) => {
      single: () => Promise<{ data: ApiKeyPayload | null; error: { message: string } | null }>
    }
  }
}

function generateApiKey(): { fullKey: string; prefix: string; hash: string } {
  const raw = randomBytes(RAW_KEY_LENGTH).toString('hex')
  const fullKey = `${KEY_PREFIX}${raw}`
  const prefix = fullKey.slice(0, KEY_PREFIX_LENGTH + VISIBLE_PREFIX_LENGTH)
  const hash = createHash('sha256').update(fullKey).digest('hex')
  return { fullKey, prefix, hash }
}

// GET /api/admin/api-keys — list all active keys
export async function GET(request: Request) {
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

  const apiKeys = auth.supabase.from('api_keys' as never) as unknown as ApiKeysTable
  const { data: keys, error } = await apiKeys
    .select('id, name, key_prefix, scopes, belongs_to, created_at, last_used_at, expires_at, revoked_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) return jsonFail('INTERNAL', error.message, 500)

  return jsonOk(keys)
}

// POST /api/admin/api-keys — create a new key
export async function POST(request: Request) {
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

  let body: { name?: string; scopes?: string[]; belongs_to?: string; expires_at?: string }
  try {
    body = await request.json()
  } catch {
    return badRequest('invalid JSON body')
  }

  if (!body.name || typeof body.name !== 'string') {
    return badRequest('name is required')
  }

  const scopes = body.scopes ?? [...DEFAULT_SCOPES]
  if (
    !Array.isArray(scopes) ||
    scopes.length === 0 ||
    scopes.some((scope) => typeof scope !== 'string' || !ALLOWED_SCOPES.has(scope))
  ) {
    return badRequest('invalid scopes')
  }

  const { fullKey, prefix, hash } = generateApiKey()

  const apiKeys = auth.supabase.from('api_keys' as never) as unknown as ApiKeysTable
  const { data: key, error } = await apiKeys
    .insert({
      name: body.name,
      key_prefix: prefix,
      key_hash: hash,
      scopes,
      belongs_to: body.belongs_to ?? null,
      created_by: auth.user.id,
      expires_at: body.expires_at ?? null,
    })
    .select('id, name, key_prefix, scopes, belongs_to, created_at, expires_at')
    .single()

  if (error) return jsonFail('INTERNAL', error.message, 500)
  if (!key) return jsonFail('INTERNAL', 'api key creation returned no data', 500)

  return jsonOk({ ...key, api_key: fullKey }, 201)
}
