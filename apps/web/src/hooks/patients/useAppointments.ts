'use client';

import { useState, useCallback, useEffect } from 'react';
import { logger } from '@autamedica/shared';
import { fetchApi } from '@/lib/api-client';
import type {
  AppointmentWithDoctor,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from '@/lib/patients/types/appointment';

interface UseAppointmentsResult {
  appointments: AppointmentWithDoctor[];
  loading: boolean;
  error: string | null;
  createAppointment: (data: CreateAppointmentInput) => Promise<AppointmentWithDoctor | null>;
  updateAppointment: (id: string, data: UpdateAppointmentInput) => Promise<AppointmentWithDoctor | null>;
  cancelAppointment: (id: string) => Promise<boolean>;
  refreshAppointments: () => Promise<void>;
}

export function useAppointments(): UseAppointmentsResult {
  const [appointments, setAppointments] = useState<AppointmentWithDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<AppointmentWithDoctor[]>('/api/patients/appointments');
      setAppointments(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las citas');
      logger.error('[useAppointments] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createAppointment = useCallback(async (
    data: CreateAppointmentInput
  ): Promise<AppointmentWithDoctor | null> => {
    setLoading(true);
    setError(null);
    try {
      const created = await fetchApi<AppointmentWithDoctor>('/api/patients/appointments', { body: data });
      setAppointments(prev => [created, ...prev]);
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la cita');
      logger.error('[useAppointments] Create error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateAppointment = useCallback(async (
    id: string,
    data: UpdateAppointmentInput
  ): Promise<AppointmentWithDoctor | null> => {
    setLoading(true);
    setError(null);
    try {
      const updated = await fetchApi<AppointmentWithDoctor>(`/api/patients/appointments/${id}`, {
        method: 'PATCH',
        body: data,
      });
      setAppointments(prev => prev.map(apt => (apt.id === id ? updated : apt)));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la cita');
      logger.error('[useAppointments] Update error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelAppointment = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await fetchApi(`/api/patients/appointments/${id}`, { method: 'DELETE' });
      setAppointments(prev =>
        prev.map(apt => apt.id === id ? { ...apt, status: 'cancelled' as const } : apt)
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cancelar la cita');
      logger.error('[useAppointments] Cancel error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

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
