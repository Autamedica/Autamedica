package com.autamedica.android.presentation.dashboard

import com.autamedica.android.domain.model.PortalNotification
import com.autamedica.android.navigation.NotificationRouteResolver
import com.autamedica.android.navigation.Route

sealed interface PatientNotificationDestination {
    data class VideoCall(val appointmentId: String) : PatientNotificationDestination
    data class ChatConversation(val chatId: String) : PatientNotificationDestination
    data object ChatList : PatientNotificationDestination
    data object Prescriptions : PatientNotificationDestination
    data object Certificates : PatientNotificationDestination
    data object MedicalOrders : PatientNotificationDestination
    data object ClinicalDocuments : PatientNotificationDestination
    data object ContinuityStatus : PatientNotificationDestination
    data object Community : PatientNotificationDestination
    data object Profile : PatientNotificationDestination
    data object Appointments : PatientNotificationDestination
}

object PatientNotificationActionResolver {
    fun resolve(notification: PortalNotification): PatientNotificationDestination {
        // 1. Honor explicit action_url from server first
        val deepRoute = NotificationRouteResolver.parseDeepLink(notification.actionUrl)
        when (deepRoute) {
            is Route.VideoCall -> {
                val targetId = deepRoute.appointmentId.ifBlank { deepRoute.roomId }
                if (targetId.isNotBlank()) return PatientNotificationDestination.VideoCall(targetId)
            }
            is Route.ChatConversation -> return PatientNotificationDestination.ChatConversation(deepRoute.chatId)
            Route.ChatList -> return PatientNotificationDestination.ChatList
            Route.Prescriptions, Route.DoctorPrescriptions, is Route.CreatePrescription ->
                return PatientNotificationDestination.Prescriptions
            Route.PatientCertificates -> return PatientNotificationDestination.Certificates
            Route.PatientOrders -> return PatientNotificationDestination.MedicalOrders
            Route.ClinicalDocuments -> return PatientNotificationDestination.ClinicalDocuments
            Route.ContinuityStatus -> return PatientNotificationDestination.ContinuityStatus
            Route.PatientCommunity -> return PatientNotificationDestination.Community
            Route.PatientProfile -> return PatientNotificationDestination.Profile
            else -> Unit
        }

        // 2. Fallback to normalized type + category
        val type = notification.type?.trim()?.lowercase().orEmpty()
        val category = notification.category?.trim()?.lowercase().orEmpty()
        val combined = "$type $category"

        return when {
            NotificationRouteResolver.isCertificateNotification(type) ||
                "certificate" in combined || "certificado" in combined || "atestado" in combined ->
                PatientNotificationDestination.Certificates

            NotificationRouteResolver.isMedicalOrderNotification(type) ||
                "medical_order" in combined || "exam" in combined || "orden" in combined || "lab" in combined ->
                PatientNotificationDestination.MedicalOrders

            NotificationRouteResolver.isPrescriptionNotification(type) ||
                "prescription" in combined || "receta" in combined || "receita" in combined ->
                PatientNotificationDestination.Prescriptions

            NotificationRouteResolver.isFollowupNotification(type) ||
                "followup" in combined || "continuity" in combined ->
                PatientNotificationDestination.ContinuityStatus

            "chat" in combined || "message" in combined ->
                PatientNotificationDestination.ChatList

            "community" in combined || "comunidad" in combined ->
                PatientNotificationDestination.Community

            "document" in combined || "report" in combined || "study" in combined ->
                PatientNotificationDestination.ClinicalDocuments

            "profile" in combined || "identity" in combined || "renaper" in combined ->
                PatientNotificationDestination.Profile

            else -> PatientNotificationDestination.Appointments
        }
    }
}
