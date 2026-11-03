import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  visits: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  unavailable: false,
  visitError: false,
  eventError: false,
}))

vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => {
    if (state.unavailable) throw new Error('Supabase offline')
    return {
      from: (name: string) => ({
        insert: async (row: Record<string, unknown>) => {
          if (name !== 'partner_qr_visits') throw new Error('Unexpected table')
          if (!state.visitError) state.visits.push(row)
          return { error: state.visitError ? { message: 'offline' } : null }
        },
      }),
      schema: () => ({
        from: () => ({
          insert: async (row: Record<string, unknown>) => {
            state.events.push(row)
            return { error: state.eventError ? { message: 'offline' } : null }
          },
        }),
      }),
    }
  },
}))

import { GET } from './[code]'

function hit(code: string) {
  return GET({
    params: { code },
    request: new Request('https://www.autamedica.com/j/' + code),
    locals: {},
  } as unknown as Parameters<typeof GET>[0])
}

beforeEach(() => {
  state.visits = []
  state.events = []
  state.unavailable = false
  state.visitError = false
  state.eventError = false
})

describe('Jordan QR first-party attribution', () => {
  it.each(['JORDAN01', 'JORDAN02'])('issues a one-use token for %s', async code => {
    const response = await hit(code)
    expect(response.status).toBe(302)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    const redirect = new URL(response.headers.get('Location')!, 'https://www.autamedica.com')
    expect(redirect.pathname).toBe('/descargar')
    expect(redirect.searchParams.get('utm_source')).toBe('cantina_jordan')
    expect(redirect.searchParams.get('utm_content')).toBe(code.toLowerCase())
    expect(redirect.searchParams.get('utm_term')).toMatch(/^click_[0-9a-f]{32}$/)
    expect(state.visits).toHaveLength(1)
    expect(state.visits[0]).toMatchObject({ partner_code: 'jordan', location_code: code, country_code: 'BR' })
    expect(state.visits[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(state.events).toHaveLength(1)
    expect(state.events[0].event_type).toBe('partner_qr_scan')
  })

  it('never lets unregistered codes redirect visitors', async () => {
    const response = await hit('EVIL-LOCATION')
    expect(response.status).toBe(404)
    expect(state.visits).toHaveLength(0)
  })

  it('does not create claimable tokens when persistence fails', async () => {
    state.visitError = true
    const response = await hit('JORDAN01')
    const url = new URL(response.headers.get('Location')!, 'https://www.autamedica.com')
    expect(response.status).toBe(302)
    expect(url.searchParams.has('utm_term')).toBe(false)
    expect(state.events).toHaveLength(0)
  })

  it('does not block downloads when service is unavailable', async () => {
    state.unavailable = true
    const response = await hit('JORDAN02')
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toContain('/descargar?')
  })

  it('does not store identifiers or clinical data from QR scans', async () => {
    await hit('JORDAN01')
    const event = state.visits[0]
    for (const key of ['ip', 'email', 'patient_id', 'diagnosis', 'medical_record_id']) {
      expect(event).not.toHaveProperty(key)
    }
  })

  it('does not erase persisted tokens when growth events fail', async () => {
    state.eventError = true
    const response = await hit('JORDAN01')
    expect(response.status).toBe(302)
    expect(state.visits).toHaveLength(1)
  })
})
