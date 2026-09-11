package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.OffsetDateTime

class AppointmentTelemedicineRulesTest {

    private fun createAppointment(
        startTime: String,
        status: AppointmentStatus = AppointmentStatus.CONFIRMED,
        type: AppointmentType = AppointmentType.TELEMEDICINE,
    ) = Appointment(
        id = "test-apt-1",
        patientId = "pat-1",
        doctorId = "doc-1",
        startTime = startTime,
        endTime = null,
        durationMinutes = 30,
        type = type,
        status = status,
        notes = null,
        meetingUrl = null,
    )

    @Test
    fun `appointment within 45 minutes before start is join candidate`() {
        val apt = createAppointment(
            startTime = OffsetDateTime.now().plusMinutes(30).toString()
        )
        assertThat(apt.isTelemedicineJoinCandidate()).isTrue()
    }

    @Test
    fun `appointment more than 45 minutes in future is not join candidate`() {
        val apt = createAppointment(
            startTime = OffsetDateTime.now().plusMinutes(50).toString()
        )
        assertThat(apt.isTelemedicineJoinCandidate()).isFalse()
    }

    @Test
    fun `appointment within 24 hours in past is join candidate`() {
        val apt = createAppointment(
            startTime = OffsetDateTime.now().minusHours(12).toString()
        )
        assertThat(apt.isTelemedicineJoinCandidate()).isTrue()
    }

    @Test
    fun `appointment more than 24 hours in past is not join candidate`() {
        val apt = createAppointment(
            startTime = OffsetDateTime.now().minusHours(25).toString()
        )
        assertThat(apt.isTelemedicineJoinCandidate()).isFalse()
    }

    @Test
    fun `non joinable status is not join candidate even within window`() {
        val apt = createAppointment(
            startTime = OffsetDateTime.now().plusMinutes(10).toString(),
            status = AppointmentStatus.PAYMENT_PENDING
        )
        assertThat(apt.isTelemedicineJoinCandidate()).isFalse()
    }

    @Test
    fun `non joinable type is not join candidate even within window`() {
        val apt = createAppointment(
            startTime = OffsetDateTime.now().plusMinutes(10).toString(),
            type = AppointmentType.LAB_TEST
        )
        assertThat(apt.isTelemedicineJoinCandidate()).isFalse()
    }

    @Test
    fun `invalid start time date format returns false safely`() {
        val apt = createAppointment(
            startTime = "invalid-date"
        )
        assertThat(apt.isTelemedicineJoinCandidate()).isFalse()
    }
}
