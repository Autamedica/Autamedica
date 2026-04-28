import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { captureEdgeException, initEdgeSentry } from '../_shared/sentry.ts';

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const SSS_RESOURCE_ID = '7964780d-13f0-4732-8164-603a397962fa';
const SSS_API_URL = 'https://datos.salud.gob.ar/api/3/action/datastore_search';

interface VerifyRequest {
  dni: string;
  matricula: string;
}

interface SssLicenseRecord {
  numero_documento?: string | number;
  certificado_numero?: string | number;
  profesion?: string;
  nombre?: string;
  apellido?: string;
  fecha_vencimiento?: string;
}

interface SssResponse {
  result?: {
    records?: SssLicenseRecord[];
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function normalizeNumeric(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textTokens(value: unknown): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1);
}

function hasTokenOverlap(left: unknown, right: unknown): boolean {
  const leftTokens = textTokens(left);
  const rightTokens = new Set(textTokens(right));
  return leftTokens.length > 0 && leftTokens.some((token) => rightTokens.has(token));
}

function profileMatchesSssRecord(
  profile: { first_name?: string | null; last_name?: string | null },
  record: SssLicenseRecord,
): boolean {
  return hasTokenOverlap(profile.first_name, record.nombre) && hasTokenOverlap(profile.last_name, record.apellido);
}

async function markValidationStatus(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  status: 'valid' | 'invalid',
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabaseAdmin.from('profiles').update({
    sss_validation_status: status,
    sss_last_checked_at: new Date().toISOString(),
    ...extra,
  }).eq('user_id', userId);

  if (error) throw error;
}

initEdgeSentry('verify-doctor-license');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { dni, matricula }: VerifyRequest = await req.json();
    const normalizedDni = normalizeNumeric(dni);
    const normalizedInputLicense = normalizeNumeric(matricula);

    if (normalizedDni.length < 7 || normalizedDni.length > 9 || !normalizedInputLicense) {
      return jsonResponse({ error: 'DNI and matrícula are required' }, 400);
    }

    const { data: doctor, error: doctorError } = await supabaseAdmin
      .from('doctors')
      .select(`
        id,
        user_id,
        license_number,
        active,
        profile:profiles!doctors_user_id_fkey(user_id, role, active, first_name, last_name)
      `)
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    if (doctorError) throw doctorError;

    const profile = Array.isArray(doctor?.profile) ? doctor?.profile[0] : doctor?.profile;
    if (!doctor || profile?.role !== 'doctor' || profile?.active === false) {
      return jsonResponse({ error: 'doctor_profile_required' }, 403);
    }

    const normalizedStoredLicense = normalizeNumeric(doctor.license_number);
    if (!normalizedStoredLicense || normalizedStoredLicense !== normalizedInputLicense) {
      await markValidationStatus(supabaseAdmin, user.id, 'invalid');
      return jsonResponse({ success: false, message: 'La matrícula ingresada no coincide con tu perfil profesional.' }, 403);
    }

    if (!profile?.first_name || !profile?.last_name) {
      return jsonResponse({ success: false, message: 'Completá nombre y apellido en tu perfil antes de validar la matrícula.' }, 409);
    }

    console.log('[verify-doctor-license] Checking SSS registry for authenticated doctor', { userId: user.id });

    const queryUrl = `${SSS_API_URL}?resource_id=${SSS_RESOURCE_ID}&q=${encodeURIComponent(normalizedDni)}`;
    const response = await fetch(queryUrl);
    
    if (!response.ok) {
      throw new Error(`SSS API returned ${response.status}`);
    }

    const sssData = await response.json() as SssResponse;
    const records = sssData.result?.records ?? [];

    const match = records.find((r) =>
      normalizeNumeric(r.numero_documento) === normalizedDni &&
      normalizeNumeric(r.certificado_numero) === normalizedInputLicense
    );

    if (!match) {
      console.warn('[verify-doctor-license] No SSS match for authenticated doctor', { userId: user.id, records: records.length });
      await markValidationStatus(supabaseAdmin, user.id, 'invalid');

      return jsonResponse({ 
        success: false, 
        message: 'No se encontró una matrícula activa para los datos proporcionados en el registro nacional.' 
      });
    }

    if (!profileMatchesSssRecord(profile, match)) {
      console.warn('[verify-doctor-license] SSS identity mismatch for authenticated doctor', { userId: user.id });
      await markValidationStatus(supabaseAdmin, user.id, 'invalid');

      return jsonResponse({
        success: false,
        message: 'La identidad del registro nacional no coincide con el perfil profesional cargado.',
      }, 403);
    }

    const profesion = String(match.profesion).toLowerCase();
    const isPsychiatrist = profesion.includes('psiquiatria') || profesion.includes('psiquiatría');

    console.log('[verify-doctor-license] SSS match validated for authenticated doctor', { userId: user.id });

    await markValidationStatus(supabaseAdmin, user.id, 'valid', {
      especialidad_registrada: match.profesion,
      matricula_nacional: match.certificado_numero,
    });

    return jsonResponse({
      success: true,
      data: {
        nombre: match.nombre,
        apellido: match.apellido,
        profesion: match.profesion,
        is_psychiatrist: isPsychiatrist,
        vencimiento: match.fecha_vencimiento
      }
    });

  } catch (error) {
    captureEdgeException(error, {
      layer: 'data-platform',
      surface: 'verify-doctor-license:unexpected',
      owner: 'Medical Board',
    });
    console.error('[verify-doctor-license] Error:', error);
    return jsonResponse({ error: 'Error interno al verificar la matrícula.' }, 500);
  }
});
