/**
 * Backend Controller: API Endpoint for Patients.
 * Path: /api/doctors/patients
 *
 * RBAC:
 * - doctor: can list their own assigned patients or fetch by ID
 * - admin: can list all active patients or fetch by ID
 * - other roles: 403 Forbidden
 */
import type { APIRoute } from 'astro'
import type { UUID } from '@autamedica/types'
import { patientBackendService } from '@/lib/doctors/services/patient.backend'
import { patientsRepo } from '@/lib/doctors/lib/repos/patients'
import { logger } from '@autamedica/shared'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { forbidden, badRequest, internalError, jsonOk } from '@/lib/api-helpers'

type UserRole = 'doctor' | 'admin' | 'patient' | 'company'

function resolveRole(user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }): UserRole | undefined {
  const meta = user.user_metadata?.role
  if (typeof meta === 'string' && meta.length > 0) return meta as UserRole
  const app = user.app_metadata?.role
  if (typeof app === 'string' && app.length > 0) return app as UserRole
  return undefined
}

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuth(request, locals)
  if (!isAuthed(auth)) return auth

  const role = resolveRole(auth.user)
  if (role !== 'doctor' && role !== 'admin') {
    return forbidden('doctor_or_admin_only')
  }

  try {
    const url = new URL(request.url)
    const patientId = url.searchParams.get('id')
    const companyId = url.searchParams.get('companyId')?.trim()

    if (patientId) {
      const data = await patientBackendService.getPatientById(patientId as UUID, auth.supabase)
      return jsonOk(data)
    }

    if (role === 'doctor') {
      const data = await patientBackendService.getAssignedPatients(auth.user.id, auth.supabase)
      return jsonOk(data)
    }

    if (companyId) {
      const data = await patientBackendService.getPatientsByCompany(companyId, auth.supabase)
      return jsonOk(data)
    }

    const data = await patientBackendService.getActivePatients(auth.supabase)
    return jsonOk(data)
  } catch (err) {
    logger.error('[api/doctors/patients] GET error:', err)
    return internalError()
  }
}

export const PATCH: APIRoute = async ({ request, locals }) => {
  const auth = await withAuth(request, locals)
  if (!isAuthed(auth)) return auth

  const role = resolveRole(auth.user)
  if (role !== 'doctor' && role !== 'admin') {
    return forbidden('doctor_or_admin_only')
  }

  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (!id) return badRequest('patient_id_required')

    const body = await request.json()
    await patientsRepo.update(id as UUID, body as Record<string, unknown>, auth.supabase)
    return new Response(null, { status: 204 })
  } catch (err) {
    logger.error('[api/doctors/patients] PATCH error:', err)
    return internalError()
  }
}
