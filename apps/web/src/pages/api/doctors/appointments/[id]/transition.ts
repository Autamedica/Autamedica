import type { APIRoute } from 'astro';
import { appointmentBackendService } from '@/lib/doctors/services/appointment.backend';
import type { AppointmentStatus } from '@autamedica/types';
import { createAppointmentReadAdapter } from '@/lib/doctors/lib/repos/appointments';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { badRequest, forbidden, notFound, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';

const VALID_STATUSES = ['scheduled', 'confirmed', 'in_progress', 're_queue', 'completed', 'cancelled', 'no_show'] as const;
type ValidStatus = typeof VALID_STATUSES[number];

export const POST: APIRoute = async ({ params, request, locals }) => {
  const { id } = params;
  if (!id) return badRequest('missing_appointment_id');

  const context = await resolveDoctorContext(request, locals);
  if (!context) return unauthorized();

  const admin = createAstroAdminClient(locals.runtime?.env);
  const appointmentRepo = createAppointmentReadAdapter(admin);
  const appointment = await appointmentRepo.findById(id);
  if (!appointment) return notFound('appointment_not_found');

  if (appointment.doctorId !== context.doctorId) {
    return forbidden('not_your_appointment');
  }

  let status: string | undefined;
  try {
    const body = await request.json();
    status = (body as { status?: string }).status;

    if (!status) return badRequest('missing_status');

    if (!VALID_STATUSES.includes(status as ValidStatus)) {
      return badRequest(`invalid_status: must be one of ${VALID_STATUSES.join(', ')}`);
    }

    const updatedAppointment = await appointmentBackendService.transitionStatus(id, status as AppointmentStatus);
    return jsonOk(updatedAppointment);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Postgres error code (PGRST or 23xxx) hints at CHECK / RLS / FK violations.
    // We surface a recognisable message so the caller (and Sentry, via `cause`)
    // can distinguish a domain validation failure from a true 500.
    const pgCode = (error as { code?: string } | null)?.code;

    if (message.includes('not found')) return notFound(message);
    if (message.includes('Invalid transition')) return badRequest(message);

    // 23514 = check_violation (e.g. status not in CHECK constraint, like 're_queue').
    if (pgCode === '23514' || /violates check constraint/i.test(message)) {
      return badRequest(`invalid_status_for_db: ${message}`);
    }
    // 42501 = insufficient_privilege (RLS denial when not using service role).
    if (pgCode === '42501' || /row-level security|new row violates row-level/i.test(message)) {
      return forbidden(`rls_denied: ${message}`);
    }

    logger.error('[API transition] failed', { id, status, pgCode, error });
    return internalError(message || 'transition_failed');
  }
};
