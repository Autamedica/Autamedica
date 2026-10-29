import type { APIRoute } from 'astro';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { MemedService } from '@/lib/prescriptions/brazil/memed.service';
import { logger } from '@autamedica/shared';

const cpfDigits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');
const crmDigits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');
const VALID_UF = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const admin = createAstroAdminClient(locals?.runtime?.env);
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, active, license_type, license_number, uf_brazil, cpf')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (doctorError) {
      logger.error('[memed-token] doctor lookup failed', doctorError);
      return internalError();
    }
    if (!doctor?.active || doctor.license_type !== 'CRM') {
      return forbidden('active_brazilian_doctor_required');
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('first_name, last_name, email, phone, cpf')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (profileError) {
      logger.error('[memed-token] profile lookup failed', profileError);
      return internalError();
    }

    const nome = profile?.first_name?.trim() ?? '';
    const sobrenome = profile?.last_name?.trim() ?? '';
    const crm = crmDigits(doctor.license_number);
    const uf = (doctor.uf_brazil ?? '').toUpperCase();
    const cpf = cpfDigits(doctor.cpf || profile?.cpf);

    // Never register a medical professional using fabricated CPF, CRM or UF.
    if (!nome || !sobrenome || !crm || !VALID_UF.test(uf) || !/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
      return badRequest('memed_doctor_identity_incomplete');
    }

    const envMap: Record<string, string | undefined> = {};
    if (locals.runtime?.env) {
      for (const [key, value] of Object.entries(locals.runtime.env)) {
        if (typeof value === 'string' && key.startsWith('MEMED_')) envMap[key] = value;
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
      telefone: profile?.phone || undefined,
    });

    return jsonOk({
      token: tokenData.token,
      scriptUrl: memed.getScriptUrl(),
      doctor: { id: doctor.id, crm, uf, nome: `${nome} ${sobrenome}` },
    });
  } catch (err) {
    logger.error('[memed-token] token acquisition failed', err instanceof Error ? err.message : 'unknown');
    return internalError('memed_token_unavailable');
  }
};
