import { createAdminClient, createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import { NextResponse } from 'next/server';
import { resolvePatientContext } from '@/app/api/shared/patient-context';

type DoctorCatalogRow = {
  id: string;
  specialty: string | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export async function GET() {
  try {
    const supabase = await createRouteHandlerClient();
    const context = await resolvePatientContext(supabase);
    if (!context) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    let admin: ReturnType<typeof createAdminClient>;
    try {
      admin = createAdminClient();
    } catch (error) {
      logger.error('[GET /api/doctors] Admin client unavailable', error);
      return NextResponse.json(
        { error: 'No fue posible cargar el listado de profesionales' },
        { status: 503 },
      );
    }

    const { data, error } = await admin
      .from('doctors')
      .select(`
        id,
        specialty,
        profile:profiles!doctors_user_id_fkey(
          first_name,
          last_name
        )
      `)
      .eq('active', true);

    if (error) {
      logger.error('[GET /api/doctors] Error', error);
      return NextResponse.json(
        { error: 'No fue posible cargar el listado de profesionales' },
        { status: 500 },
      );
    }

    const doctors = ((data ?? []) as DoctorCatalogRow[])
      .map((doctor) => {
        const firstName = doctor.profile?.first_name?.trim() ?? '';
        const lastName = doctor.profile?.last_name?.trim() ?? '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

        return {
          id: doctor.id,
          specialty: doctor.specialty,
          first_name: doctor.profile?.first_name ?? null,
          last_name: doctor.profile?.last_name ?? null,
          label: fullName ? `Dr. ${fullName}` : 'Profesional disponible',
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label, 'es'));

    return NextResponse.json({ success: true, data: doctors });
  } catch (error) {
    logger.error('[GET /api/doctors] Unexpected error', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
