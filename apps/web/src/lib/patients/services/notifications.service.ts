import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import { appointmentsUseCase } from '@/lib/patients/usecases/appointments.usecase';
import { createAppointmentAdapter } from '@/lib/patients/lib/repos/appointments.adapter';
import { createCommunityAdapter } from '@/lib/patients/lib/repos/community.adapter';
import { createMedicalHistoryAdapter } from '@/lib/patients/lib/repos/medical-history.adapter';
import { createNotificationsAdapter } from '@/lib/patients/lib/repos/notifications.adapter';
import type {
  PortalNotificationCandidate,
  PortalNotificationFeed,
} from '@/lib/patients/types/notifications';
import type { MedicalRecord } from '@/lib/patients/lib/repos/medical-history.adapter';

type Db = SupabaseClient<Database>;

interface NotificationContext {
  userId: string;
  patientId: string;
}

function formatDoctorName(input: {
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined): string {
  const fullName = [input?.first_name, input?.last_name].filter(Boolean).join(' ').trim();
  return fullName.length > 0 ? `Dr. ${fullName}` : 'tu medico';
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

function buildAppointmentCandidates(
  appointments: Awaited<ReturnType<typeof appointmentsUseCase.listByPatient>>,
): PortalNotificationCandidate[] {
  const now = Date.now();
  const reminderWindowMs = 36 * 60 * 60 * 1000;

  return appointments.flatMap((appointment): PortalNotificationCandidate[] => {
    const doctorName = formatDoctorName(appointment.doctor);
    const scheduledAtMs = new Date(appointment.scheduled_at).getTime();
    const startsSoon = scheduledAtMs > now && scheduledAtMs - now <= reminderWindowMs;

    if (appointment.status === 'in_progress') {
      return [{
        category: 'appointment',
        type: 'appointment_live',
        title: 'Tu consulta ya esta lista',
        body: `${doctorName} ya puede atenderte.`,
        actionUrl: '/patients/appointments',
        actionLabel: 'Entrar',
        priority: 'urgent',
        dedupeKey: `appointment:live:${appointment.id}`,
        contextData: {
          appointmentId: appointment.id,
          doctorId: appointment.doctor_id,
          scheduledAt: appointment.scheduled_at,
        },
        createdAt: appointment.updated_at ?? appointment.scheduled_at,
      }];
    }

    if (!startsSoon || (appointment.status !== 'scheduled' && appointment.status !== 'confirmed')) {
      return [];
    }

    return [{
      category: 'appointment',
      type: 'appointment_upcoming',
      title: 'Tenes un turno proximo',
      body: `${doctorName} - ${formatAppointmentDate(appointment.scheduled_at)}`,
      actionUrl: '/patients/appointments',
      actionLabel: 'Ver turno',
      priority: 'high',
      dedupeKey: `appointment:upcoming:${appointment.id}`,
      contextData: {
        appointmentId: appointment.id,
        doctorId: appointment.doctor_id,
        scheduledAt: appointment.scheduled_at,
        status: appointment.status,
      },
      createdAt: appointment.scheduled_at,
    }];
  });
}

function buildReportCandidates(
  records: MedicalRecord[],
): PortalNotificationCandidate[] {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return records
    .filter((record) => new Date(record.created_at).getTime() >= cutoff)
    .slice(0, 6)
    .map((record) => ({
      category: 'report' as const,
      type: 'report_ready',
      title: 'Ya tenes un nuevo informe',
      body: record.title || 'Tu ultimo informe ya esta disponible.',
      actionUrl: '/patients/reports',
      actionLabel: 'Ver informes',
      priority: 'normal' as const,
      dedupeKey: `report:ready:${record.id}`,
      contextData: {
        reportId: record.id,
        reportType: record.type,
      },
      createdAt: record.created_at,
    }));
}

function buildCommunityCandidates(
  comments: Array<{
    id: string;
    post_id: string;
    post_title: string | null;
    author_role: 'patient' | 'doctor';
    author_display_name: string | null;
    doctor_specialty: string | null;
    content: string;
    created_at: string;
  }>,
): PortalNotificationCandidate[] {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return comments
    .filter((comment) => new Date(comment.created_at).getTime() >= cutoff)
    .map((comment) => {
      const authorName = comment.author_display_name?.trim() || (comment.author_role === 'doctor' ? 'Un medico' : 'Alguien');
      const postLabel = comment.post_title?.trim() || 'tu publicacion';

      return {
        category: 'community' as const,
        type: comment.author_role === 'doctor' ? 'community_doctor_reply' : 'community_comment',
        title: comment.author_role === 'doctor' ? 'Un medico respondio en comunidad' : 'Hay una nueva respuesta en comunidad',
        body: `${authorName} comento en ${postLabel}.`,
        actionUrl: '/patients/community',
        actionLabel: 'Abrir comunidad',
        priority: comment.author_role === 'doctor' ? ('high' as const) : ('normal' as const),
        dedupeKey: `community:comment:${comment.id}`,
        contextData: {
          commentId: comment.id,
          postId: comment.post_id,
          postTitle: comment.post_title,
          authorRole: comment.author_role,
          doctorSpecialty: comment.doctor_specialty,
          preview: comment.content.slice(0, 180),
        },
        createdAt: comment.created_at,
      };
    });
}

export const notificationsService = {
  async syncPatientNotifications(
    supabase: Db,
    context: NotificationContext,
  ): Promise<void> {
    const communityRepo = createCommunityAdapter(supabase);
    const medicalHistoryRepo = createMedicalHistoryAdapter(supabase);
    const notificationsRepo = createNotificationsAdapter(supabase);

    const [appointments, reports, comments] = await Promise.all([
      appointmentsUseCase.listByPatient({ appointmentsRepo: createAppointmentAdapter(supabase), dbClient: supabase }, context.patientId),
      medicalHistoryRepo.listConsultations(context.patientId, 8),
      communityRepo.listRecentCommentsOnPatientPosts(context.patientId, 12),
    ]);

    const candidates = [
      ...buildAppointmentCandidates(appointments),
      ...buildReportCandidates(reports),
      ...buildCommunityCandidates(comments),
    ]
      .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime())
      .slice(0, 24);

    await notificationsRepo.insertMissing(context.userId, candidates);
  },

  async getPatientFeed(
    supabase: Db,
    context: NotificationContext,
  ): Promise<PortalNotificationFeed> {
    try {
      await this.syncPatientNotifications(supabase, context);
    } catch (error) {
      logger.warn('[notificationsService] syncPatientNotifications degraded', error);
    }

    const notificationsRepo = createNotificationsAdapter(supabase);
    const [notifications, unreadCount] = await Promise.all([
      notificationsRepo.listByUser(context.userId, 24),
      notificationsRepo.countUnread(context.userId),
    ]);

    return {
      unreadCount,
      notifications,
    };
  },

  async markRead(
    supabase: Db,
    context: NotificationContext,
    notificationId: string,
  ): Promise<void> {
    if (!notificationId.trim()) {
      throw Object.assign(new Error('La notificacion es obligatoria'), { code: 'VALIDATION' });
    }

    const notificationsRepo = createNotificationsAdapter(supabase);
    await notificationsRepo.markRead(context.userId, notificationId);
  },

  async markAllRead(
    supabase: Db,
    context: NotificationContext,
  ): Promise<void> {
    const notificationsRepo = createNotificationsAdapter(supabase);
    await notificationsRepo.markAllRead(context.userId);
  },
};
