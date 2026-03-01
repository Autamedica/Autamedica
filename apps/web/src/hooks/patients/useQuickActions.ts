'use client';

import { useState } from 'react';
import { useSupabase } from '@autamedica/auth/react';

interface AuthenticatedPatientContext {
  userId: string;
  patientId: string;
}

async function resolveAuthenticatedPatientContext(
  supabase: ReturnType<typeof useSupabase>,
): Promise<AuthenticatedPatientContext> {
  if (!supabase) throw new Error('Supabase client not available');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('No autenticado');
  }

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (patientError) {
    throw patientError;
  }

  if (!patient?.id) {
    throw new Error('Perfil de paciente no encontrado');
  }

  return {
    userId: user.id,
    patientId: patient.id,
  };
}

export function useVitalSigns() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordBloodPressure = async (systolic: number, diastolic: number, notes?: string) => {
    if (!supabase) return { success: false, error: 'Supabase no disponible' } as const;
    try {
      setLoading(true);
      setError(null);

      const { userId, patientId } = await resolveAuthenticatedPatientContext(supabase);

      const { error: insertError } = await supabase
        .from('vital_signs')
        .insert({
          patient_id: patientId,
          recorded_by_id: userId,
          type: 'blood_pressure',
          blood_pressure_systolic: systolic,
          blood_pressure_diastolic: diastolic,
          unit: 'mmHg',
          notes,
          measurement_context: 'patient_self_report',
          measured_at: new Date().toISOString(),
          recorded_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;
      return { success: true } as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al registrar presión arterial';
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
    if (!supabase) return { success: false, error: 'Supabase no disponible' } as const;
    try {
      setLoading(true);
      setError(null);

      const { userId, patientId } = await resolveAuthenticatedPatientContext(supabase);

      const { error: insertError } = await supabase
        .from('medication_logs')
        .insert({
          patient_id: patientId,
          logged_by_id: userId,
          medication_name: medicationName,
          dosage,
          notes,
          status,
          taken_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;
      return { success: true } as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al confirmar medicamento';
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
    if (!supabase) return { success: false, error: 'Supabase no disponible' } as const;
    try {
      setLoading(true);
      setError(null);

      const { userId, patientId } = await resolveAuthenticatedPatientContext(supabase);

      const { error: insertError } = await supabase
        .from('symptom_reports')
        .insert({
          patient_id: patientId,
          reported_by_id: userId,
          symptom_name: data.symptomName,
          severity: data.severity,
          description: data.description,
          duration: data.duration,
          frequency: data.frequency,
          triggers: data.triggers,
          is_urgent: data.isUrgent ?? false,
          body_location: data.bodyLocation,
          reported_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;
      return { success: true } as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reportar síntoma';
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
    if (!supabase) return { success: false, error: 'Supabase no disponible' } as const;
    try {
      setLoading(true);
      setError(null);

      const { userId, patientId } = await resolveAuthenticatedPatientContext(supabase);

      const { error: insertError } = await supabase
        .from('lab_results')
        .insert({
          patient_id: patientId,
          uploaded_by_id: userId,
          test_type: data.testType,
          test_date: data.testDate,
          laboratory_name: data.laboratoryName,
          file_url: data.fileUrl,
          file_type: data.fileType,
          notes: data.notes,
          status: 'pending',
        });

      if (insertError) throw insertError;
      return { success: true } as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al subir resultado';
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
    if (!supabase) return { success: false, error: 'Supabase no disponible' } as const;
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const { data: membership } = await supabase
        .from('group_memberships')
        .select('id')
        .eq('group_id', data.groupId)
        .eq('patient_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (!membership) {
        await supabase
          .from('group_memberships')
          .insert({
            group_id: data.groupId,
            patient_id: user.id,
            role: 'member',
            status: 'active',
          });
      }

      const { error: insertError } = await supabase
        .from('community_posts')
        .insert({
          group_id: data.groupId,
          author_id: user.id,
          title: data.title,
          content: data.content,
          is_anonymous: data.isAnonymous ?? false,
          tags: data.tags ?? [],
          moderation_status: 'approved',
        });

      if (insertError) throw insertError;
      return { success: true } as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear publicación';
      setError(message);
      return { success: false, error: message } as const;
    } finally {
      setLoading(false);
    }
  };

  return { createPost, loading, error };
}
