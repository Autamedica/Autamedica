/**
 * API Routes para lista de espera de turnos
 * GET /api/waitlist - Obtener entradas del paciente actual
 * POST /api/waitlist - Agregar a lista de espera
 */

import { createRouteHandlerClient } from '@autamedica/auth/server';
import { addToWaitlist, cancelWaitlistEntry } from '@autamedica/scheduling';
import type { UUID } from '@autamedica/types';
import { NextRequest, NextResponse } from 'next/server';
import { resolvePatientContext } from '../shared/patient-context';

/**
 * GET /api/waitlist
 * Obtiene las entradas de waitlist del paciente autenticado
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    const context = await resolvePatientContext(supabase);
    if (!context) {
      return NextResponse.json({ error: 'No autorizado o paciente no encontrado' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('appointment_waitlist')
      .select('*')
      .eq('patient_id', context.patientId)
      .in('status', ['waiting', 'offered'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ entries: data ?? [], total: data?.length ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/waitlist
 * Agrega al paciente a la lista de espera de un doctor
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    const context = await resolvePatientContext(supabase);
    if (!context) {
      return NextResponse.json({ error: 'No autorizado o paciente no encontrado' }, { status: 401 });
    }

    const body = await request.json();
    const { doctor_id, preferred_date_start, preferred_date_end, preferred_time_start, preferred_time_end, appointment_type } = body;

    if (!doctor_id) {
      return NextResponse.json({ error: 'doctor_id es requerido' }, { status: 400 });
    }

    const entry = await addToWaitlist(supabase, {
      patient_id: context.patientId as UUID,
      doctor_id: doctor_id as UUID,
      preferred_date_start: preferred_date_start ?? null,
      preferred_date_end: preferred_date_end ?? null,
      preferred_time_start: preferred_time_start ?? null,
      preferred_time_end: preferred_time_end ?? null,
      appointment_type: appointment_type ?? 'consultation',
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/waitlist?id=<waitlist_id>
 * Cancela una entrada de waitlist del paciente
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    const context = await resolvePatientContext(supabase);
    if (!context) {
      return NextResponse.json({ error: 'No autorizado o paciente no encontrado' }, { status: 401 });
    }

    const waitlistId = request.nextUrl.searchParams.get('id');
    if (!waitlistId) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 });
    }

    await cancelWaitlistEntry(supabase, waitlistId, context.patientId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
