/**
 * API Routes para gestión individual de citas
 * GET /api/appointments/[id] - Obtener cita específica
 * PATCH /api/appointments/[id] - Actualizar cita
 * DELETE /api/appointments/[id] - Cancelar cita
 */

import type { UpdateAppointmentInput } from '@/types/appointment';
import { createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import type { DbAppointmentRow } from '../utils';
import { NextRequest, NextResponse } from 'next/server';
import { resolvePatientContext } from '../../shared/patient-context';
import { computeEndTime, mapAppointment, mapTypeToDb } from '../utils';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/appointments/[id]
 * Obtiene una cita específica
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const supabase = await createRouteHandlerClient();
    const contextData = await resolvePatientContext(supabase);

    if (!contextData) {
      return NextResponse.json(
        { error: 'No autorizado o paciente no encontrado' },
        { status: 401 }
      );
    }

    // Obtener la cita
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
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
      .eq('id', id)
      .eq('patient_id', contextData.patientId)
      .single();

    if (appointmentError || !appointment) {
      return NextResponse.json(
        { error: 'Cita no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: mapAppointment(appointment as DbAppointmentRow),
    });
  } catch (error) {
    logger.error('[GET /api/appointments/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/appointments/[id]
 * Actualiza una cita existente
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const supabase = await createRouteHandlerClient();
    const contextData = await resolvePatientContext(supabase);

    if (!contextData) {
      return NextResponse.json(
        { error: 'No autorizado o paciente no encontrado' },
        { status: 401 }
      );
    }

    // Verificar que la cita pertenece al paciente
    const { data: existingAppointment, error: checkError } = await supabase
      .from('appointments')
      .select('id, start_time, duration_minutes, notes')
      .eq('id', id)
      .eq('patient_id', contextData.patientId)
      .single();

    if (checkError || !existingAppointment) {
      return NextResponse.json(
        { error: 'Cita no encontrada' },
        { status: 404 }
      );
    }

    // Parsear body
    const body: UpdateAppointmentInput = await request.json();

    // Actualizar la cita
    const typedExistingAppointment = existingAppointment as Pick<
      DbAppointmentRow,
      'start_time' | 'duration_minutes' | 'notes'
    > | null;

    const updates: Record<string, string | number | null> = {
      updated_at: new Date().toISOString(),
    };

    let effectiveStart = typedExistingAppointment?.start_time ?? null;
    let effectiveDuration = typedExistingAppointment?.duration_minutes ?? 30;

    if (body.scheduled_at) {
      const startIso = new Date(body.scheduled_at).toISOString();
      updates.start_time = startIso;
      effectiveStart = startIso;
    }

    if (body.duration_minutes !== undefined) {
      updates.duration_minutes = body.duration_minutes;
      effectiveDuration = body.duration_minutes;
    }

    if (effectiveStart) {
      updates.end_time = computeEndTime(effectiveStart, effectiveDuration);
    }

    if (body.status) updates.status = body.status;
    if (body.type) updates.type = mapTypeToDb(body.type);
    if (body.notes !== undefined || body.reason !== undefined) {
      const nextNotes = body.notes !== undefined ? body.notes : typedExistingAppointment?.notes ?? null;
      const nextReason = body.reason !== undefined ? body.reason : null;
      updates.notes = [nextReason, nextNotes].filter(Boolean).join('\n\n') || null;
    }
    if (body.meeting_url !== undefined) updates.meeting_url = body.meeting_url;
    if (body.location !== undefined) updates.location = body.location;

    const { data: updatedAppointment, error: updateError } = await supabase
      .from('appointments')
      .update(updates as never)
      .eq('id', id)
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

    if (updateError) {
      logger.error('[PATCH /api/appointments/[id]] Error:', updateError);
      return NextResponse.json(
        { error: 'Error al actualizar la cita', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: mapAppointment(updatedAppointment as DbAppointmentRow),
    });
  } catch (error) {
    logger.error('[PATCH /api/appointments/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/appointments/[id]
 * Cancela una cita (soft delete, cambia status a 'cancelled')
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const supabase = await createRouteHandlerClient();
    const contextData = await resolvePatientContext(supabase);

    if (!contextData) {
      return NextResponse.json(
        { error: 'No autorizado o paciente no encontrado' },
        { status: 401 }
      );
    }

    // Cancelar la cita (soft delete)
    const { data: cancelledAppointment, error: cancelError } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', id)
      .eq('patient_id', contextData.patientId)
      .select()
      .single();

    if (cancelError || !cancelledAppointment) {
      return NextResponse.json(
        { error: 'Cita no encontrada o ya cancelada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cita cancelada exitosamente',
      data: mapAppointment(cancelledAppointment as DbAppointmentRow),
    });
  } catch (error) {
    logger.error('[DELETE /api/appointments/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
