import { useSupabase } from '@autamedica/auth/react';
import { logger } from '@autamedica/shared';
import type {
  DoctorId,
  ISODateString,
  PhoneE164,
  ReproductiveHealthSpecialistId,
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
  const supabase = useSupabase();
  const [specialists, setSpecialists] = useState<ReproductiveHealthSpecialistWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSpecialists = useCallback(async () => {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    try {
      setIsLoading(true);
      setError(null);

      // Build query
      let query = supabase
        .from('reproductive_health_specialists')
        .select(`
          *,
          doctor:doctors!inner (
            id,
            first_name,
            last_name,
            email,
            phone,
            profile_image_url
          )
        `);

      // Apply filters
      if (options.specialty) {
        query = query.eq('specialty', options.specialty);
      }

      if (options.availableOnly) {
        query = query.eq('availability_status', 'available');
      }

      if (options.certifiedOnly) {
        query = query.eq('is_certified_ive_ile', true);
      }

      // Order by rating and consultations
      query = query.order('rating', { ascending: false });
      query = query.order('total_consultations', { ascending: false });

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Transform data to match interface
      const transformedData: ReproductiveHealthSpecialistWithProfile[] = (data || []).map((item: unknown) => {
        const record = item as Record<string, unknown> & {
          id: string;
          doctor_id: string;
          specialty: ReproductiveHealthSpecialtyType;
          is_certified_ive_ile: boolean;
          availability_status: SpecialistAvailabilityStatus;
          accepts_emergency_consultations: boolean;
          rating: number | null;
          total_consultations: number;
          years_of_experience: number;
          languages?: string[] | null;
          bio?: string | null;
          created_at: string;
          updated_at: string;
          doctor?: Record<string, string>;
        };
        const doc = record.doctor;
        return {
          id: record.id as unknown as ReproductiveHealthSpecialistId,
          doctor_id: record.doctor_id as unknown as DoctorId,
          specialty: record.specialty,
          is_certified_ive_ile: record.is_certified_ive_ile,
          availability_status: record.availability_status,
          accepts_emergency_consultations: record.accepts_emergency_consultations,
          rating: record.rating ?? 0,
          total_consultations: record.total_consultations,
          years_of_experience: record.years_of_experience,
          languages: record.languages || ['es'],
          bio: record.bio || '',
          created_at: record.created_at as ISODateString,
          updated_at: record.updated_at as ISODateString,
          first_name: doc?.first_name || '',
          last_name: doc?.last_name || '',
          email: doc?.email || '',
          phone: doc?.phone as unknown as PhoneE164 | undefined,
          profile_image_url: doc?.profile_image_url
        };
      });

      setSpecialists(transformedData);
    } catch (err) {
      logger.error('Error fetching reproductive health specialists:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, options.specialty, options.availableOnly, options.certifiedOnly]);

  useEffect(() => {
    fetchSpecialists();
  }, [fetchSpecialists]);

  return {
    specialists,
    isLoading,
    error,
    refetch: fetchSpecialists
  };
}

// Hook específico para obtener un especialista por ID
export function useSpecialistById(specialistId: string | null) {
  const supabase = useSupabase();
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
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      try {
        setIsLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('reproductive_health_specialists')
          .select(`
            *,
            doctor:doctors!inner (
              id,
              first_name,
              last_name,
              email,
              phone,
              profile_image_url
            )
          `)
          .eq('id', specialistId)
          .single();

        if (fetchError) throw fetchError;

        if (data) {
          const doc = (data as unknown as { doctor?: Record<string, string> }).doctor;
          const transformedData: ReproductiveHealthSpecialistWithProfile = {
            id: data.id as unknown as ReproductiveHealthSpecialistId,
            doctor_id: data.doctor_id as unknown as DoctorId,
            specialty: data.specialty,
            is_certified_ive_ile: data.is_certified_ive_ile,
            availability_status: data.availability_status,
            accepts_emergency_consultations: data.accepts_emergency_consultations,
            rating: data.rating ?? 0,
            total_consultations: data.total_consultations,
            years_of_experience: data.years_of_experience,
            languages: data.languages || ['es'],
            bio: data.bio || '',
            created_at: data.created_at as ISODateString,
            updated_at: data.updated_at as ISODateString,
            first_name: doc?.first_name || '',
            last_name: doc?.last_name || '',
            email: doc?.email || '',
            phone: doc?.phone as unknown as PhoneE164 | undefined,
            profile_image_url: doc?.profile_image_url
          };

          setSpecialist(transformedData);
        }
      } catch (err) {
        logger.error('Error fetching specialist:', err);
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSpecialist();
  }, [supabase, specialistId]);

  return { specialist, isLoading, error };
}

// Hook para actualizar estado de disponibilidad (solo para médicos)
export function useUpdateSpecialistAvailability() {
  const supabase = useSupabase();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateAvailability = useCallback(async (
    specialistId: string,
    status: SpecialistAvailabilityStatus
  ) => {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    try {
      setIsUpdating(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('reproductive_health_specialists')
        .update({
          availability_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', specialistId);

      if (updateError) throw updateError;

      return { success: true };
    } catch (err) {
      logger.error('Error updating availability:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return { success: false, error: err };
    } finally {
      setIsUpdating(false);
    }
  }, [supabase]);

  return {
    updateAvailability,
    isUpdating,
    error
  };
}
