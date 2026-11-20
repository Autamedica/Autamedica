package com.autamedica.android.presentation.dashboard

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DoctorSpecialtyFormatterTest {
    @Test
    fun generalMedicineUsesBrazilianPortugueseLabel() {
        assertThat(formatDoctorSpecialty("Medicina General", "Clínica Geral"))
            .isEqualTo("Clínica Geral")
    }

    @Test
    fun generalMedicineUsesLatinAmericanSpanishLabel() {
        assertThat(formatDoctorSpecialty("Medicina General", "Medicina General"))
            .isEqualTo("Medicina General")
    }

    @Test
    fun spanishAndPortugueseGeneralAliasesAreLocalized() {
        assertThat(formatDoctorSpecialty("Clínica médica", "Clínica Geral"))
            .isEqualTo("Clínica Geral")
        assertThat(formatDoctorSpecialty("Clínica Geral", "Medicina General"))
            .isEqualTo("Medicina General")
    }

    @Test
    fun specificSpecialtiesKeepTheirDatabaseName() {
        assertThat(formatDoctorSpecialty("Cardiología", "Clínica Geral"))
            .isEqualTo("Cardiología")
    }
}
