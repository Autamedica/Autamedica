package com.autamedica.android.data.repository

import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TelemedicineAvailabilityResolverTest {

    @Test
    fun `joinable appointments include active live sessions even without meeting url`() {
        val appointment = appointment(
            id = "appointment-1",
            type = AppointmentType.TELEMEDICINE,
            status = AppointmentStatus.CONFIRMED,
            meetingUrl = null,
        )

        val result = deriveJoinableAppointmentIds(
            appointments = listOf(appointment),
            legacyCalls = emptyList(),
            liveSessions = listOf(
                LiveSessionReference(
                    appointmentId = appointment.id,
                    status = "scheduled",
                )
            ),
        )

        assertThat(result).containsExactly(appointment.id)
    }

    @Test
    fun `joinable appointments include active legacy calls resolved from meeting url`() {
        val appointment = appointment(
            id = "appointment-2",
            type = AppointmentType.CONSULTATION,
            status = AppointmentStatus.SCHEDULED,
            meetingUrl = "https://autamedica.app/calls/room_abc123?from=mobile",
        )

        val result = deriveJoinableAppointmentIds(
            appointments = listOf(appointment),
            legacyCalls = listOf(
                LegacyCallReference(
                    id = "call-1",
                    roomId = "room_abc123",
                    status = "connected",
                )
            ),
            liveSessions = emptyList(),
        )

        assertThat(result).containsExactly(appointment.id)
    }

    @Test
    fun `ended legacy calls do not mark appointment as joinable`() {
        val appointment = appointment(
            id = "appointment-3",
            type = AppointmentType.TELEMEDICINE,
            status = AppointmentStatus.IN_PROGRESS,
            meetingUrl = "https://autamedica.app/calls/room_def456",
        )

        val result = deriveJoinableAppointmentIds(
            appointments = listOf(appointment),
            legacyCalls = listOf(
                LegacyCallReference(
                    id = "call-2",
                    roomId = "room_def456",
                    status = "ended",
                )
            ),
            liveSessions = emptyList(),
        )

        assertThat(result).isEmpty()
    }

    @Test
    fun `non candidate appointments stay hidden even if backend has session`() {
        val appointment = appointment(
            id = "appointment-4",
            type = AppointmentType.LAB_TEST,
            status = AppointmentStatus.CONFIRMED,
            meetingUrl = "https://autamedica.app/calls/room_lab",
        )

        val result = deriveJoinableAppointmentIds(
            appointments = listOf(appointment),
            legacyCalls = listOf(
                LegacyCallReference(
                    id = "call-3",
                    roomId = "room_lab",
                    status = "connected",
                )
            ),
            liveSessions = listOf(
                LiveSessionReference(
                    appointmentId = appointment.id,
                    status = "in_progress",
                )
            ),
        )

        assertThat(result).isEmpty()
    }

    @Test
    fun `meeting identifier parser extracts last path segment`() {
        assertThat(
            extractMeetingIdentifier("https://autamedica.app/consultation/room_xyz#mobile")
        ).isEqualTo("room_xyz")
        assertThat(extractMeetingIdentifier("  ")).isNull()
    }

    private fun appointment(
        id: String,
        type: AppointmentType,
        status: AppointmentStatus,
        meetingUrl: String?,
    ) = Appointment(
        id = id,
        patientId = "patient-1",
        doctorId = "doctor-1",
        startTime = java.time.OffsetDateTime.now().plusHours(1).toString(),
        endTime = null,
        durationMinutes = 30,
        type = type,
        status = status,
        notes = null,
        meetingUrl = meetingUrl,
    )
}
