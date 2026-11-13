import type { SupabaseClient } from '@supabase/supabase-js';

/** An archive lookup proves registration, never a cryptographic medical signature. */
export interface PublicDocumentArchive {
  reference: string;
  status: 'registered' | 'revoked';
  documentDate: string;
  registeredAt: string;
  pdfSha256: string;
  signatureType: 'scanned_signature';
  issuer: { name: string; profession: string; license: string; jurisdiction: string };
}

export const isArchiveReference = (value: string): boolean => value.length === 36 && /^DOC-[A-F0-9]{32}$/.test(value);

export function publicArchiveRecord(row: Record<string, unknown>): PublicDocumentArchive | null {
  if (typeof row.reference !== 'string' || !isArchiveReference(row.reference) ||
      !['registered', 'revoked'].includes(String(row.status)) ||
      row.signature_type !== 'scanned_signature' ||
      typeof row.pdf_sha256 !== 'string' || row.pdf_sha256.length !== 64 || !/^[a-f0-9]{64}$/.test(row.pdf_sha256) ||
      typeof row.document_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.document_date) ||
      typeof row.registered_at !== 'string' || !Number.isFinite(Date.parse(row.registered_at))) return null;
  const issuer = row.issuer_snapshot;
  if (!issuer || typeof issuer !== 'object' || Array.isArray(issuer)) return null;
  const fields = issuer as Record<string, unknown>;
  const values = ['name', 'profession', 'license', 'jurisdiction'] as const;
  if (values.some(key => typeof fields[key] !== 'string' || !(fields[key] as string).trim())) return null;
  // Explicit projection: private patient, clinical, authorization and contact data
  // must not be exposed even if additional keys are present in a snapshot.
  return {
    reference: row.reference,
    status: row.status as PublicDocumentArchive['status'],
    documentDate: row.document_date,
    registeredAt: row.registered_at,
    pdfSha256: row.pdf_sha256,
    signatureType: 'scanned_signature',
    issuer: {
      name: fields.name as string, profession: fields.profession as string,
      license: fields.license as string, jurisdiction: fields.jurisdiction as string,
    },
  };
}

export async function loadPublicDocumentArchive(
  admin: SupabaseClient, reference: string,
): Promise<PublicDocumentArchive | null> {
  if (!isArchiveReference(reference)) return null;
  const { data, error } = await admin.from('medical_document_archives')
    .select('reference,status,document_date,registered_at,pdf_sha256,issuer_snapshot,signature_type')
    .eq('reference', reference).maybeSingle();
  if (error) throw new Error('document_archive_lookup_failed');
  return data ? publicArchiveRecord(data as Record<string, unknown>) : null;
}
