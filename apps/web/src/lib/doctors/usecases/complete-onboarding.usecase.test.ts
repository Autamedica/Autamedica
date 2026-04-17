import { describe, it, expect, vi } from 'vitest'
import type { IDoctorRepository } from '@autamedica/types'
import { completeOnboardingUseCase } from './complete-onboarding.usecase'

function createMockRepo(overrides: Partial<IDoctorRepository> = {}): IDoctorRepository {
  return {
    findAll: vi.fn(),
    findByUserId: vi.fn(),
    findById: vi.fn(),
    findBySpecialty: vi.fn(),
    resolveIdByUserId: vi.fn(),
    markOnboardingComplete: vi.fn().mockResolvedValue(undefined),
    markUserMetadataOnboardingComplete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('completeOnboardingUseCase', () => {
  it('returns ok and marks profile + metadata when inputs are valid', async () => {
    const repo = createMockRepo()

    const result = await completeOnboardingUseCase(
      { doctorsRepo: repo },
      { userId: 'user-1', firstName: 'Ada', lastName: 'Lovelace' },
    )

    expect(result).toEqual({ kind: 'ok' })
    expect(repo.markOnboardingComplete).toHaveBeenCalledTimes(1)
    const call = (repo.markOnboardingComplete as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.userId).toBe('user-1')
    expect(call.firstName).toBe('Ada')
    expect(call.lastName).toBe('Lovelace')
    expect(typeof call.completedAt).toBe('string')
    expect(repo.markUserMetadataOnboardingComplete).toHaveBeenCalledWith('user-1')
  })

  it('passes null names through when omitted', async () => {
    const repo = createMockRepo()

    await completeOnboardingUseCase({ doctorsRepo: repo }, { userId: 'user-2' })

    const call = (repo.markOnboardingComplete as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.firstName).toBeNull()
    expect(call.lastName).toBeNull()
  })

  it('rejects empty userId without touching the repo', async () => {
    const repo = createMockRepo()

    const result = await completeOnboardingUseCase({ doctorsRepo: repo }, { userId: '   ' })

    expect(result).toEqual({ kind: 'error', message: 'userId_required' })
    expect(repo.markOnboardingComplete).not.toHaveBeenCalled()
    expect(repo.markUserMetadataOnboardingComplete).not.toHaveBeenCalled()
  })

  it('returns error when profile update fails', async () => {
    const repo = createMockRepo({
      markOnboardingComplete: vi.fn().mockRejectedValue(new Error('db down')),
    })

    const result = await completeOnboardingUseCase(
      { doctorsRepo: repo },
      { userId: 'user-3' },
    )

    expect(result).toEqual({ kind: 'error', message: 'profile_update_failed' })
    expect(repo.markUserMetadataOnboardingComplete).not.toHaveBeenCalled()
  })

  it('still returns ok when metadata update fails (non-fatal)', async () => {
    const repo = createMockRepo({
      markUserMetadataOnboardingComplete: vi.fn().mockRejectedValue(new Error('auth api down')),
    })

    const result = await completeOnboardingUseCase(
      { doctorsRepo: repo },
      { userId: 'user-4' },
    )

    expect(result).toEqual({ kind: 'ok' })
    expect(repo.markOnboardingComplete).toHaveBeenCalledTimes(1)
  })
})
