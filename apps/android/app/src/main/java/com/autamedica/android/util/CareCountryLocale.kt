package com.autamedica.android.util

import android.app.Activity
import android.app.LocaleManager
import android.content.Context
import android.content.ContextWrapper
import android.content.res.Configuration
import android.os.Build
import android.os.LocaleList
import java.util.Locale

/**
 * UI language preference only. Clinical jurisdiction remains in careCountry on the
 * dispatch request and must never be inferred from the device/app language.
 */
object CareCountryLocale {
    private const val PREFERENCES = "autamedica_ui_language"
    private const val LANGUAGE_TAG = "language_tag"

    fun languageTagForCountry(country: String): String = when (country) {
        "BR" -> "pt-BR"
        "AR" -> "es"
        else -> throw IllegalArgumentException("Unsupported care country")
    }

    /**
     * Android 8-12: provide the saved language to MainActivity before Compose
     * inflates resources. Android 13+ persists per-app locales in LocaleManager.
     */
    fun wrap(base: Context): Context {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return base
        val tag = base.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString(LANGUAGE_TAG, null) ?: return base
        val localized = Configuration(base.resources.configuration)
        localized.setLocale(Locale.forLanguageTag(tag))
        return base.createConfigurationContext(localized)
    }

    /**
     * Selection changes the entire Activity language, including its navigation
     * destinations. Android recreates the Activity when necessary; the ViewModel
     * retains form/queue state across the configuration change.
     */
    fun applyCountry(context: Context, country: String) {
        val languageTag = languageTagForCountry(country)
        val activity = context.findActivity() ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val manager = activity.getSystemService(LocaleManager::class.java)
            if (manager.applicationLocales.toLanguageTags() != languageTag) {
                manager.applicationLocales = LocaleList.forLanguageTags(languageTag)
            }
        } else {
            val prefs = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            if (prefs.getString(LANGUAGE_TAG, null) != languageTag) {
                prefs.edit().putString(LANGUAGE_TAG, languageTag).apply()
                activity.recreate()
            }
        }
    }

    private fun Context.findActivity(): Activity? {
        var current: Context = this
        while (current is ContextWrapper) {
            if (current is Activity) return current
            val base = current.baseContext
            if (base === current) break
            current = base
        }
        return current as? Activity
    }
}
