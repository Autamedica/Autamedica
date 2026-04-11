import type { PatientProfileUpdateInput } from '@/lib/patients/lib/zod/patients';
import type { ProfileUpdateInput } from '@/lib/patients/lib/zod/profiles';

type FormGender = '' | 'male' | 'female' | 'other' | 'prefer_not_to_say';
type FormBloodType = '' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface PatientProfileFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: FormGender;
  bloodType: FormBloodType;
  heightCm: string;
  weightKg: string;
  cuil: string;
  address: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  emergencyContactEmail: string;
}

export interface MissingProfileField {
  id: string;
  label: string;
  reason: string;
}

export const EMPTY_FORM: PatientProfileFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  birthDate: '',
  gender: '',
  bloodType: '',
  heightCm: '',
  weightKg: '',
  cuil: '',
  address: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactPhone: '',
  emergencyContactEmail: '',
};

export function asText(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

export function asMetric(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  if (!fullName) {
    return { firstName: '', lastName: '' };
  }

  const tokens = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (tokens.length === 1) {
    return { firstName: tokens[0] ?? '', lastName: '' };
  }

  return {
    firstName: tokens.slice(0, -1).join(' '),
    lastName: tokens.slice(-1).join(' '),
  };
}

export function buildFormState(input: {
  email?: string | null;
  accountFullName?: string | null;
  anamnesisBirthDate?: string | null;
  profile?: {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  } | null;
  patient?: {
    birthDate?: string | null;
    gender?: string | null;
    bloodType?: string | null;
    heightCm?: number | null;
    weightKg?: number | null;
    cuil?: string | null;
    address?: string | null;
    emergencyContact?: {
      name?: string | null;
      relationship?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
  } | null;
}): PatientProfileFormState {
  const emergency = input.patient?.emergencyContact ?? null;
  const derivedName = splitFullName(input.accountFullName);
  const firstName = asText(input.profile?.firstName) || derivedName.firstName;
  const lastName = asText(input.profile?.lastName) || derivedName.lastName;
  const birthDate = asText(input.patient?.birthDate) || asText(input.anamnesisBirthDate);

  return {
    firstName,
    lastName,
    email: asText(input.email ?? input.profile?.email),
    phone: asText(input.profile?.phone),
    birthDate,
    gender:
      input.patient?.gender === 'male' ||
      input.patient?.gender === 'female' ||
      input.patient?.gender === 'other' ||
      input.patient?.gender === 'prefer_not_to_say'
        ? input.patient.gender
        : '',
    bloodType:
      input.patient?.bloodType === 'A+' ||
      input.patient?.bloodType === 'A-' ||
      input.patient?.bloodType === 'B+' ||
      input.patient?.bloodType === 'B-' ||
      input.patient?.bloodType === 'AB+' ||
      input.patient?.bloodType === 'AB-' ||
      input.patient?.bloodType === 'O+' ||
      input.patient?.bloodType === 'O-'
        ? input.patient.bloodType
        : '',
    heightCm: asMetric(input.patient?.heightCm),
    weightKg: asMetric(input.patient?.weightKg),
    cuil: asText(input.patient?.cuil),
    address: asText(input.patient?.address),
    emergencyContactName: asText(emergency?.name),
    emergencyContactRelationship: asText(emergency?.relationship),
    emergencyContactPhone: asText(emergency?.phone),
    emergencyContactEmail: asText(emergency?.email),
  };
}

export function toNullableString(value: string): string | null | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeBmi(heightCm: string, weightKg: string): number | null {
  const height = toNullableNumber(heightCm);
  const weight = toNullableNumber(weightKg);

  if (!height || !weight || height <= 0) {
    return null;
  }

  const bmi = weight / Math.pow(height / 100, 2);
  if (!Number.isFinite(bmi)) {
    return null;
  }

  return Number(bmi.toFixed(1));
}

export function getGenderLabel(value: PatientProfileFormState['gender']): string {
  switch (value) {
    case 'male':
      return 'Masculino';
    case 'female':
      return 'Femenino';
    case 'other':
      return 'Otro';
    case 'prefer_not_to_say':
      return 'Prefiero no decirlo';
    default:
      return 'Sin especificar';
  }
}

export function buildMissingFields(form: PatientProfileFormState): MissingProfileField[] {
  const checks: MissingProfileField[] = [];

  if (!form.firstName.trim()) {
    checks.push({
      id: 'firstName',
      label: 'Nombre',
      reason: 'se usa para identificarte en turnos, reportes y teleconsultas',
    });
  }

  if (!form.lastName.trim()) {
    checks.push({
      id: 'lastName',
      label: 'Apellido',
      reason: 'evita ambiguedades en agenda, historia y documentación clínica',
    });
  }

  if (!form.cuil.trim()) {
    checks.push({
      id: 'cuil',
      label: 'CUIL',
      reason: 'obligatorio para registro nacional RCTA y trazabilidad legal de recetas (Argentina)',
    });
  }

  if (!form.address.trim()) {
    checks.push({
      id: 'address',
      label: 'Domicilio',
      reason: 'requerido por Res. 2214/2025 para la validez de la receta electrónica',
    });
  }

  if (!form.phone.trim()) {
    checks.push({
      id: 'phone',
      label: 'Teléfono',
      reason: 'se reutiliza en confirmaciones y contacto asistencial',
    });
  }

  if (!form.birthDate.trim()) {
    checks.push({
      id: 'birthDate',
      label: 'Fecha de nacimiento',
      reason: 'alimenta edad clínica y recomendaciones preventivas',
    });
  }

  if (!form.gender.trim()) {
    checks.push({
      id: 'gender',
      label: 'Género',
      reason: 'mejora la personalización de screenings y contexto médico',
    });
  }

  if (!form.emergencyContactPhone.trim()) {
    checks.push({
      id: 'emergencyContactPhone',
      label: 'Teléfono de emergencia',
      reason: 'es el dato crítico si hay que escalar un contacto urgente',
    });
  }

  return checks;
}

export function buildProfileCompletion(form: PatientProfileFormState): number {
  const checks = [
    form.firstName.trim().length > 0,
    form.lastName.trim().length > 0,
    form.cuil.trim().length > 0,
    form.address.trim().length > 0,
    form.email.trim().length > 0,
    form.phone.trim().length > 0,
    form.birthDate.trim().length > 0,
    form.gender.trim().length > 0,
    form.emergencyContactPhone.trim().length > 0,
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

export function buildPayload(form: PatientProfileFormState): {
  profile: ProfileUpdateInput;
  patient: PatientProfileUpdateInput;
} {
  return {
    profile: {
      firstName: toNullableString(form.firstName),
      lastName: toNullableString(form.lastName),
      phone: toNullableString(form.phone),
    },
    patient: {
      birthDate: form.birthDate.trim() ? form.birthDate.trim() : null,
      gender: form.gender || null,
      bloodType: form.bloodType || null,
      heightCm: toNullableNumber(form.heightCm),
      weightKg: toNullableNumber(form.weightKg),
      cuil: toNullableString(form.cuil),
      address: toNullableString(form.address),
      emergencyContact: {
        name: toNullableString(form.emergencyContactName) ?? null,
        relationship: toNullableString(form.emergencyContactRelationship) ?? null,
        phone: toNullableString(form.emergencyContactPhone) ?? null,
        email: toNullableString(form.emergencyContactEmail) ?? null,
      },
    },
  };
}

export function formatSectionName(sectionId: string): string {
  return sectionId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function extractAnamnesisBirthDate(
  sections: Array<{ section: string; data?: Record<string, unknown> | null }>,
): string | null {
  const ageSection = sections.find((section) => section.section === 'edad');
  const rawValue = ageSection?.data?.['fecha_nacimiento'];
  return typeof rawValue === 'string' && rawValue.trim().length > 0 ? rawValue : null;
}
