/**
 * Service: Telemedicine session API operations.
 * Extracts all HTTP calls from useTelemedicine hook into a testable service layer.
 */
import { fetchApi } from '@/lib/api-client'
import type { SessionParticipant, SessionEvent } from '@autamedica/types'

export interface ApiSession {
  session_id: string
  room_id: string
  status: string
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
}

export interface StartSessionResponse {
  session: ApiSession
  signaling: {
    room_id: string
    server_url: string
    ice_servers: Array<{ urls: string | string[]; username?: string; credential?: string }>
  }
}

interface SessionSnapshot {
  session: ApiSession | null
  participants: SessionParticipant[]
  events: SessionEvent[]
}

export function mapApiSession(data: unknown): ApiSession {
  const d = data as Record<string, unknown> | null | undefined
  return {
    session_id: String(d?.session_id ?? d?.id ?? ''),
    room_id: String(d?.room_id ?? ''),
    status: String(d?.status ?? 'scheduled'),
    scheduled_at: (d?.scheduled_at as string | null) ?? null,
    started_at: (d?.started_at as string | null) ?? null,
    ended_at: (d?.ended_at as string | null) ?? null,
  }
}

export const telemedicineService = {
  async getSession(sessionId?: string): Promise<SessionSnapshot> {
    const url = sessionId
      ? `/api/telemedicine/session?sessionId=${encodeURIComponent(sessionId)}`
      : '/api/telemedicine/session'
    const payload = await fetchApi<{ session?: unknown; participants?: SessionParticipant[]; events?: SessionEvent[] }>(url)
    if (!payload) return { session: null, participants: [], events: [] }
    const rawSession = payload.session ?? payload
    return {
      session: mapApiSession(rawSession),
      participants: payload.participants ?? [],
      events: payload.events ?? [],
    }
  },

  async startSession(appointmentId: string, doctorId: string): Promise<StartSessionResponse> {
    return fetchApi<StartSessionResponse>('/api/telemedicine/session', {
      body: { appointment_id: appointmentId, doctor_id: doctorId },
    })
  },

  async endSession(sessionId: string): Promise<{ status: string; ended_at: string | null }> {
    return fetchApi<{ status: string; ended_at: string | null }>(
      `/api/telemedicine/session/${encodeURIComponent(sessionId)}`,
      { method: 'PATCH', body: { status: 'completed', ended: true } },
    )
  },

  async joinSession(sessionId: string, role = 'patient'): Promise<void> {
    await fetchApi(`/api/telemedicine/session/${encodeURIComponent(sessionId)}/participants`, {
      body: { role },
    })
  },

  async leaveSession(sessionId: string): Promise<void> {
    await fetchApi(`/api/telemedicine/session/${encodeURIComponent(sessionId)}/participants`, {
      method: 'PATCH',
      body: { left: true },
    })
  },

  async logEvent(sessionId: string, eventType: string, details?: string): Promise<void> {
    await fetchApi(`/api/telemedicine/session/${encodeURIComponent(sessionId)}/events`, {
      body: { event_type: eventType, event_data: details ? { details } : undefined },
    })
  },
}
