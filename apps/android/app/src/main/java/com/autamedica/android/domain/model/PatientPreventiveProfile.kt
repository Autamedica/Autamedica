package com.autamedica.android.domain.model

import java.time.LocalDate
import java.time.Period

data class PatientPreventiveProfile(
    val patientId: String,
    val birthDate: String? = null,
    val gender: String? = null,
) {
    val age: Int?
        get() = birthDate?.let {
            try {
                val birth = LocalDate.parse(it)
                val years = Period.between(birth, LocalDate.now()).years
                years.takeIf { age -> age in 0..139 }
            } catch (_: Exception) {
                null
            }
        }
}
