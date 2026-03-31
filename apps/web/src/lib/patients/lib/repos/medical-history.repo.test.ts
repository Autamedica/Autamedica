import { describe, it, expect, vi } from 'vitest'
import { medicalHistoryRepo } from './medical-history.repo'

// Suppress logger output in tests
vi.mock('@autamedica/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

/* ------------------------------------------------------------------ */
/*  Chainable Supabase mock                                           */
/* ------------------------------------------------------------------ */

function createMockSupabase(resolvedValue: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedValue),
    // Terminal — when the chain ends without maybeSingle/single,
    // the awaited result comes from a `.then` on the chain itself.
    then: (resolve: (v: unknown) => void) => resolve(resolvedValue),
  }

  const from = vi.fn().mockReturnValue(chain)
  return { from, chain } as const
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */

const PATIENT_ID = 'patient-123'
const RECORD_ID = 'record-456'

const mockRecord = {
  id: RECORD_ID,
  patient_id: PATIENT_ID,
  type: 'diagnosis',
  title: 'Test record',
  content: { note: 'hello' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('medicalHistoryRepo', () => {
  /* ---- listByType ------------------------------------------------ */
  describe('listByType', () => {
    it('filters by deleted_at IS NULL', async () => {
      const { from, chain } = createMockSupabase({ data: [mockRecord], error: null })
      await medicalHistoryRepo.listByType(
        { from } as never,
        PATIENT_ID,
        'diagnosis',
      )
      expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('returns data on success', async () => {
      const { from } = createMockSupabase({ data: [mockRecord], error: null })
      const result = await medicalHistoryRepo.listByType(
        { from } as never,
        PATIENT_ID,
        'diagnosis',
      )
      expect(result).toEqual([mockRecord])
    })

    it('returns empty array when data is null', async () => {
      const { from } = createMockSupabase({ data: null, error: null })
      const result = await medicalHistoryRepo.listByType(
        { from } as never,
        PATIENT_ID,
        'diagnosis',
      )
      expect(result).toEqual([])
    })

    it('throws on error', async () => {
      const err = { message: 'db error', code: '42P01' }
      const { from } = createMockSupabase({ data: null, error: err })
      await expect(
        medicalHistoryRepo.listByType({ from } as never, PATIENT_ID, 'diagnosis'),
      ).rejects.toEqual(err)
    })
  })

  /* ---- findById -------------------------------------------------- */
  describe('findById', () => {
    it('filters by deleted_at IS NULL', async () => {
      const { from, chain } = createMockSupabase({ data: mockRecord, error: null })
      await medicalHistoryRepo.findById({ from } as never, PATIENT_ID, RECORD_ID)
      expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('returns the record on success', async () => {
      const { from } = createMockSupabase({ data: mockRecord, error: null })
      const result = await medicalHistoryRepo.findById(
        { from } as never,
        PATIENT_ID,
        RECORD_ID,
      )
      expect(result).toEqual(mockRecord)
    })

    it('returns null when no match', async () => {
      const { from } = createMockSupabase({ data: null, error: null })
      const result = await medicalHistoryRepo.findById(
        { from } as never,
        PATIENT_ID,
        RECORD_ID,
      )
      expect(result).toBeNull()
    })

    it('throws on error', async () => {
      const err = { message: 'not found', code: 'PGRST116' }
      const { from } = createMockSupabase({ data: null, error: err })
      await expect(
        medicalHistoryRepo.findById({ from } as never, PATIENT_ID, RECORD_ID),
      ).rejects.toEqual(err)
    })
  })

  /* ---- listConsultations ----------------------------------------- */
  describe('listConsultations', () => {
    it('filters by deleted_at IS NULL', async () => {
      const { from, chain } = createMockSupabase({ data: [mockRecord], error: null })
      await medicalHistoryRepo.listConsultations({ from } as never, PATIENT_ID)
      expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('passes type=consultation and orders by created_at desc', async () => {
      const { from, chain } = createMockSupabase({ data: [mockRecord], error: null })
      await medicalHistoryRepo.listConsultations({ from } as never, PATIENT_ID)
      expect(chain.eq).toHaveBeenCalledWith('type', 'consultation')
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('applies custom limit', async () => {
      const { from, chain } = createMockSupabase({ data: [], error: null })
      await medicalHistoryRepo.listConsultations({ from } as never, PATIENT_ID, 10)
      expect(chain.limit).toHaveBeenCalledWith(10)
    })

    it('returns data on success', async () => {
      const { from } = createMockSupabase({ data: [mockRecord], error: null })
      const result = await medicalHistoryRepo.listConsultations(
        { from } as never,
        PATIENT_ID,
      )
      expect(result).toEqual([mockRecord])
    })

    it('throws on error', async () => {
      const err = { message: 'timeout' }
      const { from } = createMockSupabase({ data: null, error: err })
      await expect(
        medicalHistoryRepo.listConsultations({ from } as never, PATIENT_ID),
      ).rejects.toEqual(err)
    })
  })

  /* ---- listAll --------------------------------------------------- */
  describe('listAll', () => {
    it('filters by deleted_at IS NULL', async () => {
      const { from, chain } = createMockSupabase({ data: [mockRecord], error: null })
      await medicalHistoryRepo.listAll({ from } as never, PATIENT_ID)
      expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('does NOT filter by type', async () => {
      const { from, chain } = createMockSupabase({ data: [mockRecord], error: null })
      await medicalHistoryRepo.listAll({ from } as never, PATIENT_ID)
      // eq is called once for patient_id, never for type
      const eqCalls = chain.eq.mock.calls.map(([col]: [string]) => col)
      expect(eqCalls).not.toContain('type')
    })

    it('orders by created_at desc', async () => {
      const { from, chain } = createMockSupabase({ data: [], error: null })
      await medicalHistoryRepo.listAll({ from } as never, PATIENT_ID)
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('returns data on success', async () => {
      const { from } = createMockSupabase({ data: [mockRecord, mockRecord], error: null })
      const result = await medicalHistoryRepo.listAll({ from } as never, PATIENT_ID)
      expect(result).toHaveLength(2)
    })

    it('returns empty array when data is null', async () => {
      const { from } = createMockSupabase({ data: null, error: null })
      const result = await medicalHistoryRepo.listAll({ from } as never, PATIENT_ID)
      expect(result).toEqual([])
    })

    it('throws on error', async () => {
      const err = { message: 'connection refused' }
      const { from } = createMockSupabase({ data: null, error: err })
      await expect(
        medicalHistoryRepo.listAll({ from } as never, PATIENT_ID),
      ).rejects.toEqual(err)
    })
  })

  /* ---- insert ---------------------------------------------------- */
  describe('insert', () => {
    it('inserts and returns the created record', async () => {
      const { from } = createMockSupabase({ data: mockRecord, error: null })
      const result = await medicalHistoryRepo.insert(
        { from } as never,
        PATIENT_ID,
        'diagnosis',
        'Test',
        { note: 'hello' },
      )
      expect(result).toEqual(mockRecord)
    })

    it('calls from with medical_records', async () => {
      const { from } = createMockSupabase({ data: mockRecord, error: null })
      await medicalHistoryRepo.insert(
        { from } as never,
        PATIENT_ID,
        'diagnosis',
        'Test',
        {},
      )
      expect(from).toHaveBeenCalledWith('medical_records')
    })

    it('throws on error', async () => {
      const err = { message: 'unique violation' }
      const { from } = createMockSupabase({ data: null, error: err })
      await expect(
        medicalHistoryRepo.insert(
          { from } as never,
          PATIENT_ID,
          'diagnosis',
          'Test',
          {},
        ),
      ).rejects.toEqual(err)
    })
  })
})
