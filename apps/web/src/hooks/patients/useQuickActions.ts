'use client';

import { useState } from 'react';
import { useSupabase } from '@autamedica/auth/react';
import { quickActionsService } from '@/lib/patients/services/quick-actions.service';
import { logger } from '@autamedica/shared';

const SESSION_UNAVAILABLE_MESSAGE = 'Necesitás iniciar sesión para guardar esta información.';

export function useVitalSigns() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordBloodPressure = async (systolic: number, diastolic: number, notes?: string) => {
    if (!supabase) return { success: false, error: SESSION_UNAVAILABLE_MESSAGE } as const;
    try {
      setLoading(true);
      setError(null);

      await quickActionsService.logVitalSign(supabase, {
        systolic,
        diastolic,
        notes,
      });
      return { success: true } as const;
    } catch (err) {
      const message = 'No pudimos registrar la presión arterial.';
      logger.error('[useVitalSigns]', err);
      setError(message);
      return { success: false, error: message } as const;
    } finally {
      setLoading(false);
    }
  };

  return { recordBloodPressure, loading, error };
}

export function useMedicationLog() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmMedication = async (
    medicationName: string,
    dosage: string,
    notes?: string,
    status: 'taken' | 'skipped' | 'late' = 'taken',
  ) => {
    if (!supabase) return { success: false, error: SESSION_UNAVAILABLE_MESSAGE } as const;
    try {
      setLoading(true);
      setError(null);

      await quickActionsService.logMedication(supabase, {
        medicationName,
        dosage,
        notes,
        status,
      });
      return { success: true } as const;
    } catch (err) {
      const message = 'No pudimos confirmar el medicamento.';
      logger.error('[useMedicationLog]', err);
      setError(message);
      return { success: false, error: message } as const;
    } finally {
      setLoading(false);
    }
  };

  return { confirmMedication, loading, error };
}

export function useSymptomReport() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportSymptom = async (data: {
    symptomName: string;
    severity: number;
    description?: string;
    duration?: string;
    frequency?: string;
    triggers?: string;
    isUrgent?: boolean;
    bodyLocation?: string;
  }) => {
    if (!supabase) return { success: false, error: SESSION_UNAVAILABLE_MESSAGE } as const;
    try {
      setLoading(true);
      setError(null);

      await quickActionsService.reportSymptom(supabase, {
        symptomName: data.symptomName,
        severity: data.severity,
        description: data.description,
        duration: data.duration,
        frequency: data.frequency,
        triggers: data.triggers,
        isUrgent: data.isUrgent,
        bodyLocation: data.bodyLocation,
      });
      return { success: true } as const;
    } catch (err) {
      const message = 'No pudimos guardar el síntoma.';
      logger.error('[useSymptomReport]', err);
      setError(message);
      return { success: false, error: message } as const;
    } finally {
      setLoading(false);
    }
  };

  return { reportSymptom, loading, error };
}

export function useLabResults() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadLabResult = async (data: {
    testType: string;
    testDate: string;
    laboratoryName?: string;
    fileUrl?: string;
    fileType?: string;
    notes?: string;
  }) => {
    if (!supabase) return { success: false, error: SESSION_UNAVAILABLE_MESSAGE } as const;
    try {
      setLoading(true);
      setError(null);

      await quickActionsService.uploadLabResult(supabase, {
        testType: data.testType,
        testDate: data.testDate,
        laboratoryName: data.laboratoryName,
        fileUrl: data.fileUrl,
        fileType: data.fileType,
        notes: data.notes,
      });
      return { success: true } as const;
    } catch (err) {
      const message = 'No pudimos guardar el resultado.';
      logger.error('[useLabResults]', err);
      setError(message);
      return { success: false, error: message } as const;
    } finally {
      setLoading(false);
    }
  };

  return { uploadLabResult, loading, error };
}

export function useCommunityPost() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPost = async (data: {
    groupId: string;
    title: string;
    content: string;
    isAnonymous?: boolean;
    tags?: string[];
  }) => {
    if (!supabase) return { success: false, error: SESSION_UNAVAILABLE_MESSAGE } as const;
    try {
      setLoading(true);
      setError(null);

      await quickActionsService.createCommunityPost(supabase, {
        groupId: data.groupId,
        title: data.title,
        content: data.content,
        isAnonymous: data.isAnonymous,
        tags: data.tags,
      });
      return { success: true } as const;
    } catch (err) {
      const message = 'No pudimos crear la publicación.';
      logger.error('[useCommunityPost]', err);
      setError(message);
      return { success: false, error: message } as const;
    } finally {
      setLoading(false);
    }
  };

  return { createPost, loading, error };
}
