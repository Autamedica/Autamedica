import type { APIRoute } from 'astro';
import { appointmentBackendService } from '@/lib/doctors/services/appointment.backend';
import type { AppointmentStatus } from '@autamedica/types';
import { createAppointmentReadAdapter } from '@/lib/doctors/lib/repos/appointments';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { badRequest, forbidden, notFound, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';

const VALID_STATUSES = ['scheduled', 'confirmed', 'in_progress', 're_queue', 'completed', 'cancelled'] as const;
type ValidStatus = typeof VALID_STATUSES[number];

export const POST: APIRoute = async ({ params, request, locals }) => {
  const { id } = params;
  if (!id) return badRequest('missing_appointment_id');

  const context = await resolveDoctorContext(request, locals);
  if (!context) return unauthorized();

  const admin = createAstroAdminClient();
  const appointmentRepo = createAppointmentReadAdapter(admin);
  const appointment = await appointmentRepo.findById(id);
  if (!appointment) return notFound('appointment_not_found');

  if (appointment.doctorId !== context.doctorId) {
    return forbidden('not_your_appointment');
  }

  try {
    const body = await request.json();
    const { status } = body as { status?: string };

    if (!status) return badRequest('missing_status');

    if (!VALID_STATUSES.includes(status as ValidStatus)) {
      return badRequest(`invalid_status: must be one of ${VALID_STATUSES.join(', ')}`);
    }

    const updatedAppointment = await appointmentBackendService.transitionStatus(id, status as AppointmentStatus);
    return jsonOk(updatedAppointment);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) return notFound(message);
    if (message.includes('Invalid transition')) return badRequest(message);

    logger.error('[API transition] failed', { id, error });
    return internalError();
  }
};
