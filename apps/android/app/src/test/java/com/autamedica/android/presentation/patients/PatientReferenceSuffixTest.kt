package com.autamedica.android.presentation.patients

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PatientReferenceSuffixTest {
    @Test
    fun suffixIsStableAndUsesLastFourIdentifierCharacters() {
        val patientId = "2fbc88de-cc31-42c7-9c10-6e42a1b3d9af"
        assertThat(patientReferenceSuffix(patientId)).isEqualTo("D9AF")
        assertThat(patientReferenceSuffix(patientId)).isEqualTo("D9AF")
    }

    @Test
    fun separatePatientIdsKeepSeparateReferences() {
        assertThat(patientReferenceSuffix("00000000-0000-0000-0000-00000000a123"))
            .isEqualTo("A123")
        assertThat(patientReferenceSuffix("00000000-0000-0000-0000-00000000b456"))
            .isEqualTo("B456")
    }
}
