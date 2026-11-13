package com.autamedica.android.domain.model

import java.time.LocalDate

/**
 * Clinical document safeguards shared by Android video calls and repositories.
 * A country must be grounded in the doctor's actual professional license.
 * An internal reference or QR is never proof of a certified signature.
 */
object InCallDocumentPolicy {
    fun doctorCountry(
        licenseType: String?,
        careCountry: String?,
        ufBrazil: String?,
    ): String? {
        val license = when (licenseType?.trim()?.uppercase()) {
            "CRM" -> "BR"
            "MN", "MP" -> "AR"
            else -> return null
        }
        val configured = careCountry?.trim()?.uppercase()?.takeIf { it.isNotEmpty() }
        if (configured != null && configured !in setOf("AR", "BR")) return null
        if (configured != null && configured != license) return null
        if (license == "BR" && ufBrazil.isNullOrBlank()) return null
        return license
    }

    fun inclusiveEndDate(startDate: LocalDate, daysOfRest: Int): LocalDate? {
        require(daysOfRest in 0..365) { "invalid_days_of_rest" }
        return if (daysOfRest == 0) null else startDate.plusDays(daysOfRest.toLong() - 1)
    }

    /** Country isolation is not optional when issuing a clinical document. */
    fun requireMatchingPatientCountry(patientCountry: String?, doctorCountry: String) {
        require(patientCountry == doctorCountry) {
            "El país clínico del paciente no está verificado o no coincide con el médico"
        }
    }

    /** A non-resolved patient or country must not silently become Argentina. */
    fun requireCountry(country: String?): String {
        require(country == "AR" || country == "BR") { "País y matrícula médica no verificados" }
        return country
    }

    fun canUseNativePrescriptionIssuer(country: String): Boolean = country == "AR"
}
