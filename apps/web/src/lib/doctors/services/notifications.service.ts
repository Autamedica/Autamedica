import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import { createDoctorNotificationsRepository } from '@/lib/doctors/lib/repos/notifications.repo';
import type {
  DoctorPortalNotificationCandidate,
  DoctorPortalNotificationFeed,
} from '@/lib/doctors/types/notifications.types';

type Db = SupabaseClient<Database>;

interface DoctorNotificationContext {
  userId: string;
  doctorId: string;
}

interface AppointmentRow {
  id: string;
  patient_id: string | null;
  start_time: string;
  status: string | null;
  created_at: string | null;
}

interface DispensationOrderRow {
  id: string;
  patient_id: string;
  pharmacy_id: string | null;
  medication: string;
  status: string;
  updated_at: string;
  prescription_id: string;
}

interface CommunityPostRow {
  id: string;
  title: string | null;
}

interface CommunityCommentRow {
  id: string;
  post_id: string;
  author_display_name: string | null;
  author_role: 'patient' | 'doctor';
  content: string;
  created_at: string;
  doctor_author_id?: string | null;
}

function formatPatientName(input: {
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined): string {
  const fullName = [input?.first_name, input?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || 'Paciente';
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

async function resolvePatientNames(
  supabase: Db,
  patientIds: string[],
): Promise<Map<string, string>> {
  const uniquePatientIds = [...new Set(patientIds.filter(Boolean))];
  if (uniquePatientIds.length === 0) {
    return new Map<string, string>();
  }

  const { data: patients, error: patientsError } = await supabase
    .from('patients')
    .select('id, user_id')
    .in('id', uniquePatientIds);

  if (patientsError) {
    logger.warn('[doctorNotificationsService] patient lookup degraded', patientsError);
    return new Map<string, string>();
  }

  const patientToUserId = new Map(
    (patients ?? [])
      .filter((row) => row.id && row.user_id)
      .map((row) => [row.id, row.user_id as string]),
  );

  const userIds = [...new Set([...patientToUserId.values()])];
  if (userIds.length === 0) {
    return new Map<string, string>();
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name')
    .in('user_id', userIds);

  if (profilesError) {
    logger.warn('[doctorNotificationsService] profile lookup degraded', profilesError);
    return new Map<string, string>();
  }

  const profileByUserId = new Map(
    (profiles ?? []).map((profile) => [
      profile.user_id,
      formatPatientName(profile),
    ]),
  );

  return new Map(
    uniquePatientIds.map((patientId) => [
      patientId,
      profileByUserId.get(patientToUserId.get(patientId) ?? '') ?? 'Paciente',
    ]),
  );
}

async function resolvePharmacyNames(
  supabase: Db,
  pharmacyIds: Array<string | null>,
): Promise<Map<string, string>> {
  const uniquePharmacyIds = [...new Set(pharmacyIds.filter(Boolean))] as string[];
  if (uniquePharmacyIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from('pharmacies')
    .select('id, name')
    .in('id', uniquePharmacyIds);

  if (error) {
    logger.warn('[doctorNotificationsService] pharmacy lookup degraded', error);
    return new Map<string, string>();
  }

  return new Map((data ?? []).map((pharmacy) => [pharmacy.id, pharmacy.name]));
}

async function listRecentAppointments(
  supabase: Db,
  doctorId: string,
): Promise<DoctorPortalNotificationCandidate[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const query = supabase as Db & {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => {
            gte: (column: string, value: string) => {
              order: (
                column: string,
                options?: { ascending?: boolean },
              ) => { limit: (count: number) => Promise<{ data: AppointmentRow[] | null; error: Error | null }> };
            };
          };
        };
      };
    };
  };

  const { data, error } = await query
    .from('appointments')
    .select('id, patient_id, start_time, status, created_at')
    .eq('doctor_id', doctorId)
    .in('status', ['scheduled', 'confirmed'])
    .gte('created_at', cutoff)
    .order('start_time', { ascending: true })
    .limit(12);

  if (error) {
    logger.error('[doctorNotificationsService] appointments lookup failed', error);
    throw error;
  }

  const appointments = data ?? [];
  const patientNames = await resolvePatientNames(
    supabase,
    appointments.map((appointment) => appointment.patient_id ?? ''),
  );

  return appointments.map((appointment) => {
    const patientName = patientNames.get(appointment.patient_id ?? '') ?? 'Paciente';

    return {
      category: 'appointment',
      type: 'doctor_appointment_scheduled',
      title: 'Nueva cita agendada',
      body: `${patientName} - ${formatAppointmentDate(appointment.start_time)}`,
      actionUrl: '/doctors/agenda',
      actionLabel: 'Ver agenda',
      priority: 'high',
      dedupeKey: `doctor:appointment:scheduled:${appointment.id}`,
      contextData: {
        appointmentId: appointment.id,
        patientId: appointment.patient_id,
        startTime: appointment.start_time,
        status: appointment.status,
      },
      createdAt: appointment.created_at ?? appointment.start_time,
    } satisfies DoctorPortalNotificationCandidate;
  });
}

async function listClarificationRequests(
  supabase: Db,
  doctorId: string,
): Promise<DoctorPortalNotificationCandidate[]> {
  const query = supabase as Db & {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (
            column: string,
            options?: { ascending?: boolean },
          ) => { limit: (count: number) => Promise<{ data: DispensationOrderRow[] | null; error: Error | null }> };
        };
      };
    };
  };

  const { data, error } = await query
    .from('dispensation_orders')
    .select('id, patient_id, pharmacy_id, medication, status, updated_at, prescription_id')
    .eq('doctor_id', doctorId)
    .eq('status', 'clarification_requested')
    .order('updated_at', { ascending: false })
    .limit(12);

  if (error) {
    logger.error('[doctorNotificationsService] clarifications lookup failed', error);
    throw error;
  }

  const orders = data ?? [];
  const [patientNames, pharmacyNames] = await Promise.all([
    resolvePatientNames(supabase, orders.map((order) => order.patient_id)),
    resolvePharmacyNames(supabase, orders.map((order) => order.pharmacy_id)),
  ]);

  return orders.map((order) => {
    const patientName = patientNames.get(order.patient_id) ?? 'Paciente';
    const pharmacyName = order.pharmacy_id
      ? pharmacyNames.get(order.pharmacy_id) ?? 'Farmacia'
      : 'Farmacia';

    return {
      category: 'clarification',
      type: 'doctor_prescription_clarification_requested',
      title: 'Farmacia pidio una aclaracion',
      body: `${pharmacyName} necesita respuesta sobre ${order.medication} para ${patientName}.`,
      actionUrl: '/doctors/clarifications',
      actionLabel: 'Responder aclaración',
      priority: 'urgent',
      dedupeKey: `doctor:clarification:${order.id}`,
      contextData: {
        orderId: order.id,
        prescriptionId: order.prescription_id,
        patientId: order.patient_id,
        pharmacyId: order.pharmacy_id,
      },
      createdAt: order.updated_at,
    } satisfies DoctorPortalNotificationCandidate;
  });
}

async function listDispensedPrescriptions(
  supabase: Db,
  doctorId: string,
): Promise<DoctorPortalNotificationCandidate[]> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const query = supabase as Db & {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => {
            gte: (column: string, value: string) => {
              order: (
                column: string,
                options?: { ascending?: boolean },
              ) => { limit: (count: number) => Promise<{ data: DispensationOrderRow[] | null; error: Error | null }> };
            };
          };
        };
      };
    };
  };

  const { data, error } = await query
    .from('dispensation_orders')
    .select('id, patient_id, pharmacy_id, medication, status, updated_at, prescription_id')
    .eq('doctor_id', doctorId)
    .in('status', ['dispensed', 'partially_dispensed'])
    .gte('updated_at', cutoff)
    .order('updated_at', { ascending: false })
    .limit(12);

  if (error) {
    logger.error('[doctorNotificationsService] dispensed lookup failed', error);
    throw error;
  }

  const orders = data ?? [];
  const patientNames = await resolvePatientNames(
    supabase,
    orders.map((order) => order.patient_id),
  );

  return orders.map((order) => {
    const patientName = patientNames.get(order.patient_id) ?? 'Paciente';
    const statusLabel =
      order.status === 'partially_dispensed'
        ? 'fue dispensada parcialmente'
        : 'ya fue dispensada';

    return {
      category: 'prescription',
      type: 'doctor_prescription_dispensed',
      title: 'Receta actualizada por farmacia',
      body: `${order.medication} ${statusLabel} para ${patientName}.`,
      actionUrl: '/doctors/consultations',
      actionLabel: 'Ver detalle',
      priority: 'normal',
      dedupeKey: `doctor:prescription:dispensed:${order.id}:${order.status}`,
      contextData: {
        orderId: order.id,
        prescriptionId: order.prescription_id,
        patientId: order.patient_id,
        status: order.status,
      },
      createdAt: order.updated_at,
    } satisfies DoctorPortalNotificationCandidate;
  });
}

async function listCommunityActivity(
  supabase: Db,
  doctorId: string,
): Promise<DoctorPortalNotificationCandidate[]> {
  const postsQuery = supabase as Db & {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          is: (column: string, value: null) => Promise<{ data: CommunityPostRow[] | null; error: Error | null }>;
        };
      };
    };
  };

  const { data: participatedComments, error: participatedCommentsError } = await (supabase as Db & {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          is: (column: string, value: null) => {
            order: (
              column: string,
              options?: { ascending?: boolean },
            ) => { limit: (count: number) => Promise<{ data: CommunityCommentRow[] | null; error: Error | null }> };
          };
        };
      };
    };
  })
    .from('community_post_comments')
    .select('post_id')
    .eq('doctor_author_id', doctorId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(30);

  if (participatedCommentsError) {
    logger.error(
      '[doctorNotificationsService] community participation lookup failed',
      participatedCommentsError,
    );
    throw participatedCommentsError;
  }

  const participatedPostIds = [
    ...new Set((participatedComments ?? []).map((comment) => comment.post_id).filter(Boolean)),
  ];

  if (participatedPostIds.length === 0) {
    return [];
  }

  const [{ data: posts, error: postsError }, { data: comments, error: commentsError }] =
    await Promise.all([
      postsQuery
        .from('community_posts')
        .select('id, title')
        .eq('moderation_status', 'approved')
        .is('deleted_at', null),
      (supabase as Db & {
        from: (table: string) => {
          select: (columns: string) => {
            in: (column: string, values: string[]) => {
              is: (column: string, value: null) => {
                neq: (column: string, value: string) => {
                  order: (
                    column: string,
                    options?: { ascending?: boolean },
                  ) => { limit: (count: number) => Promise<{ data: CommunityCommentRow[] | null; error: Error | null }> };
                };
              };
            };
          };
        };
      })
        .from('community_post_comments')
        .select('id, post_id, author_display_name, author_role, content, created_at, doctor_author_id')
        .in('post_id', participatedPostIds)
        .is('deleted_at', null)
        .neq('doctor_author_id', doctorId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

  if (postsError) {
    logger.error('[doctorNotificationsService] community posts lookup failed', postsError);
    throw postsError;
  }

  if (commentsError) {
    logger.error('[doctorNotificationsService] community comments lookup failed', commentsError);
    throw commentsError;
  }

  const postTitleById = new Map(
    (posts ?? [])
      .filter((post) => participatedPostIds.includes(post.id))
      .map((post) => [post.id, post.title?.trim() || 'la conversacion']),
  );

  return (comments ?? []).map((comment) => {
    const authorName =
      comment.author_display_name?.trim() ||
      (comment.author_role === 'doctor' ? 'Otro medico' : 'Un paciente');
    const postTitle = postTitleById.get(comment.post_id) ?? 'la conversacion';

    return {
      category: 'community',
      type: 'doctor_community_reply',
      title: 'Nueva respuesta en comunidad',
      body: `${authorName} comento en ${postTitle}.`,
      actionUrl: '/doctors/community',
      actionLabel: 'Abrir comunidad',
      priority: 'normal',
      dedupeKey: `doctor:community:comment:${comment.id}`,
      contextData: {
        commentId: comment.id,
        postId: comment.post_id,
        preview: comment.content.slice(0, 180),
      },
      createdAt: comment.created_at,
    } satisfies DoctorPortalNotificationCandidate;
  });
}

export const doctorNotificationsService = {
  async syncDoctorNotifications(
    supabase: Db,
    context: DoctorNotificationContext,
  ): Promise<void> {
    const notificationsRepo = createDoctorNotificationsRepository(supabase);

    const [appointments, clarifications, dispensed, community] =
      await Promise.all([
        listRecentAppointments(supabase, context.doctorId),
        listClarificationRequests(supabase, context.doctorId),
        listDispensedPrescriptions(supabase, context.doctorId),
        listCommunityActivity(supabase, context.doctorId),
      ]);

    const candidates = [
      ...appointments,
      ...clarifications,
      ...dispensed,
      ...community,
    ]
      .sort(
        (left, right) =>
          new Date(right.createdAt ?? 0).getTime() -
          new Date(left.createdAt ?? 0).getTime(),
      )
      .slice(0, 24);

    await notificationsRepo.insertMissing(context.userId, candidates);
  },

  async getDoctorFeed(
    supabase: Db,
    context: DoctorNotificationContext,
  ): Promise<DoctorPortalNotificationFeed> {
    try {
      await this.syncDoctorNotifications(supabase, context);
    } catch (error) {
      logger.warn('[doctorNotificationsService] sync degraded', error);
    }

    const notificationsRepo = createDoctorNotificationsRepository(supabase);
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
    context: DoctorNotificationContext,
    notificationId: string,
  ): Promise<void> {
    if (!notificationId.trim()) {
      throw Object.assign(new Error('La notificacion es obligatoria'), {
        code: 'VALIDATION',
      });
    }

    const notificationsRepo = createDoctorNotificationsRepository(supabase);
    await notificationsRepo.markRead(context.userId, notificationId);
  },

  async markAllRead(
    supabase: Db,
    context: DoctorNotificationContext,
  ): Promise<void> {
    const notificationsRepo = createDoctorNotificationsRepository(supabase);
    await notificationsRepo.markAllRead(context.userId);
  },
};
