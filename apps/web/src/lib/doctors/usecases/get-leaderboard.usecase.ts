/**
 * Use Case: Get Doctor Leaderboard
 *
 * Orquesta la construcción del ranking de doctores:
 * 1. Obtiene métricas del doctor actual
 * 2. Obtiene top 20 del ranking
 * 3. Enriquece con perfiles y badges
 * 4. Retorna vista consolidada
 *
 * Este use case delega la query pesada al read model (CQRS).
 * Separado del ranking.service.ts original para claridad arquitectural.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'

export interface LeaderboardDoctor {
  doctorId: string
  name: string
  specialty: string | null
  yearsExperience: number | null
  overallScore: number | null
  rankPosition: number | null
  badges: Array<{ type: string; level: string; earnedAt: string }>
  avgRating: number | null
  totalReviews: number | null
}

export interface LeaderboardView {
  currentDoctor: LeaderboardDoctor | null
  topDoctors: LeaderboardDoctor[]
}

export async function getLeaderboard(
  admin: SupabaseClient,
  currentUserId: string
): Promise<LeaderboardView> {
  logger.info(`[usecase:get-leaderboard] user=${currentUserId}`)

  const { data: doctor } = await admin
    .from('doctors')
    .select('id, specialty, years_experience, user_id')
    .eq('user_id', currentUserId)
    .single()

  if (!doctor) {
    return { currentDoctor: null, topDoctors: [] }
  }

  const [metricsRes, badgesRes, topMetricsRes] = await Promise.all([
    admin
      .from('doctor_ranking_metrics')
      .select('*')
      .eq('doctor_id', doctor.id)
      .single(),
    admin
      .from('doctor_badges')
      .select('badge_type, badge_level, earned_at')
      .eq('doctor_id', doctor.id),
    admin
      .from('doctor_ranking_metrics')
      .select('doctor_id, overall_score, rank_position, avg_rating, total_reviews')
      .order('rank_position', { ascending: true })
      .limit(20),
  ])

  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', currentUserId)
    .single()

  const currentDoctor: LeaderboardDoctor = {
    doctorId: doctor.id,
    name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Doctor',
    specialty: doctor.specialty,
    yearsExperience: doctor.years_experience,
    overallScore: metricsRes.data?.overall_score ?? null,
    rankPosition: metricsRes.data?.rank_position ?? null,
    badges: (badgesRes.data ?? []).map((b) => ({
      type: b.badge_type,
      level: b.badge_level,
      earnedAt: b.earned_at,
    })),
    avgRating: metricsRes.data?.avg_rating ?? null,
    totalReviews: metricsRes.data?.total_reviews ?? null,
  }

  const topMetrics = topMetricsRes.data ?? []
  const topDoctorIds = topMetrics.map((m) => m.doctor_id)

  let topDoctors: LeaderboardDoctor[] = []

  if (topDoctorIds.length > 0) {
    const [doctorsRes, topBadgesRes] = await Promise.all([
      admin
        .from('doctors')
        .select('id, specialty, years_experience, user_id')
        .in('id', topDoctorIds),
      admin
        .from('doctor_badges')
        .select('doctor_id, badge_type, badge_level, earned_at')
        .in('doctor_id', topDoctorIds),
    ])

    const doctorsMap = new Map(
      (doctorsRes.data ?? []).map((d) => [d.id, d])
    )

    const userIds = (doctorsRes.data ?? [])
      .map((d) => d.user_id)
      .filter((id): id is string => id !== null)

    const { data: profiles } = userIds.length > 0
      ? await admin.from('profiles').select('user_id, first_name, last_name').in('user_id', userIds)
      : { data: [] }

    const profilesMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, p])
    )

    const badgesByDoctor = new Map<string, Array<{ type: string; level: string; earnedAt: string }>>()
    for (const b of topBadgesRes.data ?? []) {
      const list = badgesByDoctor.get(b.doctor_id) ?? []
      list.push({ type: b.badge_type, level: b.badge_level, earnedAt: b.earned_at })
      badgesByDoctor.set(b.doctor_id, list)
    }

    topDoctors = topMetrics.map((m) => {
      const d = doctorsMap.get(m.doctor_id)
      const p = d?.user_id ? profilesMap.get(d.user_id) : null
      return {
        doctorId: m.doctor_id,
        name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Doctor',
        specialty: d?.specialty ?? null,
        yearsExperience: d?.years_experience ?? null,
        overallScore: m.overall_score,
        rankPosition: m.rank_position,
        badges: badgesByDoctor.get(m.doctor_id) ?? [],
        avgRating: m.avg_rating,
        totalReviews: m.total_reviews,
      }
    })
  }

  return { currentDoctor, topDoctors }
}
