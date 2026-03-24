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
  loading: boolean;
  error: string | null;
  createAnamnesis: (initial?: Partial<ApiAnamnesis>) => Promise<ApiAnamnesis | null>;
  updateAnamnesis: (update: Partial<ApiAnamnesis>) => Promise<boolean>;
  updateSection: (section: AnamnesisSection, data: Record<string, AnamnesisFieldValue>) => Promise<boolean>;
  refreshAnamnesis: () => Promise<void>;
}

export function useAnamnesis(): UseAnamnesisReturn {
  const [anamnesis, setAnamnesis] = useState<ApiAnamnesis | null>(null);
  const [sections, setSections] = useState<ApiSection[]>([]);
  const [progress, setProgress] = useState<ApiProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnamnesis = useCallback(async (): Promise<ApiResponse | null> => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<ApiResponse>('/api/patients/anamnesis');
      setAnamnesis(data.anamnesis);
      setSections(data.sections);
      setProgress(data.progress);
      return data;
    } catch (err) {
      logger.error('Error fetching anamnesis:', err);
      setError(err instanceof ApiError ? err.message : 'Error desconocido');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

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
      setError(err instanceof Error ? err.message : 'Error al crear anamnesis');
      return null;
    }
  }, [fetchAnamnesis]);

  const updateAnamnesis = useCallback(async (update: Partial<ApiAnamnesis>): Promise<boolean> => {
    try {
      await fetchApi('/api/patients/anamnesis', { method: 'PATCH', body: update });
      await fetchAnamnesis();
      return true;
    } catch (err) {
      logger.error('Error updating anamnesis:', err);
      setError(err instanceof Error ? err.message : 'Error al actualizar anamnesis');
      return false;
    }
  }, [fetchAnamnesis]);

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
      setError(err instanceof Error ? err.message : 'Error al actualizar sección');
      return false;
    }
  }, [fetchAnamnesis]);

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
    loading,
    error,
    createAnamnesis,
    updateAnamnesis,
    updateSection,
    refreshAnamnesis,
  };
}
