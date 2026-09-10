package com.autamedica.android.domain.model

data class Appointment(
    val id: String,
    val patientId: String?,
    val doctorId: String?,
    val startTime: String,
    val endTime: String?,
    val durationMinutes: Int?,
    val type: AppointmentType,
    val status: AppointmentStatus,
    val notes: String?,
    val meetingUrl: String?,
    val doctorName: String? = null,
    val doctorSpecialty: String? = null,
    val doctorAvatarUrl: String? = null,
    val doctorFee: Double? = null,
    val doctorLicenseNumber: String? = null,
)

enum class AppointmentType {
    CONSULTATION,
    FOLLOW_UP,
    EMERGENCY,
    TELEMEDICINE,
    LAB_TEST,
    CHECKUP;
}

enum class AppointmentStatus {
    PAYMENT_PENDING,
    SCHEDULED,
    CONFIRMED,
    IN_PROGRESS,
    COMPLETED,
    CANCELLED,
    NO_SHOW;
}
