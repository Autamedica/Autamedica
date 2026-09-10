package com.autamedica.android.data.remote.dto

import com.autamedica.android.domain.model.AppointmentFollowup
import com.autamedica.android.domain.model.FollowupStatus
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Serializable
data class AppointmentFollowupDto(
    val id: String,
    @SerialName("appointment_id") val appointmentId: String? = null,
    @SerialName("call_id") val callId: String? = null,
    @SerialName("patient_id") val patientId: String,
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("recipient_phone") val recipientPhone: String,
    @SerialName("patient_name") val patientName: String? = null,
    @SerialName("doctor_name") val doctorName: String? = null,
    val channel: String = "whatsapp",
    @SerialName("event_type") val eventType: String = "appointment.followup_48h",
    val message: String,
    @SerialName("scheduled_for") val scheduledFor: String,
    val status: String = "pending",
    @SerialName("sent_at") val sentAt: String? = null,
    @SerialName("dedupe_key") val dedupeKey: String,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("response") val response: String? = null,
    @SerialName("metadata") val metadata: JsonElement? = null,
) {
    val appointment_id: String? get() = appointmentId
    val call_id: String? get() = callId
    val patient_id: String get() = patientId
    val doctor_id: String get() = doctorId
    val recipient_phone: String get() = recipientPhone
    val patient_name: String? get() = patientName
    val doctor_name: String? get() = doctorName
    val event_type: String get() = eventType
    val scheduled_for: String get() = scheduledFor
    val sent_at: String? get() = sentAt
    val dedupe_key: String get() = dedupeKey
    val created_at: String? get() = createdAt
}

fun AppointmentFollowupDto.toDomain(): AppointmentFollowup {
    val parsedMetadata: Map<String, String>? = (metadata as? JsonObject)?.mapNotNull { (key, value) ->
        val text = when (value) {
            is JsonPrimitive -> value.contentOrNull
            else -> value.toString()
        }
        text?.let { key to it }
    }?.toMap()

    val resolvedResponse = response
        ?: parsedMetadata?.get("response")
        ?: parsedMetadata?.get("evolution")

    return AppointmentFollowup(
        id = id,
        appointmentId = appointmentId,
        callId = callId,
        patientId = patientId,
        doctorId = doctorId,
        recipientPhone = recipientPhone,
        patientName = patientName,
        doctorName = doctorName,
        channel = channel,
        eventType = eventType,
        message = message,
        scheduledFor = scheduledFor,
        status = parseFollowupStatus(status),
        sentAt = sentAt,
        dedupeKey = dedupeKey,
        response = resolvedResponse,
        metadata = parsedMetadata,
    )
}

private fun parseFollowupStatus(raw: String?): FollowupStatus = when (raw?.lowercase()?.trim()) {
    "pending" -> FollowupStatus.PENDING
    "sent" -> FollowupStatus.SENT
    "responded" -> FollowupStatus.RESPONDED
    "failed" -> FollowupStatus.FAILED
    "cancelled", "canceled" -> FollowupStatus.CANCELLED
    else -> FollowupStatus.PENDING
}
