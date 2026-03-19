'use client';

import { logger } from '@autamedica/shared';
import type { Database } from '@autamedica/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SymptomRow = Database['public']['Tables']['symptom_reports']['Row'];
type MedicationLogRow = Database['public']['Tables']['medication_logs']['Row'];
type VitalSignRow = Database['public']['Tables']['vital_signs']['Row'];

interface ActiveMedication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  status: string;
  start_date: string | null;
  notes: string | null;
}

interface UpcomingAppointment {
  id: string;
  start_time: string;
  status: string | null;
  type: string | null;
  doctor: {
    first_name: string | null;
    last_name: string | null;
    specialty: string | null;
  } | null;
}

interface SummaryVitals {
  weight?: number;
  bloodPressure?: string;
  heartRate?: number;
  temperature?: number;
  oxygenSaturation?: number;
}

interface MedicalObservationResponse {
  success: boolean;
  data?: {
    symptoms: SymptomRow[];
    medicationLogs: MedicationLogRow[];
    vitalSigns: VitalSignRow[];
    upcomingAppointments: UpcomingAppointment[];
    activeMedications: ActiveMedication[];
  };
  error?: string;
}

export interface PatientMedicalEntry {
  id: string;
  type: 'symptom' | 'medication_taken' | 'vital_sign' | 'appointment';
  content: string;
  timestamp: string;
  patientId: string;
  metadata?: {
    medication?: string;
    dosage?: string;
    takenAt?: string;
    symptomSeverity?: 'leve' | 'moderado' | 'severo';
    vitals?: {
      weight?: number;
      bloodPressure?: string;
      heartRate?: number;
      temperature?: number;
      oxygenSaturation?: number;
    };
    appointmentLabel?: string;
  };
}

interface VitalSignsInput {
  weight?: number;
  bloodPressure?: string;
  heartRate?: number;
  temperature?: number;
  oxygenSaturation?: number;
  glucoseLevel?: number;
}

interface HealthSummary {
  overallStatus: 'excelente' | 'bueno' | 'regular' | 'necesita_atencion';
  symptomsCount: number;
  lastSymptom: string;
  lastVitals: SummaryVitals | null;
}

function severityLabelToScore(severity: 'leve' | 'moderado' | 'severo'): number {
  switch (severity) {
    case 'leve':
      return 3;
    case 'moderado':
      return 6;
    case 'severo':
      return 9;
  }
}

function severityScoreToLabel(severity: number): 'leve' | 'moderado' | 'severo' {
  if (severity >= 8) {
    return 'severo';
  }
  if (severity >= 5) {
    return 'moderado';
  }
  return 'leve';
}

function parseBloodPressure(
  value?: string,
): { systolic: number | null; diastolic: number | null } {
  if (!value) {
    return { systolic: null, diastolic: null };
  }

  const match = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    return { systolic: null, diastolic: null };
  }

  return {
    systolic: Number(match[1]),
    diastolic: Number(match[2]),
  };
}

async function postObservation(body: Record<string, unknown>): Promise<void> {
  const response = await fetch('/api/medical-observations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    throw new Error(result.error || 'No fue posible registrar la observación');
  }
}

async function createMedicationRecord(name: string, dosage: string): Promise<void> {
  const response = await fetch('/api/medical-history/medications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      medication_name: name,
      dosage,
      frequency: 'Según indicación médica',
      route: 'oral',
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    throw new Error(result.error || 'No fue posible registrar el medicamento');
  }
}

export function usePatientMedicalStore() {
  const [symptoms, setSymptoms] = useState<SymptomRow[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLogRow[]>([]);
  const [vitals, setVitals] = useState<VitalSignRow[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [activeMedications, setActiveMedications] = useState<ActiveMedication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/medical-observations', { cache: 'no-store' });
      const result = (await response.json().catch(() => ({}))) as MedicalObservationResponse;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'No fue posible cargar el seguimiento médico');
      }

      setSymptoms(result.data.symptoms);
      setMedicationLogs(result.data.medicationLogs);
      setVitals(result.data.vitalSigns);
      setUpcomingAppointments(result.data.upcomingAppointments);
      setActiveMedications(result.data.activeMedications);
      setLastSync(new Date().toISOString());
    } catch (error) {
      logger.error('[usePatientMedicalStore] Refresh failed', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const entries = useMemo<PatientMedicalEntry[]>(() => {
    const symptomEntries = symptoms.map((item) => ({
      id: item.id,
      type: 'symptom' as const,
      content: item.symptom_name,
      timestamp: item.reported_at,
      patientId: item.patient_id,
      metadata: {
        symptomSeverity: severityScoreToLabel(item.severity),
      },
    }));

    const medicationEntries = medicationLogs.map((item) => ({
      id: item.id,
      type: 'medication_taken' as const,
      content: `${item.medication_name} ${item.dosage}`,
      timestamp: item.taken_at,
      patientId: item.patient_id,
      metadata: {
        medication: item.medication_name,
        dosage: item.dosage,
        takenAt: item.taken_at,
      },
    }));

    const vitalEntries = vitals.map((item) => ({
      id: item.id,
      type: 'vital_sign' as const,
      content: 'Signos vitales registrados',
      timestamp: item.measured_at,
      patientId: item.patient_id,
      metadata: {
        vitals: {
          weight: item.weight ?? undefined,
          bloodPressure:
            item.blood_pressure_systolic && item.blood_pressure_diastolic
              ? `${item.blood_pressure_systolic}/${item.blood_pressure_diastolic}`
              : undefined,
          heartRate: item.heart_rate ?? undefined,
          temperature: item.temperature ?? undefined,
          oxygenSaturation: item.oxygen_saturation ?? undefined,
        },
      },
    }));

    const appointmentEntries = upcomingAppointments.map((item) => ({
      id: item.id,
      type: 'appointment' as const,
      content: item.doctor
        ? `Consulta con ${[item.doctor.first_name, item.doctor.last_name].filter(Boolean).join(' ')}`
        : 'Próxima consulta',
      timestamp: item.start_time,
      patientId: '',
      metadata: {
        appointmentLabel: item.doctor?.specialty ?? item.type ?? 'consulta',
      },
    }));

    return [...symptomEntries, ...medicationEntries, ...vitalEntries, ...appointmentEntries].sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
  }, [symptoms, medicationLogs, vitals, upcomingAppointments]);

  const getMedicationAdherence = useCallback(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentLogs = medicationLogs.filter(
      (item) => new Date(item.taken_at).getTime() >= thirtyDaysAgo,
    );
    const takenLogs = recentLogs.filter((item) => item.status === 'taken');

    return {
      totalTaken: takenLogs.length,
      adherenceScore: Math.min(100, (takenLogs.length / 30) * 100),
      lastTaken: recentLogs[0]?.taken_at ?? null,
    };
  }, [medicationLogs]);

  const getHealthSummary = useCallback((): HealthSummary => {
    const medication = getMedicationAdherence();
    const lastSymptom = symptoms[0];
    const lastVitals = vitals[0];

    const severeSymptoms = symptoms.filter((item) => item.severity >= 8).length;
    const overallStatus: HealthSummary['overallStatus'] =
      severeSymptoms > 0
        ? 'necesita_atencion'
        : medication.adherenceScore < 50
          ? 'regular'
          : medication.adherenceScore > 80
            ? 'excelente'
            : 'bueno';

    return {
      overallStatus,
      symptomsCount: symptoms.length,
      lastSymptom: lastSymptom?.symptom_name ?? 'Ninguno',
      lastVitals: lastVitals
        ? {
            weight: lastVitals.weight ?? undefined,
            bloodPressure:
              lastVitals.blood_pressure_systolic && lastVitals.blood_pressure_diastolic
                ? `${lastVitals.blood_pressure_systolic}/${lastVitals.blood_pressure_diastolic}`
                : undefined,
            heartRate: lastVitals.heart_rate ?? undefined,
            temperature: lastVitals.temperature ?? undefined,
            oxygenSaturation: lastVitals.oxygen_saturation ?? undefined,
          }
        : null,
    };
  }, [getMedicationAdherence, symptoms, vitals]);

  const recordSymptom = useCallback(
    async (_symptom: string, severity: 'leve' | 'moderado' | 'severo', _patientId?: string) => {
      await postObservation({
        type: 'symptom',
        payload: {
          symptom_name: _symptom,
          severity: severityLabelToScore(severity),
          description: _symptom,
        },
      });
      await refresh();
    },
    [refresh],
  );

  const recordMedicationTaken = useCallback(
    async (medication: string, dosage: string, _patientId?: string) => {
      await postObservation({
        type: 'medication',
        payload: {
          medication_name: medication,
          dosage,
          status: 'taken',
          source: 'patient_portal',
        },
      });
      await refresh();
    },
    [refresh],
  );

  const recordVitalSigns = useCallback(
    async (input: VitalSignsInput, _patientId?: string) => {
      const { systolic, diastolic } = parseBloodPressure(input.bloodPressure);

      await postObservation({
        type: 'vital_sign',
        payload: {
          type: systolic !== null && diastolic !== null ? 'blood_pressure' : 'patient_checkin',
          weight: input.weight,
          blood_pressure_systolic: systolic,
          blood_pressure_diastolic: diastolic,
          heart_rate: input.heartRate,
          temperature: input.temperature,
          oxygen_saturation: input.oxygenSaturation,
          notes: input.glucoseLevel ? `Glucosa: ${input.glucoseLevel} mg/dL` : undefined,
        },
      });
      await refresh();
    },
    [refresh],
  );

  const addMedication = useCallback(
    async (name: string, dosage: string) => {
      await createMedicationRecord(name, dosage);
      await refresh();
    },
    [refresh],
  );

  const generateMedicalSummaryForDoctor = useCallback(async () => {
    return {
      summary: getHealthSummary(),
      recentEntries: entries.slice(0, 10),
      medicationAdherence: getMedicationAdherence(),
      generatedAt: new Date().toISOString(),
    };
  }, [entries, getHealthSummary, getMedicationAdherence]);

  return {
    entries,
    isLoading,
    lastSync,
    personalNotes: [] as string[],
    symptoms: entries.filter((entry) => entry.type === 'symptom'),
    medications: entries.filter((entry) => entry.type === 'medication_taken'),
    vitals: entries.filter((entry) => entry.type === 'vital_sign'),
    upcomingAppointments,
    activeMedications,
    addMedication,
    recordSymptom,
    recordMedicationTaken,
    recordVitalSigns,
    refresh,
    getHealthSummary,
    getMedicationAdherence,
    generateMedicalSummaryForDoctor,
  };
}
