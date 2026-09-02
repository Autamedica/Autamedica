import type { APIRoute } from 'astro';
import { forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { MemedService } from '@/lib/prescriptions/brazil/memed.service';
import { logger } from '@autamedica/shared';

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const admin = createAstroAdminClient(locals?.runtime?.env);
    const { data: doctor, error } = await admin
      .from('doctors')
      .select('id, user_id, active, license_number, uf_brazil, cpf, profiles(first_name, last_name, email, phone)')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) {
      logger.error('[api/doctors/prescriptions/memed-token] error looking up doctor', error);
      return internalError();
    }

    if (!doctor?.active) {
      return forbidden('doctor_profile_required');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = (doctor as any).profiles;
    const nome = profile?.first_name || 'Médico';
    const sobrenome = profile?.last_name || 'AutaMedica';
    const crm = doctor.license_number || '123456';
    const uf = doctor.uf_brazil || 'SP';
    const cpf = doctor.cpf || '00000000000';

    const envMap: Record<string, string | undefined> = {};
    if (locals.runtime?.env) {
      for (const [k, v] of Object.entries(locals.runtime.env)) {
        if (typeof v === 'string') envMap[k] = v;
      }
    }
    const memed = new MemedService(envMap);

    const tokenData = await memed.getOrCreateDoctorToken({
      externalId: doctor.id,
      nome,
      sobrenome,
      cpf,
      crm,
      uf,
      email: profile?.email || auth.user.email,
      telefone: profile?.phone,
    });

    return jsonOk({
      token: tokenData.token,
      scriptUrl: memed.getScriptUrl(),
      doctor: {
        id: doctor.id,
        crm,
        uf,
        nome: `${nome} ${sobrenome}`.trim(),
      },
    });
  } catch (err) {
    logger.error('[api/doctors/prescriptions/memed-token] exception', err as Error);
    return internalError();
  }
};
