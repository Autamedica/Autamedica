import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAstroAdminClient } from '@/lib/supabase';
import { loadPublicDocumentVerification } from '@/lib/documents/public-document-verification';

const noStore = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

export const GET: APIRoute = async ({ params, locals, request }) => {
  try {
    const reference = (params.reference ?? '').toUpperCase();
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;
    const document = await loadPublicDocumentVerification(admin, reference);
    if (document?.status !== 'registered') {
      return new Response('Documento no disponible', { status: 404, headers: noStore });
    }

    // Resolve the immutable archive first, then the issued-certificate namespaces.
    const storage = admin.storage.from('medical-documents');
    const objectPaths = [
      `document-archives/${document.reference}/${document.pdfSha256}.pdf`,
    ];

    // Issued certificates use their canonical CUIR reference in the public
    // route, while Storage objects are keyed by the certificate UUID.
    const { data: certificate } = await admin.from('medical_certificates')
      .select('id, signature_hash, signed_pdf_url')
      .eq('cuir', reference).maybeSingle();
    if (certificate?.id) {
      if (certificate.signed_pdf_url) objectPaths.push(certificate.signed_pdf_url);
      objectPaths.push(
        `certificates/electronic/${certificate.id}/${certificate.signature_hash}.pdf`,
        `certificates/signed/${certificate.id}.pdf`,
      );
    }
    // Legacy issuances may be keyed by their public reference instead of UUID.
    objectPaths.push(
      `certificates/electronic/${reference}.pdf`,
      `certificates/signed/${reference}.pdf`,
    );

    for (const objectPath of [...new Set(objectPaths)]) {
      if (objectPath === `document-archives/${document.reference}/${document.pdfSha256}.pdf`) {
        const { data: archivedPdf, error: archivedPdfError } = await storage.download(objectPath);
        if (archivedPdfError || !archivedPdf) continue;
        const bytes = new Uint8Array(await archivedPdf.arrayBuffer());
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const actualHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (actualHash !== document.pdfSha256 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
          return new Response('El PDF archivado no coincide con el registro', { status: 409, headers: noStore });
        }
      }

      const { data } = await storage.createSignedUrl(objectPath, 300, {
        download: `${document.reference}.pdf`,
      });
      if (data?.signedUrl) return Response.redirect(data.signedUrl, 302);
    }

    // Deployment-bundled fallback. The public asset is the exact original PDF,
    // named by immutable document reference and checked against the archive hash.
    const fallbackUrl = new URL(`/verified-docs/${reference}.pdf`, request.url);
    const fallback = await fetch(fallbackUrl, { headers: { Accept: 'application/pdf' } });
    if (!fallback.ok) {
      return new Response('PDF original no está disponible', { status: 404, headers: noStore });
    }
    const bytes = new Uint8Array(await fallback.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actualHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (actualHash !== document.pdfSha256 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
      return new Response('El PDF archivado no coincide con el registro', { status: 409, headers: noStore });
    }
    return new Response(bytes, {
      status: 200,
      headers: {
        ...noStore,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${reference}.pdf"`,
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch {
    return new Response('No se pudo generar el enlace de descarga', { status: 503, headers: noStore });
  }
};
