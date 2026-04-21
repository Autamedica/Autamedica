import type { SupabaseClient } from '@supabase/supabase-js';
import type { PatientId, DoctorId, PrescriptionId } from '@autamedica/types';
import type {
  IAdverseReactionRepository,
  AdverseReactionReport,
  AdverseReactionDraft,
  AdverseReactionEvaluation,
  AdverseReactionSymptom,
  AdverseReactionSeverity,
  Causality,
  Outcome,
  ReportedBy,
  AdrStatus,
} from '../../domain/pharmacovigilance.ports';

interface AdrRow {
  id: string;
  patient_id: string;
  prescription_id: string | null;
  doctor_id: string | null;
  reported_by: ReportedBy;
  onset_date: string;
  resolution_date: string | null;
  suspected_drug: string;
  symptoms: AdverseReactionSymptom[];
  severity: AdverseReactionSeverity;
  causality: Causality | null;
  action_taken: string | null;
  outcome: Outcome | null;
  concomitant_medication: Array<{ drug: string; dose?: string }> | null;
  narrative: string | null;
  status: AdrStatus;
  evaluated_at: string | null;
  evaluated_by_doctor_id: string | null;
  reported_to_anmat_at: string | null;
  anmat_case_id: string | null;
}

function mapRow(row: AdrRow): AdverseReactionReport {
  return {
    id: row.id,
    patientId: row.patient_id as PatientId,
    prescriptionId: (row.prescription_id ?? undefined) as PrescriptionId | undefined,
    doctorId: (row.doctor_id ?? undefined) as DoctorId | undefined,
    reportedBy: row.reported_by,
    onsetDate: row.onset_date,
    resolutionDate: row.resolution_date ?? undefined,
    suspectedDrug: row.suspected_drug,
    symptoms: row.symptoms ?? [],
    severity: row.severity,
    causality: row.causality ?? undefined,
    actionTaken: row.action_taken ?? undefined,
    outcome: row.outcome ?? undefined,
    concomitantMedication: row.concomitant_medication ?? undefined,
    narrative: row.narrative ?? undefined,
    status: row.status,
    evaluatedAt: row.evaluated_at ?? undefined,
    evaluatedByDoctorId: (row.evaluated_by_doctor_id ?? undefined) as DoctorId | undefined,
    reportedToAnmatAt: row.reported_to_anmat_at ?? undefined,
    anmatCaseId: row.anmat_case_id ?? undefined,
  };
}

export class SupabaseAdverseReactionRepository implements IAdverseReactionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async submit(draft: AdverseReactionDraft): Promise<AdverseReactionReport> {
    const { data, error } = await this.supabase
      .from('adverse_drug_reactions')
      .insert({
        patient_id: draft.patientId,
        prescription_id: draft.prescriptionId ?? null,
        doctor_id: draft.doctorId ?? null,
        reported_by: draft.reportedBy,
        onset_date: draft.onsetDate,
        resolution_date: draft.resolutionDate ?? null,
        suspected_drug: draft.suspectedDrug,
        symptoms: draft.symptoms,
        severity: draft.severity,
        action_taken: draft.actionTaken ?? null,
        outcome: draft.outcome ?? null,
        concomitant_medication: draft.concomitantMedication ?? null,
        narrative: draft.narrative ?? null,
        status: 'submitted',
      })
      .select()
      .single();
    if (error || !data) throw new Error(`submit ADR: ${error?.message ?? 'no data'}`);
    return mapRow(data as AdrRow);
  }

  async get(id: string): Promise<AdverseReactionReport | null> {
    const { data, error } = await this.supabase
      .from('adverse_drug_reactions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`get ADR: ${error.message}`);
    return data ? mapRow(data as AdrRow) : null;
  }

  async listPendingEvaluation(batchSize: number): Promise<AdverseReactionReport[]> {
    const { data, error } = await this.supabase
      .from('adverse_drug_reactions')
      .select('*')
      .in('status', ['submitted', 'draft'])
      .order('created_at', { ascending: true })
      .limit(batchSize);
    if (error) throw new Error(`list pending ADR: ${error.message}`);
    return (data ?? []).map((r) => mapRow(r as AdrRow));
  }

  async listByPatient(patientId: PatientId, limit = 20): Promise<AdverseReactionReport[]> {
    const { data, error } = await this.supabase
      .from('adverse_drug_reactions')
      .select('*')
      .eq('patient_id', patientId)
      .order('onset_date', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`list ADR by patient: ${error.message}`);
    return (data ?? []).map((r) => mapRow(r as AdrRow));
  }

  async evaluate(id: string, input: AdverseReactionEvaluation): Promise<AdverseReactionReport> {
    const patch: Record<string, unknown> = {
      status: 'evaluated',
      causality: input.causality,
      evaluated_at: new Date().toISOString(),
      evaluated_by_doctor_id: input.doctorId,
    };
    if (input.finalSeverity) patch.severity = input.finalSeverity;
    if (input.finalOutcome) patch.outcome = input.finalOutcome;
    if (input.evaluationNotes) {
      patch.narrative = input.evaluationNotes;
    }

    const { data, error } = await this.supabase
      .from('adverse_drug_reactions')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error || !data) throw new Error(`evaluate ADR: ${error?.message ?? 'no data'}`);
    return mapRow(data as AdrRow);
  }

  async markReportedToAnmat(id: string, anmatCaseId: string): Promise<void> {
    const { error } = await this.supabase
      .from('adverse_drug_reactions')
      .update({
        status: 'reported_anmat',
        reported_to_anmat_at: new Date().toISOString(),
        anmat_case_id: anmatCaseId,
      })
      .eq('id', id);
    if (error) throw new Error(`mark reported anmat: ${error.message}`);
  }
}
