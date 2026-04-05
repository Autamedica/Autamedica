import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const mockFetchApi = vi.fn()

vi.mock('@/lib/api-client', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}))

import { doctorService } from './doctor.service'

const DOCTOR_A = {
  id: 'doc-1',
  userId: 'u-1',
  firstName: 'Ana',
  lastName: 'Garcia',
  specialty: 'Cardiology',
  licenseNumber: 'LIC-001',
  active: true,
}

const DOCTOR_B = {
  id: 'doc-2',
  userId: 'u-2',
  firstName: 'Carlos',
  lastName: 'Lopez',
  specialty: 'Neurology',
  licenseNumber: 'LIC-002',
  active: true,
}

describe('doctorService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getDoctors', () => {
    it('returns list of doctors from API', async () => {
      mockFetchApi.mockResolvedValue([DOCTOR_A, DOCTOR_B])

      const result = await doctorService.getDoctors()

      expect(mockFetchApi).toHaveBeenCalledWith('/api/doctors/profile')
      expect(result).toHaveLength(2)
      expect(result[0].specialty).toBe('Cardiology')
    })

    it('returns empty array when no doctors exist', async () => {
      mockFetchApi.mockResolvedValue([])

      const result = await doctorService.getDoctors()

      expect(result).toEqual([])
    })

    it('propagates API errors', async () => {
      mockFetchApi.mockRejectedValue(new Error('Network error'))

      await expect(doctorService.getDoctors()).rejects.toThrow('Network error')
    })
  })

  describe('getDoctorByUserId', () => {
    it('returns doctor matching userId', async () => {
      mockFetchApi.mockResolvedValue(DOCTOR_A)

      const result = await doctorService.getDoctorByUserId('u-1')

      expect(mockFetchApi).toHaveBeenCalledWith('/api/doctors/profile?userId=u-1')
      expect(result?.firstName).toBe('Ana')
    })

    it('returns null when no doctor matches', async () => {
      mockFetchApi.mockResolvedValue(null)

      const result = await doctorService.getDoctorByUserId('nonexistent')

      expect(result).toBeNull()
    })

    it('propagates API errors with userId context', async () => {
      mockFetchApi.mockRejectedValue(new Error('Unauthorized'))

      await expect(doctorService.getDoctorByUserId('u-1')).rejects.toThrow('Unauthorized')
    })
  })

  describe('getDoctorById', () => {
    it('returns doctor matching id', async () => {
      mockFetchApi.mockResolvedValue(DOCTOR_B)

      const result = await doctorService.getDoctorById('doc-2')

      expect(mockFetchApi).toHaveBeenCalledWith('/api/doctors/profile?id=doc-2')
      expect(result?.specialty).toBe('Neurology')
    })

    it('returns null for unknown id', async () => {
      mockFetchApi.mockResolvedValue(null)

      const result = await doctorService.getDoctorById('unknown')

      expect(result).toBeNull()
    })

    it('propagates API errors', async () => {
      mockFetchApi.mockRejectedValue(new Error('Server error'))

      await expect(doctorService.getDoctorById('doc-1')).rejects.toThrow('Server error')
    })
  })

  describe('getDoctorsBySpecialty', () => {
    it('returns doctors filtered by specialty', async () => {
      mockFetchApi.mockResolvedValue([DOCTOR_A])

      const result = await doctorService.getDoctorsBySpecialty('Cardiology')

      expect(mockFetchApi).toHaveBeenCalledWith(
        '/api/doctors/profile?specialty=Cardiology',
      )
      expect(result).toHaveLength(1)
      expect(result[0].specialty).toBe('Cardiology')
    })

    it('URL-encodes specialty with special characters', async () => {
      mockFetchApi.mockResolvedValue([])

      await doctorService.getDoctorsBySpecialty('Medicina General & Familiar')

      expect(mockFetchApi).toHaveBeenCalledWith(
        '/api/doctors/profile?specialty=Medicina%20General%20%26%20Familiar',
      )
    })

    it('returns empty array when no doctors match specialty', async () => {
      mockFetchApi.mockResolvedValue([])

      const result = await doctorService.getDoctorsBySpecialty('Dermatology')

      expect(result).toEqual([])
    })

    it('propagates API errors', async () => {
      mockFetchApi.mockRejectedValue(new Error('Timeout'))

      await expect(
        doctorService.getDoctorsBySpecialty('Cardiology'),
      ).rejects.toThrow('Timeout')
    })
  })
})
