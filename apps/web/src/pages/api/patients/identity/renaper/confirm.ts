import type { APIRoute } from 'astro';
import { getUserIdFromRequest } from '@/lib/patients/api/auth';
import { badRequest, jsonFail, jsonOk, unauthorized } from '@/lib/api-helpers';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAstroAdminClient } from '@/lib/supabase';
import { fetchOfficialIdentity, type RenaperPersonResult, type RenaperSexId } from '@/lib/interoperability/non-fhir.service';

/**
 * Explicit patient attestation of matched official data, NOT biometric ID.
 * This endpoint requires the reviewed SQL schema/RPC in the linked security
 * proposal before deployment. It never trusts a client-supplied DNI, name,
 * date, address, CUIL, or photograph.
 */
const digits = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\D/g, '') : '';

function genderFromProvider(value: string | null): 'female' | 'male' | 'other' | null {
  if (value === 'F') return 'female';
  if (value === 'M') return 'male';
  if (value === 'X') return 'other';
  return null;
}

function expectedSexId(gender: string | null): RenaperSexId | null {
  if (gender === 'female') return 1;
  if (gender === 'male') return 2;
  if (gender === 'other') return 3;
  return null;
}

function officialBirthDate(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function officialAddress(person: RenaperPersonResult): string | null {
  const street = [person.calle, person.numero].filter(Boolean).join(' ');
  const locality = [person.ciudad, person.provincia, person.pais].filter(Boolean);
  return [street, ...locality].filter(Boolean).join(', ').slice(0, 240) || null;
}

async function photoDigest(photo: string | null): Promise<string | null> {
  if (!photo) return null;
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(photo));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return unauthorized();
  if (!checkRateLimit(`renaper-confirm:${userId}`, 3, 24 * 60 * 60 * 1000)) {
    return jsonFail('RATE_LIMITED', 'Demasiados intentos de confirmación.', 429);
  }

  const body = await request.json().catch(() => null) as
    | { acknowledge?: unknown; sexId?: unknown } | null;
  if (body?.acknowledge !== true) return badRequest('Se requiere confirmación expresa.');
  const sexId = Number(body.sexId);
  if (sexId !== 1 && sexId !== 2 && sexId !== 3) {
    return badRequest('Sexo registral inválido.');
  }

  const db = createAstroAdminClient(locals.runtime?.env);
  const { data: patient, error: patientErr } = await db.from('patients')
    .select('id,dni,gender,care_country,renaper_confirmed_at')
    .eq('user_id', userId).maybeSingle();

  if (patientErr || !patient) return jsonFail('FORBIDDEN', 'Paciente no autorizado.', 403);
  if (patient.care_country !== 'AR' || patient.renaper_confirmed_at != null) {
    return jsonFail('CONFLICT', 'La identidad no puede confirmarse en este estado.', 409);
  }
  const dni = digits(patient.dni);
  if (dni.length < 6 || dni.length > 12 ||
    expectedSexId(patient.gender) !== sexId) {
    return jsonFail('FORBIDDEN', 'Los datos no coinciden con el perfil argentino.', 403);
  }

  // As with the existing lookup, do not allow final confirmation based on
  // fields that were not visible in the response to the patient.
  const { data: payment } = await db.from('appointment_payments')
    .select('id').eq('patient_id', patient.id)
    .eq('status', 'approved').limit(1).maybeSingle();
  if (!payment) return jsonFail('FORBIDDEN', 'Confirmación no disponible para este perfil.', 403);

  try {
    // The official record is re-fetched by the server; client input is not
    // accepted as proof of names, date of birth, DNI, photo or address.
    const { person } = await fetchOfficialIdentity({
      dni, sexId: sexId as RenaperSexId, runtimeEnv: locals.runtime?.env,
    });
    const gender = genderFromProvider(person.sexo);
    const birth = officialBirthDate(person.fechaNacimiento);
    if (digits(person.numeroDocumento) !== dni || gender !== patient.gender ||
        !person.nombres?.trim() || !person.apellido?.trim() || !birth) {
      return jsonFail('CONFLICT', 'Los datos oficiales no coinciden con el perfil.', 409);
    }

    const { data: confirmedAt, error: rpcError } = await db.rpc(
      'confirm_renaper_patient_snapshot' as never,
      {
        p_patient_id: patient.id,
        p_dni: dni,
        p_gender: gender,
        p_cuil: person.cuil ?? '',
        p_birth_date: birth,
        p_first_name: person.nombres.trim(),
        p_last_name: person.apellido.trim(),
        p_address: officialAddress(person),
        p_photo_sha256: await photoDigest(person.foto),
      } as never,
    );
    if (rpcError || !confirmedAt) {
      // Do not log official values, body, provider photo or SQL error details.
      return jsonFail('CONFLICT', 'No se pudo fijar la confirmación oficial.', 409);
    }

    return jsonOk({
      confirmed: true,
      confirmedAt,
      confirmationMethod: 'patient_attested_official_data',
      biometricVerified: false,
    });
  } catch {
    return jsonFail('SERVICE_UNAVAILABLE', 'No se pudo completar la confirmación.', 503);
  }
};
