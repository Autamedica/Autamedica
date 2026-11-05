package com.autamedica.android.domain.model

import java.util.Locale

private val brazilianStates = setOf(
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
    "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
    "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
)

/**
 * Display-only credential label derived from verified jurisdiction fields.
 * An unknown or conflicting license must not be presented as MN/MP/CRM.
 * This is not a substitute for authorization by the clinical backend.
 */
fun formatDoctorCredentialLabel(
    licenseNumber: String?,
    licenseType: String?,
    countryCode: String?,
    ufBrazil: String?,
): String? {
    val number = licenseNumber?.trim()?.takeIf(String::isNotBlank) ?: return null
    val type = licenseType?.trim()?.uppercase(Locale.ROOT)
    val country = countryCode?.trim()?.uppercase(Locale.ROOT)

    val prefix = when {
        country == "AR" && type in setOf("MN", "MP") -> type!!
        country == "BR" && type == "CRM" -> {
            val uf = ufBrazil?.trim()?.uppercase(Locale.ROOT)
                ?.takeIf { it in brazilianStates } ?: return null
            "CRM-$uf"
        }
        else -> return null
    }

    return if (number.startsWith("$prefix ", ignoreCase = true)) {
        number
    } else {
        "$prefix $number"
    }
}
