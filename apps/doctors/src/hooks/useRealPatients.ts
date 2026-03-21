'use client';

import { getSupabaseClient } from '@autamedica/auth/client';
import { logger, toCamel } from '@autamedica/shared';
import { PatientWithProfile } from '@autamedica/types';
import { useCallback, useEffect, useState } from 'react';

// Tipo UI (camelCase) para Patient
interface UiPatient {
  id: string;
  userId: string;
  dni: string | null;
  birthDate: string | null;
  gender: string | null;
  bloodType: string | null;
  heightCm: number | null;
  weightKg: number | null;
  emergencyContact: Record<string, unknown> | null;
  medicalHistory: Record<string, unknown> | null;
  allergies: Record<string, unknown> | null;
  medications: Record<string, unknown> | null;
  insuranceInfo: Record<string, unknown> | null;
  companyId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  profile?: {
    userId: string;
    email: string | null;
    role: string | null;
  };
}

interface UsePatientsResult {
  patients: PatientWithProfile[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRealPatients(): UsePatientsResult {
  const [patients, setPatients] = useState<PatientWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseClient();
      const { data, error: dbError } = await supabase
        .from('patients')
        .select('*, profile:profiles!inner(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (dbError) throw dbError;

      const rows = (toCamel(data ?? []) as unknown as UiPatient[]).filter(p => p.active);
      setPatients(rows as unknown as PatientWithProfile[]);
    } catch (err) {
      logger.error('Error fetching patients:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  return { patients, loading, error, refetch: fetchPatients };
}

interface UseCurrentPatientResult {
  patient: PatientWithProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCurrentPatient(userId?: string): UseCurrentPatientResult {
  const [patient, setPatient] = useState<PatientWithProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentPatient = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseClient();
      const { data, error: dbError } = await supabase
        .from('patients')
        .select('*, profile:profiles!inner(*)')
        .is('deleted_at', null)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle();

      if (dbError) throw dbError;

      setPatient(data ? (toCamel(data) as unknown as PatientWithProfile) : null);
    } catch (err) {
      logger.error('Error fetching current patient:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchCurrentPatient();
  }, [fetchCurrentPatient]);

  return { patient, loading, error, refetch: fetchCurrentPatient };
}

interface UseDoctorPatientsResult {
  patients: PatientWithProfile[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDoctorPatients(doctorUserId?: string): UseDoctorPatientsResult {
  const [patients, setPatients] = useState<PatientWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDoctorPatients = useCallback(async () => {
    if (!doctorUserId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseClient();

      // Get the doctor record for this user
      const { data: doctorData, error: docErr } = await supabase
        .from('doctors')
        .select('id')
        .eq('user_id', doctorUserId)
        .eq('active', true)
        .maybeSingle();

      if (docErr) throw docErr;
      if (!doctorData) throw new Error('Doctor not found');

      // Get active care-team assignments for this doctor
      const { data: careTeamData, error: ctErr } = await supabase
        .from('patient_care_team')
        .select('patient_id')
        .eq('doctor_id', doctorData.id)
        .eq('active', true);

      if (ctErr) throw ctErr;

      const patientIds = (careTeamData ?? []).map((r) => r.patient_id).filter((id): id is string => id !== null);
      if (patientIds.length === 0) {
        setPatients([]);
        return;
      }

      const { data: patientsData, error: pErr } = await supabase
        .from('patients')
        .select('*, profile:profiles!inner(*)')
        .in('id', patientIds)
        .eq('active', true)
        .is('deleted_at', null);

      if (pErr) throw pErr;

      setPatients((toCamel(patientsData ?? []) as unknown as PatientWithProfile[]));
    } catch (err) {
      logger.error('Error fetching doctor patients:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [doctorUserId]);

  useEffect(() => {
    void fetchDoctorPatients();
  }, [fetchDoctorPatients]);

  return { patients, loading, error, refetch: fetchDoctorPatients };
}

interface UsePatientsByCompanyResult {
  patients: PatientWithProfile[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePatientsByCompany(companyId?: string): UsePatientsByCompanyResult {
  const [patients, setPatients] = useState<PatientWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPatientsByCompany = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseClient();
      const { data, error: dbError } = await supabase
        .from('patients')
        .select('*, profile:profiles!inner(*)')
        .eq('company_id', companyId)
        .eq('active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (dbError) throw dbError;

      setPatients(toCamel(data ?? []) as unknown as PatientWithProfile[]);
    } catch (err) {
      logger.error('Error fetching patients by company:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void fetchPatientsByCompany();
  }, [fetchPatientsByCompany]);

  return { patients, loading, error, refetch: fetchPatientsByCompany };
}
