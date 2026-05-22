import type { APIRoute } from 'astro'
import type { Json } from '@autamedica/types'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { jsonOk, badRequest, internalError, conflict } from '@/lib/api-helpers'
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth'
import { doctorProfileService } from '@/lib/doctors/services/doctor-profile.service'

function optionalString(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined
  const value = body[key]
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  return value.trim() || null
}

function optionalNumber(body: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in body)) return undefined
  const value = body[key]
  if (value === null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function isConflictError(err: unknown): boolean {
  return Boolean(
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505',
  )
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
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
      firstName: optionalString(body, 'first_name'),
      lastName: optionalString(body, 'last_name'),
      phone: optionalString(body, 'phone'),
      subspecialty: optionalString(body, 'subspecialty'),
      yearsExperience: optionalNumber(body, 'years_experience'),
      education: 'education' in body ? (body.education as Json) ?? null : undefined,
      certifications: 'certifications' in body ? (body.certifications as Json) ?? null : undefined,
      schedule: body.schedule,
      consultationFee: optionalNumber(body, 'consultation_fee'),
      acceptedInsurance: 'accepted_insurance' in body ? (body.accepted_insurance as Json) ?? null : undefined,
      bio: optionalString(body, 'bio'),
      careGuideTemplate: (body.care_guide_template === 'neutral' || body.care_guide_template === 'female' || body.care_guide_template === 'empathetic')
        ? body.care_guide_template as 'neutral' | 'female' | 'empathetic'
        : undefined,
      languages: 'languages' in body ? (body.languages as Json) ?? null : undefined,
      refepsId: optionalString(body, 'refeps_id'),
      enrollmentEntity: optionalString(body, 'enrollment_entity'),
      enrollmentJurisdiction: optionalString(body, 'enrollment_jurisdiction'),
      professionalAddress: optionalString(body, 'professional_address'),
      payoutCbu: optionalString(body, 'payout_cbu'),
      payoutAlias: optionalString(body, 'payout_alias'),
      signatureUrl: optionalString(body, 'signature_url'),
      stampUrl: optionalString(body, 'stamp_url'),
      active: typeof body.active === 'boolean' ? body.active : undefined,
      fullName,
    })

    return jsonOk(result)
  } catch (err) {
    if (isConflictError(err)) {
      return conflict('license_number_already_exists')
    }
    logger.error('[API] doctor profile creation error', err as Error)
    return internalError()
  }
}
