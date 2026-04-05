import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpsertProfile = vi.fn()
const mockUpsertPatient = vi.fn()
const mockEnsureBoth = vi.fn()
const mockUpdateOnboardingComplete = vi.fn()

vi.mock('@/lib/patients/lib/repos/profile.adapter', () => ({
  createProfileAdapter: () => ({
    upsertProfile: mockUpsertProfile,
    upsertPatient: mockUpsertPatient,
    ensureBoth: mockEnsureBoth,
    updateOnboardingComplete: mockUpdateOnboardingComplete,
  }),
}))

vi.mock('@/lib/patients/lib/ai/context-builder', () => ({
  buildPatientContext: vi.fn().mockResolvedValue({}),
  persistPatientContextFiles: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/patients/lib/zod/patients', () => ({
  buildPatientUpdatePayload: (input: Record<string, unknown>) => input,
}))

vi.mock('@/lib/patients/lib/zod/profiles', () => ({
  buildProfileUpdatePayload: (input: Record<string, unknown>) => input,
}))

vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { profileService } from './profile.service'

/** Minimal Supabase stub — adapter is fully mocked so no real DB calls occur */
function fakeSupabase() {
  return {} as unknown as Parameters<typeof profileService.update>[0]
}

/** Minimal admin Supabase stub with auth.admin.updateUserById */
function fakeAdminSupabase(updateResult: { error: unknown } = { error: null }) {
  return {
    auth: {
      admin: {
        updateUserById: vi.fn().mockResolvedValue(updateResult),
      },
    },
  } as unknown as Parameters<typeof profileService.completeOnboarding>[1]
}

describe('profileService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsertProfile.mockResolvedValue({ user_id: 'u1', first_name: 'Juan' })
    mockUpsertPatient.mockResolvedValue({ user_id: 'u1', dni: '12345678' })
    mockEnsureBoth.mockResolvedValue(undefined)
    mockUpdateOnboardingComplete.mockResolvedValue(undefined)
  })

  describe('update', () => {
    it('updates profile when profile data is provided', async () => {
      const result = await profileService.update(fakeSupabase(), 'user-1', {
        profile: { firstName: 'Juan', lastName: 'Perez' },
      })

      expect(mockUpsertProfile).toHaveBeenCalledWith('user-1', {
        firstName: 'Juan',
        lastName: 'Perez',
      })
      expect(result.profile).toEqual({ user_id: 'u1', first_name: 'Juan' })
    })

    it('updates patient when patient data is provided', async () => {
      const result = await profileService.update(fakeSupabase(), 'user-1', {
        patient: { dni: '12345678', birthDate: '1990-01-01' },
      })

      expect(mockUpsertPatient).toHaveBeenCalledWith('user-1', {
        dni: '12345678',
        birthDate: '1990-01-01',
      })
      expect(result.patient).toEqual({ user_id: 'u1', dni: '12345678' })
    })

    it('updates both profile and patient when both are provided', async () => {
      const result = await profileService.update(fakeSupabase(), 'user-1', {
        profile: { firstName: 'Juan' },
        patient: { dni: '12345678' },
      })

      expect(mockUpsertProfile).toHaveBeenCalled()
      expect(mockUpsertPatient).toHaveBeenCalled()
      expect(result.profile).toBeDefined()
      expect(result.patient).toBeDefined()
    })

    it('returns null for profile when no profile input', async () => {
      const result = await profileService.update(fakeSupabase(), 'user-1', {
        patient: { dni: '12345678' },
      })

      expect(mockUpsertProfile).not.toHaveBeenCalled()
      expect(result.profile).toBeNull()
    })

    it('returns null for patient when no patient input', async () => {
      const result = await profileService.update(fakeSupabase(), 'user-1', {
        profile: { firstName: 'Test' },
      })

      expect(mockUpsertPatient).not.toHaveBeenCalled()
      expect(result.patient).toBeNull()
    })

    it('throws PROFILE_UPDATE_FAILED when profile upsert fails', async () => {
      mockUpsertProfile.mockRejectedValue(new Error('DB connection lost'))

      await expect(
        profileService.update(fakeSupabase(), 'user-1', {
          profile: { firstName: 'Test' },
        }),
      ).rejects.toThrow('DB connection lost')
    })

    it('handles patient update failure gracefully (logs warning, does not throw)', async () => {
      mockUpsertPatient.mockRejectedValue(new Error('patient constraint violation'))

      const result = await profileService.update(fakeSupabase(), 'user-1', {
        patient: { dni: 'invalid' },
      })

      // Patient update failure is caught and logged, not thrown
      expect(result.patient).toBeNull()
    })

    it('handles empty input objects', async () => {
      const result = await profileService.update(fakeSupabase(), 'user-1', {})

      expect(mockUpsertProfile).not.toHaveBeenCalled()
      expect(mockUpsertPatient).not.toHaveBeenCalled()
      expect(result.profile).toBeNull()
      expect(result.patient).toBeNull()
    })
  })

  describe('ensure', () => {
    it('calls ensureBoth with userId and email', async () => {
      await profileService.ensure(fakeSupabase(), 'user-1', 'test@example.com')
      expect(mockEnsureBoth).toHaveBeenCalledWith('user-1', 'test@example.com')
    })

    it('calls ensureBoth with null email when not provided', async () => {
      await profileService.ensure(fakeSupabase(), 'user-1')
      expect(mockEnsureBoth).toHaveBeenCalledWith('user-1', undefined)
    })

    it('propagates errors from ensureBoth', async () => {
      mockEnsureBoth.mockRejectedValue(new Error('DB error'))
      await expect(profileService.ensure(fakeSupabase(), 'user-1')).rejects.toThrow('DB error')
    })
  })

  describe('completeOnboarding', () => {
    it('updates onboarding complete in profile and auth metadata', async () => {
      const admin = fakeAdminSupabase()

      await profileService.completeOnboarding(fakeSupabase(), admin, 'user-1')

      expect(mockUpdateOnboardingComplete).toHaveBeenCalledWith('user-1')
      expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('user-1', {
        user_metadata: { onboarding_completed: true },
      })
    })

    it('does not throw when auth metadata update fails (logs error)', async () => {
      const admin = fakeAdminSupabase({ error: new Error('auth service down') })

      // Should not throw despite auth error
      await profileService.completeOnboarding(fakeSupabase(), admin, 'user-1')

      expect(mockUpdateOnboardingComplete).toHaveBeenCalled()
    })

    it('propagates errors from updateOnboardingComplete', async () => {
      mockUpdateOnboardingComplete.mockRejectedValue(new Error('profile update failed'))

      await expect(
        profileService.completeOnboarding(fakeSupabase(), fakeAdminSupabase(), 'user-1'),
      ).rejects.toThrow('profile update failed')
    })
  })
})
