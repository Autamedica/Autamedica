/**
 * GET /api/doctors/[id]/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Retorna los slots disponibles de un doctor en un rango de fechas.
 * Usa @autamedica/scheduling para generar slots reales basados en
 * doctor_availability, overrides, y citas existentes.
 */

import { createRouteHandlerClient } from '@autamedica/auth/server';
import { getOpenSlots } from '@autamedica/scheduling';
import type { UUID } from '@autamedica/types';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createRouteHandlerClient();

    // Auth check
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id: doctorId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'Parámetros from y to son requeridos (YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return NextResponse.json(
        { error: 'Formato de fecha inválido. Usar YYYY-MM-DD' },
        { status: 400 },
      );
    }

    // Max 30 day range
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 30 || diffDays < 0) {
      return NextResponse.json(
        { error: 'Rango máximo: 30 días. from debe ser anterior a to.' },
        { status: 400 },
      );
    }

    // Verify doctor exists
    const { data: doctor, error: doctorErr } = await supabase
      .from('doctors')
      .select('id')
      .eq('id', doctorId)
      .single();

    if (doctorErr || !doctor) {
      return NextResponse.json({ error: 'Doctor no encontrado' }, { status: 404 });
    }

    const slots = await getOpenSlots(supabase, {
      doctor_id: doctorId as UUID,
      date_from: dateFrom,
      date_to: dateTo,
    });

    return NextResponse.json({
      doctor_id: doctorId,
      date_from: dateFrom,
      date_to: dateTo,
      slots,
      total: slots.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
