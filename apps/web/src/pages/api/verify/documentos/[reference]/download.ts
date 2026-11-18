import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAstroAdminClient } from '@/lib/supabase';
import { loadPublicDocumentVerification } from '@/lib/documents/public-document-verification';

export const GET: APIRoute = async ({ params, locals }) => {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  };
  try {
    const reference = (params.reference ?? '').toUpperCase();
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;
    const document = await loadPublicDocumentVerification(admin, reference);
    if (!document || document.status !== 'registered') {
      return new Response('Documento no disponible', { status: 404, headers });
    }
    const objectPath = `document-archives/${document.reference}/${document.pdfSha256}.pdf`;
    const { data, error } = await admin.storage.from('medical-documents')
      .createSignedUrl(objectPath, 300, { download: `${document.reference}.pdf` });
    if (error || !data?.signedUrl) {
      return new Response('PDF original todavía no disponible en Storage', { status: 404, headers });
    }
    return Response.redirect(data.signedUrl, 302);
  } catch {
    return new Response('No se pudo generar el enlace de descarga', { status: 503, headers });
  }
};
