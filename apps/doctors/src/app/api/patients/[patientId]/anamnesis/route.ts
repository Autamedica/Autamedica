import { createAdminClient, createRouteHandlerClient } from '@autamedica/auth/server';
import { buildAnamnesisExportHtml, buildAnamnesisSummary, logger } from '@autamedica/shared';
import type { AppSupabaseClient } from '@autamedica/supabase-client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ patientId: string }>;
}

async function resolveDoctorId(admin: AppSupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('doctors')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

async function doctorHasPatientAccess(
  admin: AppSupabaseClient,
  doctorId: string,
  patientId: string,
): Promise<boolean> {
  const [{ data: careTeam, error: careTeamError }, { data: appointment, error: appointmentError }] =
    await Promise.all([
      admin
        .from('patient_care_team')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('patient_id', patientId)
        .eq('active', true)
        .limit(1)
        .maybeSingle(),
      admin
        .from('appointments')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('patient_id', patientId)
        .limit(1)
        .maybeSingle(),
    ]);

  if (careTeamError) throw careTeamError;
  if (appointmentError) throw appointmentError;

  return Boolean(careTeam?.id || appointment?.id);
}

async function resolvePatientLabel(
  admin: AppSupabaseClient,
  patientId: string,
): Promise<string> {
  const { data: patientRow, error: patientError } = await admin
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .maybeSingle();

  if (patientError) {
    logger.warn('[Doctor patient anamnesis] Unable to resolve patient row for label', patientError);
    return `Paciente ${patientId}`;
  }

  const userId = (patientRow as { user_id?: string | null } | null)?.user_id ?? null;
  if (!userId) {
    return `Paciente ${patientId}`;
  }

  let profileQuery = await admin
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', userId)
    .maybeSingle();

  if ((profileQuery.error && (profileQuery.error as { code?: string }).code !== 'PGRST116') || (!profileQuery.data && !profileQuery.error)) {
    profileQuery = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .maybeSingle();
  }

  if (profileQuery.error && (profileQuery.error as { code?: string }).code !== 'PGRST116') {
    logger.warn('[Doctor patient anamnesis] Unable to resolve patient profile label', profileQuery.error);
    return `Paciente ${patientId}`;
  }

  const profile = profileQuery.data as { first_name?: string | null; last_name?: string | null } | null;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();

  return fullName || `Paciente ${patientId}`;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { patientId } = await context.params;
    const supabase = await createRouteHandlerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient() as unknown as AppSupabaseClient;
    const doctorId = await resolveDoctorId(admin, session.user.id);

    if (!doctorId) {
      return NextResponse.json({ ok: false, error: 'doctor_not_found' }, { status: 403 });
    }

    const hasAccess = await doctorHasPatientAccess(admin, doctorId, patientId);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const { data: anamnesisRow, error: anamnesisError } = await admin
      .from('anamnesis')
      .select('id, status, privacy_accepted')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .maybeSingle();

    if (anamnesisError) throw anamnesisError;

    const anamnesis = anamnesisRow as {
      id: string
      status: string
      privacy_accepted: boolean | null
    } | null

    if (!anamnesis) {
      return NextResponse.json({ ok: false, error: 'anamnesis_not_found' }, { status: 404 });
    }

    if (anamnesis.privacy_accepted !== true) {
      return NextResponse.json({ ok: false, error: 'patient_has_not_shared' }, { status: 403 });
    }

    const { data: sections, error: sectionsError } = await admin
      .from('anamnesis_sections')
      .select('section, data, completed, updated_at')
      .eq('anamnesis_id', anamnesis.id)
      .order('updated_at', { ascending: true });

    if (sectionsError) throw sectionsError;

    const summary = buildAnamnesisSummary(sections ?? []);
    const requestUrl = new URL(_request.url);

    if (requestUrl.searchParams.get('format') === 'html') {
      const patientLabel = await resolvePatientLabel(admin, patientId);
      const html = buildAnamnesisExportHtml({
        patientLabel,
        status: anamnesis.status,
        privacyAccepted: true,
        summary,
      });

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'inline; filename="anamnesis-resumen-medico.html"',
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        anamnesis,
        summary,
        sections: sections ?? [],
      },
    });
  } catch (error) {
    logger.error('[Doctor patient anamnesis] GET error', error);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
