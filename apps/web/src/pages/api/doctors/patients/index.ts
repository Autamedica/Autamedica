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
import { withAuth, isAuthed, type AuthedRequest } from '@/lib/api-auth'
import { forbidden, badRequest, internalError, jsonOk } from '@/lib/api-helpers'

type UserRole = 'doctor' | 'admin' | 'patient' | 'company'

async function resolveRole(
  user: { id: string; app_metadata?: Record<string, unknown> },
  supabase: AuthedRequest['supabase'],
): Promise<UserRole | undefined> {
  const app = user.app_metadata?.role
  if (app === 'doctor' || app === 'admin') return app

  const { data, error } = await supabase.from('profiles')
    .select('role').eq('user_id', user.id).maybeSingle()
  if (error) return undefined
  return data?.role === 'doctor' || data?.role === 'admin' ? data.role : undefined
}

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuth(request, locals)
  if (!isAuthed(auth)) return auth

  const role = await resolveRole(auth.user, auth.supabase)
  if (role !== 'doctor' && role !== 'admin') {
    return forbidden('doctor_or_admin_only')
  }

  try {
    const runtimeEnv = locals.runtime?.env
    const url = new URL(request.url)
    const patientId = url.searchParams.get('id')
    const companyId = url.searchParams.get('companyId')?.trim()

    if (patientId) {
      if (role === 'doctor') {
        // This service uses service_role. Check doctor ownership before reading PHI.
        const assigned = await patientBackendService.getAssignedPatients(auth.user.id, runtimeEnv)
        const patient = assigned.find(p => p.id === patientId)
        if (!patient) return forbidden('patient_not_assigned_to_doctor')
        return jsonOk(patient)
      }
      const data = await patientBackendService.getPatientById(patientId as UUID, runtimeEnv)
      return jsonOk(data)
    }

    if (role === 'doctor') {
      const data = await patientBackendService.getAssignedPatients(auth.user.id, runtimeEnv)
      return jsonOk(data)
    }

    if (companyId) {
      const data = await patientBackendService.getPatientsByCompany(companyId, runtimeEnv)
      return jsonOk(data)
    }

    const data = await patientBackendService.getActivePatients(runtimeEnv)
    return jsonOk(data)
  } catch (err) {
    logger.error('[api/doctors/patients] GET error:', err)
    return internalError()
  }
}

export const PATCH: APIRoute = async ({ request, locals }) => {
  const auth = await withAuth(request, locals)
  if (!isAuthed(auth)) return auth

  const role = await resolveRole(auth.user, auth.supabase)
  if (role !== 'doctor' && role !== 'admin') {
    return forbidden('doctor_or_admin_only')
  }

  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (!id) return badRequest('patient_id_required')

    if (role === 'doctor') {
      const assigned = await patientBackendService.getAssignedPatients(auth.user.id, locals.runtime?.env)
      if (!assigned.some(p => p.id === id)) return forbidden('patient_not_assigned_to_doctor')
    }

    const body = await request.json()
    await patientsRepo.update(id as UUID, body as Record<string, unknown>, auth.supabase)
    return new Response(null, { status: 204 })
  } catch (err) {
    logger.error('[api/doctors/patients] PATCH error:', err)
    return internalError()
  }
}
