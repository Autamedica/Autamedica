package com.autamedica.android.navigation

import android.content.Intent

object NotificationRouteResolver {

    const val EXTRA_APPOINTMENT_ID = "appointment_id"
    const val EXTRA_ROOM_ID = "room_id"
    const val EXTRA_CHAT_ROOM_ID = "chat_room_id"
    const val EXTRA_PRESCRIPTION_ID = "prescription_id"
    const val EXTRA_NOTIFICATION_TYPE = "notification_type"
    const val EXTRA_EVENT = "event"
    const val EXTRA_DEEP_LINK = "deep_link"

    // Recognized followup event identifiers
    const val EVENT_FOLLOWUP_48H = "appointment.followup_48h"
    const val EVENT_APPOINTMENT_FOLLOWUP_48H = "event_appointment_followup_48h"
    const val EVENT_FOLLOWUP = "followup"

    fun resolve(
        appointmentId: String? = null,
        roomId: String? = null,
        chatRoomId: String? = null,
        deepLink: String? = null,
        notificationType: String? = null,
    ): Route? {
        val normalizedAppointmentId = appointmentId.normalizedOrNull()
        val normalizedRoomId = roomId.normalizedOrNull()

        if (isCallNotification(notificationType)) {
            // Las llamadas directas (creadas sin appointment) llegan con appointment_id
            // vacío pero con room_id. El flujo de VideoCall resuelve la sala por
            // incomingRoomId en el fast path, así que hay que navegar igual.
            val hasRoomOnly = normalizedRoomId != null
            if (normalizedAppointmentId != null || hasRoomOnly) {
                return Route.VideoCall(
                    appointmentId = normalizedAppointmentId ?: "",
                    roomId = normalizedRoomId ?: "",
                    isIncomingCall = isIncomingCallNotificationType(notificationType),
                )
            }
        }

        val normalizedChatId = chatRoomId.normalizedOrNull()
        if (normalizedChatId != null) {
            return Route.ChatConversation(normalizedChatId)
        }

        if (isFollowupNotification(notificationType)) {
            return Route.ContinuityStatus
        }

        val deepLinkRoute = parseDeepLink(deepLink)
        if (deepLinkRoute != null) {
            return deepLinkRoute
        }

        if (normalizedAppointmentId != null) {
            return Route.VideoCall(normalizedAppointmentId, normalizedRoomId ?: "")
        }

        return null
    }

    /**
     * Resolves route directly from an incoming [Intent], extracting all standard extras and data URI.
     */
    fun resolve(intent: Intent?): Route? {
        if (intent == null) return null
        return resolve(
            appointmentId = intent.getStringExtra(EXTRA_APPOINTMENT_ID),
            roomId = intent.getStringExtra(EXTRA_ROOM_ID),
            chatRoomId = intent.getStringExtra(EXTRA_CHAT_ROOM_ID),
            deepLink = intent.getStringExtra(EXTRA_DEEP_LINK) ?: intent.dataString,
            notificationType = intent.getStringExtra(EXTRA_NOTIFICATION_TYPE) ?: intent.getStringExtra(EXTRA_EVENT),
        )
    }

    fun isFollowupNotification(notificationType: String?): Boolean {
        val normalized = notificationType?.trim()?.lowercase() ?: return false
        return normalized == "appointment.followup_48h" ||
            normalized == "event_appointment_followup_48h" ||
            normalized == "followup" ||
            normalized == "followup_48h" ||
            normalized == "appointment_followup_48h" ||
            normalized == "continuity" ||
            normalized == "continuity_status"
    }

    fun isCallNotification(notificationType: String?): Boolean {
        val normalized = notificationType?.trim()?.lowercase() ?: return false
        return normalized == "call_started" ||
            normalized == "patient_connected" ||
            normalized == "incoming_call" ||
            normalized == "call_incoming" ||
            normalized == "autamedica_calls" ||
            normalized == "call" ||
            normalized == "videocall"
    }

    /**
     * Solo las notificaciones dirigidas al paciente (llamada entrante) activan el join directo.
     * PATIENT_CONNECTED va al médico, que ya se une por su propio flujo.
     */
    fun isIncomingCallNotificationType(notificationType: String?): Boolean {
        val normalized = notificationType?.trim()?.lowercase() ?: return false
        return normalized == "call_started" ||
            normalized == "incoming_call" ||
            normalized == "call_incoming" ||
            normalized == "autamedica_calls" ||
            normalized == "call" ||
            normalized == "videocall"
    }

    fun parseDeepLink(raw: String?): Route? {
        val normalized = raw.normalizedOrNull() ?: return null
        val withoutScheme = if (normalized.contains("://")) {
            normalized.substringAfter("://")
        } else {
            normalized
        }
        val cleanPath = withoutScheme.substringBefore('?').substringBefore('#').trim('/')
        if (cleanPath.isEmpty()) return null

        val segments = cleanPath.split('/').filter { it.isNotBlank() }
        if (segments.isEmpty()) return null

        val firstSegment = segments.first().lowercase()

        // Single or multi-segment deep links for continuity / clinical followup:
        // Handles autamedica://continuity, autamedica://followup, /continuity, /followup
        if (firstSegment == "continuity" || firstSegment == "followup" || firstSegment == "continuity_status") {
            return Route.ContinuityStatus
        }

        if (segments.size < 2) return null

        val identifier = segments.last().normalizedOrNull() ?: return null

        return when (firstSegment) {
            "chat", "chats", "messages" -> Route.ChatConversation(identifier)
            "appointment", "appointments", "videocall", "videocalls", "call", "calls" ->
                Route.VideoCall(identifier)
            else -> null
        }
    }

    private fun String?.normalizedOrNull(): String? =
        this?.trim()?.takeIf { it.isNotEmpty() }
}
