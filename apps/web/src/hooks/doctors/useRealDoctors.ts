'use client';

import { createBrowserClient } from '@autamedica/auth/client';
import { logger } from '@autamedica/shared';
import type { DoctorWithProfile } from '@autamedica/types';
import { useCallback, useEffect, useState } from 'react';

// ─── useCurrentDoctor ────────────────────────────────────────────────────────
// Usa createBrowserClient directamente — selectActive() usa process.env que no
// existe en browser/Cloudflare Workers context.

interface UseCurrentDoctorResult {
  doctor: DoctorWithProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCurrentDoctor(userId?: string): UseCurrentDoctorResult {
  const [doctor, setDoctor] = useState<DoctorWithProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  const fetchCurrentDoctor = useCallback(async () => {
    if (!userId || !isClient) {
      setLoading(false);
      return;
    }

    const supabase = createBrowserClient();

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('doctors')
        .select(`
          id,
          user_id,
          specialty,
          subspecialty,
          years_experience,
          consultation_fee,
          bio,
          languages,
          active,
          created_at,
          updated_at,
          profile:profiles!inner(
            user_id,
            email,
            first_name,
            last_name,
            role
          )
        `)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle();

      if (fetchError) throw fetchError;

      setDoctor(data as unknown as DoctorWithProfile);
    } catch (err) {
      logger.error('Error fetching current doctor:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar doctor');
    } finally {
      setLoading(false);
    }
  }, [userId, isClient]);

  useEffect(() => {
    fetchCurrentDoctor();
  }, [fetchCurrentDoctor]);

  return { doctor, loading, error, refetch: fetchCurrentDoctor };
}

// ─── useRealDoctors ──────────────────────────────────────────────────────────

interface UseDoctorsResult {
  doctors: DoctorWithProfile[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRealDoctors(): UseDoctorsResult {
  const [doctors, setDoctors] = useState<DoctorWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  const fetchDoctors = useCallback(async () => {
    if (!isClient) {
      setLoading(false);
      return;
    }

    const supabase = createBrowserClient();

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('doctors')
        .select(`
          id,
          user_id,
          specialty,
          subspecialty,
          years_experience,
          consultation_fee,
          bio,
          languages,
          active,
          created_at,
          updated_at,
          profile:profiles!inner(
            user_id,
            email,
            first_name,
            last_name,
            role
          )
        `)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setDoctors((data ?? []) as unknown as DoctorWithProfile[]);
    } catch (err) {
      logger.error('Error fetching doctors:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar doctores');
    } finally {
      setLoading(false);
    }
  }, [isClient]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  return { doctors, loading, error, refetch: fetchDoctors };
}

// ─── useDoctorsBySpecialty ────────────────────────────────────────────────────

interface UseDoctorsBySpecialtyResult {
  doctors: DoctorWithProfile[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDoctorsBySpecialty(specialty: string): UseDoctorsBySpecialtyResult {
  const [doctors, setDoctors] = useState<DoctorWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  const fetchDoctorsBySpecialty = useCallback(async () => {
    if (!specialty || !isClient) {
      setLoading(false);
      return;
    }

    const supabase = createBrowserClient();

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('doctors')
        .select(`
          id,
          user_id,
          specialty,
          subspecialty,
          years_experience,
          consultation_fee,
          bio,
          languages,
          active,
          created_at,
          updated_at,
          profile:profiles!inner(
            user_id,
            email,
            first_name,
            last_name,
            role
          )
        `)
        .eq('specialty', specialty)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setDoctors((data ?? []) as unknown as DoctorWithProfile[]);
    } catch (err) {
      logger.error('Error fetching doctors by specialty:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar doctores');
    } finally {
      setLoading(false);
    }
  }, [specialty, isClient]);

  useEffect(() => {
    fetchDoctorsBySpecialty();
  }, [fetchDoctorsBySpecialty]);

  return { doctors, loading, error, refetch: fetchDoctorsBySpecialty };
}
