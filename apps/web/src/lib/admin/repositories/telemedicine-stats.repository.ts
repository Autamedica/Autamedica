import type { SupabaseClient } from '@supabase/supabase-js'

export interface CallRow {
  id: string
  room_id: string
  status: string
  doctor_id: string | null
  patient_id: string | null
  appointment_id: string | null
  created_at: string
  accepted_at: string | null
  ended_at: string | null
}

export interface CallEvidence {
  call_id: string
  type: string
  at: string
  payload: Record<string, unknown> | null
}

const PAGE_SIZE = 500

export const telemedicineStatsRepository = {
  async verifyAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
    const { data, error } = await admin.from('profiles').select('role')
      .eq('user_id', userId).maybeSingle()
    if (error) throw error
    return data?.role === 'admin'
  },

  async getCalls(admin: SupabaseClient, cutoff: string): Promise<CallRow[]> {
    const rows: CallRow[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.from('calls')
        .select('id, room_id, status, doctor_id, patient_id, appointment_id, created_at, accepted_at, ended_at')
        .lte('created_at', cutoff).order('created_at', { ascending: false })
        .order('id', { ascending: false }).range(offset, offset + PAGE_SIZE - 1)
      if (error) throw error
      rows.push(...(data as CallRow[]))
      if (data.length < PAGE_SIZE) return rows
    }
  },

  async getEvidence(admin: SupabaseClient, cutoff: string): Promise<CallEvidence[]> {
    const rows: CallEvidence[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.from('call_events')
        .select('call_id, type, at, payload')
        .in('type', ['join_succeeded', 'peer_connected', 'first_remote_media'])
        .lte('at', cutoff).order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) throw error
      rows.push(...(data as CallEvidence[]))
      if (data.length < PAGE_SIZE) return rows
    }
  },

  async getEventCounts(admin: SupabaseClient, since: string, cutoff: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.from('call_events').select('type')
        .gte('at', since).lte('at', cutoff).order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) throw error
      for (const event of data) counts[event.type] = (counts[event.type] ?? 0) + 1
      if (data.length < PAGE_SIZE) return counts
    }
  },
}
