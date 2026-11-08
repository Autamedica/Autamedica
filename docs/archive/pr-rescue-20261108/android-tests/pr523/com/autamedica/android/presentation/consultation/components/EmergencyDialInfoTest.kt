package com.autamedica.android.presentation.consultation.components

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.Locale

class EmergencyDialInfoTest {

    @Test
    fun `resolveEmergencyDialInfo resolves to SAMU 192 for Brazilian locales`() {
        val ptBr = Locale("pt", "BR")
        val info = resolveEmergencyDialInfo(configuredPhone = null, locale = ptBr)
        assertThat(info.phone).isEqualTo("192")
        assertThat(info.serviceName).isEqualTo("SAMU")
        assertThat(info.buttonText).contains("192")
        assertThat(info.buttonText).contains("SAMU")
    }

    @Test
    fun `resolveEmergencyDialInfo resolves to SAMU 192 for plus 55 phone prefix`() {
        val enUs = Locale("en", "US")
        val info = resolveEmergencyDialInfo(configuredPhone = "+55192", locale = enUs)
        assertThat(info.phone).isEqualTo("192")
        assertThat(info.serviceName).isEqualTo("SAMU")
    }

    @Test
    fun `resolveEmergencyDialInfo resolves to SAME 107 for Argentine locales`() {
        val esAr = Locale("es", "AR")
        val info = resolveEmergencyDialInfo(configuredPhone = "107", locale = esAr)
        assertThat(info.phone).isEqualTo("107")
        assertThat(info.serviceName).isEqualTo("SAME")
        assertThat(info.buttonText).contains("107")
        assertThat(info.buttonText).contains("SAME")
    }

    @Test
    fun `resolveEmergencyDialInfo falls back to 911 for generic locale without specific phone`() {
        val enUs = Locale("en", "US")
        val info = resolveEmergencyDialInfo(configuredPhone = null, locale = enUs)
        assertThat(info.phone).isEqualTo("911")
        assertThat(info.buttonText).contains("911")
    }
}
