/**
 * Backend Controller: Doctor Profile API.
 * Path: /api/doctors/profile
 *
 * GET ?userId=X  → doctor by user ID
 * GET ?id=X      → doctor by doctor ID
 * GET ?specialty=X → doctors by specialty
 * GET (none)     → all active doctors
 */
import type { APIRoute } from 'astro'
import { doctorBackendService } from '@/lib/doctors/services/doctor.backend'
import { logger } from '@autamedica/shared'
import { jsonOk, internalError } from '@/lib/api-helpers'
import { withAuth, isAuthed } from '@/lib/api-auth'

export const GET: APIRoute = async ({ request }) => {
  const auth = await withAuth(request)
  if (!isAuthed(auth)) return auth

  try {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    const id = url.searchParams.get('id')
    const specialty = url.searchParams.get('specialty')

    if (userId) {
      const doctor = await doctorBackendService.getDoctorByUserId(userId)
      return jsonOk(doctor)
    }

    if (id) {
      const doctor = await doctorBackendService.getDoctorById(id)
      return jsonOk(doctor)
    }

    if (specialty) {
      const doctors = await doctorBackendService.getDoctorsBySpecialty(specialty)
      return jsonOk(doctors)
    }

    const doctors = await doctorBackendService.getDoctors()
    return jsonOk(doctors)
  } catch (err) {
    logger.error('[api/doctors/profile] GET error:', err)
    return internalError()
  }
}
