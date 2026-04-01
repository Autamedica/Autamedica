import type { APIRoute } from 'astro';
import { appointmentBackendService } from '@/lib/doctors/services/appointment.backend';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getAppointment } from '@/lib/doctors/lib/repos/appointments';
import { logger } from '@autamedica/shared';

const VALID_STATUSES = ['scheduled', 'confirmed', 'in_progress', 're_queue', 'completed', 'cancelled'] as const;
type ValidStatus = typeof VALID_STATUSES[number];

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing appointment id' }), { status: 400 });
  }

  const supabase = createSupabaseServerClient(request, cookies, locals.runtime?.env);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Session required' }), { status: 401 });
  }

  const appointment = await getAppointment(id);
  if (!appointment) {
    return new Response(JSON.stringify({ error: 'Appointment not found' }), { status: 404 });
  }

  const doctor = await supabase
    .from('doctors')
    .select('id, user_id')
    .eq('user_id', user.id)
    .single();

  if (doctor.error || !doctor.data) {
    return new Response(JSON.stringify({ error: 'Doctor profile not found' }), { status: 403 });
  }

  if (appointment.doctor_id !== doctor.data.id) {
    return new Response(JSON.stringify({ error: 'Forbidden: not your appointment' }), { status: 403 });
  }

  try {
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return new Response(JSON.stringify({ error: 'Missing status' }), { status: 400 });
    }

    if (!VALID_STATUSES.includes(status as ValidStatus)) {
      return new Response(
        JSON.stringify({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }),
        { status: 400 }
      );
    }

    const updatedAppointment = await appointmentBackendService.transitionStatus(id, status);
    return new Response(JSON.stringify(updatedAppointment), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = message.includes('not found') ? 404
      : message.includes('Invalid transition') ? 400
      : 500;
    logger.error('[API transition] failed', { id, error });
    return new Response(
      JSON.stringify({ error: statusCode === 500 ? 'Internal server error' : message }),
      { status: statusCode }
    );
  }
};
