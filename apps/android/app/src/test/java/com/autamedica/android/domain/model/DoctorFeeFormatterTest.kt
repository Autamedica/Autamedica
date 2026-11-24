package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.util.Locale

class DoctorFeeFormatterTest {

    private lateinit var originalLocale: Locale

    @Before
    fun setUp() {
        originalLocale = Locale.getDefault()
    }

    @After
    fun tearDown() {
        Locale.setDefault(originalLocale)
    }

    @Test
    fun `formats Argentine license fee in ARS regardless of pt-BR device locale`() {
        Locale.setDefault(Locale("pt", "BR"))
        assertThat(DoctorFeeFormatter.format(15000.0, "MN 187068")).isEqualTo("$ 15.000")
    }

    @Test
    fun `formats Brazilian CRM fee in BRL regardless of es-AR device locale`() {
        Locale.setDefault(Locale("es", "AR"))
        assertThat(DoctorFeeFormatter.format(150.0, "CRM-RS 006402")).isEqualTo("R$ 150")
    }

    @Test
    fun `resolves currency code from license prefix`() {
        assertThat(DoctorFeeFormatter.resolveCurrencyCode("CRM-SP 123456")).isEqualTo("BRL")
        assertThat(DoctorFeeFormatter.resolveCurrencyCode("crm-rs 006402")).isEqualTo("BRL")
        assertThat(DoctorFeeFormatter.resolveCurrencyCode("MN 187068")).isEqualTo("ARS")
        assertThat(DoctorFeeFormatter.resolveCurrencyCode("MP 036802")).isEqualTo("ARS")
        assertThat(DoctorFeeFormatter.resolveCurrencyCode(null)).isEqualTo("ARS")
    }
}
