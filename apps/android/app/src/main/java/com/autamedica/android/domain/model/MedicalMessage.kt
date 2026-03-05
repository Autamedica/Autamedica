package com.autamedica.android.domain.model

/**
 * Represents a single message in a medical chat.
 * Maps to the `medical_messages` table in Supabase.
 */
data class MedicalMessage(
    val id: String,
    val chatId: String,
    val authorType: AuthorType,
    val authorId: String,
    val contentType: MessageContentType,
    val content: String,
    val attachmentUrl: String?,
    val isRead: Boolean,
    val readAt: String?,
    val createdAt: String,
    /** Resolved sender display name */
    val senderName: String?,
)

enum class AuthorType {
    PATIENT,
    DOCTOR,
    SYSTEM;

    companion object {
        fun fromString(value: String?): AuthorType = when (value?.lowercase()) {
            "patient" -> PATIENT
            "doctor" -> DOCTOR
            "system" -> SYSTEM
            else -> SYSTEM
        }
    }

    fun toDbValue(): String = name.lowercase()
}

enum class MessageContentType {
    TEXT,
    IMAGE,
    DOCUMENT,
    AUDIO,
    SYSTEM_NOTIFICATION;

    companion object {
        fun fromString(value: String?): MessageContentType = when (value?.lowercase()) {
            "text" -> TEXT
            "image" -> IMAGE
            "document" -> DOCUMENT
            "audio" -> AUDIO
            "system_notification" -> SYSTEM_NOTIFICATION
            else -> TEXT
        }
    }

    fun toDbValue(): String = name.lowercase()
}
