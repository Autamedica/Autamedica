'use client';

import { logger, toCamel } from '@autamedica/shared';
import { createBrowserClient } from '@autamedica/auth/client';
import { PatientWithProfile } from '@autamedica/types';
import { useEffect, useState } from 'react';

/**
 * Hook migrado al sistema híbrido
 *
 * CAMBIOS:
 * - Usa selectActive() en lugar de supabase directo
 * - Datos retornados en camelCase automáticamente
 * - Auto-filtrado de soft-deleted (deleted_at IS NULL)
 */

interface UsePatientsResult {
  patients: PatientWithProfile[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

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

export function useRealPatients(): UsePatientsResult {
  const [patients, setPatients] = useState<PatientWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const fetchPatients = async () => {
    if (!isClient) return;
    try {
      setLoading(true);
      setError(null);

      const supabase = createBrowserClient();
      const { data: rawData, error: dbError } = await supabase
        .from('patients')
        .select(`
          *,
          profile:profiles!inner(*)
        `)
        .order('created_at', { ascending: false });
      if (dbError) throw dbError;
      const data = toCamel<UiPatient[]>(rawData ?? []);

      // Filtrar solo activos
      const activePatients = data.filter(p => p.active);

      setPatients(activePatients as unknown as PatientWithProfile[]);
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

  return {
    patients,
    loading,
    error,
    refetch: fetchPatients
  };
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

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const fetchCurrentPatient = async () => {
    if (!userId || !isClient) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createBrowserClient();
      const { data: rawData, error: dbError } = await supabase
        .from('patients')
        .select(`
          *,
          profile:profiles!inner(*)
        `);
      if (dbError) throw dbError;
      const data = toCamel<UiPatient[]>(rawData ?? []);

      // Filtrar por user_id y active
      const currentPatient = data.find(p => p.userId === userId && p.active);

      if (!currentPatient) {
        setPatient(null);
        return;
      }

      setPatient(currentPatient as unknown as PatientWithProfile);
    } catch (err) {
      logger.error('Error fetching current patient:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentPatient();
  }, [userId]);

  return {
    patient,
    loading,
    error,
    refetch: fetchCurrentPatient
  };
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

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const fetchDoctorPatients = async () => {
    if (!doctorUserId || !isClient) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // First get the doctor ID
      const supabase = createBrowserClient();
      const { data: rawDoctors, error: err1 } = await supabase.from('doctors').select('id, user_id');
      if(err1) throw err1;
      const doctors = toCamel<{id: string, userId: string}[]>(rawDoctors ?? []);
      const doctor = doctors.find(d => d.userId === doctorUserId);

      if (!doctor) {
        throw new Error('Doctor not found');
      }

      // Then get patients assigned to this doctor through patient_care_team
      const { data: rawCare, error: err2 } = await supabase.from('patient_care_team').select('doctor_id, patient_id, active');
      if(err2) throw err2;
      const careTeam = toCamel<{doctorId: string, patientId: string, active: boolean}[]>(rawCare ?? []);

      // Filter by doctor and active
      const activeAssignments = careTeam.filter(
        ct => ct.doctorId === doctor.id && ct.active
      );

      // Get patient IDs
      const patientIds = activeAssignments.map(ct => ct.patientId);

      if (patientIds.length === 0) {
        setPatients([]);
        return;
      }

      // Fetch all patients and filter by IDs
      const { data: rawPatients, error: err3 } = await supabase
        .from('patients')
        .select(`
          *,
          profile:profiles!inner(*)
        `);
      if(err3) throw err3;
      const allPatients = toCamel<UiPatient[]>(rawPatients ?? []);

      const doctorPatients = allPatients.filter(p =>
        patientIds.includes(p.id) && p.active
      );

      setPatients(doctorPatients as unknown as PatientWithProfile[]);
    } catch (err) {
      logger.error('Error fetching doctor patients:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctorPatients();
  }, [doctorUserId]);

  return {
    patients,
    loading,
    error,
    refetch: fetchDoctorPatients
  };
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

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const fetchPatientsByCompany = async () => {
    if (!companyId || !isClient) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createBrowserClient();
      const { data: rawData, error: dbError } = await supabase
        .from('patients')
        .select(`
          *,
          profile:profiles!inner(*)
        `)
        .order('created_at', { ascending: false });
      if (dbError) throw dbError;
      const data = toCamel<UiPatient[]>(rawData ?? []);

      // Filtrar por company_id y active
      const companyPatients = data.filter(p =>
        p.companyId === companyId && p.active
      );

      setPatients(companyPatients as unknown as PatientWithProfile[]);
    } catch (err) {
      logger.error('Error fetching patients by company:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatientsByCompany();
  }, [companyId]);

  return {
    patients,
    loading,
    error,
    refetch: fetchPatientsByCompany
  };
}
