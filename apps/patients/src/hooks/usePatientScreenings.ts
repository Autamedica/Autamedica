import { useMemo } from 'react';
import { usePreventiveScreenings } from './usePreventiveScreenings';
import { usePatientSession } from './usePatientSession';

export interface ScreeningData {
  id: string;
  title: string;
  status: 'overdue' | 'due_soon' | 'up_to_date';
  priority: 'high' | 'medium' | 'low';
  category: 'cardiovascular' | 'cancer' | 'metabolic' | 'general';
  last_done_date?: string;
  next_due_date: string;
}

export interface AchievementBadge {
  id: string;
  emoji: string;
  title: string;
  description: string;
  level: 'gold' | 'silver' | 'bronze';
  earned: boolean;
  progress: number;
  maxProgress: number;
}

export interface WeeklyGoal {
  id: string;
  label: string;
  completed: number;
  total: number;
  category: string;
}

type LegacyCategory = 'cardiovascular' | 'cancer' | 'metabolic' | 'general';

function mapCategory(category: string): LegacyCategory {
  switch (category) {
    case 'cancer_screening':
      return 'cancer';
    case 'cardiovascular':
      return 'cardiovascular';
    case 'metabolic':
      return 'metabolic';
    default:
      return 'general';
  }
}

function mapStatus(status: string): ScreeningData['status'] {
  switch (status) {
    case 'completed':
      return 'up_to_date';
    case 'overdue':
      return 'overdue';
    default:
      return 'due_soon';
  }
}

/**
 * Hook para gestionar screenings preventivos y calcular logros
 * sin introducir recomendaciones sintéticas en cliente.
 */
export function usePatientScreenings(
  _patientAge?: number,
  _patientGender?: 'male' | 'female',
) {
  const { patient } = usePatientSession();
  const { myScreenings, recommendations } = usePreventiveScreenings({
    patientId: patient?.id,
    includeCompleted: true,
  });

  const screenings: ScreeningData[] = useMemo(() => {
    const byId = new Map<string, ScreeningData>();

    for (const item of myScreenings) {
      byId.set(item.screening_id, {
        id: item.screening_id,
        title: item.screening?.name || 'Screening preventivo',
        status: mapStatus(item.status),
        priority: item.status === 'overdue' ? 'high' : item.status === 'scheduled' ? 'medium' : 'low',
        category: mapCategory(item.screening?.category || 'general'),
        last_done_date: item.completed_date || undefined,
        next_due_date: item.next_due_date || item.scheduled_date || 'Sin fecha definida',
      });
    }

    for (const recommendation of recommendations) {
      if (byId.has(recommendation.screening.id)) {
        continue;
      }

      byId.set(recommendation.screening.id, {
        id: recommendation.screening.id,
        title: recommendation.screening.name,
        status: recommendation.urgency === 'high' ? 'overdue' : 'due_soon',
        priority: recommendation.urgency,
        category: mapCategory(recommendation.screening.category),
        last_done_date: undefined,
        next_due_date: recommendation.next_due_date || 'Sin fecha definida',
      });
    }

    return Array.from(byId.values());
  }, [myScreenings, recommendations]);

  // Calcular estadísticas
  const stats = useMemo(() => {
    const total = screenings.length;
    const upToDate = screenings.filter(s => s.status === 'up_to_date').length;
    const dueSoon = screenings.filter(s => s.status === 'due_soon').length;
    const overdue = screenings.filter(s => s.status === 'overdue').length;
    const cardiovascularScreenings = screenings.filter(s => s.category === 'cardiovascular');
    const cancerScreenings = screenings.filter(s => s.category === 'cancer');

    return {
      total,
      upToDate,
      dueSoon,
      overdue,
      completionRate: total > 0 ? Math.round((upToDate / total) * 100) : 0,
      cardiovascularScreenings,
      cancerScreenings,
    };
  }, [screenings]);

  // Calcular logros/badges basados en screenings
  const achievements: AchievementBadge[] = useMemo(() => {
    const badges: AchievementBadge[] = [];

    // Badge: Guerrero Cardiovascular
    const cvComplete = stats.cardiovascularScreenings.filter(s => s.status === 'up_to_date').length;
    const cvTotal = stats.cardiovascularScreenings.length;
    badges.push({
      id: 'cardiovascular-warrior',
      emoji: '🥇',
      title: 'Guerrero CV',
      description: 'Todos los controles cardiovasculares al día',
      level: cvTotal > 0 && cvComplete === cvTotal ? 'gold' : cvComplete > 0 ? 'silver' : 'bronze',
      earned: cvTotal > 0 && cvComplete === cvTotal,
      progress: cvComplete,
      maxProgress: cvTotal,
    });

    // Badge: Detección Temprana (Cáncer)
    const cancerComplete = stats.cancerScreenings.filter(s => s.status === 'up_to_date').length;
    const cancerTotal = stats.cancerScreenings.length;
    badges.push({
      id: 'early-detection',
      emoji: '🎗️',
      title: 'Detección Temprana',
      description: 'Screenings de cáncer completados',
      level: cancerComplete === cancerTotal ? 'gold' : cancerComplete > 0 ? 'silver' : 'bronze',
      earned: cancerComplete > 0,
      progress: cancerComplete,
      maxProgress: cancerTotal,
    });

    // Badge: Adherencia
    const adherenceRate = stats.completionRate;
    badges.push({
      id: 'adherence',
      emoji: '🥈',
      title: 'Adherencia',
      description: `${adherenceRate}% de controles al día`,
      level: adherenceRate >= 80 ? 'gold' : adherenceRate >= 60 ? 'silver' : 'bronze',
      earned: adherenceRate >= 60,
      progress: stats.upToDate,
      maxProgress: stats.total,
    });

    // Badge: Sin Retrasos
    badges.push({
      id: 'no-delays',
      emoji: '⏰',
      title: 'Sin Retrasos',
      description: 'Ningún screening atrasado',
      level: stats.total > 0 && stats.overdue === 0 ? 'gold' : 'bronze',
      earned: stats.total > 0 && stats.overdue === 0,
      progress: stats.total - stats.overdue,
      maxProgress: stats.total,
    });

    return badges.sort((a, b) => Number(b.earned) - Number(a.earned));
  }, [stats]);

  // Calcular metas semanales basadas en screenings
  const weeklyGoals: WeeklyGoal[] = useMemo(() => {
    if (stats.total === 0) {
      return [];
    }

    return [
      {
        id: 'screenings-up-to-date',
        label: 'Controles al día',
        completed: stats.upToDate,
        total: stats.total,
        category: 'preventive',
      },
      {
        id: 'screenings-due-soon',
        label: 'Controles próximos',
        completed: Math.max(stats.total - stats.dueSoon, 0),
        total: stats.total,
        category: 'preventive',
      },
      {
        id: 'screenings-without-delay',
        label: 'Sin retrasos',
        completed: Math.max(stats.total - stats.overdue, 0),
        total: stats.total,
        category: 'preventive',
      },
    ];
  }, [stats]);

  return {
    screenings,
    stats,
    achievements,
    weeklyGoals,
  };
}
