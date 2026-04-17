import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@autamedica/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const getOpenSlotsMock = vi.fn()
vi.mock('@autamedica/scheduling', () => ({
  getOpenSlots: (...args: unknown[]) => getOpenSlotsMock(...args),
}))

import { DoctorNotFoundError, queryDoctorSlots } from './doctor-slots.query'

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
    single: vi.fn().mockResolvedValue(resolvedValue),
    then: (resolve: (v: unknown) => void) => resolve(resolvedValue),
  }

  const from = vi.fn().mockReturnValue(chain)
  return { from, chain } as const
}

const DOCTOR_ID = '00000000-0000-0000-0000-000000000001'
const PARAMS = { dateFrom: '2026-04-17', dateTo: '2026-04-20' } as const

const SLOT_FIXTURE = {
  doctor_id: DOCTOR_ID,
  date: '2026-04-17',
  start_time: '2026-04-17T09:00:00-03:00',
  end_time: '2026-04-17T09:30:00-03:00',
  duration_minutes: 30,
  location: null,
  is_available: true,
  overbook_eligible: false,
}

describe('queryDoctorSlots', () => {
  beforeEach(() => {
    getOpenSlotsMock.mockReset()
  })

  it('resolves doctor timezone and delegates to getOpenSlots', async () => {
    const { from, chain } = createMockSupabase({
      data: { id: DOCTOR_ID, timezone: 'America/Argentina/Buenos_Aires' },
      error: null,
    })
    getOpenSlotsMock.mockResolvedValue([SLOT_FIXTURE])

    const supabase = { from } as never
    const slots = await queryDoctorSlots(supabase, DOCTOR_ID, PARAMS)

    expect(from).toHaveBeenCalledWith('doctors')
    expect(chain.select).toHaveBeenCalledWith('id, timezone')
    expect(chain.eq).toHaveBeenCalledWith('id', DOCTOR_ID)
    expect(chain.maybeSingle).toHaveBeenCalled()

    expect(getOpenSlotsMock).toHaveBeenCalledWith(supabase, {
      doctor_id: DOCTOR_ID,
      date_from: PARAMS.dateFrom,
      date_to: PARAMS.dateTo,
      timezone: 'America/Argentina/Buenos_Aires',
    })
    expect(slots).toEqual([SLOT_FIXTURE])
  })

  it('omits timezone when the doctor row has none', async () => {
    const { from } = createMockSupabase({
      data: { id: DOCTOR_ID, timezone: null },
      error: null,
    })
    getOpenSlotsMock.mockResolvedValue([])

    await queryDoctorSlots({ from } as never, DOCTOR_ID, PARAMS)

    expect(getOpenSlotsMock).toHaveBeenCalledWith(expect.anything(), {
      doctor_id: DOCTOR_ID,
      date_from: PARAMS.dateFrom,
      date_to: PARAMS.dateTo,
      timezone: undefined,
    })
  })

  it('throws DoctorNotFoundError when the doctor does not exist', async () => {
    const { from } = createMockSupabase({ data: null, error: null })

    await expect(
      queryDoctorSlots({ from } as never, DOCTOR_ID, PARAMS),
    ).rejects.toBeInstanceOf(DoctorNotFoundError)

    expect(getOpenSlotsMock).not.toHaveBeenCalled()
  })

  it('surfaces supabase errors from the doctor lookup', async () => {
    const dbError = { message: 'db exploded', code: '42P01' }
    const { from } = createMockSupabase({ data: null, error: dbError })

    await expect(
      queryDoctorSlots({ from } as never, DOCTOR_ID, PARAMS),
    ).rejects.toBe(dbError)

    expect(getOpenSlotsMock).not.toHaveBeenCalled()
  })
})
