'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError, fetchApi } from '@/lib/api-client'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import type {
  ClaimConsultationResult,
  DoctorOnDutyStatus,
  OnDemandQueueItem,
} from '@/lib/pharmacy/types'

interface UseDoctorOnDutyReturn {
  onDuty: boolean
  careCountry: 'AR' | 'BR' | null
  since: string | null
  loading: boolean
  toggling: boolean
  claimingId: string | null
  decliningId: string | null
  queue: OnDemandQueueItem[]
  queueCount: number
  error: string | null
  toggleDuty: (targetState?: boolean) => Promise<boolean>
  claimPatient: (requestId: string) => Promise<ClaimConsultationResult | null>
  declinePatient: (requestId: string) => Promise<boolean>
  refreshQueue: () => Promise<void>
}

export function useDoctorOnDuty(): UseDoctorOnDutyReturn {
  const [onDuty, setOnDuty] = useState<boolean>(false)
  const [careCountry, setCareCountry] = useState<'AR' | 'BR' | null>(null)
  const [since, setSince] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [toggling, setToggling] = useState<boolean>(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const [queue, setQueue] = useState<OnDemandQueueItem[]>([])
  const [error, setError] = useState<string | null>(null)

  const prevQueueLengthRef = useRef<number>(0)

  // Fetch duty status
  const fetchStatus = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchApi<DoctorOnDutyStatus>('/api/doctors/on-duty/toggle')
      setOnDuty(data.onDuty)
      setSince(data.since)
    } catch {
      // If unauthorized or not doctor, handle gracefully
      setOnDuty(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // Use the protected endpoint first. On a genuine network failure only,
  // the authenticated SECURITY DEFINER RPC provides the same doctor/country/
  // approval/heartbeat/assigned-offer gates without exposing table reads.
  const fetchQueue = useCallback(async () => {
    try {
      let items: OnDemandQueueItem[]
      let resolvedCountry: 'AR' | 'BR' | null = null

      try {
        const dataRes = await fetchApi<{ queue: OnDemandQueueItem[]; count: number; careCountry?: 'AR' | 'BR' }>(
          '/api/doctors/on-duty/queue',
        )
        items = dataRes.queue || []
        resolvedCountry = dataRes.careCountry === 'BR' || dataRes.careCountry === 'AR'
          ? dataRes.careCountry
          : null
      } catch (requestError) {
        // HTTP authorization/business errors must never be bypassed by fallback.
        if (requestError instanceof ApiError || !(requestError instanceof TypeError)) {
          throw requestError
        }

        const client = getBrowserSupabaseClient() as unknown as SupabaseClient
        const { data, error: fallbackError } = await client.rpc('get_my_pending_dispatch_offers')
        if (fallbackError) throw fallbackError

        const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : []
        const now = Date.now()
        items = rows.map((row) => {
          const careCountry = row.care_country === 'BR' || row.care_country === 'AR'
            ? row.care_country
            : null
          const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date(now).toISOString()
          const expiresAt = typeof row.offer_expires_at === 'string' ? row.offer_expires_at : null
          const createdTime = new Date(createdAt).getTime()
          return {
            id: String(row.id ?? ''),
            offerId: typeof row.offer_id === 'string' ? row.offer_id : null,
            expiresAt,
            pharmacyId: null,
            pharmacyName: careCountry === 'BR' ? 'Farmácia / Quiosque On-Demand' : 'Farmacia / Kiosco On-Demand',
            patientDni: String(careCountry === 'BR' ? (row.patient_cpf ?? '') : (row.patient_dni ?? '')),
            patientName: String(row.patient_name || 'Paciente Kiosco'),
            patientPhone: String(row.patient_phone ?? ''),
            reason: String(row.symptom_summary || row.tier_requested || 'Motivo não informado'),
            status: String(row.status ?? 'searching') as OnDemandQueueItem['status'],
            createdAt,
            minutesWaiting: Number.isFinite(createdTime) ? Math.floor(Math.max(0, now - createdTime) / 60000) : 0,
          }
        }).filter((item) => Boolean(item.id && item.offerId))
        const firstCountry = rows.find((row) => row.care_country === 'BR' || row.care_country === 'AR')?.care_country
        resolvedCountry = firstCountry === 'BR' || firstCountry === 'AR' ? firstCountry : null
      }

      if (resolvedCountry) setCareCountry(resolvedCountry)
      setQueue(items)

      // Audio notification if new patients arrived in queue and doctor is on duty.
      if (onDuty && items.length > prevQueueLengthRef.current && typeof window !== 'undefined') {
        try {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(587.33, ctx.currentTime)
          osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1)
          gain.gain.setValueAtTime(0.15, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start()
          osc.stop(ctx.currentTime + 0.3)
        } catch {
          // Audio autoplay might be blocked.
        }
      }
      prevQueueLengthRef.current = items.length
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : 'No se pudo actualizar el radar de guardia')
    }
  }, [onDuty])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  // Poll queue every 5 seconds when onDuty is active
  useEffect(() => {
    if (!onDuty) {
      void fetchQueue()
      setQueue([])
      prevQueueLengthRef.current = 0
      return
    }

    void fetchQueue()
    const interval = setInterval(() => {
      void fetchQueue()
    }, 5000)

    return () => clearInterval(interval)
  }, [onDuty, fetchQueue])

  // Heartbeat every 30 seconds when onDuty is active
  useEffect(() => {
    if (!onDuty) {
      return
    }

    const sendHeartbeat = async () => {
      try {
        await fetchApi<{ timestamp: string }>('/api/doctors/on-duty/heartbeat', {
          method: 'POST',
        })
      } catch {
        // Ignorar fallos transitorios de red en el heartbeat
      }
    }

    // Latido inicial inmediato al entrar en guardia
    void sendHeartbeat()

    // Intervalo de latidos cada 30 segundos (30000 ms)
    const interval = setInterval(() => {
      void sendHeartbeat()
    }, 30000)

    // Cancelar intervalo al salir de guardia o desmontar el hook
    return () => clearInterval(interval)
  }, [onDuty])

  const declinePatient = useCallback(async (requestId: string): Promise<boolean> => {
    const item = queue.find((candidate) => candidate.id === requestId)
    if (!item?.offerId) {
      setError('No se encontró una oferta activa para rechazar')
      return false
    }
    try {
      setDecliningId(requestId)
      setError(null)
      await fetchApi('/api/pharmacy/dispatch/decline', {
        method: 'POST',
        body: { offerId: item.offerId },
      })
      setQueue((current) => current.filter((candidate) => candidate.id !== requestId))
      void fetchQueue()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo rechazar la oferta')
      return false
    } finally {
      setDecliningId(null)
    }
  }, [queue, fetchQueue])

  // Toggle onDuty status
  const toggleDuty = useCallback(
    async (targetState?: boolean): Promise<boolean> => {
      const nextState = targetState !== undefined ? targetState : !onDuty
      try {
        setToggling(true)
        setError(null)
        const updated = await fetchApi<DoctorOnDutyStatus>('/api/doctors/on-duty/toggle', {
          method: 'POST',
          body: { onDuty: nextState },
        })
        setOnDuty(updated.onDuty)
        setSince(updated.since)
        if (updated.onDuty) {
          void fetchQueue()
        } else {
          setQueue([])
        }
        return updated.onDuty
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error al cambiar estado de guardia'
        setError(msg)
        return onDuty
      } finally {
        setToggling(false)
      }
    },
    [onDuty, fetchQueue],
  )

  // Reclamar consulta Gen 2 llamando a POST /api/pharmacy/dispatch/claim (claim_pharmacy_request_tier)
  const claimPatient = useCallback(
    async (requestId: string): Promise<ClaimConsultationResult | null> => {
      try {
        setClaimingId(requestId)
        setError(null)
        const result = await fetchApi<{
          success: boolean
          code?: string
          message?: string
          request_id?: string
          cloudflare_room_id?: string
          patient_dni?: string
          patient_phone?: string
          tier_requested?: string
        }>('/api/pharmacy/dispatch/claim', {
          method: 'POST',
          body: { requestId },
        })

        if (!result.success || !result.cloudflare_room_id) {
          throw new Error(result.message || 'La consulta ya no está disponible')
        }

        // Remover elemento reclamado de la cola local inmediatamente
        setQueue((prev) => prev.filter((item) => item.id !== requestId))

        const roomId = result.cloudflare_room_id
        const doctorRoomUrl = `/doctors/call/${encodeURIComponent(roomId)}`

        return {
          requestId: result.request_id || requestId,
          callId: result.request_id || requestId,
          roomId,
          guestInviteId: '',
          doctorRoomUrl,
          patientJoinUrl: '',
          patient: {
            dni: result.patient_dni || '',
            name: 'Paciente',
            phone: result.patient_phone || '',
            reason: result.tier_requested || 'Consulta General',
            pharmacyName: 'Farmacia / Kiosco On-Demand',
          },
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error al tomar paciente'
        setError(msg)
        return null
      } finally {
        setClaimingId(null)
      }
    },
    [],
  )

  return {
    onDuty,
    careCountry,
    since,
    loading,
    toggling,
    claimingId,
    decliningId,
    queue,
    queueCount: queue.length,
    error,
    toggleDuty,
    claimPatient,
    declinePatient,
    refreshQueue: fetchQueue,
  }
}
