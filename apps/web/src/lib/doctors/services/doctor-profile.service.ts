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
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  subspecialty?: string | null
  yearsExperience?: number | null
  education?: Json
  certifications?: Json
  schedule?: unknown
  consultationFee?: number | null
  acceptedInsurance?: Json
  bio?: string | null
  languages?: Json
  refepsId?: string | null
  enrollmentEntity?: string | null
  enrollmentJurisdiction?: string | null
  professionalAddress?: string | null
  payoutCbu?: string | null
  payoutAlias?: string | null
  signatureUrl?: string | null
  stampUrl?: string | null
  active?: boolean
  fullName?: string | null
}

function setIfDefined<T extends Record<string, unknown>, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) target[key] = value
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
      schedule: null,
      active: isActive,
    }

    setIfDefined(doctorData, 'subspecialty', input.subspecialty)
    setIfDefined(doctorData, 'years_experience', input.yearsExperience)
    setIfDefined(doctorData, 'education', input.education)
    setIfDefined(doctorData, 'certifications', input.certifications)
    setIfDefined(doctorData, 'consultation_fee', input.consultationFee)
    setIfDefined(doctorData, 'accepted_insurance', input.acceptedInsurance)
    setIfDefined(doctorData, 'bio', input.bio)
    setIfDefined(doctorData, 'languages', input.languages)
    setIfDefined(doctorData, 'refeps_id', input.refepsId)
    setIfDefined(doctorData, 'enrollment_entity', input.enrollmentEntity)
    setIfDefined(doctorData, 'enrollment_jurisdiction', input.enrollmentJurisdiction)
    setIfDefined(doctorData, 'professional_address', input.professionalAddress)
    setIfDefined(doctorData, 'payout_cbu', input.payoutCbu)
    setIfDefined(doctorData, 'payout_alias', input.payoutAlias)
    setIfDefined(doctorData as any, 'signature_image_url', input.signatureUrl) // eslint-disable-line @typescript-eslint/no-explicit-any
    setIfDefined(doctorData as any, 'stamp_image_url', input.stampUrl) // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await doctorProfileRepo.upsertDoctor(admin, doctorData)

    const profilePatch: {
      first_name?: string | null
      last_name?: string | null
      phone?: string | null
    } = {}

    if (input.firstName !== undefined) profilePatch.first_name = input.firstName
    if (input.lastName !== undefined) profilePatch.last_name = input.lastName
    if (input.phone !== undefined) profilePatch.phone = input.phone

    if (input.fullName && input.firstName === undefined && input.lastName === undefined) {
      const parts = input.fullName.trim().split(/\s+/)
      profilePatch.first_name = parts[0] ?? null
      profilePatch.last_name = parts.length > 1 ? parts.slice(1).join(' ') : null
    }

    if (Object.keys(profilePatch).length > 0) {
      await doctorProfileRepo.updateProfileIdentity(admin, input.userId, profilePatch)
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
