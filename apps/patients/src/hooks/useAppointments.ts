/**
 * Hook para gestión de citas médicas del paciente
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSupabase } from '@autamedica/auth/react';
import { logger } from '@autamedica/shared';
import type {
  AppointmentWithDoctor,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from '@/types/appointment';
import { usePatientSession } from '@/hooks/usePatientSession';

interface UseAppointmentsResult {
  appointments: AppointmentWithDoctor[];
  loading: boolean;
  error: string | null;
  createAppointment: (_data: CreateAppointmentInput) => Promise<AppointmentWithDoctor | null>;
  updateAppointment: (_id: string, _data: UpdateAppointmentInput) => Promise<AppointmentWithDoctor | null>;
  cancelAppointment: (_id: string) => Promise<boolean>;
  refreshAppointments: () => Promise<void>;
}

export function useAppointments(): UseAppointmentsResult {
  const supabase = useSupabase();
  const { user, patient, loading: sessionLoading, error: sessionError } = usePatientSession();
  const [appointments, setAppointments] = useState<AppointmentWithDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parseErrorResponse = useCallback(async (response: Response, fallback: string) => {
    const payload = await response.json().catch(() => null) as { error?: string; details?: string } | null;
    return payload?.details || payload?.error || fallback;
  }, []);

  const getAuthHeaders = useCallback(async () => {
    const headers: HeadersInit = {};

    if (!supabase) {
      return headers;
    }

    const { data, error: authError } = await supabase.auth.getSession();

    if (authError) {
      logger.warn('[useAppointments] Failed to resolve auth session for API request', authError);
      return headers;
    }

    const accessToken = data.session?.access_token;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return headers;
  }, [supabase]);

  /**
   * Obtener todas las citas del paciente
   */
  const refreshAppointments = useCallback(async () => {
    if (sessionLoading) {
      return;
    }

    if (sessionError) {
      setAppointments([]);
      setError(sessionError);
      setLoading(false);
      return;
    }

    if (!user) {
      setAppointments([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (!patient) {
      setAppointments([]);
      setError('No pudimos vincular tu perfil de paciente. Recarga la página.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/appointments', {
        headers: await getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Error al cargar las citas'));
      }

      const result = await response.json();

      if (result.success) {
        setAppointments(result.data || []);
      } else {
        throw new Error(result.error || 'Error desconocido');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar las citas';
      setError(message);
      logger.error(`[useAppointments] Error: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, parseErrorResponse, patient, sessionError, sessionLoading, user]);

  /**
   * Crear una nueva cita
   */
  const createAppointment = useCallback(async (
    data: CreateAppointmentInput
  ): Promise<AppointmentWithDoctor | null> => {
    if (sessionLoading) {
      return null;
    }

    if (sessionError) {
      setError(sessionError);
      return null;
    }

    if (!user || !patient) {
      setError('Tu sesión aún no está lista para agendar una cita.');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Error al crear la cita'));
      }

      const result = await response.json();

      if (result.success && result.data) {
        // Agregar la nueva cita al estado
        setAppointments(prev => [result.data, ...prev]);
        return result.data;
      }

      throw new Error('Error al crear la cita');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear la cita';
      setError(message);
      logger.error(`[useAppointments] Create error: ${message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, parseErrorResponse, patient, sessionError, sessionLoading, user]);

  /**
   * Actualizar una cita existente
   */
  const updateAppointment = useCallback(async (
    id: string,
    data: UpdateAppointmentInput
  ): Promise<AppointmentWithDoctor | null> => {
    if (sessionLoading) {
      return null;
    }

    if (sessionError) {
      setError(sessionError);
      return null;
    }

    if (!user || !patient) {
      setError('Tu sesión aún no está lista para actualizar la cita.');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Error al actualizar la cita'));
      }

      const result = await response.json();

      if (result.success && result.data) {
        // Actualizar la cita en el estado
        setAppointments(prev =>
          prev.map(apt => (apt.id === id ? result.data : apt))
        );
        return result.data;
      }

      throw new Error('Error al actualizar la cita');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar la cita';
      setError(message);
      logger.error(`[useAppointments] Update error: ${message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, parseErrorResponse, patient, sessionError, sessionLoading, user]);

  /**
   * Cancelar una cita
   */
  const cancelAppointment = useCallback(async (id: string): Promise<boolean> => {
    if (sessionLoading) {
      return false;
    }

    if (sessionError) {
      setError(sessionError);
      return false;
    }

    if (!user || !patient) {
      setError('Tu sesión aún no está lista para cancelar la cita.');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/appointments/${id}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Error al cancelar la cita'));
      }

      const result = await response.json();

      if (result.success) {
        // Actualizar estado local
        setAppointments(prev =>
          prev.map(apt =>
            apt.id === id ? { ...apt, status: 'cancelled' as const } : apt
          )
        );
        return true;
      }

      throw new Error('Error al cancelar la cita');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cancelar la cita';
      setError(message);
      logger.error(`[useAppointments] Cancel error: ${message}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, parseErrorResponse, patient, sessionError, sessionLoading, user]);

  // Cargar citas al montar el componente
  useEffect(() => {
    refreshAppointments();
  }, [refreshAppointments]);

  return {
    appointments,
    loading,
    error,
    createAppointment,
    updateAppointment,
    cancelAppointment,
    refreshAppointments,
  };
}
