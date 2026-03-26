import { fetchApi } from '@/lib/api-client'
import type { CallStatus } from '@autamedica/telemedicine'

export interface PersistCallStatusPayload {
  status: 'connecting' | 'connected' | 'ended'
  reason?: string
}

export interface PersistCallStatusResult {
  callId: string
  roomId: string
  status: CallStatus
  changed: boolean
}

export const persistCallStatusBrowserService = {
  async persist(callId: string, payload: PersistCallStatusPayload): Promise<PersistCallStatusResult> {
    return fetchApi<PersistCallStatusResult>(`/api/calls/${encodeURIComponent(callId)}/status`, {
      method: 'POST',
      body: payload,
    })
  },
}
