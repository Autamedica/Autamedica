import type { IPatientRepository, PatientWithProfile, IAlertsRepository } from '@autamedica/types';

interface GetRelevantPatientsDeps {
  patientRepo: IPatientRepository
  alertsRepo: IAlertsRepository
}

export class GetRelevantPatientsUseCase {
  constructor(private readonly deps: GetRelevantPatientsDeps) {}

  /**
   * Returns patients prioritized by clinical urgency (alerts) and recency.
   */
  async execute(doctorUserId: string): Promise<PatientWithProfile[]> {
    // 1. Fetch patients
    const patients = await this.deps.patientRepo.findByDoctorUserId(doctorUserId);
    if (patients.length === 0) return [];

    const patientIds = patients.map(p => p.id);

    // 2. Fetch alerts via injected repo
    const alerts = await this.deps.alertsRepo.getForPatients(patientIds);

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
