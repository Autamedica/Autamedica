'use client';

import { computeAgeFromIso, normalizeGender } from '@/lib/patients/lib/demographics';
import type { PatientProfileUpdateInput } from '@/lib/patients/lib/zod/patients';
import type { ProfileUpdateInput } from '@/lib/patients/lib/zod/profiles';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAnamnesis } from './useAnamnesis';
import { useAppointments } from './useAppointments';
import { useMedicalHistory } from './useMedicalHistory';
import { usePatientScreenings } from './usePatientScreenings';
import { usePatientReports } from './usePatientReports';
import type { UsePatientSessionResult } from './usePatientSession';
import { usePatientProfile } from './useProfile';

type FormGender = '' | 'male' | 'female' | 'other' | 'prefer_not_to_say';
type FormBloodType = '' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface PatientProfileFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: FormGender;
  bloodType: FormBloodType;
  heightCm: string;
  weightKg: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  emergencyContactEmail: string;
}

export interface MissingProfileField {
  id: string;
  label: string;
  reason: string;
}

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

const EMPTY_FORM: PatientProfileFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  birthDate: '',
  gender: '',
  bloodType: '',
  heightCm: '',
  weightKg: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactPhone: '',
  emergencyContactEmail: '',
};

function asText(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

function asMetric(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  if (!fullName) {
    return { firstName: '', lastName: '' };
  }

  const tokens = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (tokens.length === 1) {
    return { firstName: tokens[0] ?? '', lastName: '' };
  }

  return {
    firstName: tokens.slice(0, -1).join(' '),
    lastName: tokens.slice(-1).join(' '),
  };
}

function buildFormState(input: {
  email?: string | null;
  accountFullName?: string | null;
  anamnesisBirthDate?: string | null;
  profile?: {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  } | null;
  patient?: {
    birthDate?: string | null;
    gender?: string | null;
    bloodType?: string | null;
    heightCm?: number | null;
    weightKg?: number | null;
    emergencyContact?: {
      name?: string | null;
      relationship?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
  } | null;
}): PatientProfileFormState {
  const emergency = input.patient?.emergencyContact ?? null;
  const derivedName = splitFullName(input.accountFullName);
  const firstName = asText(input.profile?.firstName) || derivedName.firstName;
  const lastName = asText(input.profile?.lastName) || derivedName.lastName;
  const birthDate = asText(input.patient?.birthDate) || asText(input.anamnesisBirthDate);

  return {
    firstName,
    lastName,
    email: asText(input.email ?? input.profile?.email),
    phone: asText(input.profile?.phone),
    birthDate,
    gender:
      input.patient?.gender === 'male' ||
      input.patient?.gender === 'female' ||
      input.patient?.gender === 'other' ||
      input.patient?.gender === 'prefer_not_to_say'
        ? input.patient.gender
        : '',
    bloodType:
      input.patient?.bloodType === 'A+' ||
      input.patient?.bloodType === 'A-' ||
      input.patient?.bloodType === 'B+' ||
      input.patient?.bloodType === 'B-' ||
      input.patient?.bloodType === 'AB+' ||
      input.patient?.bloodType === 'AB-' ||
      input.patient?.bloodType === 'O+' ||
      input.patient?.bloodType === 'O-'
        ? input.patient.bloodType
        : '',
    heightCm: asMetric(input.patient?.heightCm),
    weightKg: asMetric(input.patient?.weightKg),
    emergencyContactName: asText(emergency?.name),
    emergencyContactRelationship: asText(emergency?.relationship),
    emergencyContactPhone: asText(emergency?.phone),
    emergencyContactEmail: asText(emergency?.email),
  };
}

function toNullableString(value: string): string | null | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeBmi(heightCm: string, weightKg: string): number | null {
  const height = toNullableNumber(heightCm);
  const weight = toNullableNumber(weightKg);

  if (!height || !weight || height <= 0) {
    return null;
  }

  const bmi = weight / Math.pow(height / 100, 2);
  if (!Number.isFinite(bmi)) {
    return null;
  }

  return Number(bmi.toFixed(1));
}

function getGenderLabel(value: PatientProfileFormState['gender']): string {
  switch (value) {
    case 'male':
      return 'Masculino';
    case 'female':
      return 'Femenino';
    case 'other':
      return 'Otro';
    case 'prefer_not_to_say':
      return 'Prefiero no decirlo';
    default:
      return 'Sin especificar';
  }
}

function buildMissingFields(form: PatientProfileFormState): MissingProfileField[] {
  const checks: MissingProfileField[] = [];

  if (!form.firstName.trim()) {
    checks.push({
      id: 'firstName',
      label: 'Nombre',
      reason: 'se usa para identificarte en turnos, reportes y teleconsultas',
    });
  }

  if (!form.lastName.trim()) {
    checks.push({
      id: 'lastName',
      label: 'Apellido',
      reason: 'evita ambiguedades en agenda, historia y documentación clínica',
    });
  }

  if (!form.phone.trim()) {
    checks.push({
      id: 'phone',
      label: 'Teléfono',
      reason: 'se reutiliza en confirmaciones y contacto asistencial',
    });
  }

  if (!form.birthDate.trim()) {
    checks.push({
      id: 'birthDate',
      label: 'Fecha de nacimiento',
      reason: 'alimenta edad clínica y recomendaciones preventivas',
    });
  }

  if (!form.gender.trim()) {
    checks.push({
      id: 'gender',
      label: 'Género',
      reason: 'mejora la personalización de screenings y contexto médico',
    });
  }

  if (!form.bloodType.trim()) {
    checks.push({
      id: 'bloodType',
      label: 'Grupo sanguíneo',
      reason: 'aporta contexto clínico rápido en urgencias y consultas',
    });
  }

  if (!form.emergencyContactPhone.trim()) {
    checks.push({
      id: 'emergencyContactPhone',
      label: 'Teléfono de emergencia',
      reason: 'es el dato crítico si hay que escalar un contacto urgente',
    });
  }

  return checks;
}

function buildProfileCompletion(form: PatientProfileFormState): number {
  const checks = [
    form.firstName.trim().length > 0,
    form.lastName.trim().length > 0,
    form.email.trim().length > 0,
    form.phone.trim().length > 0,
    form.birthDate.trim().length > 0,
    form.gender.trim().length > 0,
    form.bloodType.trim().length > 0,
    form.emergencyContactPhone.trim().length > 0,
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

function buildPayload(form: PatientProfileFormState): {
  profile: ProfileUpdateInput;
  patient: PatientProfileUpdateInput;
} {
  return {
    profile: {
      firstName: toNullableString(form.firstName),
      lastName: toNullableString(form.lastName),
      phone: toNullableString(form.phone),
    },
    patient: {
      birthDate: form.birthDate.trim() ? form.birthDate.trim() : null,
      gender: form.gender || null,
      bloodType: form.bloodType || null,
      heightCm: toNullableNumber(form.heightCm),
      weightKg: toNullableNumber(form.weightKg),
      emergencyContact: {
        name: toNullableString(form.emergencyContactName) ?? null,
        relationship: toNullableString(form.emergencyContactRelationship) ?? null,
        phone: toNullableString(form.emergencyContactPhone) ?? null,
        email: toNullableString(form.emergencyContactEmail) ?? null,
      },
    },
  };
}

function formatSectionName(sectionId: string): string {
  return sectionId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function extractAnamnesisBirthDate(
  sections: ReturnType<typeof useAnamnesis>['sections'],
): string | null {
  const ageSection = sections.find((section) => section.section === 'edad');
  const rawValue = ageSection?.data?.['fecha_nacimiento'];
  return typeof rawValue === 'string' && rawValue.trim().length > 0 ? rawValue : null;
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
          new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime(),
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
        scheduledAt: inProgress.scheduled_at,
        status: inProgress.status,
      };
    }

    const now = Date.now();
    const nextScheduled = appointments.appointments
      .filter((item) => item.status === 'scheduled' || item.status === 'confirmed')
      .filter((item) => new Date(item.scheduled_at).getTime() >= now)
      .sort(
        (left, right) =>
          new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime(),
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
      scheduledAt: nextScheduled.scheduled_at,
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
