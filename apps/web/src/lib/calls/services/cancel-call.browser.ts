import { fetchApi } from '@/lib/api-client'
import type { DoctorCancelReason } from '@/lib/calls/services/call-status-rules'

export interface CancelCallPayload {
  reason?: DoctorCancelReason
}

export interface CancelCallResult {
  callId: string
  roomId: string
  status: 'canceled'
  changed: boolean
  reason: DoctorCancelReason
}

export const cancelCallBrowserService = {
  async cancel(callId: string, payload?: CancelCallPayload): Promise<CancelCallResult> {
    return fetchApi<CancelCallResult>(`/api/doctors/calls/${encodeURIComponent(callId)}/cancel`, {
      method: 'POST',
      body: payload ?? {},
    })
  },
}
