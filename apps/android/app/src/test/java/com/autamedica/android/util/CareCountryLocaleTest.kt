package com.autamedica.android.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CareCountryLocaleTest {
    @Test
    fun clinicalMarketSelectsPortugueseOrSpanishInterface() {
        assertThat(CareCountryLocale.languageTagForCountry("BR")).isEqualTo("pt-BR")
        assertThat(CareCountryLocale.languageTagForCountry("AR")).isEqualTo("es")
    }

    @Test
    fun invalidCountryMustNotSilentlyDefaultToAnotherJurisdiction() {
        var rejected = false
        try {
            CareCountryLocale.languageTagForCountry("US")
        } catch (_: IllegalArgumentException) {
            rejected = true
        }
        assertThat(rejected).isTrue()
    }
}
