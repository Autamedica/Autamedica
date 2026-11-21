import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

/**
 * Fail-closed jurisdiction and ownership check before using service-role operations.
 * The database migration adds matching triggers/RLS: this check also protects HTTP
 * invocation and prevents unauthorized order lookups from causing mutations.
 */
export async function verifyPharmacyOrderAccess(
  admin: SupabaseClient,
  order: {
    id: string; pharmacy_id: string | null; prescription_id: string;
    care_country: string | null; doctor_id: string; patient_id: string;
  },
  pharmacist: { id: string; pharmacy_id: string | null; care_country: string | null; role: string; license_number: string | null },
): Promise<string | null> {
  if (!['pharmacist', 'pharmacy_director'].includes(pharmacist.role) ||
      !pharmacist.license_number?.trim()) return 'Licensed pharmacist required';
  if (!pharmacist.pharmacy_id || !order.pharmacy_id) return 'Order must be assigned to a pharmacy';
  if (order.pharmacy_id !== pharmacist.pharmacy_id) return 'Order is assigned to another pharmacy';
  if (!['AR', 'BR'].includes(order.care_country ?? '')) return 'Order country is not established';
  if (pharmacist.care_country !== order.care_country) return 'Pharmacist country does not match the order';

  const { data: pharmacy, error: pharmacyError } = await admin
    .from('pharmacies')
    .select('id, care_country, active, deleted_at')
    .eq('id', pharmacist.pharmacy_id)
    .maybeSingle();
  if (pharmacyError || !pharmacy || !pharmacy.active || pharmacy.deleted_at ||
      pharmacy.care_country !== order.care_country) return 'Pharmacy jurisdiction or registration invalid';

  const [{ data: rx, error: rxError }, { data: doctor, error: doctorError },
    { data: patient, error: patientError }] = await Promise.all([
    admin.from('prescriptions').select('country_code, doctor_id, patient_id').eq('id', order.prescription_id).maybeSingle(),
    admin.from('doctors').select('care_country, active').eq('id', order.doctor_id).maybeSingle(),
    admin.from('patients').select('care_country, active').eq('id', order.patient_id).maybeSingle(),
  ]);
  if (rxError || doctorError || patientError || !rx || !doctor || !patient ||
      !doctor.active || !patient.active ||
      rx.country_code !== order.care_country ||
      rx.doctor_id !== order.doctor_id || rx.patient_id !== order.patient_id ||
      doctor.care_country !== order.care_country ||
      patient.care_country !== order.care_country) {
    return 'Prescription, physician or patient jurisdiction mismatch';
  }
  return null;
}


/** Safe structured telemetry: never forward SQL failing rows, messages or details. */
export function pharmacyErrorCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'INTERNAL';
}
