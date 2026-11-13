import { useCallback, useEffect, useState } from 'react';
import { logger } from '@autamedica/shared';
import { fetchApi, ApiError } from '@/lib/api-client';

export interface PatientProfile {
  id?: string | null;
  name: string;
  dateOfBirth: string | null;
  gender: string | null;
}

export interface SuggestedQuestion {
  question: string;
  priority: 'critical' | 'high' | 'medium';
}

export interface AnamnesisSummarySection {
  title: string;
  items: string[];
}

export interface AnamnesisSummary {
  headline: string;
  narrative: string[];
  sections: AnamnesisSummarySection[];
  completedSections: number;
  lastUpdatedAt: string | null;
}

export interface AnamnesisExtraction {
  chiefComplaint?: {
    rawText: string | null;
    normalizedMedicalText: string | null;
  };
  presentIllness?: {
    clinicalNarrative: string;
    severity: string | null;
    associatedSymptoms: string[];
    missingData: string[];
  };
  personalHistory?: {
    physiological: string[];
    pathological: string[];
  };
  familyHistory?: string[];
  qualityAlerts?: Array<{ code: string; message: string; severity: string }>;
  safetyFlags?: string[];
  clinicianQuestions?: string[];
  nextQuestions?: Array<{ question: string; priority: string }>;
}

export interface ConsultationContext {
  hasAnamnesis: boolean;
  patient: PatientProfile | null;
  anamnesisStatus?: string;
  completionPercentage?: number;
  summary: AnamnesisSummary | null;
  extraction: AnamnesisExtraction | null;
  extractionFromCache?: boolean;
  redFlags: string[];
  suggestedQuestions: SuggestedQuestion[];
  reason?: 'not_started' | 'not_shared' | 'kiosk_dispatch' | 'guest_call';
  dispatchTriage?: {
    patientDni: string | null;
    symptomSummary: string | null;
    dispatchRequestId: string;
  };
}

interface UseConsultationContextResult {
  context: ConsultationContext | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useConsultationContext(roomId: string | null): UseConsultationContextResult {
  const [context, setContext] = useState<ConsultationContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    if (!roomId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchApi<ConsultationContext>(`/api/doctors/consultations/${roomId}/context`);
      setContext(data);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError('No autorizado');
        else if (err.status === 403) setError('Sin acceso al paciente');
        else setError(err.message);
      } else {
        logger.error('[useConsultationContext] fetch error', err);
        setError('Error de conexión');
      }
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  return { context, loading, error, refresh: fetchContext };
}
