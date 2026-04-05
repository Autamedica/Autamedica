import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindByPatient = vi.fn()
const mockEnsure = vi.fn()
const mockGetSections = vi.fn()
const mockUpsertSection = vi.fn()
const mockUpdateProgress = vi.fn()
const mockUpdateMeta = vi.fn()

vi.mock('@/lib/patients/lib/repos/anamnesis.adapter', () => ({
  createAnamnesisAdapter: () => ({
    findByPatient: mockFindByPatient,
    ensure: mockEnsure,
    getSections: mockGetSections,
    upsertSection: mockUpsertSection,
    updateProgress: mockUpdateProgress,
    updateMeta: mockUpdateMeta,
  }),
}))

vi.mock('./anamnesis-version.service', () => ({
  anamnesisVersionService: {
    createVersion: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { anamnesisService, KNOWN_SECTIONS } from './anamnesis.service'

/** Minimal Supabase stub — only the .from('patients').select().eq().maybeSingle() path used by anamnesisService.get */
function fakeSupabase() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof anamnesisService.get>[0]
}

const BASE_ANAMNESIS = {
  id: 'anamnesis-1',
  patient_id: 'patient-1',
  status: 'in_progress',
  completion_percentage: 0,
  sections_status: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  completed_at: null,
}

/**
 * Helper to read progress fields regardless of snake_case vs camelCase.
 * esbuild/vitest may transform property names to camelCase at runtime.
 */
function readProgress(progress: Record<string, unknown>) {
  return {
    completionPercentage:
      (progress.completionPercentage ?? progress.completion_percentage) as number,
    completedSections:
      (progress.completedSections ?? progress.completed_sections) as string[],
    pendingSections:
      (progress.pendingSections ?? progress.pending_sections) as string[],
    totalSections:
      (progress.totalSections ?? progress.total_sections) as number,
  }
}

describe('anamnesisService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsure.mockResolvedValue(BASE_ANAMNESIS)
    mockGetSections.mockResolvedValue([])
    mockUpsertSection.mockResolvedValue({ id: 'sec-1', section: 'edad', completed: true })
    mockUpdateProgress.mockResolvedValue(undefined)
    mockUpdateMeta.mockResolvedValue({ ...BASE_ANAMNESIS, status: 'completed' })
  })

  describe('get', () => {
    it('returns snapshot with zero progress when no sections are completed', async () => {
      const result = await anamnesisService.get(fakeSupabase(), 'patient-1')
      const p = readProgress(result.progress as unknown as Record<string, unknown>)

      expect(result.anamnesis.id).toBe('anamnesis-1')
      expect(p.completionPercentage).toBe(0)
      expect(p.completedSections).toEqual([])
      expect(p.pendingSections).toEqual([...KNOWN_SECTIONS])
      expect(p.totalSections).toBe(13)
    })

    it('computes progress correctly with some completed sections', async () => {
      mockGetSections.mockResolvedValue([
        { id: 's1', section: 'edad', completed: true },
        { id: 's2', section: 'ocupacion', completed: true },
        { id: 's3', section: 'alergias', completed: false },
      ])

      const result = await anamnesisService.get(fakeSupabase(), 'patient-1')
      const p = readProgress(result.progress as unknown as Record<string, unknown>)

      expect(p.completionPercentage).toBe(15) // 2/13 = ~15%
      expect(p.completedSections).toContain('edad')
      expect(p.completedSections).toContain('ocupacion')
      expect(p.pendingSections).not.toContain('edad')
    })

    it('auto-completes edad section when birth_date is available', async () => {
      const supabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { birth_date: '1990-05-15' }, error: null }),
            }),
          }),
        }),
      } as unknown as Parameters<typeof anamnesisService.get>[0]

      mockGetSections
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 's1', section: 'edad', completed: true }])

      const result = await anamnesisService.get(supabase, 'patient-1')
      const p = readProgress(result.progress as unknown as Record<string, unknown>)

      expect(mockUpsertSection).toHaveBeenCalledWith(
        'anamnesis-1',
        'edad',
        expect.objectContaining({ fecha_nacimiento: '1990-05-15' }),
        true,
      )
      expect(p.completedSections).toContain('edad')
    })

    it('skips edad auto-complete when birth_date is null', async () => {
      await anamnesisService.get(fakeSupabase(), 'patient-1')
      expect(mockUpsertSection).not.toHaveBeenCalled()
    })

    it('syncs progress when DB value differs from computed', async () => {
      mockEnsure.mockResolvedValue({ ...BASE_ANAMNESIS, completion_percentage: 50 })
      mockGetSections.mockResolvedValue([
        { id: 's1', section: 'edad', completed: true },
      ])

      await anamnesisService.get(fakeSupabase(), 'patient-1')

      expect(mockUpdateProgress).toHaveBeenCalledWith(
        'anamnesis-1',
        8, // 1/13 ~= 8%
        ['edad'],
      )
    })
  })

  describe('updateMeta', () => {
    it('updates status and auto-sets completed_at for completed status', async () => {
      const result = await anamnesisService.updateMeta(fakeSupabase(), 'patient-1', {
        status: 'completed',
      })

      expect(mockUpdateMeta).toHaveBeenCalledWith(
        'anamnesis-1',
        expect.objectContaining({
          status: 'completed',
          completed_at: expect.any(String),
        }),
      )
      expect(result).toBeDefined()
    })

    it('clamps completion_percentage to 0-100', async () => {
      await anamnesisService.updateMeta(fakeSupabase(), 'patient-1', {
        completion_percentage: 150,
      })

      expect(mockUpdateMeta).toHaveBeenCalledWith(
        'anamnesis-1',
        expect.objectContaining({ completion_percentage: 100 }),
      )
    })

    it('clamps negative completion_percentage to 0', async () => {
      await anamnesisService.updateMeta(fakeSupabase(), 'patient-1', {
        completion_percentage: -20,
      })

      expect(mockUpdateMeta).toHaveBeenCalledWith(
        'anamnesis-1',
        expect.objectContaining({ completion_percentage: 0 }),
      )
    })

    it('throws NO_UPDATES when no valid fields are provided', async () => {
      await expect(
        anamnesisService.updateMeta(fakeSupabase(), 'patient-1', { garbage: true }),
      ).rejects.toThrow('no_updates')
    })

    it('accepts boolean privacy_accepted and terms_accepted', async () => {
      await anamnesisService.updateMeta(fakeSupabase(), 'patient-1', {
        privacy_accepted: true,
        terms_accepted: true,
      })

      expect(mockUpdateMeta).toHaveBeenCalledWith(
        'anamnesis-1',
        expect.objectContaining({
          privacy_accepted: true,
          terms_accepted: true,
        }),
      )
    })

    it('ignores non-boolean privacy_accepted', async () => {
      await expect(
        anamnesisService.updateMeta(fakeSupabase(), 'patient-1', {
          privacy_accepted: 'yes',
        }),
      ).rejects.toThrow('no_updates')
    })
  })

  describe('saveSection', () => {
    it('saves a section and returns updated progress', async () => {
      mockGetSections.mockResolvedValue([
        { id: 's1', section: 'motivo_consulta', completed: true },
      ])

      const result = await anamnesisService.saveSection(
        fakeSupabase(),
        'patient-1',
        'motivo_consulta',
        { motivo: 'dolor de cabeza' },
        true,
      )
      const p = readProgress(result.progress as unknown as Record<string, unknown>)

      expect(result.section).toBeDefined()
      expect(p.completionPercentage).toBe(8) // 1/13
    })

    it('auto-computes edad when fecha_nacimiento is provided without edad', async () => {
      mockGetSections.mockResolvedValue([
        { id: 's1', section: 'edad', completed: true },
      ])

      await anamnesisService.saveSection(
        fakeSupabase(),
        'patient-1',
        'edad',
        { fecha_nacimiento: '2000-01-01' },
        true,
      )

      expect(mockUpsertSection).toHaveBeenCalledWith(
        'anamnesis-1',
        'edad',
        expect.objectContaining({
          fecha_nacimiento: '2000-01-01',
          edad: expect.any(Number),
        }),
        true,
      )
    })

    it('does not override edad when already provided', async () => {
      mockGetSections.mockResolvedValue([])

      await anamnesisService.saveSection(
        fakeSupabase(),
        'patient-1',
        'edad',
        { fecha_nacimiento: '2000-01-01', edad: 25 },
        true,
      )

      expect(mockUpsertSection).toHaveBeenCalledWith(
        'anamnesis-1',
        'edad',
        expect.objectContaining({ edad: 25 }),
        true,
      )
    })

    it('handles empty data gracefully', async () => {
      mockGetSections.mockResolvedValue([])

      const result = await anamnesisService.saveSection(
        fakeSupabase(),
        'patient-1',
        'alergias',
        {},
        false,
      )
      const p = readProgress(result.progress as unknown as Record<string, unknown>)

      expect(result.section).toBeDefined()
      expect(p.completionPercentage).toBe(0)
    })
  })

  describe('KNOWN_SECTIONS', () => {
    it('contains exactly 13 sections', () => {
      expect(KNOWN_SECTIONS).toHaveLength(13)
    })

    it('starts with edad and ends with resumen_final', () => {
      expect(KNOWN_SECTIONS[0]).toBe('edad')
      expect(KNOWN_SECTIONS[KNOWN_SECTIONS.length - 1]).toBe('resumen_final')
    })
  })
})
