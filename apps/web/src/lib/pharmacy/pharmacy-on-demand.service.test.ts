import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const mockFetchApi = vi.fn()

vi.mock('@/lib/api-client', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}))

const { browserClient } = vi.hoisted(() => {
  const browserClient: Record<string, ReturnType<typeof vi.fn>> = {
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  }
  return { browserClient }
})

vi.mock('@/lib/supabase-browser', () => ({
  getBrowserSupabaseClient: vi.fn(() => browserClient),
}))

import {
  DISPATCH_TIERS,
  computeTierWaitTime,
  generateCloudflareRoomId,
  createPharmacyDispatchRequest,
  getPharmacyDispatchRequest,
  finishPharmacyDispatchRequest,
  fetchDutyDoctorsSummary,
  subscribeToDispatchRequest,
  type DispatchRequest,
} from './pharmacy-on-demand.service'

const REQUEST: DispatchRequest = {
  id: 'req-1',
  kiosk_id: null,
  pharmacy_id: 'pharm-1',
  patient_dni: '4027041959',
  patient_phone: '5491155995522',
  patient_name: 'Marina',
  tier_requested: 'general',
  symptom_summary: 'Fiebre y malestar general',
  status: 'searching',
  assigned_doctor_id: null,
  previous_doctor_id: null,
  cloudflare_room_id: 'cf-room-general-1959-x',
  created_at: '2026-09-20T10:00:00Z',
  matched_at: null,
  call_started_at: null,
  call_ended_at: null,
}

function buildChain(data: unknown, error: unknown): any {
  const chain: any = {
    then(resolve: (value: unknown) => void) {
      resolve({ data, error })
      return undefined
    },
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => chain),
    single: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
  }
  return chain
}

describe('pharmacy-on-demand.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    browserClient.from.mockImplementation(() => buildChain(null, null))
    browserClient.rpc.mockImplementation(() =>
      Promise.resolve({
        data: { general: { online_count: 2, free_count: 1 } },
        error: null,
      }),
    )
    browserClient.removeChannel.mockResolvedValue('UNSUBSCRIBED')
  })

  describe('DISPATCH_TIERS', () => {
    it('define 12 categorias de despacho con Médico Ahora como popular default', () => {
      expect(DISPATCH_TIERS).toHaveLength(12)
      const general = DISPATCH_TIERS.find((t) => t.id === 'general')
      expect(general?.isPopularDefault).toBe(true)
      expect(general?.defaultWaitText).toBe('< 2 min')
    })
  })

  describe('computeTierWaitTime', () => {
    it('devuelve "< 2 min" cuando hay médicos libres', () => {
      const eta = computeTierWaitTime(2, 5)
      expect(eta).toEqual({ minutes: 1.5, text: '< 2 min' })
    })

    it('estima la espera proporcional a la cola cuando hay médicos en guardia', () => {
      const eta = computeTierWaitTime(0, 3, 5, 8)
      expect(eta.text).toBe('~16 min')
      expect(eta.minutes).toBe(16)
    })

    it('clampa la espera a un mínimo de 3 minutos cuando todos están ocupados', () => {
      const eta = computeTierWaitTime(0, 4, 0, 8)
      expect(eta).toEqual({ minutes: 3, text: '~3 min' })
    })

    it('devuelve "Clínico disponible (< 1 min)" cuando no hay médicos', () => {
      const eta = computeTierWaitTime(0, 0)
      expect(eta).toEqual({ minutes: 1.0, text: 'Clínico disponible (< 1 min)' })
    })
  })

  describe('generateCloudflareRoomId', () => {
    it('genera una sala con prefijo cf-room y el tier', () => {
      const room = generateCloudflareRoomId('cardiologia', '4027041959')
      expect(room).toMatch(/^cf-room-cardiologia-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/)
    })

    it('no revela DNI ni CPF en el identificador de sala', () => {
      const arRoom = generateCloudflareRoomId('general', '40.270-41959')
      const brRoom = generateCloudflareRoomId('general', '12345678909')
      expect(arRoom).toMatch(/^cf-room-general-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/)
      expect(brRoom).toMatch(/^cf-room-general-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/)
      expect(arRoom).not.toContain('1959')
      expect(brRoom).not.toContain('8909')
      expect(arRoom).not.toBe(brRoom)
    })
  })

  describe('createPharmacyDispatchRequest', () => {
    it('llama a la API de request con el payload trimeado', async () => {
      mockFetchApi.mockResolvedValue({ request: REQUEST, cloudflare_room_id: 'r', accessToken: 'tok-1' })

      await createPharmacyDispatchRequest({
        careCountry: 'AR',
        patientDni: '  4027041959  ',
        patientPhone: ' 5491155995522 ',
        patientName: ' Marina ',
        tier: 'general',
        pharmacyId: 'pharm-1',
      })

      expect(mockFetchApi).toHaveBeenCalledWith('/api/pharmacy/dispatch/request', {
        method: 'POST',
        body: expect.objectContaining({
          careCountry: 'AR',
          patientDni: '4027041959',
          patientPhone: '5491155995522',
          patientName: 'Marina',
          tier: 'general',
          pharmacyId: 'pharm-1',
        }),
      })
    })

    it('devuelve success, data y accessToken cuando la farmacia reclama', async () => {
      mockFetchApi.mockResolvedValue({ request: REQUEST, cloudflare_room_id: 'r', accessToken: 'tok-1' })

      const result = await createPharmacyDispatchRequest({
        careCountry: 'AR',
        patientDni: '4027041959',
        patientPhone: '5491155995522',
        tier: 'general',
      })

      expect(result).toEqual({ success: true, data: REQUEST, accessToken: 'tok-1' })
    })

    it('devuelve error sin lanzar cuando la API falla', async () => {
      mockFetchApi.mockRejectedValue(new Error('Network error'))

      const result = await createPharmacyDispatchRequest({
        careCountry: 'AR',
        patientDni: '4027041959',
        patientPhone: '5491155995522',
        tier: 'general',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })

  describe('getPharmacyDispatchRequest', () => {
    it('devuelve la solicitud armada desde el cliente supabase', async () => {
      browserClient.from.mockImplementation(() => buildChain(REQUEST, null))

      const result = await getPharmacyDispatchRequest('req-1')

      expect(result).toEqual(REQUEST)
      expect(browserClient.from).toHaveBeenCalledWith('pharmacy_dispatch_requests')
    })

    it('devuelve null cuando el cliente reporta error', async () => {
      browserClient.from.mockImplementation(() => buildChain(null, new Error('boom')))

      const result = await getPharmacyDispatchRequest('req-1')

      expect(result).toBeNull()
    })
  })

  describe('finishPharmacyDispatchRequest', () => {
    it('marca la solicitud como completada', async () => {
      browserClient.from.mockImplementation(() => buildChain(null, null))

      const result = await finishPharmacyDispatchRequest('req-1', {
        call_ended_at: '2026-09-20T10:30:00Z',
      })

      expect(result).toBe(true)
      expect(browserClient.from).toHaveBeenCalledWith('pharmacy_dispatch_requests')
    })

    it('devuelve false si el update falla', async () => {
      browserClient.from.mockImplementation(() => buildChain(null, new Error('update failed')))

      const result = await finishPharmacyDispatchRequest('req-1', {
        call_ended_at: '2026-09-20T10:30:00Z',
      })

      expect(result).toBe(false)
    })
  })

  describe('fetchDutyDoctorsSummary', () => {
    it('devuelve el resumen de médicos en servicio por tier', async () => {
      browserClient.rpc.mockResolvedValue({
        data: { general: { online_count: 2, free_count: 1 } },
        error: null,
      })

      const summary = await fetchDutyDoctorsSummary()

      expect(browserClient.rpc).toHaveBeenCalledWith('get_duty_doctors_summary')
      expect(summary.general).toEqual({ online_count: 2, free_count: 1 })
    })

    it('devuelve {} si el RPC falla', async () => {
      browserClient.rpc.mockResolvedValue({ data: null, error: new Error('rpc down') })

      const summary = await fetchDutyDoctorsSummary()

      expect(summary).toEqual({})
    })
  })

  describe('subscribeToDispatchRequest', () => {
    it('suscribe a updates de la solicitud y remueve el canal al desuscribirse', () => {
      const fakeChannel: any = {}
      let onUpdateCb: ((payload: { new: DispatchRequest }) => void) | null = null
      fakeChannel.on = vi.fn(
        (_event: string, _filter: unknown, cb: (payload: { new: DispatchRequest }) => void) => {
          onUpdateCb = cb
          return fakeChannel
        },
      )
      fakeChannel.subscribe = vi.fn(() => fakeChannel)
      browserClient.channel.mockReturnValue(fakeChannel)

      const onUpdate = vi.fn()
      const unsubscribe = subscribeToDispatchRequest('req-1', onUpdate)

      expect(browserClient.channel).toHaveBeenCalledWith('dispatch_request:req-1')
      expect(fakeChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({ table: 'pharmacy_dispatch_requests' }),
        expect.any(Function),
      )

      onUpdateCb?.({ new: REQUEST })
      expect(onUpdate).toHaveBeenCalledWith(REQUEST)

      unsubscribe()
      expect(browserClient.removeChannel).toHaveBeenCalledWith(fakeChannel)
    })
  })
})