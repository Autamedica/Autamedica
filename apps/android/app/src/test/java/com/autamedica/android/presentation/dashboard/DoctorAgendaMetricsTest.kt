package com.autamedica.android.presentation.dashboard

import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class DoctorAgendaMetricsTest {
    private val brazilZone = ZoneId.of("America/Sao_Paulo")
    private val day = LocalDate.of(2026, 10, 26)

    private fun appointment(
        id: String,
        startTime: String,
        status: AppointmentStatus = AppointmentStatus.CONFIRMED,
    ): Appointment = Appointment(
        id = id,
        patientId = null,
        doctorId = "doctor-id",
        startTime = startTime,
        endTime = null,
        durationMinutes = 30,
        type = AppointmentType.TELEMEDICINE,
        status = status,
        notes = null,
        meetingUrl = null,
    )

    @Test
    fun emptyAgendaHasNoSyntheticPatientsOrBookings() {
        assertThat(scheduledAppointmentsForLocalDay(emptyList(), day, brazilZone)).isEmpty()
    }

    @Test
    fun onlyRealActiveAppointmentsForLocalDayAreCounted() {
        val appointments = listOf(
            appointment("today", "2026-10-26T15:00:00Z"),
            appointment("in-progress", "2026-10-26T15:30:00Z", AppointmentStatus.IN_PROGRESS),
            appointment("cancelled", "2026-10-26T16:00:00Z", AppointmentStatus.CANCELLED),
            appointment("done", "2026-10-26T17:00:00Z", AppointmentStatus.COMPLETED),
            appointment("tomorrow", "2026-10-27T14:00:00Z"),
        )
        val result = scheduledAppointmentsForLocalDay(appointments, day, brazilZone)
        assertThat(result.map { it.id }).containsExactly("today", "in-progress").inOrder()
    }

    @Test
    fun midnightUtcDoesNotCountAsTheWrongBrazilianDay() {
        val latePreviousDay = appointment("late", "2026-10-26T02:00:00Z")
        assertThat(scheduledAppointmentsForLocalDay(listOf(latePreviousDay), day, brazilZone)).isEmpty()
    }

    @Test
    fun malformedTimestampsCannotInflateCounts() {
        val invalid = appointment("broken", "not-a-timestamp")
        assertThat(scheduledAppointmentsForLocalDay(listOf(invalid), day, brazilZone)).isEmpty()
    }
}
