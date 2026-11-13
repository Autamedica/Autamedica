import { createAstroAdminClient } from '@/lib/supabase';
import type { MedicalCertificatePdfInput } from './pdf-medical-certificate.service';

type AdminClient = ReturnType<typeof createAstroAdminClient>;

/** Reads identity exclusively from database records, never from client payload. */
export async function loadMedicalCertificateForDoctor(
  admin: AdminClient,
  certificateId: string,
  doctorUserId: string,
): Promise<{
  certificateId: string;
  doctorId: string;
  status: string;
  countryCode: string;
  pdfInput: MedicalCertificatePdfInput;
  prescriberValidationStatus: string | null;
  refepsId: string | null;
  enrollmentJurisdiction: string | null;
  licenseType: string | null;
} | null> {
  const { data: doctor, error: doctorError } = await admin
    .from('doctors')
    .select('id, license_number, license_type, refeps_id, enrollment_jurisdiction, active')
    .eq('user_id', doctorUserId)
    .maybeSingle();
  if (doctorError) throw doctorError;
  if (!doctor?.active) return null;

  const { data: cert, error: certError } = await admin
    .from('medical_certificates')
    .select('*')
    .eq('id', certificateId)
    .eq('doctor_id', doctor.id)
    .maybeSingle();
  if (certError) throw certError;
  if (!cert) return null;

  const { data: patient, error: patientError } = await admin
    .from('patients')
    .select('user_id, dni')
    .eq('id', cert.patient_id)
    .maybeSingle();
  if (patientError) throw patientError;
  if (!patient) return null;

  const userIds = [patient.user_id, doctorUserId].filter((id): id is string => Boolean(id));
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('user_id, first_name, last_name, sss_validation_status')
    .in('user_id', userIds);
  if (profilesError) throw profilesError;
  const doctorProfile = profiles?.find(p => p.user_id === doctorUserId);
  const patientProfile = profiles?.find(p => p.user_id === patient.user_id);
  const fullName = (p?: { first_name: string | null; last_name: string | null }) =>
    [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();

  return {
    certificateId: cert.id,
    doctorId: doctor.id,
    status: cert.status,
    countryCode: cert.country_code,
    prescriberValidationStatus: doctorProfile?.sss_validation_status ?? null,
    refepsId: doctor.refeps_id ?? null,
    enrollmentJurisdiction: doctor.enrollment_jurisdiction ?? null,
    licenseType: doctor.license_type ?? null,
    pdfInput: {
      reference: cert.cuir,
      type: cert.certificate_type,
      patientName: fullName(patientProfile) || 'Paciente',
      patientDni: patient.dni,
      doctorName: fullName(doctorProfile) || 'Médico sin identificar',
      doctorLicense: doctor.license_number ?? '',
      jurisdiction: doctor.enrollment_jurisdiction,
      countryCode: cert.country_code === 'BR' ? 'BR' : 'AR',
      diagnosis: cert.diagnosis,
      hideDiagnosis: cert.country_code === 'BR' || cert.hide_diagnosis === true,
      cid10Code: (cert as typeof cert & { cid10_code?: string | null }).cid10_code ?? null,
      cidPatientRequested: (cert as typeof cert & { cid_requested_by_patient?: boolean }).cid_requested_by_patient === true,
      cidConsentRecordedAt: (cert as typeof cert & { cid_consent_recorded_at?: string | null }).cid_consent_recorded_at ?? null,
      treatment: (cert as typeof cert & { treatment?: string | null }).treatment,
      observations: cert.observations,
      daysOfRest: cert.days_of_rest,
      startDate: cert.start_date,
      endDate: cert.end_date,
      createdAt: cert.created_at,
    },
  };
}
