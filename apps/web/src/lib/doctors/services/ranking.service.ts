/**
 * Service: doctor ranking business logic.
 * Extracted from /api/doctors/ranking.ts to respect Controller → Service → Repo separation.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient

interface RankingMetricsRow {
  doctor_id: string
  avg_rating: number | null
  total_reviews: number | null
  total_consultations: number | null
  completed_consultations: number | null
  completion_rate: number | null
  overall_score: number | null
  rank_position: number | null
  community_replies: number | null
  community_threads_helped: number | null
  community_helpful_reactions: number | null
  community_score: number | null
}

interface DoctorRow {
  id: string
  specialty: string | null
  years_experience: number | null
  user_id: string | null
}

interface ProfileRow {
  user_id: string
  first_name: string | null
  last_name: string | null
}

interface BadgeRow {
  id: string
  doctor_id: string
  badge: string
  level: string
  description: string | null
  earned_at: string
}

interface RankedDoctor extends RankingMetricsRow {
  specialty: string | null
  years_experience: number | null
  first_name: string | null
  last_name: string | null
  is_current_user: boolean
  badges: BadgeRow[]
}

interface CurrentDoctorSummary {
  doctor_id: string
  specialty: string | null
  years_experience: number | null
  metrics: RankingMetricsRow | null
  badges: BadgeRow[]
  review_count: number
}

export interface RankingResult {
  current_doctor: CurrentDoctorSummary | null
  ranked_doctors: RankedDoctor[]
}

export const rankingService = {
  async getLeaderboard(admin: AdminClient, userId: string): Promise<RankingResult> {
    const { data: currentDoctor } = await admin
      .from('doctors')
      .select('id, specialty, years_experience')
      .eq('user_id', userId)
      .maybeSingle()

    let myMetrics: RankingMetricsRow | null = null
    let myBadges: BadgeRow[] = []
    let myReviews: Array<Record<string, unknown>> = []

    if (currentDoctor) {
      const [metricsRes, badgesRes, reviewsRes] = await Promise.all([
        admin.from('doctor_ranking_metrics').select('*').eq('doctor_id', currentDoctor.id).single(),
        admin.from('doctor_badges').select('*').eq('doctor_id', currentDoctor.id).order('earned_at', { ascending: false }),
        admin.from('doctor_reviews')
          .select('overall_rating, punctuality_rating, communication_rating, professionalism_rating, clinical_quality_rating')
          .eq('doctor_id', currentDoctor.id)
          .eq('status', 'approved'),
      ])

      myMetrics = metricsRes.data as RankingMetricsRow | null
      myBadges = (badgesRes.data ?? []) as BadgeRow[]
      myReviews = (reviewsRes.data ?? []) as Array<Record<string, unknown>>
    }

    const { data: topRanked } = await admin
      .from('doctor_ranking_metrics')
      .select('doctor_id, avg_rating, total_reviews, total_consultations, completed_consultations, completion_rate, overall_score, rank_position, community_replies, community_threads_helped, community_helpful_reactions, community_score')
      .order('rank_position', { ascending: true })
      .limit(20)

    let rankedDoctors: RankedDoctor[] = []
    if (topRanked && topRanked.length > 0) {
      const doctorIds = topRanked.map((r: RankingMetricsRow) => r.doctor_id)

      const [doctorsRes, profilesRes] = await Promise.all([
        admin.from('doctors').select('id, specialty, years_experience, user_id').in('id', doctorIds),
        (async () => {
          const { data: doctors } = await admin.from('doctors').select('user_id').in('id', doctorIds)
          const userIds = (doctors ?? []).map((d: { user_id: string | null }) => d.user_id).filter((id): id is string => id !== null)
          return userIds.length > 0
            ? admin.from('profiles').select('user_id, first_name, last_name').in('user_id', userIds)
            : { data: [] }
        })(),
      ])

      const profileMap = new Map(((profilesRes.data ?? []) as ProfileRow[]).map(p => [p.user_id, p]))
      const doctorMap = new Map(((doctorsRes.data ?? []) as DoctorRow[]).map(d => [d.id, d]))

      rankedDoctors = topRanked.map((metrics: RankingMetricsRow) => {
        const doctor = doctorMap.get(metrics.doctor_id)
        const profile = doctor?.user_id ? profileMap.get(doctor.user_id) : null
        return {
          ...metrics,
          specialty: doctor?.specialty ?? null,
          years_experience: doctor?.years_experience ?? null,
          first_name: profile?.first_name ?? null,
          last_name: profile?.last_name ?? null,
          is_current_user: currentDoctor ? metrics.doctor_id === currentDoctor.id : false,
          badges: [] as BadgeRow[],
        }
      })
    }

    // Attach badges to ranked doctors
    const topDoctorIds = rankedDoctors.map(d => d.doctor_id)
    if (topDoctorIds.length > 0) {
      const { data: allBadges } = await admin
        .from('doctor_badges')
        .select('*')
        .in('doctor_id', topDoctorIds)

      const badgesByDoctor = new Map<string, BadgeRow[]>()
      for (const badge of (allBadges ?? []) as BadgeRow[]) {
        const existing = badgesByDoctor.get(badge.doctor_id) ?? []
        existing.push(badge)
        badgesByDoctor.set(badge.doctor_id, existing)
      }

      rankedDoctors = rankedDoctors.map(d => ({
        ...d,
        badges: badgesByDoctor.get(d.doctor_id) ?? [],
      }))
    }

    return {
      current_doctor: currentDoctor ? {
        doctor_id: currentDoctor.id,
        specialty: currentDoctor.specialty,
        years_experience: currentDoctor.years_experience,
        metrics: myMetrics,
        badges: myBadges,
        review_count: myReviews.length,
      } : null,
      ranked_doctors: rankedDoctors,
    }
  },

  async getCommunityLeaderboard(admin: AdminClient): Promise<{
    leaders: Array<{
      doctor_id: string;
      first_name: string | null;
      last_name: string | null;
      specialty: string | null;
      comment_count: number;
      helpful_count: number;
    }>;
  }> {
    // Aggregate doctor community participation from post_comments
    const { data: topDoctors } = await admin
      .from('post_comments')
      .select('author_id')
      .eq('author_role', 'doctor')

    if (!topDoctors || topDoctors.length === 0) {
      return { leaders: [] }
    }

    // Count comments per doctor
    const countMap = new Map<string, number>()
    for (const row of topDoctors as Array<{ author_id: string }>) {
      countMap.set(row.author_id, (countMap.get(row.author_id) ?? 0) + 1)
    }

    // Sort by count, take top 20
    const sorted = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)

    const authorIds = sorted.map(([id]) => id)
    if (authorIds.length === 0) {
      return { leaders: [] }
    }

    // Resolve doctor info + profiles
    const { data: doctors } = await admin
      .from('doctors')
      .select('id, specialty, user_id')
      .in('user_id', authorIds)

    const doctorMap = new Map(
      ((doctors ?? []) as Array<{ id: string; specialty: string | null; user_id: string | null }>)
        .filter((d): d is { id: string; specialty: string | null; user_id: string } => d.user_id !== null)
        .map(d => [d.user_id, d])
    )

    const userIds = Array.from(doctorMap.keys())
    const { data: profiles } = userIds.length > 0
      ? await admin.from('profiles').select('user_id, first_name, last_name').in('user_id', userIds)
      : { data: [] }

    const profileMap = new Map(
      ((profiles ?? []) as ProfileRow[]).map(p => [p.user_id, p])
    )

    const leaders = sorted.map(([authorId, commentCount]) => {
      const doctor = doctorMap.get(authorId)
      const profile = profileMap.get(authorId)
      return {
        doctor_id: doctor?.id ?? authorId,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        specialty: doctor?.specialty ?? null,
        comment_count: commentCount,
        helpful_count: 0,
      }
    })

    return { leaders }
  },
}
