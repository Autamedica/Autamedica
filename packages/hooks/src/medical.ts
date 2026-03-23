"use client";

import { useState, useEffect, useCallback } from "react";
// Duck-typed interface to avoid SupabaseClient<Database, ...> assignment incompatibility
// caused by 'protected' members in class-based structural typing checks
interface SupabaseLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>;
  };
}
type AnySupabaseClient = SupabaseLike;
import type { Patient, Appointment, AppointmentWithDetails } from "@autamedica/types";
import { logger } from '@autamedica/shared';

/**
 * Hook para obtener pacientes del doctor actual
 * Requiere cliente de Supabase con sesión activa.
 * Retorna pacientes visibles según las RLS policies (care team del doctor).
 */
export function usePatients(supabaseClient?: AnySupabaseClient | null) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = useCallback(async () => {
    if (!supabaseClient) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Verificar sesión antes de hacer el query
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError || !sessionData.session) {
        setError('Sesión no válida. Por favor, inicia sesión de nuevo.');
        setLoading(false);
        return;
      }

      // Join con profiles para obtener nombre, email, teléfono
      // RLS filtra automáticamente: doctors ven solo pacientes de su care team
      const { data, error: fetchError } = await supabaseClient
        .from('patients')
        .select(`
          id,
          user_id,
          dni,
          birth_date,
          gender,
          blood_type,
          active,
          created_at,
          updated_at,
          profile:profiles!inner(
            first_name,
            last_name,
            email,
            phone,
            avatar_url
          )
        `)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (fetchError) {
        logger.error('Supabase query error:', fetchError.message, fetchError.code);
        throw new Error(
          fetchError.code === '42501'
            ? 'Sin permisos para ver pacientes. Verifica tu rol de doctor.'
            : fetchError.message
        );
      }

      // Mapear datos joinados a la interfaz Patient (camelCase, flat)
      const mapped: Patient[] = (data || []).map((row: Record<string, unknown>) => {
        const profile = row.profile as Record<string, unknown> | null;
        return {
          id: row.id as string,
          userId: row.user_id as string,
          firstName: (profile?.first_name as string) || '',
          lastName: (profile?.last_name as string) || '',
          email: (profile?.email as string) || '',
          phone: (profile?.phone as string) || undefined,
          dateOfBirth: (row.birth_date as string) || undefined,
          gender: row.gender as Patient['gender'],
          status: row.active ? 'active' : 'inactive',
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
        };
      });

      setPatients(mapped);
    } catch (err) {
      logger.error('Error fetching patients:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar pacientes');
    } finally {
      setLoading(false);
    }
  }, [supabaseClient]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  return {
    patients,
    loading,
    error,
    refetch: fetchPatients
  };
}

/**
 * Hook para obtener citas del doctor actual
 * Requiere cliente de Supabase con sesión activa
 */
export function useAppointments(supabaseClient?: AnySupabaseClient | null, doctorId?: string) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    if (!supabaseClient) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = supabaseClient
        .from('appointments')
        .select('*')
        .is('deleted_at', null)
        .order('start_time', { ascending: true });

      // Filtrar por doctor si se proporciona ID
      if (doctorId) {
        query = query.eq('doctor_id', doctorId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setAppointments(data || []);
    } catch (err) {
      logger.error('Error fetching appointments:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar citas');
    } finally {
      setLoading(false);
    }
  }, [supabaseClient, doctorId]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  return {
    appointments,
    loading,
    error,
    refetch: fetchAppointments
  };
}

/**
 * Hook para obtener citas con detalles de paciente y doctor
 * Realiza join con tablas relacionadas
 */
export function useAppointmentsWithDetails(supabaseClient?: AnySupabaseClient | null, doctorId?: string) {
  const [appointments, setAppointments] = useState<AppointmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    if (!supabaseClient) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = supabaseClient
        .from('appointments')
        .select(`
          *,
          patient:patients(id, user_id, dni),
          doctor:doctors(id, specialty, license_number)
        `)
        .is('deleted_at', null)
        .order('start_time', { ascending: true });

      // Filtrar por doctor si se proporciona ID
      if (doctorId) {
        query = query.eq('doctor_id', doctorId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setAppointments(data || []);
    } catch (err) {
      logger.error('Error fetching appointments with details:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar citas');
    } finally {
      setLoading(false);
    }
  }, [supabaseClient, doctorId]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  return {
    appointments,
    loading,
    error,
    refetch: fetchAppointments
  };
}