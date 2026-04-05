/**
 * @autamedica/types - Anamnesis (Historia Clinica Digital)
 *
 * Tipos para el sistema de anamnesis digital del paciente.
 * Cumple con normativas HIPAA y regulaciones argentinas de historias clinicas.
 *
 * Las 13 secciones usan nombres en espanol, alineados con KNOWN_SECTIONS
 * del anamnesis.service.ts y los registros reales en BD.
 */

import type { Brand } from '../core/brand.types';
import type { PatientId } from '../core/brand.types';
import type { ISODateString } from '../core/brand.types';
import type { BaseEntity } from '../core/base.types';

// ==========================================
// Branded IDs
// ==========================================

export type AnamnesisId = Brand<string, 'AnamnesisId'>;

/**
 * Las 13 secciones de la anamnesis digital.
 * Alineadas con KNOWN_SECTIONS en anamnesis.service.ts y la BD real.
 */
export type AnamnesisSection =
  | 'edad'
  | 'ocupacion'
  | 'motivo_consulta'
  | 'enfermedades_previas'
  | 'medicamentos'
  | 'alergias'
  | 'antecedentes_familiares'
  | 'habitos'
  | 'cardiovascular'
  | 'respiratorio'
  | 'digestivo'
  | 'genitourinario'
  | 'resumen_final';

// ==========================================
// Anamnesis Status
// ==========================================

export type AnamnesisStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'under_review'
  | 'approved';

export type AnamnesisSectionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'requires_attention';

// ==========================================
// Anamnesis Entity
// ==========================================

export interface Anamnesis extends BaseEntity {
  id: AnamnesisId;
  patient_id: PatientId;
  status: AnamnesisStatus;
  completion_percentage: number; // 0-100
  last_updated_section: AnamnesisSection | null;
  sections_status: Record<AnamnesisSection, AnamnesisSectionStatus>;
  approved_by_doctor_id: string | null;
  approved_at: ISODateString | null;
  locked: boolean; // true when approved, prevents edits
  privacy_accepted: boolean;
  terms_accepted: boolean;
  data_export_requested: boolean;
}

export interface AnamnesisInsert {
  patient_id: PatientId;
  status?: AnamnesisStatus;
  completion_percentage?: number;
  last_updated_section?: AnamnesisSection | null;
  sections_status?: Record<AnamnesisSection, AnamnesisSectionStatus>;
  privacy_accepted?: boolean;
  terms_accepted?: boolean;
}

export interface AnamnesisUpdate {
  status?: AnamnesisStatus;
  completion_percentage?: number;
  last_updated_section?: AnamnesisSection | null;
  sections_status?: Record<AnamnesisSection, AnamnesisSectionStatus>;
  approved_by_doctor_id?: string | null;
  approved_at?: ISODateString | null;
  locked?: boolean;
  privacy_accepted?: boolean;
  terms_accepted?: boolean;
  data_export_requested?: boolean;
}

// ==========================================
// Section Data Types
// ==========================================

export interface EdadSection {
  fecha_nacimiento: string;
  edad: number;
}

export interface OcupacionSection {
  ocupacion: string;
  descripcion_tareas?: string;
  exposicion_riesgos?: string[];
}

export interface MotivoConsultaSection {
  motivo_principal: string;
  cuando_empezo?: string;
  intensidad?: number;
  localizacion_corporal?: string[];
}

export interface EnfermedadesPreviasSection {
  enfermedades_cronicas?: string[];
  cirugias_previas?: string[];
  internaciones?: string[];
  otras?: string;
}

export interface MedicamentosSection {
  medicamentos: Array<{
    nombre: string;
    dosis?: string;
    frecuencia?: string;
  }>;
}

export interface AlergiasSection {
  alergias: Array<{
    alergeno: string;
    tipo?: string;
    severidad?: string;
    reaccion?: string;
  }>;
}

export interface AntecedentesFamiliaresSection {
  padre_enfermedades?: string[];
  madre_enfermedades?: string[];
  hermanos_enfermedades?: string[];
  otros?: string;
}

export interface HabitosSection {
  tabaquismo?: string;
  alcohol?: string;
  drogas_recreativas?: boolean;
  actividad_fisica?: string;
  alimentacion?: string;
  horas_sueno?: number;
}

export interface CardiovascularSection {
  dolor_pecho?: boolean;
  palpitaciones?: boolean;
  disnea_esfuerzo?: boolean;
  edema_miembros?: boolean;
  otros?: string;
}

export interface RespiratorioSection {
  tos_cronica?: boolean;
  expectoracion?: boolean;
  sibilancias?: boolean;
  disnea?: boolean;
  otros?: string;
}

export interface DigestivoSection {
  nauseas?: boolean;
  vomitos?: boolean;
  dolor_abdominal?: boolean;
  diarrea?: boolean;
  constipacion?: boolean;
  otros?: string;
}

export interface GenitourinarioSection {
  disuria?: boolean;
  hematuria?: boolean;
  poliuria?: boolean;
  incontinencia?: boolean;
  otros?: string;
}

export interface ResumenFinalSection {
  resumen: string;
  observaciones?: string;
}

// ==========================================
// Anamnesis Section Data (Complete)
// ==========================================

export interface AnamnesisSectionData {
  anamnesis_id: AnamnesisId;
  section: AnamnesisSection;
  data:
    | EdadSection
    | OcupacionSection
    | MotivoConsultaSection
    | EnfermedadesPreviasSection
    | MedicamentosSection
    | AlergiasSection
    | AntecedentesFamiliaresSection
    | HabitosSection
    | CardiovascularSection
    | RespiratorioSection
    | DigestivoSection
    | GenitourinarioSection
    | ResumenFinalSection;
  completed: boolean;
  last_modified: ISODateString;
  validation_errors?: string[];
}

// ==========================================
// API Responses
// ==========================================

export interface AnamnesisAPIResponse {
  anamnesis: Anamnesis;
  sections: AnamnesisSectionData[];
}

export interface AnamnesisProgressResponse {
  anamnesis_id: AnamnesisId;
  completion_percentage: number;
  completed_sections: AnamnesisSection[];
  pending_sections: AnamnesisSection[];
  total_sections: number;
  estimated_time_remaining_minutes: number;
}

// ==========================================
// Utility Functions
// ==========================================

export const SECTION_ORDER: AnamnesisSection[] = [
  'edad',
  'ocupacion',
  'motivo_consulta',
  'enfermedades_previas',
  'medicamentos',
  'alergias',
  'antecedentes_familiares',
  'habitos',
  'cardiovascular',
  'respiratorio',
  'digestivo',
  'genitourinario',
  'resumen_final',
];

export const SECTION_DISPLAY_NAMES: Record<AnamnesisSection, string> = {
  edad: 'Edad',
  ocupacion: 'Ocupacion',
  motivo_consulta: 'Motivo de Consulta',
  enfermedades_previas: 'Enfermedades Previas',
  medicamentos: 'Medicamentos',
  alergias: 'Alergias',
  antecedentes_familiares: 'Antecedentes Familiares',
  habitos: 'Habitos',
  cardiovascular: 'Sistema Cardiovascular',
  respiratorio: 'Sistema Respiratorio',
  digestivo: 'Sistema Digestivo',
  genitourinario: 'Sistema Genitourinario',
  resumen_final: 'Resumen Final',
};

export function isAnamnesisComplete(anamnesis: Anamnesis): boolean {
  return anamnesis.completion_percentage === 100 && anamnesis.status === 'completed';
}

export function calculateSectionWeight(section: AnamnesisSection): number {
  const weights: Record<AnamnesisSection, number> = {
    edad: 5,
    ocupacion: 5,
    motivo_consulta: 15,
    enfermedades_previas: 12,
    medicamentos: 10,
    alergias: 10,
    antecedentes_familiares: 8,
    habitos: 8,
    cardiovascular: 7,
    respiratorio: 7,
    digestivo: 5,
    genitourinario: 5,
    resumen_final: 3,
  };
  return weights[section] || 5;
}

export function getNextPendingSection(anamnesis: Anamnesis): AnamnesisSection | null {
  for (const section of SECTION_ORDER) {
    if (anamnesis.sections_status[section] !== 'completed') {
      return section;
    }
  }
  return null;
}

export function canEditAnamnesis(anamnesis: Anamnesis): boolean {
  return !anamnesis.locked && anamnesis.status !== 'approved';
}

export function requiresDoctorReview(anamnesis: Anamnesis): boolean {
  return anamnesis.status === 'completed' && !anamnesis.approved_by_doctor_id;
}
