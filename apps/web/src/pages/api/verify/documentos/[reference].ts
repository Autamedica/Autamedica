import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAstroAdminClient } from '@/lib/supabase';
import { loadPublicDocumentVerification } from '@/lib/documents/public-document-verification';

const noStore = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

const json = (body: Record<string, boolean | string>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: noStore });

const displayDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');

export const GET: APIRoute = async ({ params, locals, url }) => {
  const reference = (params.reference ?? '').toUpperCase();
  const suppliedHash = url.searchParams.get('sha256');

  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;
    const document = await loadPublicDocumentVerification(admin, reference);

    if (!document) return json({ registered: false });
    if (suppliedHash === null) return json({ registered: true });

    const verified = document.status === 'registered'
      && /^[a-f0-9]{64}$/.test(suppliedHash)
      && suppliedHash === document.pdfSha256;

    if (!verified) return json({ registered: true, verified: false });

    const professional = document.issuer.name.startsWith('Dr.')
      ? document.issuer.name
      : document.issuer.profession.toLowerCase() === 'médico'
        ? `Dr. ${document.issuer.name}`
        : document.issuer.name;
    const normalizedLicense = document.issuer.license.replace(/^([A-Z]+):\s*/, '$1 ');
    const license = [normalizedLicense, document.issuer.jurisdiction]
      .filter(Boolean)
      .join(' · ');

    return json({
      registered: true,
      verified: true,
      issuedAt: displayDate(document.documentDate),
      professional,
      license,
    });
  } catch {
    return json({ registered: false }, 503);
  }
};
