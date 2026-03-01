'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface ConsultationParams {
  consultationId: string
  patientId: string
  doctorId: string
  apiBaseUrl?: string
}

interface ConsultationDataPayload {
  consultationId: string
  roomName: string
  roomSid: string
  patientId: string
  doctorId: string
  patientToken: string
  doctorToken: string
  livekitUrl: string
  createdAt: string
}

interface ConsultationResponse {
  success: boolean
  data: ConsultationDataPayload
}

interface UseConsultationDataReturn {
  data: ConsultationResponse | null
  error: string | null
  isLoading: boolean
}

async function fetchConsultationData(
  params: ConsultationParams,
  signal: AbortSignal
): Promise<ConsultationResponse> {
  const baseUrl = params.apiBaseUrl ?? 'http://localhost:8888'
  const response = await fetch(`${baseUrl}/api/consultations/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consultationId: params.consultationId,
      patientId: params.patientId,
      doctorId: params.doctorId,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Error al crear la sala de consulta')
  }

  return response.json() as Promise<ConsultationResponse>
}

export function useConsultationData(params: ConsultationParams): UseConsultationDataReturn {
  const [data, setData] = useState<ConsultationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const initialize = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const result = await fetchConsultationData(params, controller.signal)
      if (!controller.signal.aborted) {
        setData(result)
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [params.consultationId, params.patientId, params.doctorId, params.apiBaseUrl])

  useEffect(() => {
    initialize()
    return () => {
      abortRef.current?.abort()
    }
  }, [initialize])

  return { data, error, isLoading }
}

export type { ConsultationParams, ConsultationDataPayload, ConsultationResponse, UseConsultationDataReturn }
