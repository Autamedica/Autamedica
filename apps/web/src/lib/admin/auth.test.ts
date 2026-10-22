import { describe, expect, it, vi } from 'vitest'
import { resolveAdminRole } from './auth'

const session = (role: string) => ({
  user: { id: 'uid-1', app_metadata: {}, user_metadata: { role } },
}) as unknown as Parameters<typeof resolveAdminRole>[0]

const db = (role: string | null, fails = false) => {
  const maybeSingle = vi.fn().mockResolvedValue({ data: role ? { role } : null, error: fails ? Error('db') : null })
  return {
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  } as unknown as NonNullable<Parameters<typeof resolveAdminRole>[1]>
}

describe('admin role authority', () => {
  it('refuses forged user metadata', async () => {
    expect(await resolveAdminRole(session('platform_admin'), db('patient'))).toBeNull()
  })
  it('accepts trusted database privilege', async () => {
    expect(await resolveAdminRole(session('patient'), db('platform_admin'))).toBe('platform_admin')
  })
  it('fails closed without profile access', async () => {
    expect(await resolveAdminRole(session('admin'))).toBeNull()
    expect(await resolveAdminRole(session('admin'), db(null, true))).toBeNull()
  })
})
