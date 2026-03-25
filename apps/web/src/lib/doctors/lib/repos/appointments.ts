/**
 * Repository: appointments table access for doctor-facing browser hooks.
 * Uses getBrowserSupabaseClient() — este repo se ejecuta SIEMPRE en browser.
 * No delegar a @autamedica/shared (usa process.env → undefined en browser).
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser';
import { toCamel, toSnake, logger } from '@autamedica/shared';
import type { Tables, TablesInsert, TablesUpdate } from '@autamedica/types';

export type Appointment = Tables<'appointments'>;
export type NewAppointment = TablesInsert<'appointments'>;
export type PatchAppointment = TablesUpdate<'appointments'>;

export interface UiAppointment {
  id: string;
  patientId: string;
  doctorId: string;
  startTime: string;
  durationMinutes: number;
  status: string;
  type: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export async function listAppointments(): Promise<UiAppointment[]> {
  const { data, error } = await getBrowserSupabaseClient()
    .from('appointments')
    .select('*')
    .order('start_time', { ascending: true });

  if (error) {
    logger.error('[appointments repo] listAppointments failed', error);
    throw error;
  }

  return toCamel<UiAppointment[]>(data ?? []);
}

export async function getAppointment(id: string): Promise<UiAppointment | null> {
  const { data, error } = await getBrowserSupabaseClient()
    .from('appointments')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('[appointments repo] getAppointment failed', error);
    return null;
  }

  return data ? toCamel<UiAppointment>(data) : null;
}

export async function createAppointment(input: NewAppointment): Promise<UiAppointment> {
  if (typeof input.duration_minutes === 'string') {
    throw new Error('duration_minutes must be a number, not a string');
  }

  const { data, error } = await getBrowserSupabaseClient()
    .from('appointments')
    .insert(toSnake(input as unknown as Record<string, unknown>) as never)
    .select()
    .single();

  if (error) {
    logger.error('[appointments repo] createAppointment failed', error);
    throw error;
  }

  return toCamel<UiAppointment>(data);
}

export async function updateAppointment(id: string, patch: PatchAppointment): Promise<UiAppointment> {
  if (patch.duration_minutes !== undefined && typeof patch.duration_minutes === 'string') {
    throw new Error('duration_minutes must be a number, not a string');
  }

  const { data, error } = await getBrowserSupabaseClient()
    .from('appointments')
    .update(toSnake(patch as unknown as Record<string, unknown>) as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error('[appointments repo] updateAppointment failed', error);
    throw error;
  }

  return toCamel<UiAppointment>(data);
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await getBrowserSupabaseClient()
    .from('appointments')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id);

  if (error) {
    logger.error('[appointments repo] deleteAppointment failed', error);
    throw error;
  }
}
