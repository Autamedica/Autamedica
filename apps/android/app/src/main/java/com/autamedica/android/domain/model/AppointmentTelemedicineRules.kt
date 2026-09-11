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
        OffsetDateTime.parse(startTime).isAfter(OffsetDateTime.now().minusMinutes(30))
    }.getOrDefault(false)
}
