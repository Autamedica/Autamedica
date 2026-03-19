import { createAdminClient, createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import type { TablesInsert } from '@autamedica/types';
import { headers } from 'next/headers';

type RouteHandlerSupabaseClient = Awaited<ReturnType<typeof createRouteHandlerClient>>;

export interface PatientContext {
  userId: string;
  patientId: string;
}

export async function resolvePatientContext(
  supabase: RouteHandlerSupabaseClient,
): Promise<PatientContext | null> {
  const {
    data: { user: cookieUser },
    error: cookieUserError,
  } = await supabase.auth.getUser();

  let userId = cookieUser?.id ?? null;

  if (cookieUserError || !userId) {
    const headerList = await headers();
    const authHeader = headerList.get('authorization');

    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7);
      try {
        const admin = createAdminClient();
        const { data: userRes, error: tokenUserError } = await admin.auth.getUser(token);
        if (!tokenUserError && userRes.user) {
          userId = userRes.user.id;
        }
      } catch (error) {
        logger.warn('[resolvePatientContext] Bearer token lookup failed', error);
      }
    }
  }

  if (!userId) {
    return null;
  }

  const admin = createAdminClient();

  let { data: patient, error: patientError } = await admin
    .from('patients')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!patient && !patientError) {
    const patientInsert: TablesInsert<'patients'> = {
      user_id: userId,
      active: true,
    };

    const { data: insertedPatient, error: insertPatientError } = await admin
      .from('patients')
      .upsert(patientInsert as never, { onConflict: 'user_id' })
      .select('id')
      .maybeSingle();

    patient = insertedPatient;
    patientError = insertPatientError;
  }

  const patientId = (patient as { id: string } | null)?.id ?? null;

  if (patientError || !patientId) {
    logger.warn('[resolvePatientContext] Failed to resolve patient row', patientError);
    return null;
  }

  return {
    userId,
    patientId,
  };
}
