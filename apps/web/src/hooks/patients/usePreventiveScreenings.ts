'use client';

import { fetchApi, ApiError } from '@/lib/api-client';
import { logger } from '@autamedica/shared';
import type {
  PatientScreeningWithDetails,
  ScreeningRecommendation,
  ScreeningStatusType
} from '@autamedica/types';
import { useCallback, useEffect, useState } from 'react';

interface UsePreventiveScreeningsOptions {
  patientId?: string;
  status?: ScreeningStatusType[];
  categoryFilter?: string;
  includeCompleted?: boolean;
}

interface UsePreventiveScreeningsResult {
  myScreenings: PatientScreeningWithDetails[];
  recommendations: ScreeningRecommendation[];
  isLoading: boolean;
  isLoadingRecommendations: boolean;
  error: string | null;
  scheduleScreening: (screeningId: string, scheduledDate: Date) => Promise<{ success: boolean; error?: string }>;
  markAsCompleted: (patientScreeningId: string, resultSummary?: string) => Promise<{ success: boolean; error?: string }>;
  cancelScreening: (patientScreeningId: string) => Promise<{ success: boolean; error?: string }>;
  refetch: () => Promise<void>;
}

interface ScreeningsApiResponse {
  screenings: PatientScreeningWithDetails[];
  recommendations: ScreeningRecommendation[];
}

export function usePreventiveScreenings(
  options: UsePreventiveScreeningsOptions = {}
): UsePreventiveScreeningsResult {
  const [myScreenings, setMyScreenings] = useState<PatientScreeningWithDetails[]>([]);
  const [recommendations, setRecommendations] = useState<ScreeningRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScreenings = useCallback(async () => {
    if (!options.patientId) {
      setMyScreenings([]);
      setRecommendations([]);
      setIsLoading(false);
      setIsLoadingRecommendations(false);
      return;
    }

    try {
      setIsLoading(true);
      setIsLoadingRecommendations(true);
      setError(null);

      const params = new URLSearchParams();
      if (options.status && options.status.length > 0) {
        params.set('status', options.status.join(','));
      }
      if (options.categoryFilter) {
        params.set('category', options.categoryFilter);
      }
      if (options.includeCompleted) {
        params.set('includeCompleted', 'true');
      }

      const query = params.toString();
      const url = `/api/patients/screenings${query ? `?${query}` : ''}`;
      const data = await fetchApi<ScreeningsApiResponse>(url);

      setMyScreenings(data.screenings);
      setRecommendations(data.recommendations);
    } catch (err) {
      logger.error('[usePreventiveScreenings] fetch failed:', err);
      const message = err instanceof ApiError ? err.message : 'Error al cargar screenings';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsLoadingRecommendations(false);
    }
  }, [options.patientId, options.status, options.categoryFilter, options.includeCompleted]);

  const scheduleScreening = useCallback(async (
    screeningId: string,
    scheduledDate: Date
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await fetchApi('/api/patients/screenings', {
        body: { screeningId, scheduledDate: scheduledDate.toISOString() },
      });
      await fetchScreenings();
      return { success: true };
    } catch (err) {
      logger.error('[usePreventiveScreenings] schedule failed:', err);
      const message = err instanceof ApiError ? err.message : 'Error al agendar screening';
      return { success: false, error: message };
    }
  }, [fetchScreenings]);

  const markAsCompleted = useCallback(async (
    patientScreeningId: string,
    resultSummary?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await fetchApi(`/api/patients/screenings/${patientScreeningId}`, {
        method: 'PATCH',
        body: { action: 'complete', resultSummary },
      });
      await fetchScreenings();
      return { success: true };
    } catch (err) {
      logger.error('[usePreventiveScreenings] complete failed:', err);
      const message = err instanceof ApiError ? err.message : 'Error al completar screening';
      return { success: false, error: message };
    }
  }, [fetchScreenings]);

  const cancelScreening = useCallback(async (
    patientScreeningId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await fetchApi(`/api/patients/screenings/${patientScreeningId}`, {
        method: 'PATCH',
        body: { action: 'cancel' },
      });
      await fetchScreenings();
      return { success: true };
    } catch (err) {
      logger.error('[usePreventiveScreenings] cancel failed:', err);
      const message = err instanceof ApiError ? err.message : 'Error al cancelar screening';
      return { success: false, error: message };
    }
  }, [fetchScreenings]);

  const refetch = useCallback(async () => {
    await fetchScreenings();
  }, [fetchScreenings]);

  useEffect(() => {
    fetchScreenings();
  }, [fetchScreenings]);

  return {
    myScreenings,
    recommendations,
    isLoading,
    isLoadingRecommendations,
    error,
    scheduleScreening,
    markAsCompleted,
    cancelScreening,
    refetch,
  };
}
