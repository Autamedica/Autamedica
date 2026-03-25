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

export const GET: APIRoute = async ({ request }) => {
  const auth = await withAuth(request)
  if (!isAuthed(auth)) return jsonOk(null)

  try {
    const { user, supabase } = auth

    const role = user.user_metadata?.role ?? user.app_metadata?.role ?? undefined

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
          specialties: user.user_metadata?.specialties,
          medicalLicense: user.user_metadata?.medical_license,
        }
      : {
          fullName: user.user_metadata?.full_name,
          firstName: user.user_metadata?.first_name,
          lastName: user.user_metadata?.last_name,
          specialties: user.user_metadata?.specialties,
          medicalLicense: user.user_metadata?.medical_license,
        }

    return jsonOk({
      id: user.id,
      email: user.email ?? '',
      role: typeof role === 'string' ? role : undefined,
      createdAt: profile?.created_at ?? undefined,
      onboardingCompletedAt: profile?.onboarding_completed_at ?? null,
      profile: profileData,
    })
  } catch (err) {
    logger.error('[api/auth/me] GET error:', err)
    return internalError()
  }
}
