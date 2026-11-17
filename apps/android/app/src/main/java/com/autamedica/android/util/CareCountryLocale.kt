package com.autamedica.android.util

import android.content.Context

/**
 * Compatibility wrapper retained for Activity call sites.
 * UI language is a user preference; clinical jurisdiction never changes app locale.
 */
object CareCountryLocale {
    /** Kept as a market-format helper; it does not apply or persist an app locale. */
    fun languageTagForCountry(country: String): String = when (country) {
        "BR" -> "pt-BR"
        "AR" -> "es"
        else -> throw IllegalArgumentException("Unsupported care country")
    }

    fun wrap(base: Context): Context = base
}
