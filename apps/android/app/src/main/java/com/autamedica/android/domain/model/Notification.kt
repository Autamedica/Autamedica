package com.autamedica.android.domain.model

/**
 * Types of push notifications the app can receive and display.
 */
enum class NotificationType(val channelId: String) {
    APPOINTMENT_NEW("autamedica_appointments"),
    APPOINTMENT_REMINDER("autamedica_appointments"),
    APPOINTMENT_CANCELLED("autamedica_appointments"),
    PATIENT_CONNECTED("autamedica_calls"),
    MESSAGE_NEW("autamedica_messages"),
    PRESCRIPTION_READY("autamedica_prescriptions"),
    GENERAL("autamedica_general");

    companion object {
        fun fromString(value: String?): NotificationType =
            entries.firstOrNull { it.name.equals(value, ignoreCase = true) } ?: GENERAL
    }
}

/**
 * Parsed payload from an incoming FCM notification.
 */
data class PushPayload(
    val type: NotificationType,
    val title: String,
    val body: String,
    val appointmentId: String? = null,
    val chatRoomId: String? = null,
    val prescriptionId: String? = null,
    val senderId: String? = null,
    val deepLink: String? = null,
)
