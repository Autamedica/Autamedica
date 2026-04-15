/**
 * Service: doctor profile creation/update business logic.
 * Validates input, builds DB payloads, delegates to repo.
 */
import type { Database, Json } from '@autamedica/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { doctorProfileRepo } from '../lib/repos/doctor-profile'

type AdminClient = SupabaseClient<Database>
type AvailabilityInsert = Database['public']['Tables']['doctor_availability']['Insert']
type ScheduleInput = Record<
  string,
  {
    isAvailable?: boolean
    timeSlots?: Array<{
      startTime?: string
      endTime?: string
      slotDurationMinutes?: number
    }>
  }
>

const DEFAULT_AVAILABILITY_PRESET = [
  { day_of_week: 0, start_time: '00:00', end_time: '23:59' },
  { day_of_week: 1, start_time: '00:00', end_time: '23:59' },
  { day_of_week: 2, start_time: '00:00', end_time: '23:59' },
  { day_of_week: 3, start_time: '00:00', end_time: '23:59' },
  { day_of_week: 4, start_time: '00:00', end_time: '23:59' },
  { day_of_week: 5, start_time: '00:00', end_time: '23:59' },
  { day_of_week: 6, start_time: '00:00', end_time: '23:59' },
] as const

function buildAvailabilityRows(doctorId: string, schedule: unknown): AvailabilityInsert[] {
  if (!schedule || typeof schedule !== 'object') return []

  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  }

  const rows: AvailabilityInsert[] = []
  const weeklySchedule = schedule as ScheduleInput

  for (const [dayName, dayConfig] of Object.entries(weeklySchedule)) {
    const dayOfWeek = dayMap[dayName]
    if (dayOfWeek === undefined || !dayConfig?.isAvailable) continue

    for (const slot of dayConfig.timeSlots ?? []) {
      if (!slot.startTime || !slot.endTime) continue
      rows.push({
        doctor_id: doctorId,
        day_of_week: dayOfWeek,
        start_time: slot.startTime,
        end_time: slot.endTime,
        slot_duration: slot.slotDurationMinutes ?? 30,
        is_active: true,
      })
    }
  }

  return rows
}

function buildDefaultAvailabilityRows(doctorId: string): AvailabilityInsert[] {
  return DEFAULT_AVAILABILITY_PRESET.map((slot) => ({
    doctor_id: doctorId,
    day_of_week: slot.day_of_week,
    start_time: slot.start_time,
    end_time: slot.end_time,
    slot_duration: 30,
    is_active: true,
  }))
}

export interface DoctorProfileInput {
  userId: string
  licenseNumber: string
  specialty: string
  subspecialty?: string | null
  yearsExperience?: number | null
  education?: Json
  certifications?: Json
  schedule?: unknown
  consultationFee?: number | null
  acceptedInsurance?: Json
  bio?: string | null
  languages?: Json
  active?: boolean
  fullName?: string | null
}

export const doctorProfileService = {
  async createOrUpdate(
    admin: AdminClient,
    input: DoctorProfileInput,
  ): Promise<{ id: string }> {
    const isActive = input.active ?? true

    const doctorData: Database['public']['Tables']['doctors']['Insert'] = {
      user_id: input.userId,
      license_number: input.licenseNumber,
      specialty: input.specialty,
      subspecialty: input.subspecialty ?? null,
      years_experience: input.yearsExperience ?? null,
      education: input.education ?? null,
      certifications: input.certifications ?? null,
      schedule: null,
      consultation_fee: input.consultationFee ?? null,
      accepted_insurance: input.acceptedInsurance ?? null,
      bio: input.bio ?? null,
      languages: input.languages ?? null,
      active: isActive,
    }

    const result = await doctorProfileRepo.upsertDoctor(admin, doctorData)

    if (input.fullName) {
      const parts = input.fullName.trim().split(/\s+/)
      await doctorProfileRepo.updateProfileName(
        admin,
        input.userId,
        parts[0] ?? null,
        parts.length > 1 ? parts.slice(1).join(' ') : null,
      )
    }

    const doctorId = result.id
    const availabilityRows = buildAvailabilityRows(doctorId, input.schedule)

    if (availabilityRows.length > 0) {
      await doctorProfileRepo.replaceAvailability(admin, doctorId, availabilityRows)
    } else if (isActive) {
      const existing = await doctorProfileRepo.countActiveAvailability(admin, doctorId)
      if (existing === 0) {
        await doctorProfileRepo.insertDefaultAvailability(
          admin, buildDefaultAvailabilityRows(doctorId),
        )
      }
    }

    return result;
  },
}
