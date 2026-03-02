/**
 * API Routes para gestión de citas médicas
 * GET /api/appointments - Obtener citas del paciente actual
 * POST /api/appointments - Crear nueva cita
 */

import type { CreateAppointmentInput } from '@/types/appointment';
import { createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import { NextRequest, NextResponse } from 'next/server';
import { computeEndTime, mapAppointment, mapTypeToDb, type DbAppointmentRow } from './utils';
/**
 * GET /api/appointments
 * Obtiene todas las citas del paciente autenticado
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    // Verificar autenticación
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Obtener patient_id del usuario
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: 'Paciente no encontrado' },
        { status: 404 }
      );
    }

    // Obtener citas del paciente con información del doctor
    const { data: records, error } = await (supabase as any)
      .from('appointments')
      .select(`
        *,
        doctor:doctors(
          first_name,
          last_name,
          specialty
        )
      `)
      .eq('patient_id', userId) // Changed from patient.id to userId as per instruction
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
      data: (records || []).map(mapAppointment), // Changed variable name to 'records'
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

    // Verificar autenticación
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Obtener patient_id del usuario
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: 'Paciente no encontrado' },
        { status: 404 }
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

    const duration = body.duration_minutes && body.duration_minutes > 0 ? body.duration_minutes : 30;
    const startIso = startDate.toISOString();
    const endIso = computeEndTime(startIso, duration);

    // Destructure body for easier use in insert, matching the provided diff's variable names
    const {
      doctor_id,
      type,
      notes,
      reason,
      meeting_url,
      location
    } = body;
    const start_time = startIso;
    const endTime = endIso;
    const duration_minutes = duration;

    const { data: newAppointment, error: insertError } = await (supabase as any)
      .from('appointments')
      .insert({
        patient_id: (patient as any).id,
        doctor_id,
        start_time,
        end_time: endTime,
        duration_minutes: Number(duration_minutes),
        type: mapTypeToDb(type || 'telemedicine'), // Ensure type is mapped
        status: 'scheduled',
        notes,
        reason,
        meeting_url,
        location
      })
      .select(`
        *,
        doctor:doctors (
          id,
          first_name,
          last_name,
          specialty,
          profile_picture_url
        )
      `) // Re-added select to maintain original functionality of fetching doctor info
      .single();

    if (insertError) {
      logger.error('[POST /api/appointments] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Error al crear la cita', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: mapAppointment(newAppointment as DbAppointmentRow),
    }, { status: 201 });
  } catch (error) {
    logger.error('[POST /api/appointments] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
