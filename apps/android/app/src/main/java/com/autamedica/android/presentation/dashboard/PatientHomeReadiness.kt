package com.autamedica.android.presentation.dashboard

import com.autamedica.android.domain.model.PatientProfileSnapshot

enum class ReadinessNextStep {
    NONE,
    ANAMNESIS,
    PROFILE,
}

object PatientHomeReadiness {
    fun calculateProfileProgress(
        userName: String,
        userEmail: String,
        userPhone: String?,
        patientSnapshot: PatientProfileSnapshot?,
    ): Int {
        var score = 0
        if (userName.isNotBlank()) score += 25
        if (userEmail.isNotBlank()) score += 25
        if (!userPhone.isNullOrBlank()) score += 20
        if (!patientSnapshot?.birthDate.isNullOrBlank()) score += 15
        if (!patientSnapshot?.gender.isNullOrBlank()) score += 15
        return score.coerceAtMost(100)
    }

    fun combinedPercentage(anamnesisProgress: Int, profileProgress: Int): Int {
        val safeAnamnesis = anamnesisProgress.coerceIn(0, 100)
        val safeProfile = profileProgress.coerceIn(0, 100)
        return ((safeAnamnesis + safeProfile) / 2).coerceIn(0, 100)
    }

    fun isCompleted(anamnesisProgress: Int, profileProgress: Int): Boolean =
        anamnesisProgress >= 80 && profileProgress >= 70

    fun nextStep(anamnesisProgress: Int, profileProgress: Int): ReadinessNextStep = when {
        isCompleted(anamnesisProgress, profileProgress) -> ReadinessNextStep.NONE
        anamnesisProgress < 80 -> ReadinessNextStep.ANAMNESIS
        else -> ReadinessNextStep.PROFILE
    }
}
