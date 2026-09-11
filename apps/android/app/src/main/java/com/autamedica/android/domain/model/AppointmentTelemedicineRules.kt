package com.autamedica.android.domain.model

import java.time.OffsetDateTime

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
    if (type !in telemedicineJoinableTypes || status !in telemedicineJoinableStatuses) return false
    return runCatching {
        val start = OffsetDateTime.parse(startTime)
        val now = OffsetDateTime.now()
        start.isAfter(now.minusHours(24)) && start.isBefore(now.plusMinutes(45))
    }.getOrDefault(false)
}
