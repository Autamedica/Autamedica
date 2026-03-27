 
// @ts-nocheck
import { useSupabase } from '@autamedica/auth/react';
import { logger } from '@autamedica/shared';
import type {
  PatientScreeningInsert,
  PatientScreeningWithDetails,
  PreventiveScreening,
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
  // Screenings del paciente
  myScreenings: PatientScreeningWithDetails[];

  // Recomendaciones personalizadas
  recommendations: ScreeningRecommendation[];

  // Estados de carga
  isLoading: boolean;
  isLoadingRecommendations: boolean;
  error: string | null;

  // Acciones
  scheduleScreening: (screeningId: string, scheduledDate: Date) => Promise<{ success: boolean; error?: unknown }>;
  markAsCompleted: (patientScreeningId: string, resultSummary?: string) => Promise<{ success: boolean; error?: unknown }>;
  cancelScreening: (patientScreeningId: string) => Promise<{ success: boolean; error?: unknown }>;
  refetch: () => Promise<void>;
}

export function usePreventiveScreenings(
  options: UsePreventiveScreeningsOptions = {}
): UsePreventiveScreeningsResult {
  const supabase = useSupabase();
  const [myScreenings, setMyScreenings] = useState<PatientScreeningWithDetails[]>([]);
  const [recommendations, setRecommendations] = useState<ScreeningRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const computeAgeFromBirthDate = (birthDate?: string | null): number | null => {
    if (!birthDate) {
      return null;
    }

    const date = new Date(birthDate);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const now = new Date();
    let age = now.getFullYear() - date.getFullYear();
    const monthDiff = now.getMonth() - date.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
      age -= 1;
    }

    return age >= 0 ? age : null;
  };

  const isApplicableRecommendation = (
    screening: PreventiveScreening,
    patientAge: number | null,
    patientGender: 'male' | 'female' | null,
  ): boolean => {
    if (screening.target_gender !== 'all' && patientGender && screening.target_gender !== patientGender) {
      return false;
    }

    if (screening.min_age !== null && patientAge !== null && patientAge < screening.min_age) {
      return false;
    }

    if (screening.max_age !== null && patientAge !== null && patientAge > screening.max_age) {
      return false;
    }

    return true;
  };

  // Fetch screenings del paciente
  const fetchMyScreenings = useCallback(async () => {
    if (!options.patientId) {
      setMyScreenings([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Build query
      let query = supabase
        .from('patient_screenings')
        .select(`
          *,
          screening:preventive_screenings!inner (
            id,
            name,
            category,
            description,
            target_gender,
            min_age,
            max_age,
            recommended_frequency,
            is_mandatory,
            estimated_cost_ars,
            covered_by_public_health,
            requires_specialist,
            preparation_instructions
          )
        `)
        .eq('patient_id', options.patientId);

      // Apply filters
      if (options.status && options.status.length > 0) {
        query = query.in('status', options.status);
      }

      if (options.categoryFilter) {
        query = query.eq('screening.category', options.categoryFilter);
      }

      if (!options.includeCompleted) {
        query = query.neq('status', 'completed');
      }

      // Order by urgency
      query = query.order('next_due_date', { ascending: true, nullsFirst: false });

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Transform data
      const transformedData: PatientScreeningWithDetails[] = (data || []).map((dbItem) => {
        const item = dbItem as unknown as Record<string, unknown> & {
          id: string; patient_id: string; screening_id: string; status: string; scheduled_date?: string;
          completed_date?: string; next_due_date?: string; assigned_doctor_id?: string; notes?: string;
          result_summary?: string; created_at: string; updated_at: string; screening: PreventiveScreening;
        };
        return {
          id: item.id,
          patient_id: item.patient_id,
          screening_id: item.screening_id,
          status: item.status,
          scheduled_date: item.scheduled_date || null,
          completed_date: item.completed_date || null,
          next_due_date: item.next_due_date || null,
          assigned_doctor_id: item.assigned_doctor_id || null,
          notes: item.notes || null,
          result_summary: item.result_summary || null,
          created_at: item.created_at,
          updated_at: item.updated_at,
          screening: item.screening,
          assigned_doctor: null
        } as unknown as PatientScreeningWithDetails;
      });

      setMyScreenings(transformedData);
    } catch (err) {
      logger.error('Error fetching patient screenings:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, options.patientId, options.status, options.categoryFilter, options.includeCompleted]);

  // Fetch recommendations usando función SQL
  const fetchRecommendations = useCallback(async () => {
    if (!options.patientId) {
      setRecommendations([]);
      setIsLoadingRecommendations(false);
      return;
    }

    try {
      setIsLoadingRecommendations(true);

      const [{ data: patientData, error: patientError }, { data: screeningsCatalog, error: screeningsError }] =
        await Promise.all([
          supabase
            .from('patients')
            .select('birth_date, gender')
            .eq('id', options.patientId)
            .maybeSingle(),
          supabase
            .from('preventive_screenings')
            .select(`
              id,
              name,
              category,
              description,
              target_gender,
              min_age,
              max_age,
              recommended_frequency,
              is_mandatory,
              estimated_cost_ars,
              covered_by_public_health,
              requires_specialist,
              preparation_instructions,
              created_at,
              updated_at
            `)
        ]);

      if (patientError) throw patientError;
      if (screeningsError) throw screeningsError;

      const patientAge = computeAgeFromBirthDate(patientData?.birth_date);
      const patientGender =
        patientData?.gender === 'male' || patientData?.gender === 'female'
          ? patientData.gender
          : null;
      const existingIds = new Set(myScreenings.map((screening) => screening.screening_id));

      const transformedRecommendations: ScreeningRecommendation[] = (screeningsCatalog || [])
        .filter((screening) => !existingIds.has(screening.id))
        .filter((screening) =>
          isApplicableRecommendation(
            screening as PreventiveScreening,
            patientAge,
            patientGender,
          )
        )
        .slice(0, 8)
        .map((screening) => ({
          screening: screening as PreventiveScreening,
          is_due: true,
          urgency: screening.is_mandatory ? 'high' : 'medium',
          reason:
            screening.is_mandatory
              ? 'Control preventivo prioritario para tu perfil.'
              : 'Control preventivo sugerido según edad y contexto.',
          next_due_date: null
        }));

      setRecommendations(transformedRecommendations);
    } catch (err) {
      logger.error('Error fetching recommendations:', err);
      setRecommendations([]);
    } finally {
      setIsLoadingRecommendations(false);
    }
  }, [myScreenings, supabase, options.patientId]);

  // Schedule a screening
  const scheduleScreening = useCallback(async (
    screeningId: string,
    scheduledDate: Date
  ) => {
    if (!options.patientId) {
      return { success: false, error: 'Patient ID required' };
    }

    try {

      // Check if patient_screening already exists
      const { data: existing } = await supabase
        .from('patient_screenings')
        .select('id')
        .eq('patient_id', options.patientId)
        .eq('screening_id', screeningId)
        .single();

      if (existing) {
        // Update existing
        const { error: updateError } = await supabase
          .from('patient_screenings')
          .update({
            status: 'scheduled',
            scheduled_date: scheduledDate.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        // Create new
        const insertData: PatientScreeningInsert = {
          patient_id: options.patientId,
          screening_id: screeningId,
          status: 'scheduled',
          scheduled_date: scheduledDate.toISOString(),
          completed_date: null,
          next_due_date: null,
          assigned_doctor_id: null,
          notes: null,
          result_summary: null
        };

        const { error: insertError } = await supabase
          .from('patient_screenings')
          .insert(insertData);

        if (insertError) throw insertError;
      }

      // Refetch data
      await fetchMyScreenings();
      await fetchRecommendations();

      return { success: true };
    } catch (err) {
      logger.error('Error scheduling screening:', err);
      return { success: false, error: err };
    }
  }, [supabase, options.patientId, fetchMyScreenings, fetchRecommendations]);

  // Mark screening as completed
  const markAsCompleted = useCallback(async (
    patientScreeningId: string,
    resultSummary?: string
  ) => {
    try {

      // Get screening details to calculate next due date
      const { data: screening } = await supabase
        .from('patient_screenings')
        .select('screening:preventive_screenings!inner(recommended_frequency)')
        .eq('id', patientScreeningId)
        .single();

      const completedDate = new Date();
      let nextDueDate: Date | null = null;

      // Calculate next due date based on frequency
      if (screening?.screening?.recommended_frequency) {
        const freq = screening.screening.recommended_frequency;
        nextDueDate = new Date(completedDate);

        switch (freq) {
          case 'monthly':
            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
            break;
          case 'every_3_months':
            nextDueDate.setMonth(nextDueDate.getMonth() + 3);
            break;
          case 'every_6_months':
            nextDueDate.setMonth(nextDueDate.getMonth() + 6);
            break;
          case 'annually':
            nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
            break;
          case 'every_2_years':
            nextDueDate.setFullYear(nextDueDate.getFullYear() + 2);
            break;
          case 'every_3_years':
            nextDueDate.setFullYear(nextDueDate.getFullYear() + 3);
            break;
          case 'every_5_years':
            nextDueDate.setFullYear(nextDueDate.getFullYear() + 5);
            break;
          case 'every_10_years':
            nextDueDate.setFullYear(nextDueDate.getFullYear() + 10);
            break;
          case 'one_time':
            nextDueDate = null; // No hay próxima fecha
            break;
        }
      }

      const { error: updateError } = await supabase
        .from('patient_screenings')
        .update({
          status: 'completed',
          completed_date: completedDate.toISOString(),
          next_due_date: nextDueDate?.toISOString() || null,
          result_summary: resultSummary || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', patientScreeningId);

      if (updateError) throw updateError;

      // Refetch data
      await fetchMyScreenings();
      await fetchRecommendations();

      return { success: true };
    } catch (err) {
      logger.error('Error marking screening as completed:', err);
      return { success: false, error: err };
    }
  }, [supabase, fetchMyScreenings, fetchRecommendations]);

  // Cancel screening
  const cancelScreening = useCallback(async (patientScreeningId: string) => {
    try {

      const { error: updateError } = await supabase
        .from('patient_screenings')
        .update({
          status: 'not_started',
          scheduled_date: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', patientScreeningId);

      if (updateError) throw updateError;

      // Refetch data
      await fetchMyScreenings();
      await fetchRecommendations();

      return { success: true };
    } catch (err) {
      logger.error('Error cancelling screening:', err);
      return { success: false, error: err };
    }
  }, [supabase, fetchMyScreenings, fetchRecommendations]);

  // Refetch all data
  const refetch = useCallback(async () => {
    await Promise.all([
      fetchMyScreenings(),
      fetchRecommendations()
    ]);
  }, [fetchMyScreenings, fetchRecommendations]);

  // Initial fetch
  useEffect(() => {
    fetchMyScreenings();
  }, [fetchMyScreenings]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  return {
    myScreenings,
    recommendations,
    isLoading,
    isLoadingRecommendations,
    error,
    scheduleScreening,
    markAsCompleted,
    cancelScreening,
    refetch
  };
}
