'use client';

import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis';
import { fetchApi, ApiError } from '@/lib/api-client';
import { logger } from '@autamedica/shared';
import type { AnamnesisSection } from '@autamedica/types';
import { useCallback, useEffect, useState } from 'react';

type ApiAnamnesis = {
  id: string;
  patient_id: string;
  status: string;
  completion_percentage: number;
  sections_status: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  privacy_accepted?: boolean;
  terms_accepted?: boolean;
  locked?: boolean;
};

type ApiSection = {
  id: string;
  anamnesis_id: string;
  section: string;
  data: Record<string, unknown>;
  completed: boolean;
  completed_at?: string | null;
  updated_at: string;
};

type ApiProgress = {
  completion_percentage: number;
  completed_sections: string[];
  pending_sections: string[];
  total_sections: number;
};

interface ApiResponse {
  anamnesis: ApiAnamnesis;
  sections: ApiSection[];
  progress: ApiProgress;
  patientBirthDate?: string | null;
}

export interface AnamnesisState {
  anamnesis: ApiAnamnesis | null;
  sections: ApiSection[];
  progress: ApiProgress | null;
}

interface UseAnamnesisReturn {
  anamnesis: ApiAnamnesis | null;
  sections: ApiSection[];
  progress: ApiProgress | null;
  patientBirthDate: string | null;
  loading: boolean;
  error: string | null;
  authRequired: boolean;
  createAnamnesis: (initial?: Partial<ApiAnamnesis>) => Promise<ApiAnamnesis | null>;
  updateAnamnesis: (update: Partial<ApiAnamnesis>) => Promise<boolean>;
  updateSection: (section: AnamnesisSection, data: Record<string, AnamnesisFieldValue>) => Promise<boolean>;
  refreshAnamnesis: () => Promise<void>;
}

export function useAnamnesis(): UseAnamnesisReturn {
  const [anamnesis, setAnamnesis] = useState<ApiAnamnesis | null>(null);
  const [sections, setSections] = useState<ApiSection[]>([]);
  const [progress, setProgress] = useState<ApiProgress | null>(null);
  const [patientBirthDate, setPatientBirthDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const handleApiError = useCallback((err: unknown, fallbackMessage: string): string => {
    if (err instanceof ApiError && err.status === 401) {
      setAuthRequired(true);
      setError('unauthorized');
      return 'unauthorized';
    }

    const message = err instanceof ApiError ? err.message : fallbackMessage;
    setError(message);
    return message;
  }, []);

  const fetchAnamnesis = useCallback(async (): Promise<ApiResponse | null> => {
    try {
      setLoading(true);
      setError(null);
      setAuthRequired(false);
      const data = await fetchApi<ApiResponse>('/api/patients/anamnesis');
      setAnamnesis(data.anamnesis);
      setSections(data.sections);
      setProgress(data.progress);
      if (data.patientBirthDate) setPatientBirthDate(data.patientBirthDate);
      return data;
    } catch (err) {
      logger.error('Error fetching anamnesis:', err);
      handleApiError(err, 'Error desconocido');
      return null;
    } finally {
      setLoading(false);
    }
  }, [handleApiError]);

  const createAnamnesis = useCallback(async (initial?: Partial<ApiAnamnesis>): Promise<ApiAnamnesis | null> => {
    try {
      const current = await fetchAnamnesis();
      if (initial && Object.keys(initial).length > 0) {
        await fetchApi('/api/patients/anamnesis', { method: 'PATCH', body: initial });
        const updated = await fetchAnamnesis();
        return updated?.anamnesis ?? current?.anamnesis ?? null;
      }
      return current?.anamnesis ?? null;
    } catch (err) {
      logger.error('Error creating anamnesis:', err);
      handleApiError(err, 'Error al crear anamnesis');
      return null;
    }
  }, [fetchAnamnesis, handleApiError]);

  const updateAnamnesis = useCallback(async (update: Partial<ApiAnamnesis>): Promise<boolean> => {
    try {
      await fetchApi('/api/patients/anamnesis', { method: 'PATCH', body: update });
      await fetchAnamnesis();
      return true;
    } catch (err) {
      logger.error('Error updating anamnesis:', err);
      handleApiError(err, 'Error al actualizar anamnesis');
      return false;
    }
  }, [fetchAnamnesis, handleApiError]);

  const updateSection = useCallback(async (
    section: AnamnesisSection,
    data: Record<string, AnamnesisFieldValue>
  ): Promise<boolean> => {
    try {
      const result = await fetchApi<{ progress?: ApiProgress }>('/api/patients/anamnesis', {
        method: 'POST',
        body: { stepId: section, data, completed: true },
      });
      if (result?.progress) {
        setProgress(result.progress);
      }
      await fetchAnamnesis();
      return true;
    } catch (err) {
      logger.error('Error updating section:', err);
      handleApiError(err, 'Error al actualizar sección');
      return false;
    }
  }, [fetchAnamnesis, handleApiError]);

  const refreshAnamnesis = useCallback(async () => {
    await fetchAnamnesis();
  }, [fetchAnamnesis]);

  useEffect(() => {
    fetchAnamnesis();
  }, [fetchAnamnesis]);

  return {
    anamnesis,
    sections,
    progress,
    patientBirthDate,
    loading,
    error,
    authRequired,
    createAnamnesis,
    updateAnamnesis,
    updateSection,
    refreshAnamnesis,
  };
}
