package com.autamedica.android.domain.model

data class PatientContinuityCase(
    val id: String,
    val caseIntent: String,
    val triageStatus: String,
    val triagePriorityRank: Int,
    val riskOfInterruption: String?,
    val medicationName: String?,
    val medicationDose: String?,
    val medicationDaysRemaining: Int?,
    val assignedDoctorId: String?,
    val acknowledgedAt: String?,
    val resolvedAt: String?,
    val resolutionDeadlineAt: String?,
    val createdAt: String,
)

data class MedicationAdherenceSummary(
    val dosesTakenInCycle: Int,
    val totalDosesInCycle: Int = 30,
    val isTakenToday: Boolean,
) {
    val score: Int
        get() = if (totalDosesInCycle <= 0) 0
        else ((dosesTakenInCycle.toDouble() / totalDosesInCycle) * 100).toInt().coerceIn(0, 100)
}
