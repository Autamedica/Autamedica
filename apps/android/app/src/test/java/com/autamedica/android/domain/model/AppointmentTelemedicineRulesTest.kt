package com.autamedica.android.domain.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.OffsetDateTime

class AppointmentTelemedicineRulesTest {

    private fun sampleAppointment(
        status: AppointmentStatus = AppointmentStatus.CONFIRMED,
        type: AppointmentType = AppointmentType.TELEMEDICINE,
        startTime: String = OffsetDateTime.now().plusMinutes(15).toString(),
    ) = Appointment(
        id = "apt-1",
        patientId = "pat-1",
        doctorId = "doc-1",
        startTime = startTime,
        status = status,
        type = type,
    )

    @Test
    fun `confirmed telemedicine appointment within join window is joinable`() {
        assertTrue(sampleAppointment().isTelemedicineJoinCandidate())
        assertTrue(
            sampleAppointment(
                status = AppointmentStatus.IN_PROGRESS,
                type = AppointmentType.CONSULTATION,
                startTime = OffsetDateTime.now().minusHours(2).toString(),
            ).isTelemedicineJoinCandidate(),
        )
    }

    @Test
    fun `appointments outside time window or with non-joinable status are rejected`() {
        assertFalse(
            sampleAppointment(startTime = OffsetDateTime.now().plusHours(2).toString()).isTelemedicineJoinCandidate(),
        )
        assertFalse(
            sampleAppointment(startTime = OffsetDateTime.now().minusHours(25).toString()).isTelemedicineJoinCandidate(),
        )
        assertFalse(
            sampleAppointment(status = AppointmentStatus.CANCELLED).isTelemedicineJoinCandidate(),
        )
        assertFalse(
            sampleAppointment(status = AppointmentStatus.COMPLETED).isTelemedicineJoinCandidate(),
        )
        assertFalse(
            sampleAppointment(startTime = "not-a-valid-iso-timestamp").isTelemedicineJoinCandidate(),
        )
    }
}
