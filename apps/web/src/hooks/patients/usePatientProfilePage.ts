'use client';

import { computeAgeFromIso, normalizeGender } from '@/lib/patients/lib/demographics';
import {
  buildFormState,
  buildMissingFields,
  buildPayload,
  buildProfileCompletion,
  computeBmi,
  EMPTY_FORM,
  extractAnamnesisBirthDate,
  formatSectionName,
  getGenderLabel,
  toNullableNumber,
} from '@/lib/patients/services/profile-form';
import type {
  MissingProfileField,
  PatientProfileFormState,
} from '@/lib/patients/services/profile-form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAnamnesis } from './useAnamnesis';
import { useAppointments } from './useAppointments';
import { useMedicalHistory } from './useMedicalHistory';
import { usePatientScreenings } from './usePatientScreenings';
import { usePatientReports } from './usePatientReports';
import type { UsePatientSessionResult } from './usePatientSession';
import { usePatientProfile } from './useProfile';

export type { PatientProfileFormState, MissingProfileField };

export interface UsePatientProfilePageReturn {
  form: PatientProfileFormState;
  setField: <K extends keyof PatientProfileFormState>(
    field: K,
    value: PatientProfileFormState[K],
  ) => void;
  resetForm: () => void;
  saveProfile: () => Promise<boolean>;
  isSaving: boolean;
  secondaryError: string | null;
  saveError: string | null;
  saveSuccess: boolean;
  displayName: string;
  profileCompletion: number;
  age: number | null;
  bmi: number | null;
  genderLabel: string;
  lastUpdatedAt: string | null;
  missingFields: MissingProfileField[];
  anamnesisCompletion: number;
  pendingAnamnesisSections: string[];
  medicalSummary: ReturnType<typeof useMedicalHistory>['summary'];
  medicalHistoryLoading: boolean;
  appointmentsLoading: boolean;
  upcomingAppointment: {
    id: string;
    doctorName: string;
    specialty: string | null;
    scheduledAt: string;
    status: string;
  } | null;
  appointmentsCount: number;
  completedConsultations: number;
  reportsLoading: boolean;
  reportsCount: number;
  aiGeneratedReportsCount: number;
  latestReport: {
    id: string;
    title: string;
    doctorName: string | null;
    dateRecorded: string | null;
    type: string;
  } | null;
  screeningsStats: ReturnType<typeof usePatientScreenings>['stats'];
  screeningsHighlights: string[];
}

export function usePatientProfilePage(
  session: Pick<
    UsePatientSessionResult,
    'user' | 'profile' | 'patient' | 'error' | 'refresh'
  >,
): UsePatientProfilePageReturn {
  const { user, profile, patient, error, refresh } = session;
  const {
    isSaving,
    error: mutationError,
    success,
    updateProfile,
    resetStatus,
  } = usePatientProfile(user?.id ?? null);
  const medicalHistory = useMedicalHistory(patient?.id);
  const anamnesis = useAnamnesis();
  const appointments = useAppointments();
  const reports = usePatientReports();
  const patientAge = computeAgeFromIso(patient?.birthDate ?? null);
  const normalizedGender = normalizeGender(patient?.gender ?? null);
  const screenings = usePatientScreenings(patientAge ?? 52, normalizedGender ?? 'male');
  const accountFullName =
    user?.user_metadata && typeof user.user_metadata === 'object'
      ? typeof user.user_metadata['full_name'] === 'string'
        ? user.user_metadata['full_name']
        : null
      : null;
  const anamnesisBirthDate = useMemo(
    () => extractAnamnesisBirthDate(anamnesis.sections),
    [anamnesis.sections],
  );

  const [form, setForm] = useState<PatientProfileFormState>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setForm(
      buildFormState({
        email: user?.email ?? profile?.email ?? null,
        accountFullName,
        anamnesisBirthDate,
        profile,
        patient,
      }),
    );
    setSaveError(null);
  }, [accountFullName, anamnesisBirthDate, patient, profile, user?.email]);

  const setField = useCallback<UsePatientProfilePageReturn['setField']>((field, value) => {
    resetStatus();
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }, [resetStatus]);

  const resetForm = useCallback(() => {
    setForm(
      buildFormState({
        email: user?.email ?? profile?.email ?? null,
        accountFullName,
        anamnesisBirthDate,
        profile,
        patient,
      }),
    );
    setSaveError(null);
    resetStatus();
  }, [accountFullName, anamnesisBirthDate, patient, profile, resetStatus, user?.email]);

  const saveProfile = useCallback(async (): Promise<boolean> => {
    if (!user) {
      setSaveError('Necesitás iniciar sesión para editar tu perfil.');
      return false;
    }

    if (form.phone.trim() && form.phone.trim().length < 6) {
      setSaveError('El teléfono debe tener al menos 6 caracteres.');
      return false;
    }

    if (form.emergencyContactEmail.trim()) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(form.emergencyContactEmail.trim())) {
        setSaveError('El email del contacto de emergencia no es válido.');
        return false;
      }
    }

    const heightCm = toNullableNumber(form.heightCm);
    const weightKg = toNullableNumber(form.weightKg);

    if (form.heightCm.trim() && heightCm === null) {
      setSaveError('La altura debe ser un número válido.');
      return false;
    }

    if (form.weightKg.trim() && weightKg === null) {
      setSaveError('El peso debe ser un número válido.');
      return false;
    }

    if (heightCm !== null && (!Number.isInteger(heightCm) || heightCm <= 0)) {
      setSaveError('La altura debe ser un entero positivo en centímetros.');
      return false;
    }

    if (weightKg !== null && weightKg <= 0) {
      setSaveError('El peso debe ser un número positivo.');
      return false;
    }

    setSaveError(null);

    const result = await updateProfile(buildPayload(form));
    if (!result) {
      return false;
    }

    await refresh();
    return true;
  }, [form, refresh, updateProfile, user]);

  const displayName = useMemo(() => {
    const fullName = [form.firstName, form.lastName]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' ');

    if (fullName) return fullName;
    if (user?.user_metadata && typeof user.user_metadata === 'object') {
      const fullNameFromMetadata =
        typeof user.user_metadata['full_name'] === 'string'
          ? user.user_metadata['full_name']
          : null;
      if (fullNameFromMetadata) {
        return fullNameFromMetadata;
      }
    }

    return user?.email?.split('@')[0] ?? 'Paciente';
  }, [form.firstName, form.lastName, user?.email, user?.user_metadata]);

  const profileCompletion = useMemo(() => buildProfileCompletion(form), [form]);
  const missingFields = useMemo(() => buildMissingFields(form), [form]);
  const bmi = useMemo(() => computeBmi(form.heightCm, form.weightKg), [form.heightCm, form.weightKg]);
  const genderLabel = useMemo(() => getGenderLabel(form.gender), [form.gender]);
  const anamnesisCompletion = anamnesis.progress?.completion_percentage ?? 0;
  const pendingAnamnesisSections = anamnesis.progress?.pending_sections ?? [];
  const upcomingAppointment = useMemo(() => {
    if (appointments.appointments.length === 0) {
      return null;
    }

    const inProgress = appointments.appointments
      .filter((item) => item.status === 'in_progress')
      .sort(
        (left, right) =>
          new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
      )[0];

    if (inProgress) {
      return {
        id: inProgress.id,
        doctorName:
          inProgress.doctor
            ? `Dr. ${[inProgress.doctor.first_name, inProgress.doctor.last_name]
                .filter(Boolean)
                .join(' ')
                .trim() || 'Tu médico'}`
            : 'Consulta en curso',
        specialty: inProgress.doctor?.specialty ?? null,
        scheduledAt: inProgress.start_time,
        status: inProgress.status,
      };
    }

    const now = Date.now();
    const nextScheduled = appointments.appointments
      .filter((item) => item.status === 'scheduled' || item.status === 'confirmed')
      .filter((item) => new Date(item.start_time).getTime() >= now)
      .sort(
        (left, right) =>
          new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
      )[0];

    if (!nextScheduled) {
      return null;
    }

    return {
      id: nextScheduled.id,
      doctorName:
        nextScheduled.doctor
          ? `Dr. ${[nextScheduled.doctor.first_name, nextScheduled.doctor.last_name]
              .filter(Boolean)
              .join(' ')
              .trim() || 'Tu médico'}`
          : 'Consulta programada',
      specialty: nextScheduled.doctor?.specialty ?? null,
      scheduledAt: nextScheduled.start_time,
      status: nextScheduled.status,
    };
  }, [appointments.appointments]);
  const appointmentsCount = useMemo(
    () =>
      appointments.appointments.filter(
        (item) => item.status === 'scheduled' || item.status === 'confirmed',
      ).length,
    [appointments.appointments],
  );
  const completedConsultations = useMemo(
    () => appointments.appointments.filter((item) => item.status === 'completed').length,
    [appointments.appointments],
  );
  const latestReport = useMemo(() => {
    if (reports.reports.length === 0) {
      return null;
    }

    return [...reports.reports].sort((left, right) => {
      const leftDate = left.dateRecorded ? new Date(left.dateRecorded).getTime() : 0;
      const rightDate = right.dateRecorded ? new Date(right.dateRecorded).getTime() : 0;
      return rightDate - leftDate;
    })[0] ?? null;
  }, [reports.reports]);
  const aiGeneratedReportsCount = useMemo(
    () => reports.reports.filter((report) => report.aiGenerated).length,
    [reports.reports],
  );
  const screeningsStats = useMemo(
    () => ({
      ...screenings.stats,
      completionRate: Number.isFinite(screenings.stats.completionRate)
        ? screenings.stats.completionRate
        : 0,
    }),
    [screenings.stats],
  );
  const screeningsHighlights = useMemo(() => {
    const highlights: string[] = [];

    if (screeningsStats.overdue > 0) {
      highlights.push(`${screeningsStats.overdue} screening${screeningsStats.overdue > 1 ? 's' : ''} atrasado${screeningsStats.overdue > 1 ? 's' : ''}`);
    }

    if (screeningsStats.dueSoon > 0) {
      highlights.push(`${screeningsStats.dueSoon} control${screeningsStats.dueSoon > 1 ? 'es' : ''} por coordinar`);
    }

    if (screeningsStats.upToDate > 0) {
      highlights.push(`${screeningsStats.upToDate} control${screeningsStats.upToDate > 1 ? 'es' : ''} al día`);
    }

    return highlights.length > 0 ? highlights : ['Sin recomendaciones preventivas activas todavía'];
  }, [screeningsStats.dueSoon, screeningsStats.overdue, screeningsStats.upToDate]);

  const secondaryError =
    error ||
    (anamnesis.error && anamnesis.error !== 'unauthorized' ? anamnesis.error : null) ||
    medicalHistory.error ||
    appointments.error ||
    reports.error;

  return {
    form,
    setField,
    resetForm,
    saveProfile,
    isSaving,
    secondaryError,
    saveError: saveError ?? mutationError,
    saveSuccess: success,
    displayName,
    profileCompletion,
    age: computeAgeFromIso(form.birthDate),
    bmi,
    genderLabel,
    lastUpdatedAt: patient?.updatedAt ?? profile?.updatedAt ?? null,
    missingFields,
    anamnesisCompletion,
    pendingAnamnesisSections: pendingAnamnesisSections.map(formatSectionName),
    medicalSummary: medicalHistory.summary,
    medicalHistoryLoading: medicalHistory.loading,
    appointmentsLoading: appointments.loading,
    upcomingAppointment,
    appointmentsCount,
    completedConsultations,
    reportsLoading: reports.loading,
    reportsCount: reports.reports.length,
    aiGeneratedReportsCount,
    latestReport,
    screeningsStats,
    screeningsHighlights,
  };
}
