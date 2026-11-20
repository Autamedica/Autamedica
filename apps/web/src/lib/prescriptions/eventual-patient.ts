import { validCpf } from '@/lib/prescriptions/brazil/cpf';

export type EventualPatientCountry = 'AR' | 'BR';

export interface EventualPatientDetails {
  fullName?: unknown;
  documentNumber?: unknown;
  birthDate?: unknown;
  gender?: unknown;
  contact?: unknown;
  consentAccepted?: unknown;
}

export function normalizeEventualPatientDocument(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidEventualPatientBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === value
    && date.getUTCFullYear() >= 1900
    && date.getTime() < Date.now();
}

export function validateEventualPatientDetails(
  details: EventualPatientDetails,
  country: EventualPatientCountry,
): string | null {
  const name = typeof details.fullName === 'string' ? details.fullName.trim().replace(/\s+/g, ' ') : '';
  const document = typeof details.documentNumber === 'string'
    ? normalizeEventualPatientDocument(details.documentNumber) : '';
  const birthDate = typeof details.birthDate === 'string' ? details.birthDate : '';
  const gender = typeof details.gender === 'string' ? details.gender : '';
  const contact = typeof details.contact === 'string' ? details.contact.trim() : '';

  if (name.length < 3 || name.length > 200 || name.split(' ').length < 2) {
    return 'eventual_patient_name_invalid';
  }
  if (country === 'BR' && !validCpf(document)) return 'eventual_patient_cpf_invalid';
  if (country === 'AR' && !/^\d{7,8}$/.test(document)) return 'eventual_patient_dni_invalid';
  if (!isValidEventualPatientBirthDate(birthDate)) return 'eventual_patient_birth_date_invalid';
  if (country === 'BR' && gender !== 'male' && gender !== 'female') {
    return 'eventual_patient_gender_required';
  }
  if (gender && !['male', 'female', 'other', 'prefer_not_to_say'].includes(gender)) {
    return 'eventual_patient_gender_invalid';
  }
  if (contact) {
    const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact);
    const digits = contact.replace(/\D/g, '');
    const validPhone = !contact.includes('@') && /^\+?[0-9\s().-]+$/.test(contact)
      && digits.length >= 6 && digits.length <= 20;
    if (!validEmail && !validPhone) return 'eventual_patient_contact_invalid';
  }
  if (details.consentAccepted !== true) return 'eventual_patient_consent_required';
  return null;
}
