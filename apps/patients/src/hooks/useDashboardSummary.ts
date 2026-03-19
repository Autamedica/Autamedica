'use client';

import { usePatientSession } from '@/hooks/usePatientSession';
import type { DashboardViewData, DashboardViewResponse } from '@/types/dashboard-view';
import { useSupabase } from '@autamedica/auth/react';
import { logger } from '@autamedica/shared';
import { useCallback, useEffect, useState } from 'react';

interface UseDashboardSummaryOptions {
  enabled?: boolean;
}

interface UseDashboardSummaryResult {
  data: DashboardViewData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDashboardSummary(
  options: UseDashboardSummaryOptions = {},
): UseDashboardSummaryResult {
  const { enabled = true } = options;
  const supabase = useSupabase();
  const { user, patient, loading: sessionLoading, error: sessionError } = usePatientSession();
  const [data, setData] = useState<DashboardViewData | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    if (!supabase) {
      return {};
    }

    const { data: sessionData, error: authError } = await supabase.auth.getSession();

    if (authError) {
      logger.warn('[useDashboardSummary] Failed to resolve session', authError);
      return {};
    }

    const token = sessionData.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (sessionLoading) {
      return;
    }

    if (sessionError) {
      setData(null);
      setError(sessionError);
      setLoading(false);
      return;
    }

    if (!user || !patient) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/dashboard/summary', {
        headers: await getAuthHeaders(),
        cache: 'no-store',
      });

      const result = (await response.json().catch(() => ({}))) as DashboardViewResponse;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'No fue posible cargar el resumen del dashboard');
      }

      setData(result.data);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : 'No fue posible cargar el resumen del dashboard';
      setData(null);
      setError(message);
      logger.error('[useDashboardSummary] Error', fetchError);
    } finally {
      setLoading(false);
    }
  }, [enabled, getAuthHeaders, patient, sessionError, sessionLoading, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
