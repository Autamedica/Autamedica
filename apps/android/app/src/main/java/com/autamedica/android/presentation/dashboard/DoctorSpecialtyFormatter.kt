package com.autamedica.android.presentation.dashboard

import java.text.Normalizer
import java.util.Locale

/** Maps common general-medicine aliases to the localized resource label. */
internal fun formatDoctorSpecialty(
    specialty: String?,
    localizedGeneralLabel: String,
): String {
    val raw = specialty?.trim().orEmpty()
    if (raw.isBlank()) return localizedGeneralLabel

    val normalized = Normalizer.normalize(raw, Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .lowercase(Locale.ROOT)
        .replace(Regex("\\s+"), " ")

    val generalAliases = setOf(
        "general",
        "medicina general",
        "medicina general y familiar",
        "clinica medica",
        "medicina geral",
        "clinica geral",
        "general medicine",
        "general practice",
    )
    return if (normalized in generalAliases) localizedGeneralLabel
    else raw.replaceFirstChar { it.titlecase(Locale.ROOT) }
}
