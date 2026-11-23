import type { SupabaseClient } from '@supabase/supabase-js';
import { isMedicalCertificatePubliclyVerifiable } from '@/lib/doctors/services/medical-certificate-verification';
import { loadPublicDocumentArchive, type PublicDocumentArchive } from './archive-verification';

const CERTIFICATE_REFERENCE = /^(?:AR|BR)-CERT-[A-F0-9]+-[A-F0-9]{6}$/;

export function isPublicCertificateReference(value: string): boolean {
  return CERTIFICATE_REFERENCE.test(value);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const stable = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stable.buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Public projection for a platform-issued certificate. The source of truth is
 * the exact signed PDF hash persisted by the issuance transaction; the stored
 * object is downloaded and re-hashed before it is exposed as verifiable.
 */
async function loadIssuedCertificate(
  admin: SupabaseClient,
  reference: string,
): Promise<PublicDocumentArchive | null> {
  if (!isPublicCertificateReference(reference)) return null;

  const { data: cert, error } = await admin.from('medical_certificates')
    .select('id,doctor_id,country_code,created_at,status,signature_method,signature_hash,signed_pdf_url,signature_verified_at,cuir')
    .eq('cuir', reference).maybeSingle();
  if (error) throw new Error('issued_certificate_lookup_failed');
  if (!cert || !isMedicalCertificatePubliclyVerifiable(cert)) return null;

  const hash = String(cert.signature_hash ?? '');
  const method = String(cert.signature_method ?? '');
  if (!/^[a-f0-9]{64}$/.test(hash) || !cert.signature_verified_at) return null;

  const path = method === 'electronic_verified'
    ? `certificates/electronic/${cert.id}/${hash}.pdf`
    : method === 'ac_external'
      ? `certificates/signed/${cert.id}.pdf`
      : '';
  if (!path || cert.signed_pdf_url !== path) return null;

  if (method === 'electronic_verified') {
    const { data: issuance, error: issuanceError } = await admin
      .from('medical_certificate_electronic_issuances')
      .select('pdf_hash')
      .eq('certificate_id', cert.id).maybeSingle();
    if (issuanceError) throw new Error('issued_certificate_evidence_lookup_failed');
    if (issuance?.pdf_hash !== hash) return null;
  }

  const { data: pdf, error: downloadError } = await admin.storage.from('medical-documents').download(path);
  if (downloadError || !pdf) return null;
  if (await sha256Hex(new Uint8Array(await pdf.arrayBuffer())) !== hash) return null;

  const { data: doctor, error: doctorError } = await admin.from('doctors')
    .select('user_id,license_number,license_type,enrollment_jurisdiction,uf_brazil')
    .eq('id', cert.doctor_id).maybeSingle();
  if (doctorError) throw new Error('issued_certificate_issuer_lookup_failed');
  if (!doctor?.user_id || !doctor.license_number || !doctor.license_type) return null;

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('first_name,last_name')
    .eq('user_id', doctor.user_id).maybeSingle();
  if (profileError) throw new Error('issued_certificate_issuer_lookup_failed');
  const issuerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  if (!issuerName) return null;

  const verifiedAt = String(cert.signature_verified_at);
  return {
    reference,
    status: 'registered',
    documentDate: verifiedAt.slice(0, 10),
    registeredAt: verifiedAt,
    pdfSha256: hash,
    signatureType: method as PublicDocumentArchive['signatureType'],
    issuer: {
      name: issuerName,
      profession: 'Médico',
      license: `${doctor.license_type}: ${doctor.license_number}`,
      jurisdiction: String(doctor.enrollment_jurisdiction || doctor.uf_brazil || cert.country_code || '').trim(),
    },
  };
}

/**
 * Accepts both external DOC references and CUIR references for certificates
 * emitted by AutaMedica. No draft or unverified record can pass this gate.
 */
export async function loadPublicDocumentVerification(
  admin: SupabaseClient,
  reference: string,
): Promise<PublicDocumentArchive | null> {
  const archived = await loadPublicDocumentArchive(admin, reference);
  if (archived) return archived;
  return loadIssuedCertificate(admin, reference);
}
