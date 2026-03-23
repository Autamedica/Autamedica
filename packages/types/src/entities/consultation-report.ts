/**
 * Consultation Report types — Formato SOAP para informes post-consulta
 *
 * S (Subjetivo): motivo de consulta, enfermedad actual, síntomas
 * O (Objetivo): hallazgos, signos vitales, examen físico
 * A (Evaluación): impresión clínica, diagnósticos diferenciales
 * P (Plan): tratamiento, estudios, seguimiento
 */

export interface SOAPReport {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface ConsultationReportContent extends SOAPReport {
  chiefComplaint: string | null;
  differentialDiagnosis: string[];
  followUpRecommendations: string[];
  aiGenerated: boolean;
  aiProvider: string | null;
  aiModel: string | null;
  transcriptionWordCount: number;
  anamnesisAvailable: boolean;
  doctorNotes: string | null;
}

export interface GenerateReportRequest {
  transcriptionText: string;
  anamnesisSummary: string | null;
  anamnesisExtraction: Record<string, unknown> | null;
  doctorNotes: string | null;
  patientName: string;
  patientAge: number | null;
  patientGender: string | null;
}

export interface GenerateReportResponse {
  report: SOAPReport;
  chiefComplaint: string | null;
  differentialDiagnosis: string[];
  followUpRecommendations: string[];
  confidence: number;
  provider: string;
  model: string;
}
