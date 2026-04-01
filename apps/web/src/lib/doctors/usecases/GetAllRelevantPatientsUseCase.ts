/**
 * Use Case: GetAllRelevantPatients
 * Orchestrates clinical relevance logic for all patients in the platform.
 * Layer 7: Use Case Layer.
 */
import type { IPatientRepository, PatientWithProfile, Database } from '@autamedica/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAlertsForPatients } from '@/lib/doctors/lib/repos/alerts';

export class GetAllRelevantPatientsUseCase {
  constructor(private patientRepo: IPatientRepository) {}

  /**
   * Returns all patients prioritized by clinical urgency (alerts) and recency.
   */
  async execute(supabaseClient?: SupabaseClient<Database>): Promise<PatientWithProfile[]> {
    // 1. Fetch all patients
    const patients = await this.patientRepo.findAllActive();
    if (patients.length === 0) return [];

    const patientIds = patients.map(p => p.id);

    // 2. Fetch alerts (pass supabaseClient for server-side execution)
    const alerts = await getAlertsForPatients(patientIds, supabaseClient);

    // 3. Score calculation
    const scoredPatients = patients.map(p => {
      let score = 0;
      const patientAlerts = alerts.filter(a => a.patient_id === p.id);
      
      // Critical alerts boost (severity 1 is high)
      if (patientAlerts.some(a => a.severity === 'high')) score += 1000;
      if (patientAlerts.some(a => a.severity === 'medium')) score += 500;
      
      // Recency boost
      const lastUpdate = new Date(p.updated_at ?? p.created_at).getTime();
      score += lastUpdate / 1000000; // Small weight
      
      return { p, score };
    });

    return scoredPatients
      .sort((a, b) => b.score - a.score)
      .map(s => s.p);
  }
}
