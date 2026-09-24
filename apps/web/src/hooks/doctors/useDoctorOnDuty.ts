'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchApi } from '@/lib/api-client'
import type {
  ClaimConsultationResult,
  DoctorOnDutyStatus,
  OnDemandQueueItem,
} from '@/lib/pharmacy/types'

interface UseDoctorOnDutyReturn {
  onDuty: boolean
  since: string | null
  loading: boolean
  toggling: boolean
  claimingId: string | null
  queue: OnDemandQueueItem[]
  queueCount: number
  error: string | null
  toggleDuty: (targetState?: boolean) => Promise<boolean>
  claimPatient: (requestId: string) => Promise<ClaimConsultationResult | null>
  refreshQueue: () => Promise<void>
}

export function useDoctorOnDuty(): UseDoctorOnDutyReturn {
  const [onDuty, setOnDuty] = useState<boolean>(false)
  const [since, setSince] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [toggling, setToggling] = useState<boolean>(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)
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
    } catch (err) {
      // If unauthorized or not doctor, handle gracefully
      setOnDuty(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch pending queue
  const fetchQueue = useCallback(async () => {
    try {
      const data = await fetchApi<{ queue: OnDemandQueueItem[]; count: number }>(
        '/api/doctors/on-duty/queue',
      )
      setQueue(data.queue)

      // Audio notification if new patients arrived in queue and doctor is on duty
      if (onDuty && data.count > prevQueueLengthRef.current && typeof window !== 'undefined') {
        try {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
          osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1) // A5
          gain.gain.setValueAtTime(0.15, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start()
          osc.stop(ctx.currentTime + 0.3)
        } catch {
          // Audio autoplay might be blocked
        }
      }
      prevQueueLengthRef.current = data.count
    } catch {
      // Ignorar fallos transitorios
    }
  }, [onDuty])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  // Poll queue every 5 seconds when onDuty is active
  useEffect(() => {
    if (!onDuty) {
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

  // Claim a patient consultation
  const claimPatient = useCallback(
    async (requestId: string): Promise<ClaimConsultationResult | null> => {
      try {
        setClaimingId(requestId)
        setError(null)
        const result = await fetchApi<ClaimConsultationResult>('/api/doctors/on-duty/claim', {
          method: 'POST',
          body: { requestId },
        })
        // Remove claimed item from local queue immediately
        setQueue((prev) => prev.filter((item) => item.id !== requestId))
        return result
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
    since,
    loading,
    toggling,
    claimingId,
    queue,
    queueCount: queue.length,
    error,
    toggleDuty,
    claimPatient,
    refreshQueue: fetchQueue,
  }
}
