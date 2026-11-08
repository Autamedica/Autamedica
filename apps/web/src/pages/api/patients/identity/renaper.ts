import type { APIRoute } from 'astro';
import { getUserIdFromRequest } from '@/lib/patients/api/auth';
import { badRequest, internalError, jsonFail, jsonOk, serviceUnavailable, unauthorized } from '@/lib/api-helpers';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAstroAdminClient } from '@/lib/supabase';
import {
  fetchOfficialIdentity,
  type RenaperPersonResult,
  type RenaperSexId,
} from '@/lib/interoperability/non-fhir.service';
import { logger } from '@autamedica/shared';
import {
  isRenaperLookupInPatientScope,
  returnedRenaperDocumentMatches,
  buildMinimalRenaperAudit,
} from '@/lib/patients/services/renaper-identity-scope';

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

function maskCuil(cuilStr: string | null | undefined): string {
  if (!cuilStr) return '';
  const clean = cuilStr.replace(/\D/g, '');
  if (clean.length < 11) return cuilStr;
  return `${clean.slice(0, 2)}-******-${clean.slice(-1)}`;
}

function maskAddress(addressStr: string | null | undefined): string {
  if (!addressStr) return '';
  const parts = addressStr.split(',');
  const maskedStreet = parts[0] ? maskText(parts[0], 4) : '';
  const rest = parts.slice(1).map((p) => maskText(p.trim(), 2)).join(', ');
  return [maskedStreet, rest].filter(Boolean).join(', ');
}

function normalizeDni(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 12 ? digits : null;
}

function normalizeSexId(value: unknown): RenaperSexId | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null;
}

function mapSexToGender(value: string | null): 'male' | 'female' | 'other' | null {
  if (value === 'M') return 'male';
  if (value === 'F') return 'female';
  if (value === 'X') return 'other';
  return null;
}

function buildAddress(person: RenaperPersonResult): string | null {
  const streetLine = [person.calle, person.numero].filter(Boolean).join(' ').trim();
  const unitLine = [
    person.piso ? `Piso ${person.piso}` : null,
    person.departamento ? `Depto ${person.departamento}` : null,
  ].filter(Boolean).join(', ');
  const locationLine = [person.ciudad, person.municipio, person.provincia]
    .filter(Boolean)
    .join(', ');

  return [streetLine, unitLine, locationLine, person.pais]
    .filter((part) => part && part !== '0')
    .join(', ') || null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return unauthorized();

  const rateLimitKey = `identity-lookup:${userId}`;
  const isAllowed = checkRateLimit(rateLimitKey, 5, 24 * 60 * 60 * 1000);
  if (!isAllowed) {
    return jsonFail(
      'RATE_LIMITED',
      'Excediste el límite diario de consultas de identidad. Intentá mañana.',
      429,
    );
  }

  const supabase = createAstroAdminClient(locals.runtime?.env);
  const { data: patient } = await supabase
    .from('patients')
    .select('id, insurance_info, dni, gender, care_country')
    .eq('user_id', userId)
    .maybeSingle();

  if (!patient) {
    return badRequest('No se encontró el registro de paciente correspondiente.');
  }

  const insuranceInfo = (patient.insurance_info && typeof patient.insurance_info === 'object')
    ? patient.insurance_info as Record<string, unknown>
    : {};

  const lookupCount = typeof insuranceInfo['identity_lookup_count'] === 'number'
    ? insuranceInfo['identity_lookup_count'] as number
    : 0;

  if (lookupCount >= 3) {
    return jsonFail(
      'RATE_LIMITED',
      'Excediste el límite de 3 consultas de identidad permitidas por cuenta.',
      403,
    );
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
    dni?: unknown;
    sexId?: unknown;
  };

  const dni = normalizeDni(body.dni);
  const sexId = normalizeSexId(body.sexId);

  if (!dni) {
    return badRequest('Ingresá un DNI válido.');
  }

  if (!sexId) {
    return badRequest('Seleccioná el sexo registral para consultar datos oficiales.');
  }

  // A logged-in patient is not authorized to enumerate arbitrary DNI values.
  // Bind the official query to the registered patient record, never client form alone.
  // A saved DNI is still self-declared: this is not biometric identity assurance.
  if (!isRenaperLookupInPatientScope(patient, dni, sexId)) {
    return jsonFail(
      'FORBIDDEN',
      'La consulta requiere que el DNI y el sexo registral coincidan con el perfil argentino registrado.',
      403,
    );
  }

  try {
    const result = await fetchOfficialIdentity({
      dni,
      sexId,
      runtimeEnv: locals.runtime?.env,
    });

    const person = result.person;
    if (!returnedRenaperDocumentMatches(dni, person.numeroDocumento)) {
      // Never attach a different person's official record to this account.
      return jsonFail('CONFLICT', 'La identidad oficial no coincide con el DNI registrado.', 409);
    }
    const firstName = person.nombres ?? '';
    const lastName = person.apellido ?? '';
    const address = buildAddress(person);
    const coverage = result.coverages[0] ?? null;

    // Do not persist provider PII to RLS-readable insurance_info.
    // Preserve the marker required by legacy profile completion, without
    // copying RENAPER names, birth dates, CUIL, addresses or pictures.
    const newInsuranceInfo = buildMinimalRenaperAudit(insuranceInfo, dni, lookupCount);

    const { error: updateErr } = await supabase
      .from('patients')
      .update({ insurance_info: newInsuranceInfo })
      .eq('id', patient.id);

    if (updateErr) {
      logger.error('[renaper] failed to update insurance_info lookup count', updateErr);
    }

    if (hasPaid) {
      return jsonOk({
        source: 'RENAPER',
        checkedAt: new Date().toISOString(),
        hasPaid: true,
        form: {
          dni: person.numeroDocumento ?? dni,
          firstName,
          lastName,
          birthDate: person.fechaNacimiento ?? '',
          gender: mapSexToGender(person.sexo) ?? '',
          cuil: person.cuil && person.cuil !== '0' ? person.cuil : '',
          address: address ?? '',
        },
        coverage: coverage
          ? {
              rnos: coverage.rnos ?? null,
              name: coverage.cobertura ?? null,
              source: coverage.servicio ?? null,
              checkedAt: coverage.fechaConsulta ?? null,
            }
          : null,
      });
    }

    return jsonOk({
      source: 'RENAPER',
      checkedAt: new Date().toISOString(),
      hasPaid: false,
      form: {
        dni: person.numeroDocumento ?? dni,
        firstName: maskText(firstName, 1),
        lastName: maskText(lastName, 1),
        birthDate: maskDate(person.fechaNacimiento ?? ''),
        gender: mapSexToGender(person.sexo) ?? '',
        cuil: maskCuil(person.cuil && person.cuil !== '0' ? person.cuil : ''),
        address: maskAddress(address ?? ''),
      },
      coverage: coverage
        ? {
            rnos: coverage.rnos ?? null,
            name: maskText(coverage.cobertura ?? '', 4),
            source: coverage.servicio ?? null,
            checkedAt: coverage.fechaConsulta ?? null,
          }
        : null,
    });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : null;
    if (code === 'BUS_NON_FHIR_CREDENTIALS_MISSING') {
      logger.error('[patients/identity/renaper] missing credentials', error);
      return serviceUnavailable('La consulta oficial todavía no está configurada.');
    }
    if (code === 'RENAPER_PERSON_NOT_FOUND') {
      return badRequest('No encontramos datos oficiales para ese DNI y sexo registral.');
    }

    logger.error('[patients/identity/renaper] lookup failed', error);
    return internalError('No pudimos consultar los datos oficiales en este momento.');
  }
};
