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
        prescriptionId: String? = null,
        deepLink: String? = null,
        notificationType: String? = null,
    ): Route? {
        val normalizedAppointmentId = appointmentId.normalizedOrNull()
        val normalizedRoomId = roomId.normalizedOrNull()
        val normalizedPrescriptionId = prescriptionId.normalizedOrNull()

        // A dispatch push is an invitation to REVIEW an offer, never a
        // permission to enter the video room. Claim authorization happens later.
        val normalizedType = notificationType?.trim()?.lowercase()
        if (normalizedType == "pharmacy_dispatch_incoming" ||
            normalizedType == "pharmacy_dispatch"
        ) {
            return Route.DoctorOnDemand
        }

        if (isCallNotification(notificationType)) {
            // Direct calls created without an appointment carry room_id without appointment_id.
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

        if (isCertificateNotification(notificationType)) {
            return Route.PatientCertificates
        }

        if (isMedicalOrderNotification(notificationType)) {
            return Route.PatientOrders
        }

        if (normalizedPrescriptionId != null || isPrescriptionNotification(notificationType)) {
            return Route.Prescriptions
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
            prescriptionId = intent.getStringExtra(EXTRA_PRESCRIPTION_ID),
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

    fun isPrescriptionNotification(notificationType: String?): Boolean {
        val normalized = notificationType?.trim()?.lowercase() ?: return false
        return normalized == "prescription" ||
            normalized == "prescription_ready" ||
            normalized == "prescription_issued" ||
            normalized == "prescription_created" ||
            normalized == "receta" ||
            normalized == "receta_emitida"
    }

    fun isCertificateNotification(notificationType: String?): Boolean {
        val normalized = notificationType?.trim()?.lowercase() ?: return false
        return normalized == "certificate" ||
            normalized == "certificate_ready" ||
            normalized == "certificate_issued" ||
            normalized == "medical_certificate" ||
            normalized == "certificado" ||
            normalized == "atestado"
    }

    fun isMedicalOrderNotification(notificationType: String?): Boolean {
        val normalized = notificationType?.trim()?.lowercase() ?: return false
        return normalized == "medical_order" ||
            normalized == "medical_order_ready" ||
            normalized == "medical_order_issued" ||
            normalized == "exam_order" ||
            normalized == "orden_medica" ||
            normalized == "lab_order"
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
     * Only notifications directed to patient/doctor with an incoming call trigger direct join.
     * PATIENT_CONNECTED notifies the doctor, who joins through their own flow.
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
        val isHttp = normalized.startsWith("https://", ignoreCase = true) ||
            normalized.startsWith("http://", ignoreCase = true)
        val withoutScheme = if (normalized.contains("://")) {
            normalized.substringAfter("://")
        } else {
            normalized
        }
        val cleanPath = withoutScheme.substringBefore('?').substringBefore('#').trim('/')
        if (cleanPath.isEmpty()) return null

        val rawSegments = cleanPath.split('/').filter { it.isNotBlank() }
        if (rawSegments.isEmpty()) return null

        // On-demand pharmacy counter intake deep link:
        // Handles https://autamedica.com/farmacia/*, https://www.autamedica.com/farmacia/*, autamedica://farmacia/*
        if (rawSegments.any { it.equals("farmacia", ignoreCase = true) }) {
            val pharmacyId = extractPharmacyId(normalized)
            return Route.PharmacyIntake(
                pharmacyId = pharmacyId,
                referralCode = extractReferralCode(normalized),
                careCountry = extractCareCountry(normalized),
            )
        }

        // Strip known AutaMedica web host prefix so https://paciente.autamedica.com/patients/...
        // and relative /patients/... resolve identically.
        val segments = if (isHttp && isAutamedicaHost(rawSegments.first())) {
            rawSegments.drop(1)
        } else {
            rawSegments
        }
        if (segments.isEmpty()) return null

        val firstSegment = segments.first().lowercase()

        // Patient-scoped web & app deep links (/patients/*, autamedica://patients/*, autamedica://paciente/*)
        if (firstSegment == "patients" || firstSegment == "patient" || firstSegment == "paciente") {
            val sub = segments.getOrNull(1)?.lowercase()
            return when (sub) {
                "prescriptions", "recetas", "receitas" -> Route.Prescriptions
                "certificates", "certificados", "atestados" -> Route.PatientCertificates
                "medical-orders", "orders", "ordenes", "exames", "examenes" -> Route.PatientOrders
                "documents", "reports", "estudios" -> Route.ClinicalDocuments
                "community", "comunidad", "comunidade" -> Route.PatientCommunity
                "profile", "perfil", "identity" -> Route.PatientProfile
                "anamnesis", "history", "historia-clinica" -> Route.AnamnesisForm
                "continuity", "followup" -> Route.ContinuityStatus
                "chat", "chats", "messages" -> {
                    val chatId = segments.getOrNull(2).normalizedOrNull()
                    if (chatId != null) Route.ChatConversation(chatId) else Route.ChatList
                }
                "appointments", "appointment", "consultations", "call", "videocall" -> {
                    val aptId = segments.getOrNull(2).normalizedOrNull()
                    if (aptId != null) Route.VideoCall(aptId) else null
                }
                else -> null
            }
        }

        // Single or multi-segment deep links for continuity / clinical followup:
        if (firstSegment == "continuity" || firstSegment == "followup" || firstSegment == "continuity_status") {
            return Route.ContinuityStatus
        }

        // Direct patient document & community deep links:
        if (firstSegment == "certificates" || firstSegment == "certificados" || firstSegment == "atestados") {
            return Route.PatientCertificates
        }
        if (firstSegment == "medical-orders" || firstSegment == "ordenes" || firstSegment == "exames" || firstSegment == "examenes") {
            return Route.PatientOrders
        }
        if (firstSegment == "community" || firstSegment == "comunidad" || firstSegment == "comunidade") {
            return Route.PatientCommunity
        }

        // On-demand doctor duty / dispatch:
        if (firstSegment == "ondemand" || firstSegment == "guardia") {
            return Route.DoctorOnDemand
        }

        // Doctor prescriptions list or create prescription (preserved for existing doctor workflows)
        if (firstSegment == "prescriptions" || firstSegment == "recetas") {
            if (segments.size < 2) return Route.DoctorPrescriptions
            val pid = segments.last().normalizedOrNull() ?: ""
            return Route.CreatePrescription(pid)
        }
        if (firstSegment == "prescription" || firstSegment == "receta") {
            val pid = if (segments.size >= 2) segments.last().normalizedOrNull() ?: "" else ""
            return Route.CreatePrescription(pid)
        }

        if (segments.size < 2) {
            return when (firstSegment) {
                "chat", "chats", "messages" -> Route.ChatList
                else -> null
            }
        }

        val identifier = segments.last().normalizedOrNull() ?: return null

        return when (firstSegment) {
            "chat", "chats", "messages" -> Route.ChatConversation(identifier)
            "appointment", "appointments", "videocall", "videocalls", "call", "calls" ->
                Route.VideoCall(identifier)
            else -> null
        }
    }

    private fun isAutamedicaHost(host: String): Boolean {
        val lower = host.lowercase()
        return lower == "autamedica.com" || lower.endsWith(".autamedica.com")
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

    fun extractCareCountry(raw: String): String {
        val query = raw.substringAfter('?', "").substringBefore('#')
        val matches = query.split('&').mapNotNull { pair ->
            val key = pair.substringBefore('=').trim()
            if (!key.equals("careCountry", ignoreCase = true) &&
                !key.equals("care_country", ignoreCase = true)
            ) null
            else if ('=' !in pair) null
            else runCatching {
                java.net.URLDecoder.decode(pair.substringAfter('='), "UTF-8")
            }.getOrNull()
        }
        if (matches.size != 1) return ""
        return matches.single().trim().uppercase(java.util.Locale.ROOT)
            .takeIf { it == "AR" || it == "BR" } ?: ""
    }

    fun extractPharmacyId(raw: String): String {
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
