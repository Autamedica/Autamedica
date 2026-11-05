package com.autamedica.android.domain.model

data class DoctorProfile(
    val id: String,
    val userId: String,
    val licenseNumber: String,
    val specialty: String,
    val subspecialty: String? = null,
    val yearsExperience: Int = 0,
    val bio: String? = null,
    val consultationFee: Double? = null,
    val active: Boolean = true,
    val sssValidationStatus: String? = null,
    val countryCode: String? = null,
    val licenseType: String? = null,
    val ufBrazil: String? = null,
)

data class DoctorStats(
    val todayAppointments: Int = 0,
    val pendingAppointments: Int = 0,
    val completedToday: Int = 0,
    val totalPatients: Int = 0,
    val weeklyAppointments: Int = 0,
    val cancelledToday: Int = 0,
)

data class PatientSummary(
    val id: String,
    val userId: String,
    val firstName: String,
    val lastName: String,
    val avatarUrl: String? = null,
    val birthDate: String? = null,
    val gender: String? = null,
    val lastAppointment: String? = null,
    val nextAppointment: String? = null,
    val appointmentCount: Int = 0,
)
