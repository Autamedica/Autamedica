import type { APIRoute } from 'astro'
import type { Json } from '@autamedica/types'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { jsonOk, badRequest, internalError } from '@/lib/api-helpers'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { doctorProfileService } from '@/lib/doctors/services/doctor-profile.service'

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const auth = await withAuth(request)
    if (!isAuthed(auth)) return auth
    const { user } = auth

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return badRequest('invalid_body')

    const { license_number, specialty } = body
    if (typeof license_number !== 'string' || !license_number.trim()) {
      return badRequest('license_number is required')
    }
    if (typeof specialty !== 'string' || !specialty.trim()) {
      return badRequest('specialty is required')
    }

    const fullName = typeof body.fullName === 'string'
      ? body.fullName
      : (typeof body.full_name === 'string' ? body.full_name : null)

    const admin = createAstroAdminClient(locals.runtime?.env)
    const result = await doctorProfileService.createOrUpdate(admin, {
      userId: user.id,
      licenseNumber: license_number.trim(),
      specialty: specialty.trim(),
      subspecialty: typeof body.subspecialty === 'string' ? body.subspecialty.trim() || null : null,
      yearsExperience: typeof body.years_experience === 'number' ? body.years_experience : null,
      education: (body.education as Json) ?? null,
      certifications: (body.certifications as Json) ?? null,
      schedule: body.schedule,
      consultationFee: typeof body.consultation_fee === 'number' ? body.consultation_fee : null,
      acceptedInsurance: (body.accepted_insurance as Json) ?? null,
      bio: typeof body.bio === 'string' ? body.bio.trim() || null : null,
      languages: (body.languages as Json) ?? null,
      active: typeof body.active === 'boolean' ? body.active : undefined,
      fullName,
    })

    return jsonOk(result)
  } catch (err) {
    logger.error('[API] doctor profile creation error', err as Error)
    return internalError()
  }
}
