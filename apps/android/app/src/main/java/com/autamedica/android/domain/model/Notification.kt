package com.autamedica.android.domain.model

/**
 * Types of push notifications the app can receive and display.
 */
enum class NotificationType(val channelId: String) {
    APPOINTMENT_NEW("autamedica_appointments"),
    APPOINTMENT_REMINDER("autamedica_appointments"),
    APPOINTMENT_CANCELLED("autamedica_appointments"),
    PATIENT_CONNECTED("autamedica_incoming_calls"),
    CALL_STARTED("autamedica_incoming_calls"),
    INCOMING_CALL("autamedica_incoming_calls"),
    MESSAGE_NEW("autamedica_messages"),
    PRESCRIPTION_READY("autamedica_prescriptions"),
    FOLLOWUP_48H("autamedica_appointments"),
    GENERAL("autamedica_general");

    companion object {
        fun fromString(value: String?): NotificationType {
            val normalized = value?.trim()?.lowercase()?.replace('.', '_') ?: return GENERAL
            return when (normalized) {
                "appointment_followup_48h",
                "event_appointment_followup_48h",
                "followup",
                "followup_48h" -> FOLLOWUP_48H
                "incoming_call",
                "call_incoming",
                "incomingcall" -> INCOMING_CALL
                "call_started",
                "callstarted" -> CALL_STARTED
                "patient_connected",
                "patientconnected" -> PATIENT_CONNECTED
                else -> entries.firstOrNull { it.name.equals(normalized, ignoreCase = true) }
                    ?: entries.firstOrNull { it.name.equals(value.trim(), ignoreCase = true) }
                    ?: GENERAL
            }
        }
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
    val callId: String? = null,
    val roomId: String? = null,
    val chatRoomId: String? = null,
    val prescriptionId: String? = null,
    val senderId: String? = null,
    val deepLink: String? = null,
    val rawType: String? = null,
    val doctorName: String? = null,
    val doctorAvatarUrl: String? = null,
)
