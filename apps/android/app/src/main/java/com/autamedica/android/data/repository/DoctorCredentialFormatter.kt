package com.autamedica.android.data.repository

internal fun formatDoctorCredential(country: String?, type: String?, number: String?, uf: String?): String {
    val value = number?.trim().orEmpty()
    if (value.isBlank() || value.startsWith("PENDING", ignoreCase = true)) return ""
    return when {
        country == "AR" && (type == "MN" || type == "MP") -> "$type $value"
        country == "BR" && type == "CRM" && uf in setOf(
            "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
            "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
        ) -> "CRM-$uf $value"
        else -> ""
    }
}
