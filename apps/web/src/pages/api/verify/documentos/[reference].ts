import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAstroAdminClient } from '@/lib/supabase';
import { loadPublicDocumentArchive } from '@/lib/documents/archive-verification';

export const GET: APIRoute = async ({ params, locals }) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;
    const document = await loadPublicDocumentArchive(admin, params.reference ?? '');
    return new Response(JSON.stringify({ registered: document !== null, document }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: 'verification_temporarily_unavailable' }), { status: 503, headers });
  }
};
