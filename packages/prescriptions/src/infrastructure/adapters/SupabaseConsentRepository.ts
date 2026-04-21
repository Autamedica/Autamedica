import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PatientId } from '@autamedica/types';
import type {
  IConsentRepository,
  InformedConsent,
  ConsentSignInput,
  ConsentType,
} from '../../domain/consent.ports';

interface ConsentRow {
  id: string;
  patient_id: string;
  consent_type: ConsentType;
  template_version: string;
  pdf_url: string | null;
  signed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  signature_hash: string;
  accepted_sections: string[];
  revoked_at: string | null;
  expires_at: string | null;
}

function mapRow(row: ConsentRow): InformedConsent {
  return {
    id: row.id,
    patientId: row.patient_id as PatientId,
    consentType: row.consent_type,
    templateVersion: row.template_version,
    pdfUrl: row.pdf_url ?? undefined,
    signedAt: row.signed_at,
    ipAddress: row.ip_address ?? undefined,
    userAgent: row.user_agent ?? undefined,
    signatureHash: row.signature_hash,
    acceptedSections: row.accepted_sections ?? [],
    revokedAt: row.revoked_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
  };
}

function computeSignatureHash(input: ConsentSignInput): string {
  const payload = JSON.stringify({
    patient: input.patientId,
    type: input.consentType,
    version: input.templateVersion,
    sections: [...input.acceptedSections].sort(),
    at: Math.floor(Date.now() / 1000),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export class SupabaseConsentRepository implements IConsentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getLatestActive(patientId: PatientId, type: ConsentType): Promise<InformedConsent | null> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('informed_consents')
      .select('*')
      .eq('patient_id', patientId)
      .eq('consent_type', type)
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`consent getLatestActive: ${error.message}`);
    return data ? mapRow(data as ConsentRow) : null;
  }

  async isActive(patientId: PatientId, type: ConsentType): Promise<boolean> {
    const consent = await this.getLatestActive(patientId, type);
    return consent !== null;
  }

  async sign(input: ConsentSignInput): Promise<InformedConsent> {
    const signatureHash = computeSignatureHash(input);

    const { data, error } = await this.supabase
      .from('informed_consents')
      .insert({
        patient_id: input.patientId,
        consent_type: input.consentType,
        template_version: input.templateVersion,
        pdf_url: input.pdfUrl ?? null,
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
        signature_hash: signatureHash,
        accepted_sections: input.acceptedSections,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`consent sign: ${error?.message ?? 'no data'}`);
    return mapRow(data as ConsentRow);
  }

  async revoke(consentId: string, reason: string): Promise<void> {
    const { error } = await this.supabase
      .from('informed_consents')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: reason,
      })
      .eq('id', consentId);

    if (error) throw new Error(`consent revoke: ${error.message}`);
  }
}
