import type { Database } from '@autamedica/types';
import { domainEvents, logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';

type TriggerAudience = 'doctor' | 'patient';
type TriggerCategory = 'appointment' | 'report' | 'community' | 'system';

type NotificationInput = {
  userId: string;
  audience: TriggerAudience;
  category: TriggerCategory;
  type: string;
  title: string;
  body: string;
  dedupeKey: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  contextData?: Record<string, unknown>;
  createdAt?: string;
};

type GlobalTriggerState = typeof globalThis & {
  __autamedicaNotificationTriggersInitialized__?: boolean;
};

const globalTriggerState = globalThis as GlobalTriggerState;

function getAdminClient() {
  return createAstroAdminClient();
}

async function insertPortalNotification(input: NotificationInput): Promise<void> {
  const admin = getAdminClient();
  const { data: existing, error: existingError } = await admin
    .from('portal_notifications')
    .select('id')
    .eq('user_id', input.userId)
    .eq('audience', input.audience)
    .eq('dedupe_key', input.dedupeKey)
    .maybeSingle();

  if (existingError) {
    logger.error('[notificationTriggers] dedupe lookup failed', existingError);
    throw existingError;
  }

  if (existing) {
    return;
  }

  const row: Database['public']['Tables']['portal_notifications']['Insert'] = {
    user_id: input.userId,
    audience: input.audience,
    category: input.category,
    type: input.type,
    title: input.title,
    body: input.body,
    action_url: input.actionUrl ?? null,
    action_label: input.actionLabel ?? null,
    priority: input.priority ?? 'normal',
    dedupe_key: input.dedupeKey,
    context_data:
      (input.contextData ?? {}) as Database['public']['Tables']['portal_notifications']['Insert']['context_data'],
    created_at: input.createdAt ?? new Date().toISOString(),
  };

  const { error } = await admin.from('portal_notifications').insert(row);

  if (error) {
    logger.error('[notificationTriggers] insert failed', error);
    throw error;
  }
}

async function resolvePatientUser(patientId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .maybeSingle();

  if (error) {
    logger.error('[notificationTriggers] resolvePatientUser failed', error);
    return null;
  }

  return data?.user_id ?? null;
}

async function resolveDoctorUser(doctorId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('doctors')
    .select('user_id')
    .eq('id', doctorId)
    .maybeSingle();

  if (error) {
    logger.error('[notificationTriggers] resolveDoctorUser failed', error);
    return null;
  }

  return data?.user_id ?? null;
}

async function resolvePatientDisplayName(patientId: string): Promise<string> {
  const admin = getAdminClient();
  const { data: patient, error: patientError } = await admin
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .maybeSingle();

  if (patientError || !patient?.user_id) {
    if (patientError) {
      logger.warn('[notificationTriggers] resolvePatientDisplayName patient lookup degraded', patientError);
    }
    return 'Paciente';
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', patient.user_id)
    .maybeSingle();

  if (profileError) {
    logger.warn('[notificationTriggers] resolvePatientDisplayName profile lookup degraded', profileError);
    return 'Paciente';
  }

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  return fullName || 'Paciente';
}

async function resolveActiveDoctorUsersForPatient(patientId: string): Promise<string[]> {
  const admin = getAdminClient();

  const { data: careTeam, error: careTeamError } = await admin
    .from('patient_care_team')
    .select('doctor_id')
    .eq('patient_id', patientId)
    .eq('active', true);

  if (careTeamError) {
    logger.warn('[notificationTriggers] care team lookup degraded', careTeamError);
  }

  let doctorIds = (careTeam ?? [])
    .map((row) => row.doctor_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (doctorIds.length === 0) {
    const { data: appointments, error: appointmentsError } = await admin
      .from('appointments')
      .select('doctor_id')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('start_time', { ascending: false })
      .limit(3);

    if (appointmentsError) {
      logger.warn('[notificationTriggers] fallback doctor lookup degraded', appointmentsError);
    } else {
      doctorIds = (appointments ?? [])
        .map((row) => row.doctor_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
    }
  }

  const uniqueDoctorIds = [...new Set(doctorIds)];
  if (uniqueDoctorIds.length === 0) {
    return [];
  }

  const { data: doctors, error: doctorsError } = await admin
    .from('doctors')
    .select('id, user_id')
    .in('id', uniqueDoctorIds);

  if (doctorsError) {
    logger.warn('[notificationTriggers] doctor user resolution degraded', doctorsError);
    return [];
  }

  return [...new Set((doctors ?? []).map((row) => row.user_id).filter((value): value is string => Boolean(value)))];
}

function formatAppointmentDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function registerNotificationTriggers() {
  if (globalTriggerState.__autamedicaNotificationTriggersInitialized__) {
    return;
  }

  globalTriggerState.__autamedicaNotificationTriggersInitialized__ = true;
  logger.info('[notificationTriggers] Registering domain event listeners');

  domainEvents.on('appointment.scheduled', async ({ appointmentId, doctorId, patientId, startTime }) => {
    const [doctorUserId, patientName] = await Promise.all([
      resolveDoctorUser(doctorId),
      resolvePatientDisplayName(patientId),
    ]);

    if (!doctorUserId) {
      return;
    }

    await insertPortalNotification({
      userId: doctorUserId,
      audience: 'doctor',
      category: 'appointment',
      type: 'event_appointment_scheduled',
      title: 'Nueva cita agendada',
      body: `${patientName} - ${formatAppointmentDate(startTime)}`,
      actionUrl: '/doctors/agenda',
      actionLabel: 'Ver agenda',
      priority: 'high',
      dedupeKey: `event:appointment.scheduled:${appointmentId}`,
      contextData: { appointmentId, doctorId, patientId, startTime },
      createdAt: startTime,
    });
  });

  domainEvents.on('appointment.completed', async ({ appointmentId, doctorId, patientId }) => {
    const patientUserId = await resolvePatientUser(patientId);
    if (!patientUserId) {
      return;
    }

    await insertPortalNotification({
      userId: patientUserId,
      audience: 'patient',
      category: 'appointment',
      type: 'event_appointment_completed',
      title: 'Tu consulta fue completada',
      body: 'Tu atencion finalizo y el seguimiento quedo registrado en tu portal.',
      actionUrl: '/patients/appointments',
      actionLabel: 'Ver consulta',
      priority: 'normal',
      dedupeKey: `event:appointment.completed:${appointmentId}`,
      contextData: { appointmentId, doctorId, patientId },
    });
  });

  domainEvents.on('anamnesis.completed', async ({ anamnesisId, patientId }) => {
    const [doctorUserIds, patientName] = await Promise.all([
      resolveActiveDoctorUsersForPatient(patientId),
      resolvePatientDisplayName(patientId),
    ]);

    await Promise.all(
      doctorUserIds.map((doctorUserId) =>
        insertPortalNotification({
          userId: doctorUserId,
          audience: 'doctor',
          category: 'system',
          type: 'event_anamnesis_completed',
          title: 'Anamnesis completada',
          body: `${patientName} completo su anamnesis y ya podes revisarla.`,
          actionUrl: '/doctors/patients',
          actionLabel: 'Ver paciente',
          priority: 'normal',
          dedupeKey: `event:anamnesis.completed:${anamnesisId}:${doctorUserId}`,
          contextData: { anamnesisId, patientId },
        }),
      ),
    );
  });

  domainEvents.on('consultation.report_generated', async ({ consultationId, doctorId, patientId, reportUrl }) => {
    const patientUserId = await resolvePatientUser(patientId);
    if (!patientUserId) {
      return;
    }

    await insertPortalNotification({
      userId: patientUserId,
      audience: 'patient',
      category: 'report',
      type: 'event_consultation_report_generated',
      title: 'Ya tenes un nuevo informe',
      body: 'El resumen de tu consulta ya esta disponible en tu portal.',
      actionUrl: reportUrl ?? '/patients/reports',
      actionLabel: 'Ver informe',
      priority: 'normal',
      dedupeKey: `event:consultation.report_generated:${consultationId}`,
      contextData: { consultationId, doctorId, patientId, reportUrl: reportUrl ?? null },
    });
  });
}

registerNotificationTriggers();

export const notificationTriggers = {
  initialized: true,
};
