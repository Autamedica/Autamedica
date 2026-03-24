import type { APIRoute } from 'astro'
import type { Database, Json } from '@autamedica/types'
import { createServerClientFromRequest, createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request }) => {
  try {
    const supabase = createServerClientFromRequest(request)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return unauthorized()
    }

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

    const admin = createAdminClient()

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
      return badRequest(error.message)
    }

    const doctorId = (data as { id: string }).id

    // Write schedule to doctor_availability table (replaces deprecated doctors.schedule JSONB)
    if (schedule && typeof schedule === 'object') {
      const dayMap: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      }

      const availabilityRows: Database['public']['Tables']['doctor_availability']['Insert'][] = []
      const weeklySchedule = schedule as Record<string, { isAvailable?: boolean; timeSlots?: { startTime?: string; endTime?: string; slotDurationMinutes?: number }[] }>

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

      if (availabilityRows.length > 0) {
        // Clear existing availability for this doctor, then insert new
        await admin.from('doctor_availability').delete().eq('doctor_id', doctorId)
        const { error: availError } = await admin.from('doctor_availability').insert(availabilityRows)
        if (availError) {
          logger.error('[API] doctor_availability insert failed', availError)
        }
      }
    }

    return jsonOk(data)
  } catch (err) {
    logger.error('[API] doctor profile creation error', err as Error)
    return internalError()
  }
}
