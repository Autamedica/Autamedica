package com.autamedica.android.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PushPayloadTest {

    @Test
    fun `fromString parses INCOMING_CALL and related variants`() {
        assertThat(NotificationType.fromString("INCOMING_CALL")).isEqualTo(NotificationType.INCOMING_CALL)
        assertThat(NotificationType.fromString("incoming_call")).isEqualTo(NotificationType.INCOMING_CALL)
        assertThat(NotificationType.fromString("incomingcall")).isEqualTo(NotificationType.INCOMING_CALL)
        assertThat(NotificationType.fromString("call_incoming")).isEqualTo(NotificationType.INCOMING_CALL)
        assertThat(NotificationType.fromString("incoming.call")).isEqualTo(NotificationType.INCOMING_CALL)
    }

    @Test
    fun `fromString parses CALL_STARTED and PATIENT_CONNECTED`() {
        assertThat(NotificationType.fromString("CALL_STARTED")).isEqualTo(NotificationType.CALL_STARTED)
        assertThat(NotificationType.fromString("call_started")).isEqualTo(NotificationType.CALL_STARTED)
        assertThat(NotificationType.fromString("call.started")).isEqualTo(NotificationType.CALL_STARTED)
        assertThat(NotificationType.fromString("PATIENT_CONNECTED")).isEqualTo(NotificationType.PATIENT_CONNECTED)
        assertThat(NotificationType.fromString("patient_connected")).isEqualTo(NotificationType.PATIENT_CONNECTED)
        assertThat(NotificationType.fromString("patient.connected")).isEqualTo(NotificationType.PATIENT_CONNECTED)
    }

    @Test
    fun `incoming call types map to dedicated incoming calls channel`() {
        assertThat(NotificationType.INCOMING_CALL.channelId).isEqualTo("autamedica_incoming_calls")
        assertThat(NotificationType.CALL_STARTED.channelId).isEqualTo("autamedica_incoming_calls")
        assertThat(NotificationType.PATIENT_CONNECTED.channelId).isEqualTo("autamedica_incoming_calls")
    }

    @Test
    fun `fromString parses followup variants correctly`() {
        assertThat(NotificationType.fromString("appointment_followup_48h")).isEqualTo(NotificationType.FOLLOWUP_48H)
        assertThat(NotificationType.fromString("event_appointment_followup_48h")).isEqualTo(NotificationType.FOLLOWUP_48H)
        assertThat(NotificationType.fromString("appointment.followup_48h")).isEqualTo(NotificationType.FOLLOWUP_48H)
        assertThat(NotificationType.fromString("followup")).isEqualTo(NotificationType.FOLLOWUP_48H)
    }

    @Test
    fun `fromString falls back to GENERAL for null empty or unknown types`() {
        assertThat(NotificationType.fromString(null)).isEqualTo(NotificationType.GENERAL)
        assertThat(NotificationType.fromString("")).isEqualTo(NotificationType.GENERAL)
        assertThat(NotificationType.fromString("   ")).isEqualTo(NotificationType.GENERAL)
        assertThat(NotificationType.fromString("unknown_system_event")).isEqualTo(NotificationType.GENERAL)
    }

    @Test
    fun `PushPayload preserves all payload fields`() {
        val payload = PushPayload(
            type = NotificationType.INCOMING_CALL,
            title = "Llamada entrante",
            body = "Dr. Silva te está llamando",
            appointmentId = "appt-123",
            chatRoomId = "chat-456",
            prescriptionId = "presc-789",
            senderId = "doc-001",
            deepLink = "autamedica://call/appt-123",
            rawType = "call_incoming",
        )

        assertThat(payload.type).isEqualTo(NotificationType.INCOMING_CALL)
        assertThat(payload.title).isEqualTo("Llamada entrante")
        assertThat(payload.body).isEqualTo("Dr. Silva te está llamando")
        assertThat(payload.appointmentId).isEqualTo("appt-123")
        assertThat(payload.chatRoomId).isEqualTo("chat-456")
        assertThat(payload.prescriptionId).isEqualTo("presc-789")
        assertThat(payload.senderId).isEqualTo("doc-001")
        assertThat(payload.deepLink).isEqualTo("autamedica://call/appt-123")
        assertThat(payload.rawType).isEqualTo("call_incoming")
    }
}
