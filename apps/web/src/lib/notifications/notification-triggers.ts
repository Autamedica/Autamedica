import type { Database } from '@autamedica/types';
import { domainEvents, logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { resolvePublicSupabaseEnv, resolveServiceRoleKey } from '@/lib/runtime-env';
import { followupScheduleService } from '@/lib/calls/services/followup-schedule.service';

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

async function resolvePatientUser(patientId: string | null): Promise<string | null> {
  if (!patientId) return null;
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

async function resolvePatientDisplayName(patientId: string | null): Promise<string> {
  if (!patientId) return 'Paciente';
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

async function resolveActiveDoctorUsersForPatient(patientId: string | null): Promise<string[]> {
  if (!patientId) return [];
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

  domainEvents.on('appointment.cancelled', async ({ appointmentId, cancelledBy, reason }) => {
    const admin = getAdminClient();
    const { data: appointment, error } = await admin
      .from('appointments')
      .select('doctor_id, patient_id, start_time')
      .eq('id', appointmentId)
      .maybeSingle();

    if (error) {
      logger.error('[notificationTriggers] appointment.cancelled lookup failed', error);
      return;
    }

    if (!appointment?.doctor_id) {
      return;
    }

    const [doctorUserId, patientUserId, patientName] = await Promise.all([
      resolveDoctorUser(appointment.doctor_id),
      resolvePatientUser(appointment.patient_id ?? null),
      resolvePatientDisplayName(appointment.patient_id ?? null),
    ]);

    const slot = appointment.start_time ? formatAppointmentDate(appointment.start_time) : 'horario previsto';
    const motive = reason?.trim() ? ` Motivo: ${reason.trim()}.` : '';
    const baseContext = {
      appointmentId,
      doctorId: appointment.doctor_id,
      patientId: appointment.patient_id ?? null,
      cancelledBy,
      reason: reason ?? null,
    };

    const notifications: Promise<void>[] = [];

    if (doctorUserId) {
      const doctorBody = cancelledBy === 'patient'
        ? `${patientName} cancelo la cita de ${slot}.${motive}`
        : `Se cancelo la cita con ${patientName} de ${slot}.${motive}`;

      notifications.push(
        insertPortalNotification({
          userId: doctorUserId,
          audience: 'doctor',
          category: 'appointment',
          type: 'event_appointment_cancelled',
          title: 'Cita cancelada',
          body: doctorBody,
          actionUrl: '/doctors/agenda',
          actionLabel: 'Ver agenda',
          priority: 'high',
          dedupeKey: `event:appointment.cancelled:${appointmentId}:doctor`,
          contextData: baseContext,
        }),
      );
    }

    if (patientUserId) {
      const patientBody = cancelledBy === 'doctor'
        ? `Tu medico cancelo la cita de ${slot}.${motive}`
        : `Tu cita de ${slot} fue cancelada.${motive}`;

      notifications.push(
        insertPortalNotification({
          userId: patientUserId,
          audience: 'patient',
          category: 'appointment',
          type: 'event_appointment_cancelled',
          title: 'Cita cancelada',
          body: patientBody,
          actionUrl: '/patients/appointments',
          actionLabel: 'Ver turnos',
          priority: 'high',
          dedupeKey: `event:appointment.cancelled:${appointmentId}:patient`,
          contextData: baseContext,
        }),
      );
    }

    await Promise.all(notifications);
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

  domainEvents.on(
    'call.started',
    async ({ callId, roomId, doctorId, patientId }: { callId: string; roomId: string; doctorId: string; patientId: string | null }) => {
      logger.info('[notificationTriggers] Received call.started domain event', { callId, roomId, doctorId, patientId });
      try {
        const patientUserId = await resolvePatientUser(patientId);
        if (!patientUserId) {
          logger.warn('[notificationTriggers] call.started: no patient user to notify', { callId, patientId });
          return;
        }

        const [doctorUser, appointment] = await Promise.all([
          getAdminClient().from('doctors').select('user_id').eq('id', doctorId).maybeSingle(),
          getAdminClient().from('calls').select('appointment_id').eq('id', callId).maybeSingle(),
        ]);

        let doctorDisplay = 'su medico';
        let doctorAvatarUrl: string | undefined;
        if (doctorUser.data?.user_id) {
          const { data: profile } = await getAdminClient()
            .from('profiles')
            .select('first_name, last_name, avatar_url')
            .eq('user_id', doctorUser.data.user_id)
            .maybeSingle();
          const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
          if (fullName) {
            doctorDisplay = `Dr. ${fullName}`;
          }
          doctorAvatarUrl = profile?.avatar_url ?? undefined;
          if (doctorAvatarUrl?.includes('supabase.co/storage/v1/object/public')) {
            // Transform original large PNG (~1.9MB) to an ultra-lightweight ~15KB WebP thumbnail
            doctorAvatarUrl = `${doctorAvatarUrl}?width=192&height=192&resize=cover&quality=80`;
          }
        }

        const { publicSupabaseUrl } = resolvePublicSupabaseEnv();
        const serviceRoleKey = resolveServiceRoleKey();

        if (!publicSupabaseUrl || !serviceRoleKey) {
          logger.warn('[notificationTriggers] call.started: missing SUPABASE_URL/SERVICE_ROLE_KEY, skipping push', { callId });
          return;
        }

        const pushRes = await fetch(`${publicSupabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            userId: patientUserId,
title: `${doctorDisplay} te está llamando`,
            body: 'Videollamada para tu consulta',
            data: {
              type: 'CALL_STARTED',
              call_id: callId,
              room_id: roomId,
              appointment_id: appointment.data?.appointment_id ?? '',
              doctor_id: doctorId,
              doctor_name: doctorDisplay,
              doctor_avatar_url: doctorAvatarUrl ?? '',
            },
          }),
        });

        if (!pushRes.ok) {
          const errBody = await pushRes.text().catch(() => '');
          logger.error('[notificationTriggers] call.started push failed', { callId, status: pushRes.status, body: errBody });
        }

        await insertPortalNotification({
          userId: patientUserId,
          audience: 'patient',
          category: 'appointment',
          type: 'event_call_started',
title: `${doctorDisplay} te está llamando`,
          body: 'Videollamada para tu consulta',
          actionUrl: '/patients/videoconsulta',
          actionLabel: 'Atender llamada',
          priority: 'urgent',
          dedupeKey: `event:call.started:${callId}`,
          contextData: { callId, roomId, doctorId, patientId },
        });
      } catch (err) {
        logger.error('[notificationTriggers] call.started handler failed', { callId, error: err instanceof Error ? err.message : err });
      }
    },
  );

  domainEvents.on('call.ended', async ({ callId, roomId, durationSeconds }) => {
    logger.info('[notificationTriggers] Received call.ended domain event', { callId, roomId, durationSeconds });
    try {
      const admin = getAdminClient();
      await followupScheduleService.schedule48hFollowup(admin, { callId });
    } catch (err) {
      logger.error('[notificationTriggers] Failed to schedule 48h followup on call.ended', { callId, error: err });
    }
  });
}

registerNotificationTriggers();

export const notificationTriggers = {
  initialized: true,
};
