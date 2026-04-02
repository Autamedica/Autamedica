import type { APIRoute } from 'astro'
import type { Database, Json } from '@autamedica/types'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { jsonOk, badRequest, internalError } from '@/lib/api-helpers'
import { withAuth, isAuthed } from '@/lib/api-auth'

const DEFAULT_AVAILABILITY_PRESET = [
  { day_of_week: 1, start_time: '09:00', end_time: '17:00' },
  { day_of_week: 2, start_time: '09:00', end_time: '17:00' },
  { day_of_week: 3, start_time: '09:00', end_time: '17:00' },
  { day_of_week: 4, start_time: '09:00', end_time: '17:00' },
  { day_of_week: 5, start_time: '09:00', end_time: '17:00' },
] as const

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

function buildAvailabilityRows(
  doctorId: string,
  schedule: unknown,
): AvailabilityInsert[] {
  if (!schedule || typeof schedule !== 'object') return []

  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  }

  const availabilityRows: AvailabilityInsert[] = []
  const weeklySchedule = schedule as ScheduleInput

  for (const [dayName, dayConfig] of Object.entries(weeklySchedule)) {
    const dayOfWeek = dayMap[dayName]
    if (dayOfWeek === undefined || !dayConfig?.isAvailable) continue

    for (const slot of dayConfig.timeSlots ?? []) {
      if (!slot.startTime || !slot.endTime) continue

      availabilityRows.push({
        doctor_id: doctorId,
        day_of_week: dayOfWeek,
        start_time: slot.startTime,
        end_time: slot.endTime,
        slot_duration: slot.slotDurationMinutes ?? 30,
        is_active: true,
      })
    }
  }

  return availabilityRows
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

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuth(request)
    if (!isAuthed(auth)) return auth
    const { user } = auth

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return badRequest('invalid_body')
    }

    const {
      license_number,
      specialty,
      subspecialty,
      years_experience,
      education,
      certifications,
      schedule,
      consultation_fee,
      accepted_insurance,
      bio,
      languages,
      active,
    } = body

    if (typeof license_number !== 'string' || !license_number.trim()) {
      return badRequest('license_number is required')
    }
    if (typeof specialty !== 'string' || !specialty.trim()) {
      return badRequest('specialty is required')
    }

    const admin = createAstroAdminClient()

    const doctorData: Database['public']['Tables']['doctors']['Insert'] = {
      user_id: user.id,
      license_number: license_number.trim(),
      specialty: specialty.trim(),
      subspecialty: typeof subspecialty === 'string' ? subspecialty.trim() || null : null,
      years_experience: typeof years_experience === 'number' ? years_experience : null,
      education: (education as Json) ?? null,
      certifications: (certifications as Json) ?? null,
      schedule: null, // Deprecated: use doctor_availability table instead
      consultation_fee: typeof consultation_fee === 'number' ? consultation_fee : null,
      accepted_insurance: (accepted_insurance as Json) ?? null,
      bio: typeof bio === 'string' ? bio.trim() || null : null,
      languages: (languages as Json) ?? null,
      active: typeof active === 'boolean' ? active : true,
    }

    const { data, error } = await admin
      .from('doctors')
      .upsert(doctorData, { onConflict: 'user_id' })
      .select('id')
      .single()

    if (error) {
      logger.error('[API] doctor profile upsert failed', error)
      return badRequest('doctor_profile_upsert_failed')
    }

    const doctorId = (data as { id: string }).id

    const availabilityRows = buildAvailabilityRows(doctorId, schedule)

    if (availabilityRows.length > 0) {
      await admin.from('doctor_availability').delete().eq('doctor_id', doctorId)
      const { error: availError } = await admin.from('doctor_availability').insert(availabilityRows)
      if (availError) {
        logger.error('[API] doctor_availability insert failed', availError)
      }
    } else if (doctorData.active) {
      const { count, error: availabilityCountError } = await admin
        .from('doctor_availability')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', doctorId)
        .eq('is_active', true)

      if (availabilityCountError) {
        logger.error('[API] doctor_availability count failed', availabilityCountError)
      } else if ((count ?? 0) === 0) {
        const { error: defaultAvailabilityError } = await admin
          .from('doctor_availability')
          .insert(buildDefaultAvailabilityRows(doctorId))

        if (defaultAvailabilityError) {
          logger.error('[API] doctor_availability default insert failed', defaultAvailabilityError)
        }
      }
    }

    return jsonOk(data)
  } catch (err) {
    logger.error('[API] doctor profile creation error', err as Error)
    return internalError()
  }
}
