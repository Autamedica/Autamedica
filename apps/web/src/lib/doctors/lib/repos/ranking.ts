/**
 * Repository: ranking-related DB queries.
 * Covers doctor_ranking_metrics, doctor_badges, doctor_reviews,
 * and profile/doctor lookups for the leaderboard.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'

type AdminClient = SupabaseClient

export interface RankingMetricsRow {
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

export interface BadgeRow {
  id: string
  doctor_id: string
  badge: string
  level: string
  description: string | null
  earned_at: string
}

export interface ProfileRow {
  user_id: string
  first_name: string | null
  last_name: string | null
}

export interface DoctorRow {
  id: string
  specialty: string | null
  years_experience: number | null
  user_id: string | null
}

export const rankingRepo = {
  async findDoctorByUserId(
    admin: AdminClient,
    userId: string,
  ): Promise<{ id: string; specialty: string | null; years_experience: number | null } | null> {
    const { data } = await admin
      .from('doctors')
      .select('id, specialty, years_experience')
      .eq('user_id', userId)
      .maybeSingle()
    return data as { id: string; specialty: string | null; years_experience: number | null } | null
  },

  async getMetricsForDoctor(admin: AdminClient, doctorId: string): Promise<RankingMetricsRow | null> {
    const { data } = await admin
      .from('doctor_ranking_metrics')
      .select('*')
      .eq('doctor_id', doctorId)
      .single()
    return data as RankingMetricsRow | null
  },

  async getBadgesForDoctor(admin: AdminClient, doctorId: string): Promise<BadgeRow[]> {
    const { data } = await admin
      .from('doctor_badges')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('earned_at', { ascending: false })
    return (data ?? []) as BadgeRow[]
  },

  async getApprovedReviews(
    admin: AdminClient,
    doctorId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const { data } = await admin
      .from('doctor_reviews')
      .select('overall_rating, punctuality_rating, communication_rating, professionalism_rating, clinical_quality_rating')
      .eq('doctor_id', doctorId)
      .eq('status', 'approved')
    return (data ?? []) as Array<Record<string, unknown>>
  },

  async getTopRanked(admin: AdminClient, limit: number): Promise<RankingMetricsRow[]> {
    const { data } = await admin
      .from('doctor_ranking_metrics')
      .select('doctor_id, avg_rating, total_reviews, total_consultations, completed_consultations, completion_rate, overall_score, rank_position, community_replies, community_threads_helped, community_helpful_reactions, community_score')
      .order('rank_position', { ascending: true })
      .limit(limit)
    return (data ?? []) as RankingMetricsRow[]
  },

  async getDoctorsByIds(admin: AdminClient, ids: string[]): Promise<DoctorRow[]> {
    const { data } = await admin
      .from('doctors')
      .select('id, specialty, years_experience, user_id')
      .in('id', ids)
    return (data ?? []) as DoctorRow[]
  },

  async getProfilesByUserIds(admin: AdminClient, userIds: string[]): Promise<ProfileRow[]> {
    if (userIds.length === 0) return []
    const { data } = await admin
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', userIds)
    return (data ?? []) as ProfileRow[]
  },

  async getBadgesByDoctorIds(admin: AdminClient, doctorIds: string[]): Promise<BadgeRow[]> {
    if (doctorIds.length === 0) return []
    const { data } = await admin
      .from('doctor_badges')
      .select('*')
      .in('doctor_id', doctorIds)
    return (data ?? []) as BadgeRow[]
  },

  async getDoctorCommentCounts(admin: AdminClient): Promise<Map<string, number>> {
    const { data } = await admin
      .from('post_comments')
      .select('author_id')
      .eq('author_role', 'doctor')

    if (!data || data.length === 0) return new Map()

    const countMap = new Map<string, number>()
    for (const row of data as Array<{ author_id: string }>) {
      countMap.set(row.author_id, (countMap.get(row.author_id) ?? 0) + 1)
    }
    return countMap
  },

  async getDoctorsByUserIds(
    admin: AdminClient,
    userIds: string[],
  ): Promise<Array<{ id: string; specialty: string | null; user_id: string }>> {
    if (userIds.length === 0) return []
    const { data } = await admin
      .from('doctors')
      .select('id, specialty, user_id')
      .in('user_id', userIds)

    return ((data ?? []) as Array<{ id: string; specialty: string | null; user_id: string | null }>)
      .filter((d): d is { id: string; specialty: string | null; user_id: string } => d.user_id !== null)
  },
}
