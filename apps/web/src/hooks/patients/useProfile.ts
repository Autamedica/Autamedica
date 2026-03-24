'use client';

import { useCallback, useState } from 'react';
import { logger } from '@autamedica/shared';
import { fetchApi } from '@/lib/api-client';
import type { ProfileUpdateInput, Profile } from '@/lib/patients/lib/zod/profiles';
import type { PatientProfileUpdateInput, Patient } from '@/lib/patients/lib/zod/patients';

export interface PatientProfileUpdateResult {
  profile: Profile | null;
  patient: Patient | null;
}

export interface UsePatientProfileReturn {
  isSaving: boolean;
  error: string | null;
  success: boolean;
  updateProfile: (input: {
    profile?: ProfileUpdateInput;
    patient?: PatientProfileUpdateInput;
  }) => Promise<PatientProfileUpdateResult | null>;
  resetStatus: () => void;
}

export function usePatientProfile(userId: string | null): UsePatientProfileReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const updateProfile = useCallback<UsePatientProfileReturn['updateProfile']>(
    async ({ profile, patient }) => {
      if (!userId) {
        setError('Sesión inválida. Iniciá sesión nuevamente.');
        return null;
      }

      try {
        setIsSaving(true);
        setError(null);
        setSuccess(false);

        if (typeof window === 'undefined') {
          setError('Las actualizaciones solo están disponibles desde el navegador.');
          return null;
        }

        const data = await fetchApi<PatientProfileUpdateResult>('/api/patients/profile', {
          method: 'PATCH',
          body: { profile, patient },
        });
        setSuccess(true);
        return { profile: data?.profile ?? null, patient: data?.patient ?? null };
      } catch (updateError) {
        logger.error('[usePatientProfile] update failed', updateError);
        setError('No pudimos guardar los cambios. Intentá nuevamente.');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [userId],
  );

  const resetStatus = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  return {
    isSaving,
    error,
    success,
    updateProfile,
    resetStatus,
  };
}
