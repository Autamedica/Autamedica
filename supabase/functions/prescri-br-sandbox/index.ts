/**
 * Isolated Brazilian sandbox proof of PDF generation by Prescri REST API.
 * Deliberately does NOT register clinical prescriptions in public.prescriptions.
 * Android calls this function; Prescri API credentials never leave Supabase.
 */
import { getCorsHeaders, jsonResponse, requireAuth } from '../_shared/auth-helpers.ts';
import {
  assertTestCredentials,
  createPrescriDemo,
  downloadPrescriDemoPdf,
  getPrescriDemo,
  getPrescriSandboxDocumentTypes,
  type PrescriSandboxCredentials,
} from '../_shared/prescri-sandbox-client.ts';

const ADMIN_ROLES = new Set(['admin', 'platform_admin']);
const ALLOWED_ACTIONS = new Set(['create_demo', 'get_demo', 'download_demo_pdf', 'document_types']);

export async function handler(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return jsonResponse({ code: 'METHOD_NOT_ALLOWED' }, 405, cors);
  }
  if (Deno.env.get('PRESCRI_SANDBOX_ENABLED') !== 'true') {
    return jsonResponse({ code: 'PRESCRI_SANDBOX_DISABLED' }, 503, cors);
  }

  try {
    const { user, serviceClient } = await requireAuth(req, cors);
    const { data: profile, error } = await serviceClient.from('profiles')
      .select('role, active').eq('user_id', user.id).maybeSingle();
    if (error) throw new Error('admin_lookup_failed');
    if (!profile || !ADMIN_ROLES.has(profile.role) || profile.active === false) {
      return jsonResponse({ code: 'ADMIN_REQUIRED' }, 403, cors);
    }

    const raw = await req.text();
    if (raw.length > 512) return jsonResponse({ code: 'REQUEST_TOO_LARGE' }, 413, cors);
    let data: unknown;
    try { data = JSON.parse(raw); }
    catch { return jsonResponse({ code: 'INVALID_JSON' }, 400, cors); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return jsonResponse({ code: 'INVALID_PAYLOAD' }, 400, cors);
    }
    const { action } = data as { action?: unknown };
    if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
      return jsonResponse({ code: 'INVALID_ACTION' }, 400, cors);
    }
    // Never accept IDs, patient details, CPF, provider, PDF or URL from a caller.
    if (Object.keys(data).some((key) => key !== 'action')) {
      return jsonResponse({ code: 'SANDBOX_FIXED_FIXTURE_ONLY' }, 400, cors);
    }

    const credentials: PrescriSandboxCredentials = {
      key: Deno.env.get('PRESCRI_TEST_API_KEY') ?? '',
      secret: Deno.env.get('PRESCRI_TEST_API_SECRET') ?? '',
    };
    assertTestCredentials(credentials);

    if (action === 'document_types') {
      const types = await getPrescriSandboxDocumentTypes(credentials);
      return jsonResponse({ success: true, sandbox: true, types }, 200, cors);
    }
    if (action === 'create_demo') {
      const signature = await createPrescriDemo(credentials);
      return jsonResponse({
        success: true, ...signature, legal_validity: false,
      }, 200, cors);
    }
    if (action === 'get_demo') {
      const signature = await getPrescriDemo(credentials);
      return jsonResponse({
        success: true, ...signature, legal_validity: false,
      }, 200, cors);
    }

    const pdf = await downloadPrescriDemoPdf(credentials);
    return new Response(pdf.bytes, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="autamedica-prescri-demo-sem-validade.pdf"',
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
        'X-Document-Sandbox': 'true',
        'X-Document-Clinical-Validity': 'false',
        'X-Document-SHA256': pdf.sha256,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    // No provider bodies, tokens, secrets, patient or document metadata in logs.
    const code = error instanceof Error ? error.message : '';
    if (code === 'prescri_test_credentials_required') {
      return jsonResponse({ code: 'TEST_CREDENTIALS_REQUIRED' }, 503, cors);
    }
    if (code.startsWith('prescri_sandbox_') || code === 'prescri_provider_pdf_invalid' ||
        code === 'prescri_provider_pdf_wrong_content_type' ||
        code === 'prescri_provider_pdf_invalid_size' ||
        code === 'prescri_provider_pdf_too_large') {
      return jsonResponse({ code: 'SANDBOX_PROVIDER_EVIDENCE_INVALID' }, 502, cors);
    }
    if (code === 'prescri_provider_http_404') {
      return jsonResponse({ code: 'SANDBOX_DOCUMENT_NOT_FOUND' }, 404, cors);
    }
    return jsonResponse({ code: 'PRESCRI_SANDBOX_UNAVAILABLE' }, 502, cors);
  }
}

Deno.serve(handler);
