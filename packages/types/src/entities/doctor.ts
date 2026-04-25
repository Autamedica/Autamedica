/**
 * Doctor types - Sistema de médicos
 *
 * Define todos los tipos relacionados con doctores,
 * educación, experiencia y DTOs para Supabase.
 *
 * DB schema reference (table `doctors`):
 *   id, user_id, license_number, specialty (text), subspecialty,
 *   years_experience, education (jsonb), certifications (jsonb),
 *   schedule (jsonb), consultation_fee, accepted_insurance (jsonb),
 *   bio, languages (jsonb), payout_cbu, payout_alias, active, created_at, updated_at
 *
 * Personal fields (first_name, last_name, email, phone) live in the
 * `profiles` table, linked via user_id. See DoctorWithProfile in
 * ./profiles.ts for the enriched JOIN type.
 */

import type { DoctorId, SpecialtyId } from "../primitives/id";
import type { ISODateString } from "../primitives/date";

// ==========================================
// DB Row Type (matches `doctors` table exactly)
// ==========================================

/**
 * Matches the `doctors` table schema in Supabase.
 * Does NOT include profile fields (name, email, phone) -- those live in `profiles`.
 */
export interface DoctorRow {
  id: DoctorId;
  userId: string;
  licenseNumber: string;
  /** Singular text field in DB (not an array). */
  specialty: string;
  subspecialty?: string | null;
  yearsExperience?: number | null;
  education?: DoctorEducation[] | null;
  certifications?: unknown[] | null;
  schedule?: unknown | null;
  consultationFee?: number | null;
  acceptedInsurance?: string[] | null;
  bio?: string | null;
  languages?: string[] | null;
  payoutCbu?: string | null;
  payoutAlias?: string | null;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ==========================================
// Enriched / Legacy Interface
// ==========================================

/**
 * Doctor with profile fields merged (from JOIN with `profiles`).
 *
 * @deprecated Prefer DoctorRow for DB-only queries and DoctorWithProfile
 * (from ./profiles.ts) for enriched data with explicit profile nesting.
 *
 * Fields by source:
 * - id, userId, licenseNumber, bio, isActive, createdAt, updatedAt -- `doctors` table
 * - firstName, lastName, email, phone -- `profiles` table (via user_id join)
 * - specialties -- flattened from `specialty` (singular text in DB)
 */
export interface Doctor {
  id: DoctorId;
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
  licenseNumber: string;
  /**
   * Array form used in legacy code.
   * DB stores a single `specialty` text column -- not an array.
   * When consuming from DB, wrap: `[row.specialty]`.
   */
  specialties: SpecialtyId[];
  bio?: string;
  education?: DoctorEducation[];
  experience?: DoctorExperience[];
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Educación del doctor
 */
export interface DoctorEducation {
  institution: string;
  degree: string;
  year: number;
  specialization?: string;
}

/**
 * Experiencia del doctor
 */
export interface DoctorExperience {
  institution: string;
  position: string;
  startDate: ISODateString;
  endDate?: ISODateString;
  description?: string;
}

// ==========================================
// Supabase DTOs
// ==========================================

export interface DoctorUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string;
  specialty?: string;
  bio?: string;
  education?: DoctorEducation[];
  experience?: DoctorExperience[];
  consultationFee?: number;
  telemedicineEnabled?: boolean;
}

// ==========================================
// Type Guards & Utilities
// ==========================================

export const isDoctor = (v: unknown): v is Doctor => {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.id === "string" &&
    typeof obj.licenseNumber === "string" &&
    typeof obj.userId === "string";
};

export const isDoctorRow = (v: unknown): v is DoctorRow => {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.id === "string" &&
    typeof obj.licenseNumber === "string" &&
    typeof obj.specialty === "string";
};

export const isDoctorEducation = (v: unknown): v is DoctorEducation => {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.institution === "string" &&
    typeof obj.degree === "string" &&
    typeof obj.year === "number";
};

export type { DoctorId };
