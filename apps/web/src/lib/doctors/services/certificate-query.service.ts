/**
 * Certificate Query Service
 *
 * Read-only operations for certificate management.
 * This file intentionally has NO dependency on node-forge or @signpdf
 * to ensure it can be safely bundled by Cloudflare Workers.
 *
 * For certificate generation, see certificate.service.ts
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CertificateInfo {
  id: string;
  doctorId: string;
  acProvider: string;
  certFingerprint: string;
  certSubject: string;
  certValidFrom: string;
  certValidUntil: string;
  certStatus: string;
  signatureMethod: string;
}

/**
 * Gets the active certificate for a doctor, or null if none exists.
 */
export async function getActiveCertificate(
  supabase: SupabaseClient,
  doctorId: string,
): Promise<CertificateInfo | null> {
  const { data } = await supabase
    .from('signature_certificates')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('cert_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    doctorId: data.doctor_id,
    acProvider: data.ac_provider,
    certFingerprint: data.cert_fingerprint,
    certSubject: data.cert_subject,
    certValidFrom: data.cert_valid_from,
    certValidUntil: data.cert_valid_until,
    certStatus: data.cert_status,
    signatureMethod: data.signature_method,
  };
}

/**
 * Loads the PKCS#12 bundle and password for signing operations.
 * Only callable with a service_role client.
 */
export async function loadSigningCredentials(
  supabase: SupabaseClient,
  doctorId: string,
  fingerprint: string,
): Promise<{ p12Buffer: Buffer; password: string }> {
  const p12Path = `certificates/${doctorId}/${fingerprint}.p12`;
  const secretPath = `certificates/${doctorId}/${fingerprint}.secret`;

  const { data: p12Data, error: p12Err } = await supabase.storage
    .from('medical-documents')
    .download(p12Path);

  if (p12Err || !p12Data) {
    throw new Error(`Failed to load P12: ${p12Err?.message}`);
  }

  const { data: secretData, error: secretErr } = await supabase.storage
    .from('medical-documents')
    .download(secretPath);

  if (secretErr || !secretData) {
    throw new Error(`Failed to load secret: ${secretErr?.message}`);
  }

  const p12Buffer = Buffer.from(await p12Data.arrayBuffer());
  const password = await secretData.text();

  return { p12Buffer, password };
}
