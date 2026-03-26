import { fetchApi } from '@/lib/api-client'
import type { CallStatus } from '@autamedica/telemedicine'
import type { CallResponseAction } from '@/lib/calls/services/respond-call.service'

export interface RespondToCallPayload {
  callId: string
  action: CallResponseAction
}

export interface RespondToCallResult {
  callId: string
  roomId: string
  status: CallStatus
  changed: boolean
}

export const respondCallBrowserService = {
  async respond(payload: RespondToCallPayload): Promise<RespondToCallResult> {
    return fetchApi<RespondToCallResult>('/api/patients/calls/respond', {
      method: 'POST',
      body: payload,
    })
  },
}
