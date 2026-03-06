package com.autamedica.android.navigation

object NotificationRouteResolver {

    const val EXTRA_APPOINTMENT_ID = "appointment_id"
    const val EXTRA_CHAT_ROOM_ID = "chat_room_id"
    const val EXTRA_PRESCRIPTION_ID = "prescription_id"
    const val EXTRA_NOTIFICATION_TYPE = "notification_type"
    const val EXTRA_DEEP_LINK = "deep_link"

    fun resolve(
        appointmentId: String?,
        chatRoomId: String?,
        deepLink: String?,
    ): Route? {
        val normalizedChatId = chatRoomId.normalizedOrNull()
        if (normalizedChatId != null) {
            return Route.ChatConversation(normalizedChatId)
        }

        val normalizedAppointmentId = appointmentId.normalizedOrNull()
        if (normalizedAppointmentId != null) {
            return Route.VideoCall(normalizedAppointmentId)
        }

        return parseDeepLink(deepLink)
    }

    private fun parseDeepLink(raw: String?): Route? {
        val normalized = raw.normalizedOrNull() ?: return null
        val path = normalized.substringAfter("://", normalized).trim('/')

        if (path.isEmpty()) return null

        val segments = path.split('/').filter { it.isNotBlank() }
        if (segments.size < 2) return null

        val identifier = segments.last().normalizedOrNull() ?: return null

        return when (segments.first().lowercase()) {
            "chat", "chats", "messages" -> Route.ChatConversation(identifier)
            "appointment", "appointments", "videocall", "videocalls", "call", "calls" ->
                Route.VideoCall(identifier)
            else -> null
        }
    }

    private fun String?.normalizedOrNull(): String? =
        this?.trim()?.takeIf { it.isNotEmpty() }
}
