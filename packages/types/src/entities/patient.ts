/**
 * Patient types - Sistema de pacientes
 *
 * Define todos los tipos relacionados con pacientes,
 * equipos de atención médica y DTOs para Supabase.
 *
 * DB schema reference (table `patients`):
 *   id, user_id, dni, birth_date (date), gender, blood_type,
 *   height_cm, weight_kg, emergency_contact (jsonb),
 *   medical_history (jsonb), allergies (jsonb), medications (jsonb),
 *   insurance_info (jsonb), organization_id, active, created_at, updated_at
 *
 * Personal fields (first_name, last_name, email, phone) live in the
 * `profiles` table, linked via user_id. See PatientWithProfile in
 * ./profiles.ts for the enriched JOIN type.
 */

import type { ISODateString } from "../primitives/date";
import type { DoctorId, PatientId, UUID } from "../primitives/id";
import type { EmergencyContact } from "./profiles";

// ==========================================
// Patient Care Team Types
// ==========================================

export type PatientCareTeamRole =
  | "primary"
  | "specialist"
  | "consultant"
  | "emergency";

// ==========================================
// DB Row Type (matches `patients` table exactly)
// ==========================================

/**
 * Matches the `patients` table schema in Supabase.
 * Does NOT include profile fields (name, email, phone) -- those live in `profiles`.
 */
export interface PatientRow {
  id: PatientId;
  userId: string;
  dni?: string | null;
  /** DB column is `birth_date` (date type), not `dateOfBirth`. */
  birthDate?: string | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  bloodType?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  emergencyContact?: EmergencyContact | null;
  medicalHistory?: unknown[] | null;
  allergies?: unknown[] | null;
  medications?: unknown[] | null;
  insuranceInfo?: unknown | null;
  organizationId?: string | null;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ==========================================
// Enriched / Legacy Interface
// ==========================================

/**
 * Patient with profile fields merged (from JOIN with `profiles`).
 *
 * @deprecated Prefer PatientRow for DB-only queries and PatientWithProfile
 * (from ./profiles.ts) for enriched data with explicit profile nesting.
 *
 * Fields by source:
 * - id, userId, gender, emergencyContact, createdAt, updatedAt -- `patients` table
 * - firstName, lastName, email, phone -- `profiles` table (via user_id join)
 * - dateOfBirth -- maps to `birth_date` in DB
 * - address -- does NOT exist in DB; kept for backward compatibility only
 */
export interface Patient {
  id: PatientId;
  /** FK to auth.users / profiles.user_id */
  userId: string;
  /** From profiles.first_name */
  firstName: string;
  /** From profiles.last_name */
  lastName: string;
  /** From profiles.email */
  email: string;
  /** From profiles.phone */
  phone?: string;
  /**
   * Maps to `birth_date` (date) in the patients table.
   * DB column name differs from this camelCase field name.
   */
  dateOfBirth?: ISODateString;
  gender?: "male" | "female" | "other" | "prefer_not_to_say";
  /**
   * Does NOT exist as a column in the patients table.
   * Kept for backward compatibility with code that constructs this shape.
   */
  address?: PatientAddress;
  emergencyContact?: EmergencyContact;
  status?: string;
  lastVisit?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Dirección del paciente.
 * Note: The `patients` table does NOT have address columns.
 * This is a frontend-only construct for display purposes.
 */
export interface PatientAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

// EmergencyContact imported from ./profiles (canonical location)
export type { EmergencyContact } from "./profiles";

// ==========================================
// Patient Care Team Interfaces
// ==========================================

/**
 * Relación doctor-paciente para control de acceso médico
 */
export interface PatientCareTeam {
  id: UUID;
  patientId: PatientId;
  doctorId: DoctorId;
  role: PatientCareTeamRole;
  isActive: boolean;
  assignedAt: ISODateString;
  assignedBy: DoctorId;
}

// ==========================================
// Supabase DTOs
// ==========================================

export interface PatientCareTeamInsert {
  patientId: PatientId;
  doctorId: DoctorId;
  role: PatientCareTeamRole;
  assignedBy: DoctorId;
}

export interface PatientCareTeamUpdate {
  role?: PatientCareTeamRole;
  isActive?: boolean;
}

/**
 * Enriched care team view (requires JOIN across patients, profiles, doctors).
 * firstName/lastName/email come from the `profiles` table, not patients/doctors directly.
 */
export interface PatientCareTeamWithDetails extends PatientCareTeam {
  patient: {
    id: PatientId;
    /** From profiles.first_name (via patients.user_id) */
    firstName: string;
    /** From profiles.last_name (via patients.user_id) */
    lastName: string;
    /** From profiles.email (via patients.user_id) */
    email: string;
    /** From patients.birth_date */
    dateOfBirth?: ISODateString;
  };
  doctor: {
    id: DoctorId;
    /** From profiles.first_name (via doctors.user_id) */
    firstName: string;
    /** From profiles.last_name (via doctors.user_id) */
    lastName: string;
    /** From doctors.specialty (singular text) */
    specialty: string;
    licenseNumber: string;
  };
  assignedByDoctor: {
    id: DoctorId;
    /** From profiles.first_name (via doctors.user_id) */
    firstName: string;
    /** From profiles.last_name (via doctors.user_id) */
    lastName: string;
    /** From doctors.specialty (singular text) */
    specialty: string;
  };
}

/**
 * DTO for updating patient data.
 * firstName/lastName/phone target the `profiles` table.
 * Other fields target the `patients` table.
 */
export interface PatientUpdate {
  /** Updates profiles.first_name */
  firstName?: string;
  /** Updates profiles.last_name */
  lastName?: string;
  /** Updates profiles.phone */
  phone?: string;
  /** Maps to patients.birth_date in DB */
  dateOfBirth?: ISODateString;
  gender?: Patient['gender'];
  emergencyContact?: EmergencyContact;
}

// ==========================================
// Type Guards & Utilities
// ==========================================

export const isPatient = (v: unknown): v is Patient => {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.id === "string" &&
    typeof obj.userId === "string" &&
    typeof obj.firstName === "string" &&
    typeof obj.lastName === "string";
};

export const isPatientRow = (v: unknown): v is PatientRow => {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.id === "string" &&
    typeof obj.userId === "string" &&
    typeof obj.active === "boolean";
};

export const isPatientCareTeamRole = (v: unknown): v is PatientCareTeamRole => {
  const validRoles: PatientCareTeamRole[] = ["primary", "specialist", "consultant", "emergency"];
  return typeof v === 'string' && validRoles.includes(v as PatientCareTeamRole);
};

export const isPrimaryDoctor = (role: PatientCareTeamRole): boolean => {
  return role === "primary";
};

export type { PatientId };
