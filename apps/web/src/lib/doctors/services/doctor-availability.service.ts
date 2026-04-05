/**
 * Service: Doctor Availability management.
 * Orchestrates weekly schedule CRUD and date-specific overrides.
 * Validates input before delegating to the repository.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { isDayOfWeek } from '@autamedica/types'
import { logger } from '@autamedica/shared'
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
  isAvailable: boolean
  startTime?: string | null
  endTime?: string | null
  reason?: string | null
}

const TIME_RE = /^\d{2}:\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_WEEKLY_ROWS = 21

function validationError(msg: string): never {
  throw Object.assign(new Error(msg), { code: 'VALIDATION' })
}

function validateWeeklySlot(slot: WeeklySlot, index: number): void {
  if (!isDayOfWeek(slot.dayOfWeek)) {
    validationError(`slots[${index}]: dayOfWeek must be 0-6`)
  }
  if (!TIME_RE.test(slot.startTime)) {
    validationError(`slots[${index}]: startTime must be HH:mm`)
  }
  if (!TIME_RE.test(slot.endTime)) {
    validationError(`slots[${index}]: endTime must be HH:mm`)
  }
  if (slot.startTime >= slot.endTime) {
    validationError(`slots[${index}]: startTime must be before endTime`)
  }
  if (slot.slotDuration < 5 || slot.slotDuration > 240) {
    validationError(`slots[${index}]: slotDuration must be 5-240 minutes`)
  }
}

function validateOverride(input: OverrideInput): void {
  if (!DATE_RE.test(input.overrideDate)) {
    validationError('overrideDate must be YYYY-MM-DD')
  }
  if (input.startTime != null && !TIME_RE.test(input.startTime)) {
    validationError('startTime must be HH:mm')
  }
  if (input.endTime != null && !TIME_RE.test(input.endTime)) {
    validationError('endTime must be HH:mm')
  }
  if (input.startTime != null && input.endTime != null && input.startTime >= input.endTime) {
    validationError('startTime must be before endTime')
  }
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
    if (!Array.isArray(slots) || slots.length === 0) {
      validationError('slots must be a non-empty array')
    }
    if (slots.length > MAX_WEEKLY_ROWS) {
      validationError(`slots exceeds maximum of ${MAX_WEEKLY_ROWS} entries`)
    }
    slots.forEach(validateWeeklySlot)

    const rows: Omit<AvailabilityInsert, 'doctor_id'>[] = slots.map((s) => ({
      day_of_week: s.dayOfWeek,
      start_time: s.startTime,
      end_time: s.endTime,
      slot_duration: s.slotDuration,
      location: s.location ?? null,
      is_active: true,
    }))

    logger.info(`[doctorAvailabilityService] replacing weekly for doctor=${doctorId}, rows=${rows.length}`)
    return doctorAvailabilityRepo.replaceWeekly(admin, doctorId, rows)
  },

  async addOverride(admin: AdminClient, doctorId: string, input: OverrideInput) {
    validateOverride(input)

    logger.info(`[doctorAvailabilityService] adding override for doctor=${doctorId}, date=${input.overrideDate}`)
    return doctorAvailabilityRepo.insertOverride(admin, doctorId, {
      override_date: input.overrideDate,
      is_available: input.isAvailable,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
      reason: input.reason ?? null,
    })
  },

  async removeOverride(admin: AdminClient, doctorId: string, overrideId: string) {
    logger.info(`[doctorAvailabilityService] removing override=${overrideId} for doctor=${doctorId}`)
    return doctorAvailabilityRepo.deleteOverride(admin, doctorId, overrideId)
  },
}
