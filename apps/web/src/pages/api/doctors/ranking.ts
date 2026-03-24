import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@autamedica/types';
import { createServerClientFromRequest } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';

export const GET: APIRoute = async ({ request }) => {
  try {
    let supabase: SupabaseClient<Database>;
    try {
      supabase = createServerClientFromRequest(request);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: currentDoctor } = await supabase
      .from('doctors')
      .select('id, specialty, years_experience')
      .eq('user_id', user.id)
      .maybeSingle();

    let myMetrics = null;
    let myBadges: Array<Record<string, unknown>> = [];
    let myReviews: Array<Record<string, unknown>> = [];

    if (currentDoctor) {
      const { data: metrics } = await supabase
        .from('doctor_ranking_metrics')
        .select('*')
        .eq('doctor_id', currentDoctor.id)
        .single();
      myMetrics = metrics;

      const { data: badges } = await supabase
        .from('doctor_badges')
        .select('*')
        .eq('doctor_id', currentDoctor.id)
        .order('earned_at', { ascending: false });
      myBadges = badges ?? [];

      const { data: reviews } = await supabase
        .from('doctor_reviews')
        .select('overall_rating, punctuality_rating, communication_rating, professionalism_rating, clinical_quality_rating')
        .eq('doctor_id', currentDoctor.id)
        .eq('status', 'approved');
      myReviews = reviews ?? [];
    }

    const { data: topRanked } = await supabase
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

    let rankedDoctors: Array<Record<string, unknown>> = [];
    if (topRanked && topRanked.length > 0) {
      const doctorIds = topRanked.map((r: Record<string, unknown>) => r.doctor_id as string);

      const { data: doctors } = await supabase
        .from('doctors')
        .select('id, specialty, years_experience, user_id')
        .in('id', doctorIds);

      const userIds = (doctors ?? []).map((d: { user_id: string | null }) => d.user_id).filter(Boolean) as string[];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', userIds);

      const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));
      const doctorMap = new Map((doctors ?? []).map((d: { id: string; user_id: string | null; specialty: string; years_experience: number | null }) => [d.id, d]));

      rankedDoctors = topRanked.map((metrics: Record<string, unknown>) => {
        const doctor = doctorMap.get(metrics.doctor_id as string);
        const profile = doctor?.user_id ? profileMap.get(doctor.user_id) : null;
        return {
          ...metrics,
          specialty: doctor?.specialty ?? null,
          years_experience: doctor?.years_experience ?? null,
          first_name: profile?.first_name ?? null,
          last_name: profile?.last_name ?? null,
          is_current_user: currentDoctor ? metrics.doctor_id === currentDoctor.id : false,
        };
      });
    }

    const topDoctorIds = rankedDoctors.map(d => d.doctor_id as string);
    const { data: allBadges } = topDoctorIds.length > 0
      ? await supabase
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
      badges: badgesByDoctor.get(d.doctor_id as string) ?? [],
    }));

    return new Response(JSON.stringify({
      ok: true,
      data: {
        current_doctor: currentDoctor ? {
          doctor_id: currentDoctor.id,
          specialty: currentDoctor.specialty,
          years_experience: currentDoctor.years_experience,
          metrics: myMetrics ?? null,
          badges: myBadges,
          review_count: myReviews.length,
        } : null,
        ranked_doctors: rankedDoctors,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('Ranking API error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'internal_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
