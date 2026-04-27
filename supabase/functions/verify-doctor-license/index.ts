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

initEdgeSentry('verify-doctor-license');

Deno.serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { dni, matricula }: VerifyRequest = await req.json();
    if (!dni || !matricula) {
      return new Response(JSON.stringify({ error: 'DNI and matrícula are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    console.log(`[verify-doctor-license] Checking DNI: ${dni}, Matricula: ${matricula} for user: ${user.id}`);

    // Consulta a la API de la SSS
    const queryUrl = `${SSS_API_URL}?resource_id=${SSS_RESOURCE_ID}&q=${dni}`;
    const response = await fetch(queryUrl);
    
    if (!response.ok) {
      throw new Error(`SSS API returned ${response.status}`);
    }

    const sssData = await response.json() as SssResponse;
    const records = sssData.result?.records ?? [];

    // Buscar coincidencia exacta por DNI y Matrícula
    const match = records.find((r) =>
      String(r.numero_documento).trim() === String(dni).trim() && 
      String(r.certificado_numero).trim() === String(matricula).trim()
    );

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    if (!match) {
      console.warn(`[verify-doctor-license] No match found in SSS for DNI ${dni} and Matricula ${matricula}`);
      
      // Actualizar estado a fallido o pendiente
      await supabaseAdmin.from('profiles').update({
        sss_validation_status: 'invalid',
        sss_last_checked_at: new Date().toISOString()
      }).eq('user_id', user.id);

      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No se encontró una matrícula activa para los datos proporcionados en el registro nacional.' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Validar Especialidad (Psiquiatría)
    const profesion = String(match.profesion).toLowerCase();
    const isPsychiatrist = profesion.includes('psiquiatria') || profesion.includes('psiquiatría');

    console.log(`[verify-doctor-license] Match found. Profesion: ${match.profesion}`);

    // Actualizar el perfil del médico
    const { error: updateError } = await supabaseAdmin.from('profiles').update({
      sss_validation_status: 'valid',
      especialidad_registrada: match.profesion,
      sss_last_checked_at: new Date().toISOString(),
      matricula_nacional: match.certificado_numero
    }).eq('user_id', user.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      success: true,
      data: {
        nombre: match.nombre,
        apellido: match.apellido,
        profesion: match.profesion,
        is_psychiatrist: isPsychiatrist,
        vencimiento: match.fecha_vencimiento
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    captureEdgeException(error, {
      layer: 'data-platform',
      surface: 'verify-doctor-license:unexpected',
      owner: 'Medical Board',
    });
    console.error('[verify-doctor-license] Error:', error);
    return new Response(JSON.stringify({ error: 'Error interno al verificar la matrícula.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
