'use client';

import { computeAgeFromIso, normalizeGender } from '@/lib/patients/lib/demographics';
import type { CommunityGroup, CommunitySortBy } from '@/lib/patients/types/community';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppointments } from './useAppointments';
import { useCommunity } from './useCommunity';
import { useMedicalHistory } from './useMedicalHistory';
import { usePatientReports } from './usePatientReports';
import { usePatientScreenings } from './usePatientScreenings';
import { usePatientSession } from './usePatientSession';

export interface CommunitySignalCard {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  href?: string;
}

export interface CommunityFocusArea {
  id: string;
  label: string;
  description: string;
}

export interface RecommendedCommunityGroup extends CommunityGroup {
  reason: string;
  isMember: boolean;
  matchScore: number;
}

export interface CommunityPromptSuggestion {
  id: string;
  title: string;
  content: string;
  groupId?: string;
}

function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenize(input: string | null | undefined): string[] {
  if (!input) {
    return [];
  }

  return normalizeText(input)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function deriveDisplayName(input: {
  profileFirstName?: string | null;
  profileLastName?: string | null;
  accountFullName?: string | null;
  email?: string | null;
}): string {
  const composedName = [input.profileFirstName, input.profileLastName].filter(Boolean).join(' ').trim();
  if (composedName.length > 0) {
    return composedName;
  }

  if (input.accountFullName?.trim()) {
    return input.accountFullName.trim();
  }

  if (input.email?.includes('@')) {
    return input.email.split('@')[0] ?? 'Paciente';
  }

  return 'Paciente';
}

function buildGroupReason(group: CommunityGroup, keywords: string[]): { score: number; reason: string } {
  const haystack = [
    group.name,
    group.description,
    group.category,
    ...group.tags,
  ]
    .filter(Boolean)
    .flatMap((value) => tokenize(value));

  const uniqueTokens = new Set(haystack);
  let score = 0;
  const matches: string[] = [];

  for (const keyword of keywords) {
    if (uniqueTokens.has(keyword)) {
      score += 3;
      matches.push(keyword);
    }
  }

  if (score > 0) {
    return {
      score,
      reason: `Se alinea con ${matches.slice(0, 2).join(' y ')}.`,
    };
  }

  if (group.post_count > 0) {
    score += 1;
  }

  if (group.member_count > 0) {
    score += 1;
  }

  return {
    score,
    reason: 'Actividad sostenida y señales de apoyo entre pacientes.',
  };
}

export function usePatientCommunityPage() {
  const session = usePatientSession();
  const {
    groups,
    memberships,
    posts,
    loading: communityLoading,
    error: communityError,
    refresh: refreshCommunity,
    createPost: createCommunityPost,
    addReaction: addCommunityReaction,
  } = useCommunity();
  const appointmentsState = useAppointments();
  const reportsState = usePatientReports();
  const medicalHistoryState = useMedicalHistory(session.patient?.id);

  const derivedAge = computeAgeFromIso(session.patient?.birthDate ?? null) ?? 52;
  const derivedGender = normalizeGender(session.patient?.gender ?? null) ?? 'male';
  const screeningsState = usePatientScreenings(derivedAge, derivedGender);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<CommunitySortBy>('recent');

  useEffect(() => {
    refreshCommunity({
      limit: 24,
      sort_by: sortBy,
      group_id: activeGroupId ?? undefined,
    });
  }, [activeGroupId, refreshCommunity, sortBy]);

  const displayName = useMemo(
    () =>
      deriveDisplayName({
        profileFirstName: session.profile?.firstName ?? null,
        profileLastName: session.profile?.lastName ?? null,
        accountFullName:
          typeof session.user?.user_metadata?.full_name === 'string'
            ? session.user.user_metadata.full_name
            : null,
        email: session.user?.email ?? session.profile?.email ?? null,
      }),
    [session.profile?.email, session.profile?.firstName, session.profile?.lastName, session.user],
  );

  const membershipsByGroupId = useMemo(
    () => new Set(memberships.map((membership) => membership.group_id)),
    [memberships],
  );

  const appointmentKeywords = useMemo(
    () =>
      appointmentsState.appointments
        .slice(0, 3)
        .flatMap((appointment) => tokenize(appointment.doctor?.specialty ?? appointment.reason ?? appointment.notes)),
    [appointmentsState.appointments],
  );

  const reportKeywords = useMemo(
    () =>
      reportsState.reports
        .slice(0, 3)
        .flatMap((report) => tokenize(`${report.title} ${report.type} ${report.doctorName ?? ''}`)),
    [reportsState.reports],
  );

  const summaryKeywords = useMemo(
    () => [
      ...(medicalHistoryState.summary?.chronic_conditions?.flatMap((condition) => tokenize(condition)) ?? []),
      ...(medicalHistoryState.summary?.current_medications?.flatMap((medication) => tokenize(medication)) ?? []),
    ],
    [medicalHistoryState.summary?.chronic_conditions, medicalHistoryState.summary?.current_medications],
  );

  const screeningKeywords = useMemo(
    () =>
      screeningsState.screenings
        .filter((screening) => screening.status !== 'up_to_date')
        .slice(0, 3)
        .flatMap((screening) => tokenize(`${screening.title} ${screening.category}`)),
    [screeningsState.screenings],
  );

  const recommendationKeywords = useMemo(
    () =>
      Array.from(
        new Set([
          ...appointmentKeywords,
          ...reportKeywords,
          ...summaryKeywords,
          ...screeningKeywords,
          'apoyo',
          'consulta',
          'prevencion',
        ]),
      ),
    [appointmentKeywords, reportKeywords, screeningKeywords, summaryKeywords],
  );

  const recommendedGroups = useMemo<RecommendedCommunityGroup[]>(() => {
    return groups
      .map((group) => {
        const { score, reason } = buildGroupReason(group, recommendationKeywords);
        const isMember = membershipsByGroupId.has(group.id);

        return {
          ...group,
          reason: isMember ? 'Ya participás en este grupo.' : reason,
          isMember,
          matchScore: isMember ? score + 5 : score,
        };
      })
      .sort((left, right) => {
        if (right.matchScore !== left.matchScore) {
          return right.matchScore - left.matchScore;
        }

        if (right.member_count !== left.member_count) {
          return right.member_count - left.member_count;
        }

        return right.post_count - left.post_count;
      })
      .slice(0, 4);
  }, [groups, membershipsByGroupId, recommendationKeywords]);

  const focusAreas = useMemo<CommunityFocusArea[]>(() => {
    const areas: CommunityFocusArea[] = [];

    const upcomingAppointment = appointmentsState.appointments.find((appointment) =>
      appointment.status === 'scheduled' || appointment.status === 'confirmed',
    );

    if (upcomingAppointment) {
      areas.push({
        id: 'appointment-prep',
        label: upcomingAppointment.doctor?.specialty
          ? `Preparar ${upcomingAppointment.doctor.specialty}`
          : 'Preparar tu próxima consulta',
        description: 'Usá la comunidad para ordenar preguntas y escuchar experiencias comparables.',
      });
    }

    if (screeningsState.stats.overdue > 0 || screeningsState.stats.dueSoon > 0) {
      areas.push({
        id: 'screenings',
        label: `${screeningsState.stats.overdue + screeningsState.stats.dueSoon} controles en radar`,
        description: 'Detectamos temas preventivos abiertos que pueden orientar las conversaciones útiles.',
      });
    }

    if ((medicalHistoryState.summary?.chronic_conditions.length ?? 0) > 0) {
      areas.push({
        id: 'conditions',
        label: medicalHistoryState.summary?.chronic_conditions.slice(0, 2).join(' · ') ?? 'Seguimiento clínico',
        description: 'Priorizamos grupos y publicaciones alineadas con tu contexto clínico actual.',
      });
    }

    if (reportsState.reports.length > 0) {
      const latest = reportsState.reports[0];
      areas.push({
        id: 'reports',
        label: latest.title,
        description: 'Tu último informe puede convertirse en mejores preguntas, no en duplicación de datos.',
      });
    }

    if (areas.length === 0) {
      areas.push({
        id: 'general',
        label: 'Comunidad guiada',
        description: 'Explorá apoyo entre pares sin mezclar la conversación social con tu registro clínico.',
      });
    }

    return areas.slice(0, 4);
  }, [
    appointmentsState.appointments,
    medicalHistoryState.summary?.chronic_conditions,
    reportsState.reports,
    screeningsState.stats.dueSoon,
    screeningsState.stats.overdue,
  ]);

  const signalCards = useMemo<CommunitySignalCard[]>(() => {
    const nextAppointment = appointmentsState.appointments.find((appointment) =>
      appointment.status === 'scheduled' || appointment.status === 'confirmed',
    );

    const signals: CommunitySignalCard[] = [
      {
        id: 'agenda',
        eyebrow: 'Agenda',
        title: nextAppointment
          ? nextAppointment.doctor?.specialty ?? 'Próxima consulta'
          : 'Sin consulta próxima',
        description: nextAppointment
          ? 'Llevá preguntas mejores a partir de experiencias similares, no de repetir tu historia clínica.'
          : 'Podés usar la comunidad para preparar dudas antes de agendar.',
        href: '/patients/appointments',
      },
      {
        id: 'reportes',
        eyebrow: 'Informes',
        title:
          reportsState.reports[0]?.title ?? `${reportsState.reports.length} informes disponibles`,
        description:
          reportsState.reports.length > 0
            ? 'Tus informes ya existen en el portal. Acá la idea es sumar contexto y preguntas.'
            : 'Cuando lleguen nuevos informes, la comunidad puede ayudarte a preparar la conversación médica.',
        href: '/patients/history',
      },
      {
        id: 'prevencion',
        eyebrow: 'Prevención',
        title: `${screeningsState.stats.overdue} atrasados · ${screeningsState.stats.dueSoon} próximos`,
        description:
          screeningsState.stats.total > 0
            ? 'Priorizamos discusiones que te ayuden a sostener seguimiento y adherencia.'
            : 'Todavía no hay suficientes screenings para personalizar esta capa.',
      },
      {
        id: 'historia',
        eyebrow: 'Historia',
        title: `${medicalHistoryState.summary?.active_conditions_count ?? 0} condiciones · ${medicalHistoryState.summary?.active_medications_count ?? 0} tratamientos`,
        description: 'La comunidad acompaña el recorrido; el registro clínico sigue viviendo en tu historia médica.',
        href: '/patients/profile',
      },
    ];

    return signals;
  }, [
    appointmentsState.appointments,
    medicalHistoryState.summary?.active_conditions_count,
    medicalHistoryState.summary?.active_medications_count,
    reportsState.reports,
    screeningsState.stats.dueSoon,
    screeningsState.stats.overdue,
    screeningsState.stats.total,
  ]);

  const promptSuggestions = useMemo<CommunityPromptSuggestion[]>(() => {
    const firstRecommended = recommendedGroups[0];
    const latestReport = reportsState.reports[0];
    const overdueScreening = screeningsState.screenings.find((screening) => screening.status !== 'up_to_date');
    const nextAppointment = appointmentsState.appointments.find((appointment) =>
      appointment.status === 'scheduled' || appointment.status === 'confirmed',
    );

    const prompts: CommunityPromptSuggestion[] = [];

    if (nextAppointment) {
      prompts.push({
        id: 'appointment',
        title: 'Preparar consulta',
        content: `Tengo una consulta${nextAppointment.doctor?.specialty ? ` de ${nextAppointment.doctor.specialty}` : ''} y quiero saber qué preguntas vale la pena llevar.`,
        groupId: firstRecommended?.id,
      });
    }

    if (latestReport) {
      prompts.push({
        id: 'report',
        title: 'Entender un informe',
        content: `Recibí un informe sobre ${latestReport.title} y quiero escuchar cómo otros organizaron la conversación con su médico.`,
        groupId: firstRecommended?.id,
      });
    }

    if (overdueScreening) {
      prompts.push({
        id: 'screening',
        title: 'Adherencia preventiva',
        content: `Me cuesta sostener ${overdueScreening.title}. ¿Qué hábitos o recordatorios les funcionaron para no postergarlo?`,
        groupId: firstRecommended?.id,
      });
    }

    prompts.push({
      id: 'privacy',
      title: 'Participar con criterio',
      content: 'Quiero compartir mi experiencia sin exponer datos sensibles. ¿Cómo lo hacen ustedes para cuidar privacidad y aun así recibir apoyo?',
      groupId: firstRecommended?.id,
    });

    return prompts.slice(0, 3);
  }, [appointmentsState.appointments, recommendedGroups, reportsState.reports, screeningsState.screenings]);

  const highlightedPosts = useMemo(() => {
    const recommendedGroupIds = new Set(recommendedGroups.map((group) => group.id));

    return [...posts].sort((left, right) => {
      const leftScore = (recommendedGroupIds.has(left.group_id) ? 10 : 0) + left.reaction_count;
      const rightScore = (recommendedGroupIds.has(right.group_id) ? 10 : 0) + right.reaction_count;
      return rightScore - leftScore;
    });
  }, [posts, recommendedGroups]);

  const summaryStats = useMemo(
    () => [
      { label: 'Grupos activos', value: String(groups.length) },
      { label: 'Circulos para vos', value: String(recommendedGroups.length) },
      { label: 'Conversaciones visibles', value: String(posts.length) },
      { label: 'Tu presencia', value: `${memberships.length} grupos` },
    ],
    [groups.length, memberships.length, posts.length, recommendedGroups.length],
  );

  const loading =
    session.loading ||
    communityLoading ||
    appointmentsState.loading ||
    reportsState.loading ||
    medicalHistoryState.loading;

  const primaryError = session.error || communityError;

  const createPost = useCallback(
    async (payload: { groupId: string; title?: string; content: string; anonymous?: boolean; tags?: string[] }) => {
      await createCommunityPost(payload);
      await refreshCommunity({
        limit: 24,
        sort_by: sortBy,
        group_id: activeGroupId ?? undefined,
      });
    },
    [activeGroupId, createCommunityPost, refreshCommunity, sortBy],
  );

  const reactToPost = useCallback(
    async (postId: string) => {
      await addCommunityReaction({ postId, reactionType: 'like' });
      await refreshCommunity({
        limit: 24,
        sort_by: sortBy,
        group_id: activeGroupId ?? undefined,
      });
    },
    [activeGroupId, addCommunityReaction, refreshCommunity, sortBy],
  );

  return {
    session,
    displayName,
    loading,
    primaryError,
    activeGroupId,
    setActiveGroupId,
    sortBy,
    setSortBy,
    groups,
    memberships,
    posts: highlightedPosts,
    recommendedGroups,
    focusAreas,
    signalCards,
    promptSuggestions,
    summaryStats,
    screeningsStats: screeningsState.stats,
    reportsCount: reportsState.reports.length,
    appointmentsCount: appointmentsState.appointments.length,
    createPost,
    reactToPost,
  };
}
