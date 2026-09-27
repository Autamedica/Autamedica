import type { APIRoute } from 'astro';
import { getUserIdFromRequest } from '@/lib/patients/api/auth';
import { badRequest, internalError, jsonFail, jsonOk, serviceUnavailable, unauthorized } from '@/lib/api-helpers';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAstroAdminClient } from '@/lib/supabase';
import { buildDatasusClients, resolveDatasusConfig, SupabaseRndsEvidenceRepository } from '@autamedica/datasus';
import type { RndsDomain, RndsEnvironment } from '@autamedica/datasus';
import { logger } from '@autamedica/shared';

function maskText(text: string | null | undefined, visibleCount = 1): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= visibleCount) return trimmed;
  return trimmed.slice(0, visibleCount) + '*'.repeat(trimmed.length - visibleCount);
}

function maskDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return dateStr.replace(/\d/g, '*');
}

function maskCns(cns: string | null | undefined): string {
  const clean = (cns ?? '').replace(/\D/g, '');
  if (clean.length < 4) return clean;
  return `${clean.slice(0, 3)}*****${clean.slice(-3)}`;
}

function maskCpf(cpf: string | null | undefined): string {
  const clean = (cpf ?? '').replace(/\D/g, '');
  if (clean.length < 4) return clean;
  return `${clean.slice(0, 3)}.*****.***-${clean.slice(-2)}`;
}

function normalizeCns(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 15 ? digits : null;
}

function normalizeCpf(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return unauthorized();

  const rateLimitKey = `cadsus-lookup:${userId}`;
  const isAllowed = checkRateLimit(rateLimitKey, 5, 24 * 60 * 60 * 1000);
  if (!isAllowed) {
    return jsonFail(
      'RATE_LIMITED',
      'Excediste el límite diario de consultas CADSUS. Intentá mañana.',
      429,
    );
  }

  const supabase = createAstroAdminClient(locals.runtime?.env);
  const { data: patient } = await supabase
    .from('patients')
    .select('id, insurance_info')
    .eq('user_id', userId)
    .maybeSingle();

  if (!patient) {
    return badRequest('No se encontró el registro de paciente correspondiente.');
  }

  const { data: payment } = await supabase
    .from('appointment_payments')
    .select('id')
    .eq('patient_id', patient.id)
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle();

  const hasPaid = !!payment;

  const body = await request.json().catch(() => ({})) as {
    cns?: unknown;
    cpf?: unknown;
  };

  const cns = normalizeCns(body.cns);
  const cpf = cns ? null : normalizeCpf(body.cpf);

  if (!cns && !cpf) {
    return badRequest('Ingresá un CNS válido (15 dígitos).');
  }

  const config = resolveDatasusConfig(locals.runtime?.env);
  const domain: RndsDomain = 'cadsus';
  const environment: RndsEnvironment = config.environment;

  try {
    if (!config.enabled) {
      logger.warn('[patients/identity/cadsus] DATASUS disabled in this environment');
      return serviceUnavailable('La consulta CADSUS todavía no está configurada.');
    }

    const { cadsus } = buildDatasusClients({ config, domain });
    const result = await cadsus.lookup({ cns: cns ?? undefined, cpf: cpf ?? undefined });

    await new SupabaseRndsEvidenceRepository(supabase).save({
      domain,
      direction: 'response',
      environment,
      status: result.found ? 'ok' : 'failed',
      rndsIdentifier: result.person?.cns ?? null,
      referenceId: patient.id,
      errorCode: result.reason ?? null,
      sanitizedPayload: {
        source: result.source,
        cns: cns ? maskCns(cns) : null,
        cpf: cpf ? maskCpf(cpf) : null,
      },
    }).catch((err: unknown) => {
      logger.warn('[patients/identity/cadsus] failed to save rnds evidence (non-blocking)', {
        userId,
        error: err,
      });
    });

    if (!result.found) {
      if (result.source === 'offline_mock') {
        return serviceUnavailable('La consulta CADSUS todavía no está configurada.');
      }
      return badRequest('No encontramos el registro en el CADSUS para ese CNS.');
    }

    const person = result.person!;

    const { error: upsertErr } = await supabase
      .from('patients_cadsus_profile')
      .upsert({
        patient_id: userId,
        cns: person.cns,
        cpf: person.cpf ?? null,
        nome: person.nome,
        nome_mae: person.nomeMae ?? null,
        sexo: person.sexo ?? null,
        nascimento: person.nascimento ?? null,
        municipio_nascimento: person.municipioNascimento?.codigo ?? null,
        rnds_source: result.source,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'patient_id' });

    if (upsertErr) {
      logger.error('[patients/identity/cadsus] failed to persist cadsus profile', upsertErr);
    }

    const base = {
      source: result.source.toUpperCase(),
      checkedAt: new Date().toISOString(),
    };

    if (hasPaid) {
      return jsonOk({
        ...base,
        hasPaid: true,
        form: {
          cns: person.cns,
          cpf: person.cpf ?? null,
          nome: person.nome,
          nomeMae: person.nomeMae ?? null,
          sexo: person.sexo ?? null,
          nascimento: person.nascimento ?? null,
        },
      });
    }

    return jsonOk({
      ...base,
      hasPaid: false,
      form: {
        cns: maskCns(person.cns),
        cpf: maskCpf(person.cpf ?? ''),
        nome: maskText(person.nome, 2),
        nomeMae: maskText(person.nomeMae ?? '', 2),
        sexo: person.sexo ?? null,
        nascimento: maskDate(person.nascimento ?? ''),
      },
    });
  } catch (error) {
    logger.error('[patients/identity/cadsus] lookup failed', error);
    return internalError('No pudimos consultar los datos CADSUS en este momento.');
  }
};