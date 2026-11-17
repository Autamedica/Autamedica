package com.autamedica.android.util

import android.content.Context
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
class CareCountryLocaleTest {
    @Test
    fun argentinaDefaultsToSpanishAndBrazilDefaultsToBrazilianPortuguese() {
        assertThat(CareCountryLocale.languageTagForCountry("AR")).isEqualTo("es")
        assertThat(CareCountryLocale.languageTagForCountry("BR")).isEqualTo("pt-BR")
    }

    @Test
    fun explicitLanguagePreferenceHasPriorityOverCareCountry() {
        assertThat(CareCountryLocale.resolveLanguageTag("pt-BR", "AR", "es-AR"))
            .isEqualTo("pt-BR")
        assertThat(CareCountryLocale.resolveLanguageTag("es", "BR", "pt-BR"))
            .isEqualTo("es")
    }

    @Test
    fun careCountryDefaultHasPriorityOverDeviceLanguage() {
        assertThat(CareCountryLocale.resolveLanguageTag(null, "AR", "pt-BR"))
            .isEqualTo("es")
        assertThat(CareCountryLocale.resolveLanguageTag(null, "BR", "es-AR"))
            .isEqualTo("pt-BR")
    }

    @Test
    fun missingOrUnsupportedCareCountryFallsBackToDeviceLanguage() {
        assertThat(CareCountryLocale.resolveLanguageTag(null, null, "pt-BR"))
            .isEqualTo("pt-BR")
        assertThat(CareCountryLocale.resolveLanguageTag(null, "US", "pt-BR"))
            .isEqualTo("pt-BR")
    }

    @Test
    fun invalidCountryIsRejected() {
        assertThat(runCatching { CareCountryLocale.languageTagForCountry("US") }.isFailure)
            .isTrue()
    }

    @Test
    @Config(sdk = [26])
    fun androidEightThroughTwelveContextUsesCachedMarketLocale() {
        val base = RuntimeEnvironment.getApplication()
        clearPreferences(base)
        base.getSharedPreferences(CareCountryLocale.PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(CareCountryLocale.KEY_CARE_COUNTRY, "AR")
            .apply()

        val localized = CareCountryLocale.wrap(base)

        assertThat(localized.resources.configuration.locales[0].language).isEqualTo("es")
    }

    @Test
    @Config(sdk = [32])
    fun explicitLanguagePreferenceOverridesCachedMarketLocaleInContext() {
        val base = RuntimeEnvironment.getApplication()
        clearPreferences(base)
        base.getSharedPreferences(CareCountryLocale.PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(CareCountryLocale.KEY_CARE_COUNTRY, "AR")
            .putString(CareCountryLocale.KEY_USER_LANGUAGE_TAG, "pt-BR")
            .apply()

        val localized = CareCountryLocale.wrap(base)

        assertThat(localized.resources.configuration.locales[0].toLanguageTag()).isEqualTo("pt-BR")
    }

    private fun clearPreferences(context: Context) {
        context.getSharedPreferences(CareCountryLocale.PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }
}
