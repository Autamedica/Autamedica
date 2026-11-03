import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  unavailable: false,
  dbError: false,
}))

vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => {
    if (state.unavailable) throw new Error('supabase unavailable')
    return {
      schema: (name: string) => {
        if (name !== 'growth_os') throw new Error('Unexpected schema')
        return {
          from: (table: string) => {
            if (table !== 'growth_events') throw new Error('Unexpected table')
            return {
              insert: async (row: Record<string, unknown>) => {
                state.inserted.push(row)
                return { error: state.dbError ? { message: 'offline' } : null }
              },
            }
          },
        }
      },
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
  state.inserted = []
  state.unavailable = false
  state.dbError = false
})

describe('Jordan physical QR attribution entry', () => {
  it.each(['JORDAN01', 'JORDAN02'])('redirects %s with its distinct location code', async code => {
    const response = await hit(code)
    expect(response.status).toBe(302)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    const location = new URL(response.headers.get('Location')!, 'https://www.autamedica.com')
    expect(location.pathname).toBe('/descargar')
    expect(location.searchParams.get('utm_source')).toBe('cantina_jordan')
    expect(location.searchParams.get('utm_medium')).toBe('qr')
    expect(location.searchParams.get('utm_content')).toBe(code.toLowerCase())
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toMatchObject({
      event_type: 'partner_qr_scan',
      page_url: '/j/' + code,
      metadata: { partner_code: 'jordan', location_code: code, country_code: 'BR' },
    })
  })

  it('never accepts arbitrary codes or open redirect parameters', async () => {
    const response = await hit('EXTERNAL-DESTINATION')
    expect(response.status).toBe(404)
    expect(response.headers.get('Location')).toBeNull()
    expect(state.inserted).toHaveLength(0)
  })

  it('continues to Google Play even if analytics is unavailable', async () => {
    state.unavailable = true
    const response = await hit('JORDAN01')
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toContain('/descargar?')
  })

  it('does not store IP, medical details or a patient identifier in the event', async () => {
    await hit('JORDAN01')
    const event = state.inserted[0]
    expect(event).not.toHaveProperty('ip')
    expect(event).not.toHaveProperty('patient_id')
    expect(event).not.toHaveProperty('email')
    expect(event).not.toHaveProperty('diagnosis')
  })

  it('continues redirect when the event insert fails', async () => {
    state.dbError = true
    const response = await hit('JORDAN02')
    expect(response.status).toBe(302)
  })
})
