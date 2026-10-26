package com.autamedica.android.presentation.dashboard

import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId

/** Only genuine scheduled appointments within the doctor's local calendar day. */
internal fun scheduledAppointmentsForLocalDay(
    appointments: List<Appointment>,
    day: LocalDate,
    zone: ZoneId,
): List<Appointment> = appointments.filter { appointment ->
    appointment.status in setOf(
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.IN_PROGRESS,
    ) && runCatching {
        OffsetDateTime.parse(appointment.startTime)
            .atZoneSameInstant(zone)
            .toLocalDate() == day
    }.getOrDefault(false)
}
