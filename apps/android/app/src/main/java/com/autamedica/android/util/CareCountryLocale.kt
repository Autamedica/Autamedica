package com.autamedica.android.util

import android.content.Context

/**
 * Compatibility wrapper retained for Activity call sites.
 *
 * UI language is a user preference managed independently from clinical
 * jurisdiction. Care country must never alter Android application locales.
 */
object CareCountryLocale {
    fun wrap(base: Context): Context = base
}
