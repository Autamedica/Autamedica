/**
 * Backend Controller: Current Authenticated User.
 * Path: /api/auth/me
 *
 * GET → returns the authenticated user with profile data
 */
import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { jsonOk, internalError } from '@/lib/api-helpers'
import { withAuth, isAuthed } from '@/lib/api-auth'

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuth(request, locals)
  if (!isAuthed(auth)) return jsonOk(null)

  try {
    const { user, supabase } = auth

    const metadataRole =
      typeof user.app_metadata?.role === 'string'
        ? user.app_metadata.role
        : undefined

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (profileError && profileError.code !== 'PGRST116') {
      logger.warn('[api/auth/me] Profile fetch error:', profileError.message)
    }

    const profileData = profile
      ? {
          fullName: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || undefined,
          firstName: profile.first_name ?? undefined,
          lastName: profile.last_name ?? undefined,
          phone: profile.phone ?? undefined,
          specialties: user.user_metadata?.specialties,
          medicalLicense: user.user_metadata?.medical_license,
        }
      : {
          fullName: user.user_metadata?.full_name,
          firstName: user.user_metadata?.first_name,
          lastName: user.user_metadata?.last_name,
          phone: user.user_metadata?.phone,
          specialties: user.user_metadata?.specialties,
          medicalLicense: user.user_metadata?.medical_license,
        }

    const profileRole =
      profile && typeof profile.role === 'string' && profile.role.trim().length > 0
        ? profile.role
        : undefined
    const declaredRole = metadataRole ?? profileRole

    let doctorProfileId: string | undefined
    let patientProfileId: string | undefined

    if (declaredRole === 'doctor' || !declaredRole) {
      const { data: doctorProfile, error: doctorProfileError } = await supabase
        .from('doctors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (doctorProfileError && doctorProfileError.code !== 'PGRST116') {
        logger.warn('[api/auth/me] Doctor profile fetch error:', doctorProfileError.message)
      }

      doctorProfileId = doctorProfile?.id ?? undefined
    }

    if (declaredRole === 'patient' || !declaredRole) {
      const { data: patientProfile, error: patientProfileError } = await supabase
        .from('patients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (patientProfileError && patientProfileError.code !== 'PGRST116') {
        logger.warn('[api/auth/me] Patient profile fetch error:', patientProfileError.message)
      }

      patientProfileId = patientProfile?.id ?? undefined
    }

    const effectiveRole = declaredRole
      ?? (doctorProfileId ? 'doctor' : undefined)
      ?? (patientProfileId ? 'patient' : undefined)

    return jsonOk({
      id: user.id,
      doctorProfileId,
      patientProfileId,
      email: user.email ?? '',
      role: effectiveRole,
      createdAt: profile?.created_at ?? undefined,
      onboardingCompletedAt: profile?.onboarding_completed_at ?? null,
      profile: profileData,
    })
  } catch (err) {
    logger.error('[api/auth/me] GET error:', err)
    return internalError()
  }
}
