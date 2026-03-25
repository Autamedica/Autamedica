import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { jsonOk, internalError, unauthorized } from '@/lib/api-helpers';
import { createAdminClient } from '@autamedica/auth/server';

interface RankingMetricsRow {
  doctor_id: string
  avg_rating: number | null
  total_reviews: number | null
  total_consultations: number | null
  completed_consultations: number | null
  completion_rate: number | null
  overall_score: number | null
  rank_position: number | null
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

export const GET: APIRoute = async ({ locals }) => {
  try {
    // Use session from middleware (already validated via getUser() + refreshed if needed)
    // This avoids the stale-cookie bug where withSession() re-parses the original request
    // cookies before the middleware has written the refreshed token to the response.
    const session = locals.session;
    if (!session) return unauthorized();
    const user = session.user;

    const admin = createAdminClient();

    const { data: currentDoctor } = await admin
      .from('doctors')
      .select('id, specialty, years_experience')
      .eq('user_id', user.id)
      .maybeSingle();

    let myMetrics = null;
    let myBadges: BadgeRow[] = [];
    let myReviews: Array<Record<string, unknown>> = [];

    if (currentDoctor) {
      const { data: metrics } = await admin
        .from('doctor_ranking_metrics')
        .select('*')
        .eq('doctor_id', currentDoctor.id)
        .single();
      myMetrics = metrics;

      const { data: badges } = await admin
        .from('doctor_badges')
        .select('*')
        .eq('doctor_id', currentDoctor.id)
        .order('earned_at', { ascending: false });
      myBadges = badges ?? [];

      const { data: reviews } = await admin
        .from('doctor_reviews')
        .select('overall_rating, punctuality_rating, communication_rating, professionalism_rating, clinical_quality_rating')
        .eq('doctor_id', currentDoctor.id)
        .eq('status', 'approved');
      myReviews = reviews ?? [];
    }

    const { data: topRanked } = await admin
      .from('doctor_ranking_metrics')
      .select(`
        doctor_id,
        avg_rating,
        total_reviews,
        total_consultations,
        completed_consultations,
        completion_rate,
        overall_score,
        rank_position
      `)
      .order('rank_position', { ascending: true })
      .limit(20);

    let rankedDoctors: RankedDoctor[] = [];
    if (topRanked && topRanked.length > 0) {
      const doctorIds = topRanked.map((r: RankingMetricsRow) => r.doctor_id);

      const { data: doctors } = await admin
        .from('doctors')
        .select('id, specialty, years_experience, user_id')
        .in('id', doctorIds);

      const userIds = (doctors ?? []).map((d: DoctorRow) => d.user_id).filter((id): id is string => id !== null);
      const { data: profiles } = await admin
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', userIds);

      const profileMap = new Map((profiles ?? []).map((p: ProfileRow) => [p.user_id, p]));
      const doctorMap = new Map((doctors ?? []).map((d: DoctorRow) => [d.id, d]));

      rankedDoctors = topRanked.map((metrics: RankingMetricsRow) => {
        const doctor = doctorMap.get(metrics.doctor_id);
        const profile = doctor?.user_id ? profileMap.get(doctor.user_id) : null;
        return {
          ...metrics,
          specialty: doctor?.specialty ?? null,
          years_experience: doctor?.years_experience ?? null,
          first_name: profile?.first_name ?? null,
          last_name: profile?.last_name ?? null,
          is_current_user: currentDoctor ? metrics.doctor_id === currentDoctor.id : false,
          badges: [] as BadgeRow[],
        };
      });
    }

    const topDoctorIds = rankedDoctors.map(d => d.doctor_id);
    const { data: allBadges } = topDoctorIds.length > 0
      ? await admin
          .from('doctor_badges')
          .select('*')
          .in('doctor_id', topDoctorIds)
      : { data: [] };

    const badgesByDoctor = new Map<string, typeof allBadges>();
    for (const badge of (allBadges ?? [])) {
      const existing = badgesByDoctor.get(badge.doctor_id) ?? [];
      existing.push(badge);
      badgesByDoctor.set(badge.doctor_id, existing);
    }

    rankedDoctors = rankedDoctors.map(d => ({
      ...d,
      badges: (badgesByDoctor.get(d.doctor_id) ?? []) as BadgeRow[],
    }));

    return jsonOk({
      current_doctor: currentDoctor ? {
        doctor_id: currentDoctor.id,
        specialty: currentDoctor.specialty,
        years_experience: currentDoctor.years_experience,
        metrics: myMetrics ?? null,
        badges: myBadges,
        review_count: myReviews.length,
      } : null,
      ranked_doctors: rankedDoctors,
    });
  } catch (err) {
    logger.error('Ranking API error:', err);
    return internalError();
  }
};
