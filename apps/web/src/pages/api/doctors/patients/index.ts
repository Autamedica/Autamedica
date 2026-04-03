/**
 * Backend Controller: API Endpoint for Patients.
 * Path: /api/doctors/patients
 */
import type { APIRoute } from 'astro'
import { createSupabaseServerClient } from '@/lib/supabase'
import { patientBackendService } from '@/lib/doctors/services/patient.backend'
import { logger } from '@autamedica/shared'

export const GET: APIRoute = async ({ request, cookies, locals }) => {
  const supabase = createSupabaseServerClient(request, cookies, locals.runtime?.env)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Session Required' }), { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const patientId = url.searchParams.get('id')
    const requestedDoctorUserId = url.searchParams.get('doctorUserId')?.trim()

    let data: unknown

    // Si pide uno en específico
    if (patientId) {
      data = await patientBackendService.getPatientById(patientId as unknown as import('@autamedica/types').UUID, supabase)
    } 
    // Si pide los asignados a un doctor
    else if (requestedDoctorUserId) {
      if (requestedDoctorUserId !== user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
      }

      data = await patientBackendService.getAssignedPatients(requestedDoctorUserId, supabase)
    } 
    // Si pide todos (activo)
    else {
      data = await patientBackendService.getActivePatients(supabase)
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

export const PATCH: APIRoute = async ({ request, cookies, locals }) => {
  const supabase = createSupabaseServerClient(request, cookies, locals.runtime?.env)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return new Response(JSON.stringify({ error: "Session Required" }), { status: 401 })
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get("id")
    const body = await request.json()
    if (!id) return new Response(JSON.stringify({ error: "Patient ID required" }), { status: 400 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (patientsRepo as any).update(id, body, supabase)
    return new Response(null, { status: 204 })
  } catch (err) {
    logger.error("[api/doctors/patients] PATCH error:", err)
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 })
  }
}
