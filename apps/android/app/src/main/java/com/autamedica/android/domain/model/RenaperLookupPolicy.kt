package com.autamedica.android.domain.model

/**
 * UX defence-in-depth. All fields are sourced from the authenticated
 * patient row, NEVER the device locale, a free-text DNI, or user_metadata.
 * Backend must independently enforce patient ownership before RENAPER.
 */
object RenaperLookupPolicy {
    fun registeredArgentineDni(patient: PatientProfileSnapshot?): String? {
        if (patient?.careCountry != "AR") return null
        val value = patient.dni?.trim().orEmpty()
        // Allow common DNI display punctuation without accepting letters.
        if (value.isBlank() || value.any { !it.isDigit() && it !in ".- " }) return null
        return value.filter(Char::isDigit).takeIf { it.length in 6..12 }
    }

    fun sexMatchesPatient(patient: PatientProfileSnapshot?, sex: RenaperSexId): Boolean {
        val gender = patient?.gender?.trim()?.lowercase() ?: return false
        return when (gender) {
            "female", "f", "femenino", "feminino" -> sex == RenaperSexId.FEMALE
            "male", "m", "masculino" -> sex == RenaperSexId.MALE
            "other", "x", "otro", "outro" -> sex == RenaperSexId.OTHER
            else -> false
        }
    }

    fun canQuery(patient: PatientProfileSnapshot?, sex: RenaperSexId): Boolean =
        registeredArgentineDni(patient) != null && sexMatchesPatient(patient, sex)

    /** UI-only masking; never send masked characters to the official service. */
    fun maskedDni(patient: PatientProfileSnapshot?): String? =
        registeredArgentineDni(patient)?.let { "***" + it.takeLast(3) }
}
