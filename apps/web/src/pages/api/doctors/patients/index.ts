/**
 * Backend Controller: API Endpoint for Patients.
 * Path: /api/doctors/patients
 */
import type { APIRoute } from 'astro'
import { createServerClient } from '@autamedica/auth/server'
import { patientBackendService } from '@/lib/doctors/services/patient.backend'
import { logger } from '@autamedica/shared'

export const GET: APIRoute = async ({ request, cookies }) => {
  const supabase = createServerClient(cookies)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Session Required' }), { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const patientId = url.searchParams.get('id')
    const doctorUserId = url.searchParams.get('doctorUserId')

    let data: unknown

    // Si pide uno en específico
    if (patientId) {
      data = await patientBackendService.getPatientById(patientId)
    } 
    // Si pide los asignados a un doctor
    else if (doctorUserId) {
      data = await patientBackendService.getAssignedPatients(doctorUserId)
    } 
    // Si pide todos (activo)
    else {
      data = await patientBackendService.getActivePatients()
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    logger.error('[api/doctors/patients] GET error:', err)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 })
  }
}
