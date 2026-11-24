package com.autamedica.android.presentation.health

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import java.util.Locale

internal fun isPortugueseRuntime(locale: Locale = Locale.getDefault()): Boolean =
    locale.language.equals("pt", ignoreCase = true)

@Composable
internal fun isPortugueseUi(): Boolean {
    val configuration = LocalConfiguration.current
    val locale = configuration.locales[0] ?: Locale.getDefault()
    return isPortugueseRuntime(locale)
}

internal fun localizedCopy(es: String, pt: String, isPortuguese: Boolean): String =
    if (isPortuguese) pt else es

@Composable
internal fun healthText(es: String, pt: String): String =
    if (isPortugueseUi()) pt else es
