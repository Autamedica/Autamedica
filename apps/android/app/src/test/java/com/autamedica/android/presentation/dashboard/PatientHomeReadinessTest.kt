package com.autamedica.android.presentation.dashboard

import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PatientHomeReadinessTest {
    @Test fun profileProgressSumsExpectedWeightsUpToHundred() {
        val full = PatientHomeReadiness.calculateProfileProgress(
            userName = "Ana Perez",
            userEmail = "ana@example.com",
            userPhone = "+5491155551111",
            patientSnapshot = PatientProfileSnapshot(birthDate = "1990-05-01", gender = "female"),
        )
        assertThat(full).isEqualTo(100)

        val partial = PatientHomeReadiness.calculateProfileProgress(
            userName = "Ana",
            userEmail = "ana@example.com",
            userPhone = null,
            patientSnapshot = null,
        )
        assertThat(partial).isEqualTo(50)
    }

    @Test fun readinessHidesBannerOnceThresholdsAreMet() {
        assertThat(PatientHomeReadiness.isCompleted(anamnesisProgress = 80, profileProgress = 70)).isTrue()
        assertThat(PatientHomeReadiness.nextStep(anamnesisProgress = 80, profileProgress = 70))
            .isEqualTo(ReadinessNextStep.NONE)
    }

    @Test fun readinessPrioritizesAnamnesisThenProfile() {
        assertThat(PatientHomeReadiness.nextStep(anamnesisProgress = 40, profileProgress = 50))
            .isEqualTo(ReadinessNextStep.ANAMNESIS)
        assertThat(PatientHomeReadiness.nextStep(anamnesisProgress = 90, profileProgress = 50))
            .isEqualTo(ReadinessNextStep.PROFILE)
    }

    @Test fun combinedPercentageClampsOutOfRangeValues() {
        assertThat(PatientHomeReadiness.combinedPercentage(anamnesisProgress = 120, profileProgress = 100))
            .isEqualTo(100)
        assertThat(PatientHomeReadiness.combinedPercentage(anamnesisProgress = -10, profileProgress = 40))
            .isEqualTo(20)
    }
}
