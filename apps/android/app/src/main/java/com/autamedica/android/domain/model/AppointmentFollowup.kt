package com.autamedica.android.domain.model

data class AppointmentFollowup(
    val id: String,
    val appointmentId: String? = null,
    val callId: String? = null,
    val patientId: String,
    val doctorId: String,
    val recipientPhone: String,
    val patientName: String? = null,
    val doctorName: String? = null,
    val channel: String = "whatsapp",
    val eventType: String = "appointment.followup_48h",
    val message: String,
    val scheduledFor: String,
    val status: FollowupStatus,
    val sentAt: String? = null,
    val dedupeKey: String,
    val response: String? = null,
    val metadata: Map<String, String>? = null,
)

enum class FollowupStatus {
    PENDING,
    SENT,
    RESPONDED,
    FAILED,
    CANCELLED;
}

enum class FollowupCheckInEvolution {
    BETTER,
    STABLE,
    WORSE;

    companion object {
        fun fromValue(value: String?): FollowupCheckInEvolution? =
            entries.firstOrNull { it.name.equals(value, ignoreCase = true) || it.toKey().equals(value, ignoreCase = true) }
    }

    fun toKey(): String = when (this) {
        BETTER -> "better"
        STABLE -> "stable"
        WORSE -> "worse"
    }
}
