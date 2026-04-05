/**
 * Service: doctor ranking business logic.
 * Orchestrates rankingRepo for leaderboard assembly.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  rankingRepo,
  type RankingMetricsRow,
  type BadgeRow,
  type ProfileRow,
} from '../lib/repos/ranking'

type AdminClient = SupabaseClient

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
    const currentDoctor = await rankingRepo.findDoctorByUserId(admin, userId)

    let myMetrics: RankingMetricsRow | null = null
    let myBadges: BadgeRow[] = []
    let myReviewCount = 0

    if (currentDoctor) {
      const [metrics, badges, reviews] = await Promise.all([
        rankingRepo.getMetricsForDoctor(admin, currentDoctor.id),
        rankingRepo.getBadgesForDoctor(admin, currentDoctor.id),
        rankingRepo.getApprovedReviews(admin, currentDoctor.id),
      ])
      myMetrics = metrics
      myBadges = badges
      myReviewCount = reviews.length
    }

    const topRanked = await rankingRepo.getTopRanked(admin, 20)

    let rankedDoctors: RankedDoctor[] = []
    if (topRanked.length > 0) {
      const doctorIds = topRanked.map((r) => r.doctor_id)
      const doctors = await rankingRepo.getDoctorsByIds(admin, doctorIds)

      const userIds = doctors
        .map((d) => d.user_id)
        .filter((id): id is string => id !== null)

      const [profiles, allBadges] = await Promise.all([
        rankingRepo.getProfilesByUserIds(admin, userIds),
        rankingRepo.getBadgesByDoctorIds(admin, doctorIds),
      ])

      const profileMap = new Map(profiles.map((p: ProfileRow) => [p.user_id, p]))
      const doctorMap = new Map(doctors.map((d) => [d.id, d]))

      const badgesByDoctor = new Map<string, BadgeRow[]>()
      for (const badge of allBadges) {
        const existing = badgesByDoctor.get(badge.doctor_id) ?? []
        existing.push(badge)
        badgesByDoctor.set(badge.doctor_id, existing)
      }

      rankedDoctors = topRanked.map((metrics) => {
        const doctor = doctorMap.get(metrics.doctor_id)
        const profile = doctor?.user_id ? profileMap.get(doctor.user_id) : null
        return {
          ...metrics,
          specialty: doctor?.specialty ?? null,
          years_experience: doctor?.years_experience ?? null,
          first_name: profile?.first_name ?? null,
          last_name: profile?.last_name ?? null,
          is_current_user: currentDoctor ? metrics.doctor_id === currentDoctor.id : false,
          badges: badgesByDoctor.get(metrics.doctor_id) ?? [],
        }
      })
    }

    return {
      current_doctor: currentDoctor ? {
        doctor_id: currentDoctor.id,
        specialty: currentDoctor.specialty,
        years_experience: currentDoctor.years_experience,
        metrics: myMetrics,
        badges: myBadges,
        review_count: myReviewCount,
      } : null,
      ranked_doctors: rankedDoctors,
    }
  },

  async getCommunityLeaderboard(admin: AdminClient): Promise<{
    leaders: Array<{
      doctor_id: string
      first_name: string | null
      last_name: string | null
      specialty: string | null
      comment_count: number
      helpful_count: number
    }>
  }> {
    const countMap = await rankingRepo.getDoctorCommentCounts(admin)
    if (countMap.size === 0) return { leaders: [] }

    const sorted = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)

    const authorIds = sorted.map(([id]) => id)
    if (authorIds.length === 0) return { leaders: [] }

    const doctors = await rankingRepo.getDoctorsByUserIds(admin, authorIds)
    const doctorMap = new Map(doctors.map((d) => [d.user_id, d]))

    const userIds = Array.from(doctorMap.keys())
    const profiles = await rankingRepo.getProfilesByUserIds(admin, userIds)
    const profileMap = new Map(profiles.map((p: ProfileRow) => [p.user_id, p]))

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
