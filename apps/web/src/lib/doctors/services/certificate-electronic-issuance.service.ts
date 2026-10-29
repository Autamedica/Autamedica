import type { SupabaseClient } from '@supabase/supabase-js';
import { generateMedicalCertificatePdf } from './pdf-medical-certificate.service';
import { certificateAssetPath, certificateSha256, assertCertificateImage } from './certificate-electronic-assets';

export const ELECTRONIC_CONFIRMATION = 'Confirmo el contenido clínico y autorizo aplicar mi firma y sello a este certificado mediante firma electrónica.';

type Row = Record<string, unknown>;
export interface ElectronicCertificateSource {
  certificate: Row;
  doctor: Row;
  profile: Row;
  patient: Row;
  patientProfile: Row;
  snapshotHash: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const name = (row: Row): string => [row.first_name, row.last_name].filter(Boolean).join(' ').trim();

export async function loadElectronicCertificateSource(
  admin: SupabaseClient, id: string, userId: string,
): Promise<ElectronicCertificateSource | null> {
  const { data: doctor, error: doctorError } = await admin.from('doctors')
    .select('id,user_id,active,license_type,license_number,enrollment_jurisdiction,signature_image_url,stamp_image_url,signature_url,stamp_url')
    .eq('user_id', userId).maybeSingle();
  if (doctorError) throw doctorError;
  if (!doctor) return null;
  const { data: certificate, error } = await admin.from('medical_certificates')
    .select('*').eq('id', id).eq('doctor_id', doctor.id).maybeSingle();
  if (error) throw error;
  if (!certificate) return null;
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('user_id,first_name,last_name,role,active,deleted_at,sss_validation_status')
    .eq('user_id', userId).single();
  if (profileError) throw profileError;
  const { data: patient, error: patientError } = await admin.from('patients')
    .select('id,user_id,dni').eq('id', certificate.patient_id).single();
  if (patientError) throw patientError;
  const { data: patientProfile, error: patientProfileError } = await admin.from('profiles')
    .select('user_id,first_name,last_name').eq('user_id', patient.user_id).single();
  if (patientProfileError) throw patientProfileError;
  const source = { certificate, doctor, profile, patient, patientProfile };
  const snapshotHash = await certificateSha256(new TextEncoder().encode(canonical(source)));
  return { ...source, snapshotHash };
}

export function assertElectronicCertificateEligible(source: ElectronicCertificateSource): void {
  const { certificate: cert, doctor, profile, patient, patientProfile } = source;
  if (cert.country_code !== 'AR' || !['MN', 'MP'].includes(String(doctor.license_type))) {
    throw new Error('certificate_argentina_only');
  }
  if (cert.status !== 'draft') throw new Error('certificate_not_draft');
  if (doctor.active !== true || profile.active !== true || profile.deleted_at !== null ||
      profile.role !== 'doctor' || profile.sss_validation_status !== 'valid') {
    throw new Error('certificate_doctor_not_validated');
  }
  if (!name(profile) || !String(doctor.license_number ?? '').trim() ||
      !name(patientProfile) || !String(patient.dni ?? '').trim()) {
    throw new Error('certificate_identity_incomplete');
  }
  if (!(doctor.signature_image_url || doctor.signature_url) ||
      !(doctor.stamp_image_url || doctor.stamp_url)) {
    throw new Error('certificate_signature_and_stamp_required');
  }
  const start = String(cert.start_date);
  const days = Number(cert.days_of_rest);
  const parsed = new Date(`${start}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== start || !Number.isInteger(days) || days < 0 || days > 365 ||
      (days === 0 && cert.end_date !== null)) {
    throw new Error('certificate_period_invalid');
  }
  if (days > 0) {
    const end = new Date(`${start}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + days - 1);
    if (end.toISOString().slice(0, 10) !== cert.end_date || !String(cert.diagnosis ?? '').trim()) {
      throw new Error('certificate_period_or_diagnosis_invalid');
    }
  }
}

export async function issueElectronicCertificate(
  admin: SupabaseClient, source: ElectronicCertificateSource, userId: string,
  storageOrigin: string,
): Promise<Row> {
  assertElectronicCertificateEligible(source);
  const { certificate: cert, doctor, profile, patient, patientProfile } = source;
  if (doctor.user_id !== userId) throw new Error('certificate_not_owned');
  if (cert.appointment_id) {
    const { data, error } = await admin.from('appointments').select('id')
      .eq('id', cert.appointment_id).eq('doctor_id', doctor.id)
      .eq('patient_id', cert.patient_id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('certificate_appointment_mismatch');
  }
  const loadAsset = async (type: 'signature' | 'stamp'): Promise<Uint8Array> => {
    const value = doctor[`${type}_image_url`] || doctor[`${type}_url`];
    const path = certificateAssetPath(String(value), storageOrigin, userId, String(doctor.id), type);
    const { data, error } = await admin.storage.from('medical-documents').download(path);
    if (error || !data) throw new Error('certificate_asset_unavailable');
    const bytes = new Uint8Array(await data.arrayBuffer());
    assertCertificateImage(bytes);
    return bytes;
  };
  const [signature, stamp] = await Promise.all([loadAsset('signature'), loadAsset('stamp')]);
  const confirmedAt = new Date().toISOString();
  const pdf = generateMedicalCertificatePdf({
    reference: String(cert.cuir), type: String(cert.certificate_type),
    patientName: name(patientProfile), patientDni: String(patient.dni),
    doctorName: name(profile), doctorLicense: String(doctor.license_number),
    jurisdiction: String(doctor.enrollment_jurisdiction ?? ''),
    diagnosis: cert.diagnosis as string | null, hideDiagnosis: cert.hide_diagnosis === true,
    treatment: cert.treatment as string | null, observations: cert.observations as string | null,
    daysOfRest: Number(cert.days_of_rest), startDate: String(cert.start_date),
    endDate: cert.end_date as string | null, createdAt: String(cert.created_at),
    electronicSignature: { signature, stamp, confirmedAt },
  }, 'electronic');
  const hash = await certificateSha256(pdf);
  const path = `certificates/electronic/${cert.id}/${hash}.pdf`;
  const { error: uploadError } = await admin.storage.from('medical-documents')
    .upload(path, pdf, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw new Error('certificate_pdf_storage_failed');
  const { data, error } = await admin.rpc('issue_electronic_medical_certificate', {
    p_certificate_id: cert.id, p_actor_user_id: userId,
    p_expected_certificate: cert, p_expected_doctor: doctor,
    p_expected_profile: profile, p_expected_patient: patient,
    p_expected_patient_profile: patientProfile, p_snapshot_hash: source.snapshotHash,
    p_pdf_hash: hash, p_signature_hash: await certificateSha256(signature),
    p_stamp_hash: await certificateSha256(stamp), p_confirmed_at: confirmedAt,
  });
  // Never remove an uploaded file on an ambiguous response: a committed issuance
  // may already reference it. A retry reloads the issued record instead.
  if (error || !data) throw new Error('certificate_changed_or_issuance_failed');
  return data as Row;
}
