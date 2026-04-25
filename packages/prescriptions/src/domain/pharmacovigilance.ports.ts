import type { PatientId, DoctorId, PrescriptionId } from '@autamedica/types';

export type AdverseReactionSeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening' | 'fatal';

export type Causality = 'certain' | 'probable' | 'possible' | 'unlikely' | 'unassessable';

export type Outcome = 'recovered' | 'recovering' | 'not_recovered' | 'sequelae' | 'fatal' | 'unknown';

export type ReportedBy = 'patient' | 'doctor' | 'pharmacist' | 'caregiver';

export type AdrStatus = 'draft' | 'submitted' | 'evaluated' | 'reported_anmat' | 'resolved' | 'rejected';

export interface AdverseReactionSymptom {
  label: string;
  cie10?: string;
  onsetDate?: string;
  intensity?: 'mild' | 'moderate' | 'severe';
}

export interface AdverseReactionReport {
  id: string;
  patientId: PatientId;
  prescriptionId?: PrescriptionId;
  doctorId?: DoctorId;
  reportedBy: ReportedBy;
  onsetDate: string;
  resolutionDate?: string;
  suspectedDrug: string;
  symptoms: AdverseReactionSymptom[];
  severity: AdverseReactionSeverity;
  causality?: Causality;
  actionTaken?: string;
  outcome?: Outcome;
  concomitantMedication?: Array<{ drug: string; dose?: string }>;
  narrative?: string;
  status: AdrStatus;
  evaluatedAt?: string;
  evaluatedByDoctorId?: DoctorId;
  reportedToAnmatAt?: string;
  anmatCaseId?: string;
}

export interface AdverseReactionDraft {
  patientId: PatientId;
  prescriptionId?: PrescriptionId;
  doctorId?: DoctorId;
  reportedBy: ReportedBy;
  onsetDate: string;
  resolutionDate?: string;
  suspectedDrug: string;
  symptoms: AdverseReactionSymptom[];
  severity: AdverseReactionSeverity;
  actionTaken?: string;
  outcome?: Outcome;
  concomitantMedication?: Array<{ drug: string; dose?: string }>;
  narrative?: string;
}

export interface AdverseReactionEvaluation {
  doctorId: DoctorId;
  causality: Causality;
  finalSeverity?: AdverseReactionSeverity;
  finalOutcome?: Outcome;
  evaluationNotes?: string;
  reportToAnmat: boolean;
}

export interface IAdverseReactionRepository {
  submit(draft: AdverseReactionDraft): Promise<AdverseReactionReport>;
  get(id: string): Promise<AdverseReactionReport | null>;
  listPendingEvaluation(batchSize: number): Promise<AdverseReactionReport[]>;
  listByPatient(patientId: PatientId, limit?: number): Promise<AdverseReactionReport[]>;
  evaluate(id: string, input: AdverseReactionEvaluation): Promise<AdverseReactionReport>;
  markReportedToAnmat(id: string, anmatCaseId: string): Promise<void>;
}
