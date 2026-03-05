package com.autamedica.android.domain.model

/**
 * Full detail of a patient for the doctor's patient detail screen.
 * Extends PatientSummary with medical-context fields.
 */
data class PatientDetail(
    val id: String,
    val userId: String,
    val firstName: String,
    val lastName: String,
    val avatarUrl: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val birthDate: String? = null,
    val gender: String? = null,
    val bloodType: String? = null,
    val allergies: String? = null,
    val appointmentHistory: List<Appointment> = emptyList(),
    val totalAppointments: Int = 0,
    val lastAppointment: String? = null,
    val nextAppointment: String? = null,
) {
    val displayName: String
        get() = "$firstName $lastName".trim().ifBlank { "Paciente" }

    val age: Int?
        get() = birthDate?.let {
            try {
                val birth = java.time.LocalDate.parse(it)
                java.time.Period.between(birth, java.time.LocalDate.now()).years
            } catch (_: Exception) {
                null
            }
        }
}
