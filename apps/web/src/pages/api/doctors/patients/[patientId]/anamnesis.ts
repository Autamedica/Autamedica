import type { APIRoute } from 'astro';
import { createAdminClient } from '@autamedica/auth/server';
import { buildAnamnesisExportHtml, buildAnamnesisSummary, logger } from '@autamedica/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonOk, forbidden, notFound, badRequest, internalError } from '@/lib/api-helpers';
import { withAuth, isAuthed } from '@/lib/api-auth';
import { resolveDoctorId, doctorHasPatientAccess } from '@/lib/doctors/lib/resolve-room';

type AdminClient = SupabaseClient;

async function resolvePatientLabel(
  admin: AdminClient,
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

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const patientId = params.patientId;
    if (!patientId) {
      return badRequest('missing_patient_id');
    }

    const auth = await withAuth(request);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const admin = createAdminClient() as unknown as AdminClient;
    const doctorId = await resolveDoctorId(admin, user.id);

    if (!doctorId) {
      return forbidden('doctor_not_found');
    }

    const hasAccess = await doctorHasPatientAccess(admin, doctorId, patientId);
    if (!hasAccess) {
      return forbidden();
    }

    const { data: anamnesisRow, error: anamnesisError } = await admin
      .from('anamnesis')
      .select('id, status, privacy_accepted')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .maybeSingle();

    if (anamnesisError) throw anamnesisError;

    const anamnesis = anamnesisRow as {
      id: string;
      status: string;
      privacy_accepted: boolean | null;
    } | null;

    if (!anamnesis) {
      return notFound('anamnesis_not_found');
    }

    if (anamnesis.privacy_accepted !== true) {
      return forbidden('patient_has_not_shared');
    }

    const { data: sections, error: sectionsError } = await admin
      .from('anamnesis_sections')
      .select('section, data, completed, updated_at')
      .eq('anamnesis_id', anamnesis.id)
      .order('updated_at', { ascending: true });

    if (sectionsError) throw sectionsError;

    const summary = buildAnamnesisSummary(sections ?? []);
    const requestUrl = new URL(request.url);

    if (requestUrl.searchParams.get('format') === 'html') {
      const patientLabel = await resolvePatientLabel(admin, patientId);
      const html = buildAnamnesisExportHtml({
        patientLabel,
        status: anamnesis.status,
        privacyAccepted: true,
        summary,
      });

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'inline; filename="anamnesis-resumen-medico.html"',
        },
      });
    }

    return jsonOk({
      anamnesis,
      summary,
      sections: sections ?? [],
    });
  } catch (error) {
    logger.error('[Doctor patient anamnesis] GET error', error);
    return internalError();
  }
};
