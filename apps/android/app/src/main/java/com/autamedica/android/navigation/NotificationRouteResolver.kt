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

        // A dispatch push is an invitation to REVIEW an offer, never a
        // permission to enter the video room. Claim authorization happens later.
        val normalizedType = notificationType?.trim()?.lowercase()
        if (normalizedType == "pharmacy_dispatch_incoming" ||
            normalizedType == "pharmacy_dispatch"
        ) {
            return Route.DoctorOnDemand
        }

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
     * Solo las notificaciones dirigidas al paciente o médico con llamada entrante activan el join directo.
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

        // On-demand pharmacy counter intake deep link:
        // Handles https://autamedica.com/farmacia/*, https://www.autamedica.com/farmacia/*, autamedica://farmacia/*
        if (segments.any { it.equals("farmacia", ignoreCase = true) }) {
            val pharmacyId = extractPharmacyId(normalized)
            return Route.PharmacyIntake(pharmacyId, extractReferralCode(normalized))
        }

        // On-demand doctor duty / dispatch:
        // Handles autamedica://ondemand, autamedica://guardia
        if (firstSegment == "ondemand" || firstSegment == "guardia") {
            return Route.DoctorOnDemand
        }

        // Doctor prescriptions list or create prescription
        if (firstSegment == "prescriptions" || firstSegment == "recetas") {
            if (segments.size < 2) return Route.DoctorPrescriptions
            val pid = segments.last().normalizedOrNull() ?: ""
            return Route.CreatePrescription(pid)
        }
        if (firstSegment == "prescription" || firstSegment == "receta") {
            val pid = if (segments.size >= 2) segments.last().normalizedOrNull() ?: "" else ""
            return Route.CreatePrescription(pid)
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

    // A commercial QR source must be explicitly supplied and syntactically safe.
    // The backend, not the deep link, decides whether the partner code is active.
    fun extractReferralCode(raw: String): String {
        val query = raw.substringAfter('?', "").substringBefore('#')
        val matches = query.split('&').mapNotNull { pair ->
            val key = pair.substringBefore('=').trim()
            if (!key.equals("ref", ignoreCase = true) || '=' !in pair) null
            else runCatching { java.net.URLDecoder.decode(pair.substringAfter('='), "UTF-8") }.getOrNull()
        }
        if (matches.size != 1) return ""
        val normalized = matches.single().trim().uppercase(java.util.Locale.ROOT)
        return normalized.takeIf { it.matches(Regex("^[A-Z0-9_-]{3,32}$")) } ?: ""
    }

    fun extractPharmacyId(raw: String): String {
        // 1. Check query parameters
        val queryString = raw.substringAfter('?', "").substringBefore('#')
        if (queryString.isNotBlank()) {
            val params = queryString.split('&')
            for (param in params) {
                val pair = param.split('=', limit = 2)
                val key = pair.getOrNull(0)?.trim()?.lowercase()
                val value = pair.getOrNull(1)?.trim()
                if (key in listOf("pharmacy_id", "pharmacyid", "pharmacy") && !value.isNullOrBlank()) {
                    return runCatching { java.net.URLDecoder.decode(value, "UTF-8") }.getOrDefault(value)
                }
            }
        }

        // 2. Check path segments after "farmacia"
        val withoutScheme = if (raw.contains("://")) raw.substringAfter("://") else raw
        val cleanPath = withoutScheme.substringBefore('?').substringBefore('#').trim('/')
        val segments = cleanPath.split('/').filter { it.isNotBlank() }
        val farmaciaIndex = segments.indexOfFirst { it.equals("farmacia", ignoreCase = true) }
        if (farmaciaIndex >= 0 && farmaciaIndex < segments.size - 1) {
            val candidate = segments.subList(farmaciaIndex + 1, segments.size)
                .firstOrNull {
                    !it.equals("on-demand", ignoreCase = true) &&
                    !it.equals("entry", ignoreCase = true) &&
                    !it.equals("intake", ignoreCase = true) &&
                    !it.equals("solicitar", ignoreCase = true)
                }
            if (!candidate.isNullOrBlank()) {
                return runCatching { java.net.URLDecoder.decode(candidate.trim(), "UTF-8") }.getOrDefault(candidate.trim())
            }
        }

        return ""
    }

    private fun String?.normalizedOrNull(): String? =
        this?.trim()?.takeIf { it.isNotEmpty() }
}
