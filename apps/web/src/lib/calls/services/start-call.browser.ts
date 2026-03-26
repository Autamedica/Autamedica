import type { CallStatus } from '@autamedica/telemedicine'
import { fetchApi } from '@/lib/api-client'

export interface StartCallPayload {
  patientId: string
  appointmentId?: string
}

export interface StartCallResult {
  callId: string
  roomId: string
  status: CallStatus
  appointmentId: string | null
  reused: boolean
}

export const startCallBrowserService = {
  async startCall(payload: StartCallPayload): Promise<StartCallResult> {
    return fetchApi<StartCallResult>('/api/doctors/calls/start', {
      body: payload,
      method: 'POST',
    })
  },
}
