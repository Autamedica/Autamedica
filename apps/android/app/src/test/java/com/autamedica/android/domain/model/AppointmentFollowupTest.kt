package com.autamedica.android.domain.model

import com.autamedica.android.data.remote.dto.AppointmentFollowupDto
import com.autamedica.android.data.remote.dto.toDomain
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

class AppointmentFollowupTest {

    @Test
    fun appointmentFollowupDomainModelInstantiatesCorrectly() {
        val followup = AppointmentFollowup(
            id = "fup-123",
            appointmentId = "appt-456",
            callId = "call-789",
            patientId = "pat-001",
            doctorId = "doc-002",
            recipientPhone = "+5491155551234",
            patientName = "Carlos Tevez",
            doctorName = "Dr. Eduardo Marques",
            channel = "whatsapp",
            eventType = "appointment.followup_48h",
            message = "Hola Carlos, ¿cómo te venís sintiendo?",
            scheduledFor = "2026-09-10T12:00:00Z",
            status = FollowupStatus.SENT,
            sentAt = "2026-09-10T12:00:05Z",
            dedupeKey = "followup_48h:call:call-789",
            response = "better",
            metadata = mapOf("lang" to "es", "roomId" to "room-1"),
        )

        assertThat(followup.id).isEqualTo("fup-123")
        assertThat(followup.status).isEqualTo(FollowupStatus.SENT)
        assertThat(followup.response).isEqualTo("better")
        assertThat(followup.metadata).containsEntry("lang", "es")
    }

    @Test
    fun followupStatusEnumHasAllExpectedValues() {
        val expected = listOf(
            FollowupStatus.PENDING,
            FollowupStatus.SENT,
            FollowupStatus.RESPONDED,
            FollowupStatus.FAILED,
            FollowupStatus.CANCELLED,
        )
        assertThat(FollowupStatus.entries).containsExactlyElementsIn(expected)
    }

    @Test
    fun followupCheckInEvolutionEnumConvertsCorrectly() {
        assertThat(FollowupCheckInEvolution.BETTER.toKey()).isEqualTo("better")
        assertThat(FollowupCheckInEvolution.STABLE.toKey()).isEqualTo("stable")
        assertThat(FollowupCheckInEvolution.WORSE.toKey()).isEqualTo("worse")

        assertThat(FollowupCheckInEvolution.fromValue("better")).isEqualTo(FollowupCheckInEvolution.BETTER)
        assertThat(FollowupCheckInEvolution.fromValue("BETTER")).isEqualTo(FollowupCheckInEvolution.BETTER)
        assertThat(FollowupCheckInEvolution.fromValue("stable")).isEqualTo(FollowupCheckInEvolution.STABLE)
        assertThat(FollowupCheckInEvolution.fromValue("worse")).isEqualTo(FollowupCheckInEvolution.WORSE)
        assertThat(FollowupCheckInEvolution.fromValue("unknown")).isNull()
    }

    @Test
    fun appointmentFollowupDtoMapsToDomainCorrectly() {
        val metadataJson = buildJsonObject {
            put("lang", "es")
            put("evolution", "better")
            put("notes", "Me siento con menos dolor")
        }

        val dto = AppointmentFollowupDto(
            id = "fup-999",
            appointmentId = "appt-111",
            callId = "call-222",
            patientId = "pat-333",
            doctorId = "doc-444",
            recipientPhone = "+5491199998888",
            patientName = "Lionel Messi",
            doctorName = "Dr. Marques",
            channel = "whatsapp",
            eventType = "appointment.followup_48h",
            message = "¿Cómo te sentís?",
            scheduledFor = "2026-09-09T18:00:00Z",
            status = "responded",
            sentAt = "2026-09-09T18:01:00Z",
            dedupeKey = "followup_48h:call:call-222",
            metadata = metadataJson,
        )

        // Test snake_case and camelCase property aliases
        assertThat(dto.appointment_id).isEqualTo("appt-111")
        assertThat(dto.call_id).isEqualTo("call-222")
        assertThat(dto.patient_id).isEqualTo("pat-333")
        assertThat(dto.doctor_id).isEqualTo("doc-444")
        assertThat(dto.recipient_phone).isEqualTo("+5491199998888")
        assertThat(dto.patient_name).isEqualTo("Lionel Messi")
        assertThat(dto.doctor_name).isEqualTo("Dr. Marques")
        assertThat(dto.event_type).isEqualTo("appointment.followup_48h")
        assertThat(dto.scheduled_for).isEqualTo("2026-09-09T18:00:00Z")
        assertThat(dto.sent_at).isEqualTo("2026-09-09T18:01:00Z")
        assertThat(dto.dedupe_key).isEqualTo("followup_48h:call:call-222")

        val domain = dto.toDomain()

        assertThat(domain.id).isEqualTo("fup-999")
        assertThat(domain.appointmentId).isEqualTo("appt-111")
        assertThat(domain.callId).isEqualTo("call-222")
        assertThat(domain.patientId).isEqualTo("pat-333")
        assertThat(domain.doctorId).isEqualTo("doc-444")
        assertThat(domain.recipientPhone).isEqualTo("+5491199998888")
        assertThat(domain.patientName).isEqualTo("Lionel Messi")
        assertThat(domain.doctorName).isEqualTo("Dr. Marques")
        assertThat(domain.status).isEqualTo(FollowupStatus.RESPONDED)
        assertThat(domain.response).isEqualTo("better")
        assertThat(domain.metadata).containsEntry("lang", "es")
        assertThat(domain.metadata).containsEntry("evolution", "better")
        assertThat(domain.metadata).containsEntry("notes", "Me siento con menos dolor")
    }

    @Test
    fun appointmentFollowupDtoParsesAllStatuses() {
        val baseDto = AppointmentFollowupDto(
            id = "f-1",
            patientId = "p-1",
            doctorId = "d-1",
            recipientPhone = "123",
            message = "msg",
            scheduledFor = "date",
            dedupeKey = "key",
        )

        assertThat(baseDto.copy(status = "pending").toDomain().status).isEqualTo(FollowupStatus.PENDING)
        assertThat(baseDto.copy(status = "sent").toDomain().status).isEqualTo(FollowupStatus.SENT)
        assertThat(baseDto.copy(status = "responded").toDomain().status).isEqualTo(FollowupStatus.RESPONDED)
        assertThat(baseDto.copy(status = "failed").toDomain().status).isEqualTo(FollowupStatus.FAILED)
        assertThat(baseDto.copy(status = "cancelled").toDomain().status).isEqualTo(FollowupStatus.CANCELLED)
        assertThat(baseDto.copy(status = "canceled").toDomain().status).isEqualTo(FollowupStatus.CANCELLED)
        assertThat(baseDto.copy(status = "unknown_status").toDomain().status).isEqualTo(FollowupStatus.PENDING)
    }
}
