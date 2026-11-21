package com.autamedica.android.presentation.dashboard

import com.autamedica.android.domain.model.PortalNotification
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PatientNotificationActionResolverTest {
    private fun notification(
        category: String? = "general",
        type: String? = "general",
        actionUrl: String? = null,
    ) = PortalNotification(
        id = "n-1",
        userId = "u-1",
        category = category,
        type = type,
        title = "Notificación",
        body = "Detalle",
        actionUrl = actionUrl,
    )

    @Test fun actionUrlTakesPriorityOverCategoryFallback() {
        assertThat(
            PatientNotificationActionResolver.resolve(
                notification(category = "appointment", actionUrl = "https://paciente.autamedica.com/patients/certificates"),
            ),
        ).isEqualTo(PatientNotificationDestination.Certificates)

        assertThat(
            PatientNotificationActionResolver.resolve(
                notification(category = "chat", actionUrl = "/chat/room-99"),
            ),
        ).isEqualTo(PatientNotificationDestination.ChatConversation("room-99"))
    }

    @Test fun documentCategoriesRouteToExactDocumentTabs() {
        assertThat(PatientNotificationActionResolver.resolve(notification(category = "prescription")))
            .isEqualTo(PatientNotificationDestination.Prescriptions)
        assertThat(PatientNotificationActionResolver.resolve(notification(category = "certificate")))
            .isEqualTo(PatientNotificationDestination.Certificates)
        assertThat(PatientNotificationActionResolver.resolve(notification(category = "medical_order")))
            .isEqualTo(PatientNotificationDestination.MedicalOrders)
    }

    @Test fun chatAndFollowupCategoriesNoLongerFallBackToAppointments() {
        assertThat(PatientNotificationActionResolver.resolve(notification(category = "chat")))
            .isEqualTo(PatientNotificationDestination.ChatList)
        assertThat(PatientNotificationActionResolver.resolve(notification(type = "followup_48h")))
            .isEqualTo(PatientNotificationDestination.ContinuityStatus)
    }
}
