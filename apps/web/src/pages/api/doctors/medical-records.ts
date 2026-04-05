/**
 * Backend Controller: Medical Records API.
 * Path: /api/doctors/medical-records
 *
 * GET ?patientId=X → records for patient (required)
 *     &type=X      → filter by record type
 *     &dateFrom=X  → filter by date range
 *     &dateTo=X
 *     &diagnosisContains=X → full-text search in content
 *     &page=0      → pagination
 *     &pageSize=10
 */
import type { APIRoute } from 'astro'
import { medicalRecordsBackendService } from '@/lib/doctors/services/medical-records.backend'
import { logger } from '@autamedica/shared'
import { jsonOk, badRequest, internalError } from '@/lib/api-helpers'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'


export const GET: APIRoute = async ({ request }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES)
  if (!isAuthed(auth)) return auth

  try {
    const { supabase } = auth
    const url = new URL(request.url)
    const patientId = url.searchParams.get('patientId')

    if (!patientId) {
      return badRequest('patientId is required')
    }

    const result = await medicalRecordsBackendService.getByPatient({
      patientId,
      type: url.searchParams.get('type') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      diagnosisContains: url.searchParams.get('diagnosisContains') ?? undefined,
      page: parseInt(url.searchParams.get('page') ?? '0', 10),
      pageSize: parseInt(url.searchParams.get('pageSize') ?? '10', 10),
    }, supabase)

    return jsonOk(result)
  } catch (err) {
    logger.error('[api/doctors/medical-records] GET error:', err)
    return internalError()
  }
}
