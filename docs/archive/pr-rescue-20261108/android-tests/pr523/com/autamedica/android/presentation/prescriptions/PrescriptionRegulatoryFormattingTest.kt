package com.autamedica.android.presentation.prescriptions

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.Locale

class PrescriptionRegulatoryFormattingTest {

    @Test
    fun `isBrazilPrescription returns true when countryCode is BR`() {
        assertThat(isBrazilPrescription(countryCode = "BR", doctorLicense = null)).isTrue()
        assertThat(isBrazilPrescription(countryCode = "br", doctorLicense = "12345")).isTrue()
    }

    @Test
    fun `isBrazilPrescription returns true when doctor license contains CRM`() {
        assertThat(isBrazilPrescription(countryCode = null, doctorLicense = "CRM-RS 12345")).isTrue()
        assertThat(isBrazilPrescription(countryCode = "AR", doctorLicense = "CRM 43210")).isTrue()
    }

    @Test
    fun `formatDoctorLicense formats as CRM-RS in Brazil context`() {
        assertThat(formatDoctorLicense("12345", isBrazil = true)).isEqualTo("CRM-RS: 12345")
        assertThat(formatDoctorLicense("CRM-RS 12345", isBrazil = true)).isEqualTo("CRM-RS 12345")
        assertThat(formatDoctorLicense("CRM 12345", isBrazil = true)).isEqualTo("CRM 12345")
    }

    @Test
    fun `formatDoctorLicense formats as Matricula in Argentina context`() {
        assertThat(formatDoctorLicense("12345", isBrazil = false)).isEqualTo("Matrícula: 12345")
        assertThat(formatDoctorLicense("MN 12345", isBrazil = false)).isEqualTo("MN 12345")
        assertThat(formatDoctorLicense("MP 54321", isBrazil = false)).isEqualTo("MP 54321")
    }
}
