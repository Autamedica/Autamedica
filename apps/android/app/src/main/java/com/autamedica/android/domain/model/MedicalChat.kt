package com.autamedica.android.domain.model

/**
 * Represents a medical chat conversation between a patient and a specialist.
 * Maps to the `medical_chats` table in Supabase.
 */
data class MedicalChat(
    val id: String,
    val patientId: String,
    val specialistId: String,
    val appointmentId: String?,
    val status: ChatStatus,
    val subject: String,
    val isUrgent: Boolean,
    val lastMessageAt: String,
    val lastMessagePreview: String?,
    val unreadCount: Int,
    /** Resolved name of the other participant (doctor name for patient, patient name for doctor) */
    val otherParticipantName: String?,
    val otherParticipantAvatarUrl: String?,
)

enum class ChatStatus {
    ACTIVE,
    WAITING_RESPONSE,
    RESOLVED,
    CLOSED;

    companion object {
        fun fromString(value: String?): ChatStatus = when (value?.lowercase()) {
            "active" -> ACTIVE
            "waiting_response" -> WAITING_RESPONSE
            "resolved" -> RESOLVED
            "closed" -> CLOSED
            else -> ACTIVE
        }
    }
}
