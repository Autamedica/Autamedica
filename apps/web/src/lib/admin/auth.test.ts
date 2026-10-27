import { describe, expect, it } from 'vitest'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { resolveAdminRole } from './auth'

function sessionWithRoles(appRole?: string, userRole?: string): Session {
  return {
    user: {
      id: 'e2ab64e1-6b73-4a96-b03b-af10733380dd',
      app_metadata: appRole ? { role: appRole } : {},
      user_metadata: userRole ? { role: userRole } : {},
    },
  } as Session
}

function dbWithRole(role: string | null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role }, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe('admin authority never comes from user-editable metadata', () => {
  it('rejects a forged user_metadata admin role when DB role is patient', async () => {
    expect(await resolveAdminRole(sessionWithRoles(undefined, 'admin'), dbWithRole('patient'))).toBeNull()
  })

  it('rejects a forged role when no trusted DB lookup is provided', async () => {
    expect(await resolveAdminRole(sessionWithRoles(undefined, 'platform_admin'))).toBeNull()
  })

  it('accepts a server-controlled app_metadata admin role', async () => {
    expect(await resolveAdminRole(sessionWithRoles('admin', 'patient'))).toBe('admin')
  })

  it('accepts a trusted database role even when user metadata disagrees', async () => {
    expect(await resolveAdminRole(sessionWithRoles(undefined, 'patient'), dbWithRole('organization_admin'))).toBe('organization_admin')
  })

  it('rejects missing session', async () => {
    expect(await resolveAdminRole(null, dbWithRole('admin'))).toBeNull()
  })
})
