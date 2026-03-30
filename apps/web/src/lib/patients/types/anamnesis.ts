/**
 * Tipos para Anamnesis Interactiva
 * Basado en la estructura de Alvarez con storytelling médico
 */

/**
 * How a step behaves on revisit (patient already completed anamnesis before).
 * - carry_forward: skip silently, use previous data. Patient can edit manually.
 * - carry_forward_additive: show previous + ask "anything new?". Only adds, never removes.
 * - confirm_on_revisit: show compact summary + ask "did anything change?". If yes, open edit.
 * - per_visit: always ask fresh. New answers each time.
 */
export type StepMutability =
  | 'carry_forward'
  | 'carry_forward_additive'
  | 'confirm_on_revisit'
  | 'per_visit';

export interface AnamnesisStep {
  id: string;
  title: string;
  subtitle: string;
  story?: {
    intro: string;
    why: string;
    example?: string;
    didYouKnow?: string;
  };
  fields: AnamnesisField[];
  mediaUrl?: string;
  completed: boolean;
  category: AnamnesisCategory;
  /** How this step behaves when patient revisits. Default: per_visit */
  mutability: StepMutability;
}

export type AnamnesisCategory =
  | 'filiacion'
  | 'motivo_consulta'
  | 'enfermedad_actual'
  | 'antecedentes_personales'
  | 'antecedentes_familiares'
  | 'revision_sistemas';

export type BodySymptomType =
  | 'pain'
  | 'pressure'
  | 'burning'
  | 'numbness'
  | 'weakness'
  | 'swelling'
  | 'other'

export type BodyLaterality = 'left' | 'right' | 'bilateral' | 'midline' | 'unknown'

export type BodyAspect = 'anterior' | 'posterior' | 'diffuse'

export interface BodyMapSelection {
  partId: string
  label: string
  intensity: number
  symptomType: BodySymptomType
  laterality: BodyLaterality
  aspect: BodyAspect
}

export type AnamnesisFieldValue =
  | string
  | number
  | boolean
  | string[]
  | BodyMapSelection[]
  | null
  | undefined;

export interface AnamnesisField {
  id: string;
  type:
    | 'text'
    | 'number'
    | 'select'
    | 'multiselect'
    | 'date'
    | 'textarea'
    | 'boolean'
    | 'scale'
    | 'body_map';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: { value: string; label: string; explanation?: string }[];
  tooltip?: string;
  educationalNote?: string; // Nota que aparece al completar
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  dependsOn?: {
    fieldId: string;
    value: AnamnesisFieldValue;
  };
}

export interface AnamnesisData {
  patient_id: string;
  started_at: string;
  last_updated: string;
  completed_at?: string;
  progress_percentage: number;

  // Datos de Filiación
  filiacion: {
    edad: number;
    sexo: 'masculino' | 'femenino' | 'otro';
    ocupacion: string;
    estado_civil: string;
    lugar_nacimiento: string;
    residencia_actual: string;
  };

  // Motivo de Consulta
  motivo_consulta: {
    sintoma_principal: string;
    desde_cuando: string;
    intensidad: number; // 1-10
    body_selections: BodyMapSelection[];
  };

  // Antecedentes Personales
  antecedentes_personales: {
    enfermedades_previas: string[];
    cirugias: Array<{ tipo: string; fecha: string }>;
    hospitalizaciones: Array<{ motivo: string; fecha: string }>;
    alergias: string[];
    medicacion_actual: Array<{ nombre: string; dosis: string; desde: string }>;

    habitos: {
      tabaquismo: { fuma: boolean; cigarrillos_dia?: number; años?: number };
      alcohol: { consume: boolean; frecuencia?: string; tipo?: string };
      ejercicio: { hace: boolean; tipo?: string; frecuencia?: string };
      dieta: string;
      sueño_horas: number;
    };
  };

  // Antecedentes Familiares
  antecedentes_familiares: {
    padre: { vivo: boolean; edad?: number; causa_muerte?: string; enfermedades?: string[] };
    madre: { vivo: boolean; edad?: number; causa_muerte?: string; enfermedades?: string[] };
    hermanos: Array<{ edad: number; enfermedades?: string[] }>;
    enfermedades_hereditarias: string[];
  };

  // Revisión por Sistemas
  revision_sistemas: {
    cardiovascular: { sintomas: string[]; detalles?: string };
    respiratorio: { sintomas: string[]; detalles?: string };
    digestivo: { sintomas: string[]; detalles?: string };
    genitourinario: { sintomas: string[]; detalles?: string };
    nervioso: { sintomas: string[]; detalles?: string };
    endocrino: { sintomas: string[]; detalles?: string };
    musculoesqueletico: { sintomas: string[]; detalles?: string };
    piel: { sintomas: string[]; detalles?: string };
  };
}
