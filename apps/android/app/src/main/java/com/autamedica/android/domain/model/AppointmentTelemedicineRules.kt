package com.autamedica.android.domain.model

private val telemedicineJoinableStatuses = setOf(
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.IN_PROGRESS,
)

private val telemedicineJoinableTypes = setOf(
    AppointmentType.TELEMEDICINE,
    AppointmentType.CONSULTATION,
)

fun Appointment.isTelemedicineJoinCandidate(): Boolean {
    return type in telemedicineJoinableTypes && status in telemedicineJoinableStatuses
}
