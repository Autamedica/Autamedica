export type DashboardPriorityTone = 'critical' | 'attention' | 'stable'

export interface DashboardAppointmentSummary {
  id: string
  startTime: string
  status: string | null
  type: string | null
  meetingUrl: string | null
  location: string | null
  doctorName: string | null
  doctorSpecialty: string | null
  isToday: boolean
}

export interface DashboardMedicationSummary {
  id: string
  name: string
  dosage: string
  frequency: string
  status: string
  startDate: string | null
  notes: string | null
}

export interface DashboardResultSummary {
  id: string
  testType: string
  testDate: string
  status: string
  laboratoryName: string | null
  notes: string | null
  reviewedAt: string | null
}

export interface DashboardScreeningSummary {
  id: string
  title: string
  status: 'overdue' | 'due_soon' | 'up_to_date'
  priority: 'high' | 'medium' | 'low'
  category: string
  nextDueDate: string | null
}

export interface DashboardPriority {
  id: string
  title: string
  description: string
  href: string
  tone: DashboardPriorityTone
}

export interface DashboardSummary {
  generatedAt: string
  agenda: {
    todayCount: number
    upcomingCount: number
    nextAppointment: DashboardAppointmentSummary | null
  }
  history: {
    activeConditionsCount: number
    activeMedicationsCount: number
    knownAllergiesCount: number
    lastEncounterDate: string | null
    chronicConditions: string[]
    criticalAllergies: string[]
    currentMedications: DashboardMedicationSummary[]
    anamnesisCompletion: number | null
  }
  prevention: {
    total: number
    upToDate: number
    dueSoon: number
    overdue: number
    nextItems: DashboardScreeningSummary[]
  }
  observations: {
    recentSymptom: {
      name: string
      severity: number
      reportedAt: string
    } | null
    lastVitals: {
      measuredAt: string
      bloodPressure: string | null
      heartRate: number | null
      temperature: number | null
      oxygenSaturation: number | null
      weight: number | null
    } | null
    medicationTakenLast30Days: number
    lastMedicationLogAt: string | null
  }
  results: {
    total: number
    pendingReviewCount: number
    latest: DashboardResultSummary | null
  }
  priorities: DashboardPriority[]
}

export interface DashboardSummaryResponse {
  success: boolean
  data?: DashboardSummary
  error?: string
}
