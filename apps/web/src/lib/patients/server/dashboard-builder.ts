import type {
  DashboardPriority,
  DashboardSummary,
} from '@/lib/patients/types/dashboard-summary'
import type {
  PatientSnapshot,
} from '@/lib/patients/types/patient-snapshot'

export function buildMissingSections(snapshot: PatientSnapshot): string[] {
  const missing: string[] = []

  if (snapshot.appointments.upcoming.length === 0) {
    missing.push('appointments')
  }
  if (snapshot.history.anamnesisCompletion === null) {
    missing.push('anamnesis')
  }
  if (snapshot.history.activeConditions.length === 0 && snapshot.history.activeMedications.length === 0) {
    missing.push('medical_history')
  }
  if (snapshot.results.recent.length === 0) {
    missing.push('lab_results')
  }
  if (snapshot.prevention.items.length === 0) {
    missing.push('preventive_screenings')
  }
  if (
    snapshot.observations.recentSymptoms.length === 0 &&
    snapshot.observations.lastVitals === null &&
    snapshot.observations.recentMedicationLogs.length === 0
  ) {
    missing.push('observations')
  }

  return missing
}

export function buildPriorities(summary: Omit<DashboardSummary, 'generatedAt' | 'priorities'>): DashboardPriority[] {
  const priorities: DashboardPriority[] = []

  if (summary.agenda.nextAppointment?.isToday) {
    priorities.push({
      id: 'next-appointment-today',
      title: 'Tienes una consulta para hoy',
      description: summary.agenda.nextAppointment.doctorName
        ? `Tu proxima cita es con ${summary.agenda.nextAppointment.doctorName}.`
        : 'Revisa el horario y prepara tu consulta.',
      href: '/appointments',
      tone: 'critical',
    })
  } else if (summary.agenda.nextAppointment) {
    priorities.push({
      id: 'next-appointment',
      title: 'Tu proxima consulta ya esta agendada',
      description: 'Confirma el horario y revisa indicaciones previas si corresponde.',
      href: '/appointments',
      tone: 'stable',
    })
  }

  if (summary.prevention.overdue > 0) {
    priorities.push({
      id: 'overdue-screenings',
      title: 'Hay chequeos preventivos vencidos',
      description: `${summary.prevention.overdue} control(es) requieren seguimiento.`,
      href: '/preventive-health',
      tone: 'critical',
    })
  } else if (summary.prevention.dueSoon > 0) {
    priorities.push({
      id: 'due-soon-screenings',
      title: 'Tienes chequeos proximos por coordinar',
      description: `${summary.prevention.dueSoon} control(es) estan por vencer.`,
      href: '/preventive-health',
      tone: 'attention',
    })
  }

  if (summary.results.pendingReviewCount > 0) {
    priorities.push({
      id: 'pending-results',
      title: 'Hay estudios pendientes de revision',
      description: `${summary.results.pendingReviewCount} resultado(s) aun no fueron revisados.`,
      href: '/results',
      tone: 'attention',
    })
  } else if (summary.results.latest) {
    priorities.push({
      id: 'latest-results',
      title: 'Tus resultados mas recientes ya estan disponibles',
      description: `Ultimo estudio cargado: ${summary.results.latest.testType}.`,
      href: '/results',
      tone: 'stable',
    })
  }

  if ((summary.history.anamnesisCompletion ?? 0) > 0 && (summary.history.anamnesisCompletion ?? 0) < 100) {
    priorities.push({
      id: 'anamnesis-incomplete',
      title: 'Tu anamnesis todavia no esta completa',
      description: `Llevas ${summary.history.anamnesisCompletion}% completado.`,
      href: '/anamnesis',
      tone: 'attention',
    })
  }

  if (priorities.length === 0) {
    priorities.push({
      id: 'build-history',
      title: 'Tu panel todavia necesita mas datos clinicos',
      description:
        'Completa tu historia clinica o agenda una consulta para personalizar mejor el portal.',
      href: '/medical-history',
      tone: 'stable',
    })
  }

  return priorities.slice(0, 4)
}

export function buildDashboardSummary(snapshot: PatientSnapshot): DashboardSummary {
  const baseSummary = {
    agenda: {
      todayCount: snapshot.appointments.todayCount,
      upcomingCount: snapshot.appointments.upcoming.length,
      nextAppointment: snapshot.appointments.next,
    },
    history: {
      activeConditionsCount: snapshot.history.activeConditions.length,
      activeMedicationsCount: snapshot.history.activeMedications.length,
      knownAllergiesCount: snapshot.history.allergies.length,
      lastEncounterDate: snapshot.history.lastEncounterDate,
      chronicConditions: snapshot.history.activeConditions.slice(0, 3).map((item) => item.name),
      criticalAllergies: snapshot.history.allergies.slice(0, 3),
      currentMedications: snapshot.history.activeMedications.slice(0, 4),
      anamnesisCompletion: snapshot.history.anamnesisCompletion,
    },
    prevention: {
      total: snapshot.prevention.total,
      upToDate: snapshot.prevention.upToDate.length,
      dueSoon: snapshot.prevention.dueSoon.length,
      overdue: snapshot.prevention.overdue.length,
      nextItems: [...snapshot.prevention.overdue, ...snapshot.prevention.dueSoon].slice(0, 3),
    },
    observations: {
      recentSymptom: snapshot.observations.recentSymptoms[0]
        ? {
            name: snapshot.observations.recentSymptoms[0].name,
            severity: snapshot.observations.recentSymptoms[0].severity,
            reportedAt: snapshot.observations.recentSymptoms[0].reportedAt,
          }
        : null,
      lastVitals: snapshot.observations.lastVitals
        ? {
            measuredAt: snapshot.observations.lastVitals.measuredAt,
            bloodPressure: snapshot.observations.lastVitals.bloodPressure,
            heartRate: snapshot.observations.lastVitals.heartRate,
            temperature: snapshot.observations.lastVitals.temperature,
            oxygenSaturation: snapshot.observations.lastVitals.oxygenSaturation,
            weight: snapshot.observations.lastVitals.weight,
          }
        : null,
      medicationTakenLast30Days: snapshot.observations.recentMedicationLogs.filter(
        (item) => item.status === 'taken',
      ).length,
      lastMedicationLogAt: snapshot.observations.recentMedicationLogs[0]?.takenAt ?? null,
    },
    results: {
      total: snapshot.results.recent.length,
      pendingReviewCount: snapshot.results.pendingReviewCount,
      latest: snapshot.results.latest,
    },
  }

  return {
    generatedAt: snapshot.generatedAt,
    ...baseSummary,
    priorities: buildPriorities(baseSummary),
  }
}
