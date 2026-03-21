/**
 * API Routes para gestión de citas médicas
 * GET /api/appointments - Obtener citas del paciente actual
 * POST /api/appointments - Crear nueva cita
 */

import type { CreateAppointmentInput } from '@/types/appointment';
import { createAdminClient, createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import type { Database } from '@autamedica/types';
import { NextRequest, NextResponse } from 'next/server';
import { computeEndTime, mapAppointment, mapTypeToDb, type DbAppointmentRow } from './utils';
import { resolvePatientContext } from '../shared/patient-context';
/**
 * GET /api/appointments
 * Obtiene todas las citas del paciente autenticado
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const context = await resolvePatientContext(supabase);

    if (!context) {
      return NextResponse.json(
        { error: 'No autorizado o paciente no encontrado' },
        { status: 401 }
      );
    }

    let admin: ReturnType<typeof createAdminClient>;
    try {
      admin = createAdminClient();
    } catch (error) {
      logger.error('[GET /api/appointments] Admin client unavailable', error);
      return NextResponse.json(
        { error: 'No fue posible cargar las citas del paciente' },
        { status: 503 }
      );
    }

    // Obtener citas del paciente con información del doctor
    const { data: records, error } = await admin
      .from('appointments')
      .select(`
        *,
        doctor:doctors(
          id,
          specialty,
          user_id,
          profile:profiles!doctors_user_id_fkey(
            first_name,
            last_name
          )
        )
      `)
      .eq('patient_id', context.patientId)
      .order('start_time', { ascending: false });

    if (error) { // Corrected syntax for error handling
      logger.error('[GET /api/appointments] Error:', error); // Changed variable name to 'error'
      return NextResponse.json(
        { error: 'Error al obtener citas' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: ((records || []) as unknown as DbAppointmentRow[]).map(mapAppointment),
    });
  } catch (error) {
    logger.error('[GET /api/appointments] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/appointments
 * Crea una nueva cita para el paciente autenticado
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const context = await resolvePatientContext(supabase);

    if (!context) {
      return NextResponse.json(
        { error: 'No autorizado o paciente no encontrado' },
        { status: 401 }
      );
    }

    // Parsear body de la request
    const body: CreateAppointmentInput = await request.json();

    // Validar campos requeridos
    if (!body.scheduled_at) {
      return NextResponse.json(
        { error: 'El campo scheduled_at es requerido' },
        { status: 400 }
      );
    }

    const startDate = new Date(body.scheduled_at);
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: 'scheduled_at no tiene un formato válido' },
        { status: 400 }
      );
    }

    const doctorId = typeof body.doctor_id === 'string' ? body.doctor_id.trim() : '';
    if (!doctorId) {
      return NextResponse.json(
        { error: 'Debes seleccionar un profesional antes de agendar la cita' },
        { status: 400 }
      );
    }

    let admin: ReturnType<typeof createAdminClient>;
    try {
      admin = createAdminClient();
    } catch (error) {
      logger.error('[POST /api/appointments] Admin client unavailable', error);
      return NextResponse.json(
        { error: 'No fue posible validar el profesional seleccionado' },
        { status: 503 }
      );
    }

    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id')
      .eq('id', doctorId)
      .eq('active', true)
      .maybeSingle();

    if (doctorError) {
      logger.error('[POST /api/appointments] Doctor lookup error:', doctorError);
      return NextResponse.json(
        { error: 'No fue posible validar el profesional seleccionado' },
        { status: 500 }
      );
    }

    if (!doctor) {
      return NextResponse.json(
        { error: 'El profesional seleccionado no está disponible' },
        { status: 404 }
      );
    }

    const duration = body.duration_minutes && body.duration_minutes > 0 ? body.duration_minutes : 30;
    const startIso = startDate.toISOString();
    const endIso = computeEndTime(startIso, duration);

    // Destructure body for easier use in insert, matching the provided diff's variable names
    const {
      type,
      notes,
      reason,
      meeting_url,
      location
    } = body;
    const start_time = startIso;
    const endTime = endIso;
    const duration_minutes = duration;
    const combinedNotes = [reason, notes]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .join('\n\n') || null;

    const appointmentInsert: Database['public']['Tables']['appointments']['Insert'] = {
      patient_id: context.patientId,
      doctor_id: doctorId,
      start_time,
      end_time: endTime,
      duration_minutes: Number(duration_minutes),
      type: mapTypeToDb(type || 'telemedicine'),
      status: 'scheduled',
      notes: combinedNotes,
      meeting_url: meeting_url ?? null,
      location: location ?? null,
    };

    const { data: newAppointment, error: insertError } = await admin
      .from('appointments')
      .insert(appointmentInsert as never)
      .select(`
        *,
        doctor:doctors (
          id,
          specialty,
          user_id,
          profile:profiles!doctors_user_id_fkey (
            first_name,
            last_name
          )
        )
      `)
      .single();

    if (insertError) {
      logger.error('[POST /api/appointments] Insert error:', insertError);
      const isSchedulingConflict =
        typeof insertError.message === 'string' &&
        insertError.message.includes('SCHEDULING_CONFLICT');
      const status = isSchedulingConflict
        ? 409
        : insertError.code === '23502' || insertError.code === '23503'
          ? 400
          : 500;
      const errorMessage = isSchedulingConflict
        ? 'El profesional ya tiene una cita en ese horario'
        : 'Error al crear la cita';
      return NextResponse.json(
        { error: errorMessage, details: insertError.message },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      data: mapAppointment(newAppointment as unknown as DbAppointmentRow),
    }, { status: 201 });
  } catch (error) {
    logger.error('[POST /api/appointments] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
