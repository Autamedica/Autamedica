/**
 * Service: Doctor Availability management.
 * Orchestrates weekly schedule CRUD and date-specific overrides.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { doctorAvailabilityRepo, type AvailabilityInsert } from '@/lib/doctors/lib/repos/doctor-availability.repo'

type AdminClient = SupabaseClient<Database>

interface WeeklySlot {
  dayOfWeek: number
  startTime: string
  endTime: string
  slotDuration: number
  location?: string | null
}

interface OverrideInput {
  overrideDate: string
  isBlocked: boolean
  startTime?: string | null
  endTime?: string | null
  reason?: string | null
}

export const doctorAvailabilityService = {
  async getSchedule(admin: AdminClient, doctorId: string) {
    const [weekly, overrides] = await Promise.all([
      doctorAvailabilityRepo.listWeekly(admin, doctorId),
      doctorAvailabilityRepo.listOverrides(admin, doctorId),
    ])

    return { weekly, overrides }
  },

  async replaceWeeklySchedule(admin: AdminClient, doctorId: string, slots: WeeklySlot[]) {
    const rows: Omit<AvailabilityInsert, 'doctor_id'>[] = slots.map((s) => ({
      day_of_week: s.dayOfWeek,
      start_time: s.startTime,
      end_time: s.endTime,
      slot_duration: s.slotDuration,
      location: s.location ?? null,
      is_active: true,
    }))

    return doctorAvailabilityRepo.replaceWeekly(admin, doctorId, rows)
  },

  async addOverride(admin: AdminClient, doctorId: string, input: OverrideInput) {
    return doctorAvailabilityRepo.insertOverride(admin, doctorId, {
      override_date: input.overrideDate,
      is_blocked: input.isBlocked,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
      reason: input.reason ?? null,
    })
  },

  async removeOverride(admin: AdminClient, doctorId: string, overrideId: string) {
    return doctorAvailabilityRepo.deleteOverride(admin, doctorId, overrideId)
  },
}
