import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doctorProfileService } from './doctor-profile.service'

const { repo } = vi.hoisted(() => ({
  repo: {
    upsertDoctor: vi.fn(),
    updateProfileIdentity: vi.fn(),
    replaceAvailability: vi.fn(),
  },
}))

vi.mock('../lib/repos/doctor-profile', () => ({ doctorProfileRepo: repo }))

function mockAdmin(existing: { active: boolean | null; license_number: string } | null, error: Error | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return {
    admin: { from } as unknown as Parameters<typeof doctorProfileService.createOrUpdate>[0],
    maybeSingle, from,
  }
}

const application = {
  userId: 'synthetic-user',
  licenseNumber: 'CLAIMED-UNVERIFIED',
  specialty: 'General',
}

describe('doctor self-service profile provisioning', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    repo.upsertDoctor.mockResolvedValue({ id: 'doctor-synthetic' })
    repo.updateProfileIdentity.mockResolvedValue(undefined)
    repo.replaceAvailability.mockResolvedValue(undefined)
  })

  it('never activates an unverified doctor even if the request says active=true', async () => {
    const { admin } = mockAdmin(null)
    await doctorProfileService.createOrUpdate(admin, { ...application, active: true })
    expect(repo.upsertDoctor).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ active: false, license_number: 'CLAIMED-UNVERIFIED' }),
    )
  })

  it('allows pending applicants to submit a license claim while keeping them inactive', async () => {
    const { admin } = mockAdmin({ active: false, license_number: 'PENDING-0000000' })
    await doctorProfileService.createOrUpdate(admin, { ...application, active: true })
    expect(repo.upsertDoctor).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ active: false, license_number: 'CLAIMED-UNVERIFIED' }),
    )
  })

  it('preserves both activation status and verified license on an existing active doctor', async () => {
    const { admin } = mockAdmin({ active: true, license_number: 'CRM-TRUSTED' })
    await doctorProfileService.createOrUpdate(admin, { ...application, active: false })
    expect(repo.upsertDoctor).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ active: true, license_number: 'CRM-TRUSTED' }),
    )
  })

  it('fails closed when approval status cannot be loaded', async () => {
    const { admin } = mockAdmin(null, new Error('database unavailable'))
    await expect(doctorProfileService.createOrUpdate(admin, { ...application, active: true }))
      .rejects.toThrow('database unavailable')
    expect(repo.upsertDoctor).not.toHaveBeenCalled()
  })
})
