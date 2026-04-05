/**
 * Backend Controller: Doctor Availability API.
 * Path: /api/doctors/availability
 *
 * GET    → doctor's weekly schedule + overrides
 * PUT    → replace weekly schedule
 * POST   → add a date-specific override
 * DELETE ?overrideId=X → remove an override
 */
import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { jsonOk, badRequest, internalError, notFound } from '@/lib/api-helpers'
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth'
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { doctorAvailabilityService } from '@/lib/doctors/services/doctor-availability.service'

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES)
  if (!isAuthed(auth)) return auth

  const context = await resolveDoctorContext(request, locals)
  if (!context) return badRequest('Doctor profile not found')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const schedule = await doctorAvailabilityService.getSchedule(admin, context.doctorId)
    return jsonOk(schedule)
  } catch (err) {
    logger.error('[doctors/availability/GET]', err)
    return internalError()
  }
}

export const PUT: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES)
  if (!isAuthed(auth)) return auth

  const context = await resolveDoctorContext(request, locals)
  if (!context) return badRequest('Doctor profile not found')

  const body = await request.json().catch(() => null)
  if (!body?.slots || !Array.isArray(body.slots)) {
    return badRequest('slots array required')
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const weekly = await doctorAvailabilityService.replaceWeeklySchedule(admin, context.doctorId, body.slots)
    return jsonOk({ weekly })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'VALIDATION') return badRequest((err as Error).message)
    logger.error('[doctors/availability/PUT]', err)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES)
  if (!isAuthed(auth)) return auth

  const context = await resolveDoctorContext(request, locals)
  if (!context) return badRequest('Doctor profile not found')

  const body = await request.json().catch(() => null)
  if (!body?.overrideDate?.trim()) {
    return badRequest('overrideDate required')
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const override = await doctorAvailabilityService.addOverride(admin, context.doctorId, {
      overrideDate: body.overrideDate,
      isAvailable: body.isAvailable ?? false,
      startTime: body.startTime,
      endTime: body.endTime,
      reason: body.reason,
    })
    return jsonOk(override, 201)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'VALIDATION') return badRequest((err as Error).message)
    if (code === '23505') return badRequest('Override already exists for this date')
    logger.error('[doctors/availability/POST]', err)
    return internalError()
  }
}

export const DELETE: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES)
  if (!isAuthed(auth)) return auth

  const context = await resolveDoctorContext(request, locals)
  if (!context) return badRequest('Doctor profile not found')

  const url = new URL(request.url)
  const overrideId = url.searchParams.get('overrideId')
  if (!overrideId) return badRequest('overrideId query param required')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const deleted = await doctorAvailabilityService.removeOverride(admin, context.doctorId, overrideId)
    if (!deleted) return notFound('Override not found')
    return jsonOk({ deleted: true })
  } catch (err) {
    logger.error('[doctors/availability/DELETE]', err)
    return internalError()
  }
}
