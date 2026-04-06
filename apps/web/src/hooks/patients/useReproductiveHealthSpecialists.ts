'use client';

import { fetchApi, ApiError } from '@/lib/api-client';
import { logger } from '@autamedica/shared';
import type {
  ReproductiveHealthSpecialistWithProfile,
  ReproductiveHealthSpecialtyType,
  SpecialistAvailabilityStatus
} from '@autamedica/types';
import { useCallback, useEffect, useState } from 'react';

interface UseSpecialistsOptions {
  specialty?: ReproductiveHealthSpecialtyType;
  availableOnly?: boolean;
  certifiedOnly?: boolean;
}

interface UseSpecialistsResult {
  specialists: ReproductiveHealthSpecialistWithProfile[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useReproductiveHealthSpecialists(
  options: UseSpecialistsOptions = {}
): UseSpecialistsResult {
  const [specialists, setSpecialists] = useState<ReproductiveHealthSpecialistWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSpecialists = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (options.specialty) params.set('specialty', options.specialty);
      if (options.availableOnly) params.set('availableOnly', 'true');
      if (options.certifiedOnly) params.set('certifiedOnly', 'true');

      const query = params.toString();
      const url = `/api/patients/reproductive-health/specialists${query ? `?${query}` : ''}`;
      const data = await fetchApi<ReproductiveHealthSpecialistWithProfile[]>(url);

      setSpecialists(data);
    } catch (err) {
      logger.error('[useReproductiveHealthSpecialists] fetch failed:', err);
      const message = err instanceof ApiError ? err.message : 'Error al cargar especialistas';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [options.specialty, options.availableOnly, options.certifiedOnly]);

  useEffect(() => {
    fetchSpecialists();
  }, [fetchSpecialists]);

  return {
    specialists,
    isLoading,
    error,
    refetch: fetchSpecialists,
  };
}

export function useSpecialistById(specialistId: string | null) {
  const [specialist, setSpecialist] = useState<ReproductiveHealthSpecialistWithProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!specialistId) {
      setSpecialist(null);
      setIsLoading(false);
      return;
    }

    const fetchSpecialist = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const data = await fetchApi<ReproductiveHealthSpecialistWithProfile>(
          `/api/patients/reproductive-health/specialists/${specialistId}`
        );
        setSpecialist(data);
      } catch (err) {
        logger.error('[useSpecialistById] fetch failed:', err);
        const message = err instanceof ApiError ? err.message : 'Error al cargar especialista';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSpecialist();
  }, [specialistId]);

  return { specialist, isLoading, error };
}

export function useUpdateSpecialistAvailability() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateAvailability = useCallback(async (
    specialistId: string,
    status: SpecialistAvailabilityStatus
  ) => {
    try {
      setIsUpdating(true);
      setError(null);

      await fetchApi(`/api/patients/reproductive-health/specialists/${specialistId}`, {
        method: 'PATCH',
        body: { status },
      });

      return { success: true };
    } catch (err) {
      logger.error('[useUpdateSpecialistAvailability] update failed:', err);
      const message = err instanceof ApiError ? err.message : 'Error al actualizar disponibilidad';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsUpdating(false);
    }
  }, []);

  return {
    updateAvailability,
    isUpdating,
    error,
  };
}
