/**
 * Sistema de Perfiles AutaMedica - Tipos para BD Real
 *
 * Estos tipos reflejan exactamente el esquema de Supabase
 * implementado en las migraciones SQL.
 */

import type { UUID, ISODateString } from '../core/brand.types';

// ==========================================
// ROLES DEL SISTEMA - Simplified Single Role Per User
// ==========================================

export type UserRole =
  | 'doctor'
  | 'patient'
  | 'pharmacist'
  | 'company_admin'
  | 'organization_admin'
  | 'platform_admin';

export const USER_ROLES: readonly UserRole[] = [
  'doctor',
  'patient',
  'pharmacist',
  'company_admin',
  'organization_admin',
  'platform_admin'
] as const;

// ==========================================
// PERFIL BASE (tabla profiles)
// ==========================================

/**
 * Perfil base de usuario - source of truth para roles
 * Corresponde exactamente a la tabla public.profiles en Supabase
 *
 * IMPORTANTE: Esta interfaz refleja SOLO los campos que existen en la BD real.
 * Campos como first_name, last_name, phone están en las tablas específicas
 * (doctors, patients) no en profiles.
 */
export interface Profile {
  user_id: UUID;
  email: string | null;
  role: UserRole | null; // null until role is selected
  external_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  onboarding_started_at: ISODateString | null;
  onboarding_completed_at: ISODateString | null;
  created_at: ISODateString;
  updated_at: ISODateString;
  deleted_at: ISODateString | null; // Soft delete - agregado en parches de seguridad
}

/**
 * Datos para insertar nuevo perfil
 * Solo incluye campos que existen en la tabla profiles real
 */
export interface ProfileInsert {
  user_id: UUID;
  email?: string | null;
  role?: UserRole | null; // optional, null by default until role selection
  external_id?: string | null; // Auto-generated si no se provee
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
}

/**
 * Datos para actualizar perfil existente
 * Solo incluye campos que existen en la tabla profiles real
 */
export interface ProfileUpdate {
  email?: string | null;
  role?: UserRole | null;
  external_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  onboarding_completed_at?: ISODateString | null;
  onboarding_started_at?: ISODateString | null;
  updated_at?: ISODateString;
  deleted_at?: ISODateString | null; // Para soft delete
}

// ==========================================
// PERFIL MÉDICO (tabla doctors)
// ==========================================

export type CompanySize = 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export const COMPANY_SIZES: readonly CompanySize[] = [
  'startup', 'small', 'medium', 'large', 'enterprise'
] as const;

export const GENDERS: readonly Gender[] = [
  'male', 'female', 'other', 'prefer_not_to_say'
] as const;

/**
 * Educación médica
 */
export interface DoctorEducation {
  institution: string;
  degree: string;
  year: number;
  specialization?: string;
}

/**
 * Certificaciones médicas
 */
export interface MedicalCertification {
  name: string;
  issuer: string;
  date_issued: ISODateString;
  expiry_date?: ISODateString;
  certificate_number?: string;
}

/**
 * Horario de disponibilidad
 */
export interface DaySchedule {
  start: string; // HH:mm format
  end: string;   // HH:mm format
  breaks?: Array<{ start: string; end: string }>;
}

export interface WeeklySchedule {
  monday?: DaySchedule;
  tuesday?: DaySchedule;
  wednesday?: DaySchedule;
  thursday?: DaySchedule;
  friday?: DaySchedule;
  saturday?: DaySchedule;
  sunday?: DaySchedule;
}

/**
 * Perfil completo de doctor - corresponde a tabla doctors
 * Refleja el esquema real de Supabase incluyendo soft delete
 */
export interface DoctorProfile {
  id: UUID;
  user_id: UUID;
  license_number: string;
  specialty: string | null;
  subspecialty: string | null;
  years_experience: number | null;
  education: DoctorEducation[] | null;
  certifications: MedicalCertification[] | null;
  schedule: WeeklySchedule | null;
  consultation_fee: number | null;
  accepted_insurance: string[] | null; // JSON array of insurance names
  bio: string | null;
  languages: string[] | null; // Default: ["Spanish"]
  active: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
  deleted_at: ISODateString | null; // Soft delete - agregado en parches de seguridad
}

/**
 * Datos para crear perfil de doctor
 */
export interface DoctorInsert {
  user_id: UUID;
  license_number: string;
  specialty: string;
  subspecialty?: string | null;
  years_experience?: number;
  education?: DoctorEducation[] | null;
  certifications?: MedicalCertification[] | null;
  schedule?: WeeklySchedule | null;
  consultation_fee?: number | null;
  accepted_insurance?: string[] | null;
  bio?: string | null;
  languages?: string[];
  active?: boolean;
}

/**
 * Perfil de doctor con datos de usuario
 */
export interface DoctorWithProfile extends DoctorProfile {
  profile: Profile;
}

// ==========================================
// PERFIL PACIENTE (tabla patients)
// ==========================================

/**
 * Contacto de emergencia
 */
export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

/**
 * Condición médica
 */
export interface MedicalCondition {
  name: string;
  diagnosed_date?: ISODateString;
  status: 'active' | 'resolved' | 'chronic';
  notes?: string;
}

/**
 * Alergia
 */
export interface Allergy {
  allergen: string;
  severity: 'mild' | 'moderate' | 'severe';
  reaction?: string;
  notes?: string;
}

/**
 * Medicación
 */
export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  prescribed_by?: string;
  start_date?: ISODateString;
  end_date?: ISODateString;
  notes?: string;
}

/**
 * Información de seguro médico
 */
export interface InsuranceInfo {
  provider: string;
  plan_name: string;
  policy_number: string;
  group_number?: string;
  effective_date?: ISODateString;
  expiry_date?: ISODateString;
}

/**
 * Perfil completo de paciente - corresponds to the `patients` table.
 *
 * DB schema: id, user_id, dni, birth_date (date), gender, blood_type,
 * height_cm, weight_kg, emergency_contact (jsonb), medical_history (jsonb DEFAULT '[]'),
 * allergies (jsonb DEFAULT '[]'), medications (jsonb DEFAULT '[]'),
 * insurance_info (jsonb), organization_id, active, created_at, updated_at
 */
export interface PatientProfile {
  id: UUID;
  user_id: UUID;
  dni: string | null;
  /** DB column: `birth_date` (date type) */
  birth_date: ISODateString | null;
  gender: Gender | null;
  blood_type: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  /** DB column: `emergency_contact` (jsonb) -- single object, not split fields */
  emergency_contact: EmergencyContact | null;
  /** DB column: `medical_history` (jsonb DEFAULT '[]') */
  medical_history: unknown[] | null;
  /** DB column: `allergies` (jsonb DEFAULT '[]') */
  allergies: unknown[] | null;
  /** DB column: `medications` (jsonb DEFAULT '[]') */
  medications: unknown[] | null;
  /** DB column: `insurance_info` (jsonb) */
  insurance_info: unknown | null;
  /** DB column: `organization_id` (uuid FK) */
  organization_id: UUID | null;
  active: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/**
 * Datos para crear perfil de paciente.
 * Matches INSERT columns of the `patients` table.
 */
export interface PatientInsert {
  user_id: UUID;
  dni?: string | null;
  birth_date?: ISODateString | null;
  gender?: Gender | null;
  blood_type?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  emergency_contact?: EmergencyContact | null;
  medical_history?: unknown[] | null;
  allergies?: unknown[] | null;
  medications?: unknown[] | null;
  insurance_info?: unknown | null;
  organization_id?: UUID | null;
  active?: boolean;
}

/**
 * Perfil de paciente con datos de usuario
 */
export interface PatientWithProfile extends PatientProfile {
  profile: Profile;
}

// ==========================================
// PERFIL EMPRESA (tabla companies)
// ==========================================

/**
 * Dirección de empresa
 */
export interface CompanyAddress {
  street: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

/**
 * Perfil de empresa - corresponde a tabla companies
 * Refleja el esquema real de Supabase con validación CUIT de AFIP
 */
export interface CompanyProfile {
  id: UUID;
  name: string;
  legal_name: string | null;
  cuit: string | null; // Validado con algoritmo AFIP (constraint agregado en parches)
  industry: string | null;
  size: CompanySize | null;
  address: string | null; // En BD es TEXT, no objeto CompanyAddress
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  owner_profile_id: UUID | null;
  active: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
  deleted_at: ISODateString | null; // Soft delete - agregado en parches de seguridad
}

/**
 * Datos para crear perfil de empresa
 * Actualizado para reflejar esquema real de BD
 */
export interface CompanyInsert {
  name: string;
  legal_name?: string | null;
  cuit?: string | null; // Validado con constraint AFIP
  industry?: string | null;
  size?: CompanySize | null;
  address?: string | null; // TEXT field, no objeto
  city?: string | null;
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  owner_profile_id?: UUID | null;
  active?: boolean;
}

// ==========================================
// UTILIDADES Y TYPE GUARDS
// ==========================================

/**
 * Type guard para verificar si un objeto es un Profile válido
 */
export function isProfile(obj: unknown): obj is Profile {
  return typeof obj === 'object' && obj !== null &&
    'user_id' in obj && 'email' in obj && 'role' in obj;
}

/**
 * Type guard para verificar rol de usuario
 */
export function isValidRole(role: string): role is UserRole {
  return USER_ROLES.includes(role as UserRole);
}

/**
 * Generar nombre para display desde perfil base
 */
export function generateDisplayName(profile: Profile): string {
  const parts = [profile.first_name, profile.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return profile.email?.split('@')[0] ?? 'Usuario';
}

/**
 * Verificar si perfil base está completo
 * NOTA: El perfil base es mínimo (user_id, email, role).
 * La completitud real se verifica en las tablas específicas (doctors, patients).
 */
export function isProfileComplete(profile: Profile): boolean {
  return !!(profile.user_id && profile.email && profile.role);
}