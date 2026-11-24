import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AdminClient } from '../lib/repos/doctor-profile'
import { doctorProfileRepo } from '../lib/repos/doctor-profile'
import { doctorProfileService } from './doctor-profile.service'

vi.mock('../lib/repos/doctor-profile', () => ({
  doctorProfileRepo: {
    findExistingDoctorStatus: vi.fn(),
    upsertDoctor: vi.fn(),
    updateProfileIdentity: vi.fn(),
    replaceAvailability: vi.fn(),
    ensurePendingLicense: vi.fn(),
    markArValidationPendingReview: vi.fn(),
  },
}))

const fakeAdmin = {} as AdminClient

describe('doctorProfileService.createOrUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(doctorProfileRepo.findExistingDoctorStatus).mockResolvedValue(null)
    vi.mocked(doctorProfileRepo.upsertDoctor).mockResolvedValue({ id: 'doc-1' })
    vi.mocked(doctorProfileRepo.updateProfileIdentity).mockResolvedValue(undefined)
    vi.mocked(doctorProfileRepo.replaceAvailability).mockResolvedValue(undefined)
    vi.mocked(doctorProfileRepo.ensurePendingLicense).mockResolvedValue(undefined)
    vi.mocked(doctorProfileRepo.markArValidationPendingReview).mockResolvedValue(undefined)
  })

  it('keeps new AR self-onboarding doctors inactive, creates pending license, and marks pending_review', async () => {
    await doctorProfileService.createOrUpdate(fakeAdmin, {
      userId: 'user-ar',
      licenseNumber: '123456',
      licenseType: 'MN',
      specialty: 'Clínica Médica',
      enrollmentJurisdiction: 'CABA',
      firstName: 'Ana',
      lastName: 'Pérez',
      active: true,
      allowActiveOverride: false,
    })

    expect(doctorProfileRepo.upsertDoctor).toHaveBeenCalledWith(
      fakeAdmin,
      expect.objectContaining({
        user_id: 'user-ar',
        license_number: '123456',
        license_type: 'MN',
        care_country: 'AR',
        active: false,
      }),
    )
    expect(doctorProfileRepo.ensurePendingLicense).toHaveBeenCalledWith(fakeAdmin, {
      doctorId: 'doc-1',
      licenseNumber: '123456',
      licenseType: 'MN',
      province: 'CABA',
      ufBrazil: null,
    })
    expect(doctorProfileRepo.markArValidationPendingReview).toHaveBeenCalledWith(fakeAdmin, 'user-ar')
  })

  it('derives BR care_country for CRM onboarding, sets UF, and skips AR SISA review', async () => {
    await doctorProfileService.createOrUpdate(fakeAdmin, {
      userId: 'user-br',
      licenseNumber: '654321',
      licenseType: 'CRM',
      ufBrazil: 'sp',
      specialty: 'Medicina de Família',
    })

    expect(doctorProfileRepo.upsertDoctor).toHaveBeenCalledWith(
      fakeAdmin,
      expect.objectContaining({
        user_id: 'user-br',
        license_number: '654321',
        license_type: 'CRM',
        care_country: 'BR',
        active: false,
      }),
    )
    expect(doctorProfileRepo.ensurePendingLicense).toHaveBeenCalledWith(fakeAdmin, {
      doctorId: 'doc-1',
      licenseNumber: '654321',
      licenseType: 'CRM',
      province: null,
      ufBrazil: 'SP',
    })
    expect(doctorProfileRepo.markArValidationPendingReview).not.toHaveBeenCalled()
  })

  it('preserves active status for an already-active doctor updating profile without admin override', async () => {
    vi.mocked(doctorProfileRepo.findExistingDoctorStatus).mockResolvedValue({
      id: 'doc-1',
      active: true,
    })

    await doctorProfileService.createOrUpdate(fakeAdmin, {
      userId: 'user-existing',
      licenseNumber: '999888',
      licenseType: 'MP',
      specialty: 'Cardiología',
      active: false,
      allowActiveOverride: false,
    })

    expect(doctorProfileRepo.upsertDoctor).toHaveBeenCalledWith(
      fakeAdmin,
      expect.objectContaining({
        active: true,
      }),
    )
  })

  it('allows admin callers to explicitly override active status', async () => {
    await doctorProfileService.createOrUpdate(fakeAdmin, {
      userId: 'user-admin-target',
      licenseNumber: '777666',
      licenseType: 'MN',
      specialty: 'Pediatría',
      active: true,
      allowActiveOverride: true,
    })

    expect(doctorProfileRepo.upsertDoctor).toHaveBeenCalledWith(
      fakeAdmin,
      expect.objectContaining({
        active: true,
      }),
    )
  })
})
