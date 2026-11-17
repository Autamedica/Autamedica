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
 * Applies the app's display language independently from clinical jurisdiction.
 *
 * Precedence:
 * 1. Explicit app-language preference (or a language selected in Android Settings).
 * 2. Patient care-country default (AR -> Spanish, BR -> Brazilian Portuguese).
 * 3. Device language until a care country is known.
 *
 * The care country remains clinical/business data and is never inferred from UI locale.
 */
object CareCountryLocale {
    const val PREFERENCES = "autamedica_ui_language"
    const val KEY_USER_LANGUAGE_TAG = "user_language_tag"
    const val KEY_CARE_COUNTRY = "care_country"
    const val KEY_LAST_MARKET_LANGUAGE_TAG = "last_market_language_tag"

    fun languageTagForCountry(country: String): String = when (country.trim().uppercase(Locale.ROOT)) {
        "BR" -> "pt-BR"
        "AR" -> "es"
        else -> throw IllegalArgumentException("Unsupported care country")
    }

    /**
     * Pure resolver used by startup code and tests. A missing/unsupported market
     * never forces another country's locale; the device locale remains the fallback.
     */
    fun resolveLanguageTag(
        preferredLanguageTag: String?,
        careCountry: String?,
        deviceLanguageTag: String,
    ): String {
        return supportedLanguageTag(preferredLanguageTag)
            ?: careCountry?.let { runCatching { languageTagForCountry(it) }.getOrNull() }
            ?: deviceLanguageTag.takeIf { it.isNotBlank() }
            ?: Locale.getDefault().toLanguageTag()
    }

    /**
     * Supplies the saved locale before Activity resources are created on Android 8-12.
     * Android 13+ uses the native per-app locale API and persists that selection itself.
     */
    fun wrap(base: Context): Context {
        val prefs = base.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        val preferred = supportedLanguageTag(prefs.getString(KEY_USER_LANGUAGE_TAG, null))
        val careCountry = prefs.getString(KEY_CARE_COUNTRY, null)
        val hasLocalePreference = preferred != null || careCountry in setOf("AR", "BR")
        if (!hasLocalePreference) return base

        val deviceTag = base.resources.configuration.locales[0]?.toLanguageTag()
            ?: Locale.getDefault().toLanguageTag()
        val targetTag = resolveLanguageTag(preferred, careCountry, deviceTag)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            syncAndroid13Locale(base, prefs, preferred, careCountry)
            return base
        }

        val configuration = Configuration(base.resources.configuration)
        val currentTag = configuration.locales[0]?.toLanguageTag()
        if (!sameLocale(currentTag, targetTag)) {
            configuration.setLocale(Locale.forLanguageTag(targetTag))
            return base.createConfigurationContext(configuration)
        }
        return base
    }

    /**
     * Called only after the server confirms a patient's care country or after an
     * explicit country selection succeeds. It updates a default, never an explicit
     * language preference.
     */
    fun applyCareCountryDefault(context: Context, country: String) {
        val normalizedCountry = country.trim().uppercase(Locale.ROOT)
        val marketLanguageTag = languageTagForCountry(normalizedCountry)
        val prefs = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_CARE_COUNTRY, normalizedCountry).apply()

        val preferred = supportedLanguageTag(prefs.getString(KEY_USER_LANGUAGE_TAG, null))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val manager = context.getSystemService(LocaleManager::class.java) ?: return
            val currentTag = manager.applicationLocales.toLanguageTags()
            val lastMarketTag = prefs.getString(KEY_LAST_MARKET_LANGUAGE_TAG, null)

            // On Android 13+, a difference from the last locale Autamedica applied
            // means the user changed the app language in Android Settings.
            if (preferred == null && currentTag.isNotBlank() && currentTag != lastMarketTag) {
                supportedLanguageTag(currentTag)?.let { userTag ->
                    prefs.edit()
                        .putString(KEY_USER_LANGUAGE_TAG, userTag)
                        .putString(KEY_LAST_MARKET_LANGUAGE_TAG, marketLanguageTag)
                        .apply()
                    return
                }
            }

            val targetTag = preferred ?: marketLanguageTag
            if (currentTag != targetTag) {
                manager.applicationLocales = LocaleList.forLanguageTags(targetTag)
            }
            prefs.edit().putString(KEY_LAST_MARKET_LANGUAGE_TAG, marketLanguageTag).apply()
            return
        }

        prefs.edit().putString(KEY_LAST_MARKET_LANGUAGE_TAG, marketLanguageTag).apply()
        val targetTag = preferred ?: marketLanguageTag
        val activity = context.findActivity() ?: return
        val currentTag = activity.resources.configuration.locales[0]?.toLanguageTag()
        if (!sameLocale(currentTag, targetTag)) {
            activity.recreate()
        }
    }

    /**
     * Optional explicit app-language setting. Pass null to return to the market
     * default (or the device language until a care country is known).
     */
    fun setUserLanguage(context: Context, languageTag: String?) {
        val normalized = languageTag?.let(::supportedLanguageTag)
        require(languageTag == null || normalized != null) { "Unsupported app language" }

        val prefs = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        prefs.edit().apply {
            if (normalized == null) remove(KEY_USER_LANGUAGE_TAG)
            else putString(KEY_USER_LANGUAGE_TAG, normalized)
            apply()
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val country = prefs.getString(KEY_CARE_COUNTRY, null)
            val target = normalized
                ?: country?.let { runCatching { languageTagForCountry(it) }.getOrNull() }
            val manager = context.getSystemService(LocaleManager::class.java) ?: return
            manager.applicationLocales = target?.let(LocaleList::forLanguageTags)
                ?: LocaleList.getEmptyLocaleList()
        } else {
            context.findActivity()?.recreate()
        }
    }

    private fun syncAndroid13Locale(
        context: Context,
        prefs: android.content.SharedPreferences,
        preferred: String?,
        careCountry: String?,
    ) {
        val manager = context.getSystemService(LocaleManager::class.java) ?: return
        val currentTag = manager.applicationLocales.toLanguageTags()
        val lastMarketTag = prefs.getString(KEY_LAST_MARKET_LANGUAGE_TAG, null)

        if (preferred == null && currentTag.isNotBlank() && currentTag != lastMarketTag) {
            supportedLanguageTag(currentTag)?.let { userTag ->
                prefs.edit().putString(KEY_USER_LANGUAGE_TAG, userTag).apply()
            }
            return
        }

        val target = preferred
            ?: careCountry?.let { runCatching { languageTagForCountry(it) }.getOrNull() }
            ?: return
        if (currentTag != target) {
            manager.applicationLocales = LocaleList.forLanguageTags(target)
        }
        if (careCountry in setOf("AR", "BR")) {
            prefs.edit().putString(KEY_LAST_MARKET_LANGUAGE_TAG, languageTagForCountry(requireNotNull(careCountry))).apply()
        }
    }

    private fun supportedLanguageTag(value: String?): String? {
        val parsed = value?.trim()?.replace('_', '-')?.takeIf { it.isNotEmpty() }
            ?.let(Locale::forLanguageTag) ?: return null
        return when (parsed.language.lowercase(Locale.ROOT)) {
            "es" -> "es"
            "pt" -> if (parsed.country.equals("BR", ignoreCase = true)) "pt-BR" else "pt"
            else -> null
        }
    }

    private fun sameLocale(current: String?, target: String): Boolean {
        if (current.isNullOrBlank()) return false
        val currentLocale = Locale.forLanguageTag(current)
        val targetLocale = Locale.forLanguageTag(target)
        return currentLocale.language.equals(targetLocale.language, ignoreCase = true) &&
            (targetLocale.country.isBlank() ||
                currentLocale.country.equals(targetLocale.country, ignoreCase = true))
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
