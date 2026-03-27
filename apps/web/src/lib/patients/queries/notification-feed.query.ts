/**
 * CQRS Read Model: Patient Notification Feed
 *
 * Query que agrega notificaciones de múltiples fuentes
 * (turnos, reportes, comunidad) en un feed unificado.
 * Solo lectura — no muta estado.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'

export interface NotificationItem {
  id: string
  type: 'appointment' | 'report' | 'community'
  title: string
  body: string
  createdAt: string
  read: boolean
  dedupeKey: string
  link?: string
}

export interface NotificationFeedView {
  items: NotificationItem[]
  unreadCount: number
  totalCount: number
}

export async function queryNotificationFeed(
  supabase: SupabaseClient,
  patientId: string,
  limit = 24
): Promise<NotificationFeedView> {
  const [apptResult, reportsResult, commentsResult] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, start_time, status, type, doctor_id')
      .eq('patient_id', patientId)
      .order('start_time', { ascending: false })
      .limit(10),

    supabase
      .from('medical_records')
      .select('id, created_at, record_type, doctor_id')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(8),

    supabase
      .from('community_comments')
      .select('id, created_at, content, post_id')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(12),
  ])

  const items: NotificationItem[] = []

  for (const appt of apptResult.data ?? []) {
    items.push({
      id: `appt-${appt.id}`,
      type: 'appointment',
      title: `Turno ${appt.status === 'confirmed' ? 'confirmado' : appt.status}`,
      body: `${appt.type ?? 'consulta'} — ${new Date(appt.start_time).toLocaleDateString('es-AR')}`,
      createdAt: appt.start_time,
      read: false,
      dedupeKey: `appt:${appt.id}`,
      link: `/appointments/${appt.id}`,
    })
  }

  for (const report of reportsResult.data ?? []) {
    items.push({
      id: `report-${report.id}`,
      type: 'report',
      title: 'Nuevo informe médico',
      body: report.record_type ?? 'Consulta',
      createdAt: report.created_at,
      read: false,
      dedupeKey: `report:${report.id}`,
      link: `/medical-history/${report.id}`,
    })
  }

  for (const comment of commentsResult.data ?? []) {
    items.push({
      id: `comment-${comment.id}`,
      type: 'community',
      title: 'Nuevo comentario',
      body: (comment.content ?? '').slice(0, 80),
      createdAt: comment.created_at,
      read: false,
      dedupeKey: `comment:${comment.id}`,
      link: `/community/posts/${comment.post_id}`,
    })
  }

  const deduped = new Map<string, NotificationItem>()
  for (const item of items) {
    if (!deduped.has(item.dedupeKey)) deduped.set(item.dedupeKey, item)
  }

  const sorted = [...deduped.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)

  logger.info(`[query:notification-feed] patient=${patientId} items=${sorted.length}`)

  return {
    items: sorted,
    unreadCount: sorted.filter((i) => !i.read).length,
    totalCount: sorted.length,
  }
}
