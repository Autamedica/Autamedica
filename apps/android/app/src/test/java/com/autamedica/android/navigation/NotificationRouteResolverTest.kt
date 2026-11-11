package com.autamedica.android.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationRouteResolverTest {

    @Test
    fun `chat room id has priority over other inputs`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "appointment-123",
            chatRoomId = "chat-456",
            deepLink = "/appointments/appointment-123",
        )

        assertThat(route).isEqualTo(Route.ChatConversation("chat-456"))
    }

    @Test
    fun `appointment id resolves to video call route`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "appointment-123",
            chatRoomId = null,
            deepLink = null,
        )

        assertThat(route).isEqualTo(Route.VideoCall("appointment-123"))
    }

    @Test
    fun `chat deep link resolves to conversation route`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = null,
            chatRoomId = null,
            deepLink = "autamedica://messages/chat-456",
        )

        assertThat(route).isEqualTo(Route.ChatConversation("chat-456"))
    }

    @Test
    fun `appointment deep link resolves to video call route`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = null,
            chatRoomId = null,
            deepLink = "/appointments/appointment-123",
        )

        assertThat(route).isEqualTo(Route.VideoCall("appointment-123"))
    }

    @Test
    fun `unknown deep link resolves to null`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = null,
            chatRoomId = null,
            deepLink = "/unknown/unknown-123",
        )

        assertThat(route).isNull()
    }

    @Test
    fun `followup notification type appointment followup 48h resolves to ContinuityStatus`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "appointment-123",
            chatRoomId = null,
            deepLink = null,
            notificationType = "appointment.followup_48h",
        )

        assertThat(route).isEqualTo(Route.ContinuityStatus)
    }

    @Test
    fun `followup notification type event_appointment_followup_48h resolves to ContinuityStatus`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "appointment-123",
            chatRoomId = null,
            deepLink = null,
            notificationType = "event_appointment_followup_48h",
        )

        assertThat(route).isEqualTo(Route.ContinuityStatus)
    }

    @Test
    fun `followup notification type followup resolves to ContinuityStatus`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = null,
            chatRoomId = null,
            deepLink = null,
            notificationType = "followup",
        )

        assertThat(route).isEqualTo(Route.ContinuityStatus)
    }

    @Test
    fun `deep link autamedica continuity resolves to ContinuityStatus`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = null,
            chatRoomId = null,
            deepLink = "autamedica://continuity",
        )

        assertThat(route).isEqualTo(Route.ContinuityStatus)
    }

    @Test
    fun `deep link autamedica followup resolves to ContinuityStatus`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = null,
            chatRoomId = null,
            deepLink = "autamedica://followup",
        )

        assertThat(route).isEqualTo(Route.ContinuityStatus)
    }

    @Test
    fun `deep link with trailing slash or subpath resolves to ContinuityStatus`() {
        val routeSlash = NotificationRouteResolver.resolve(
            appointmentId = null,
            chatRoomId = null,
            deepLink = "autamedica://continuity/",
        )
        val routeSubpath = NotificationRouteResolver.resolve(
            appointmentId = null,
            chatRoomId = null,
            deepLink = "/followup",
        )

        assertThat(routeSlash).isEqualTo(Route.ContinuityStatus)
        assertThat(routeSubpath).isEqualTo(Route.ContinuityStatus)
    }

    @Test
    fun `followup notification type overrides appointment id`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "appointment-999",
            chatRoomId = null,
            deepLink = null,
            notificationType = "appointment.followup_48h",
        )

        assertThat(route).isEqualTo(Route.ContinuityStatus)
    }

    @Test
    fun `pharmacy dispatch push only opens doctor radar never video room`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "dispatch-request-123",
            roomId = "room-hidden-from-push",
            notificationType = "pharmacy_dispatch_incoming",
        )
        assertThat(route).isEqualTo(Route.DoctorOnDemand)
        assertThat(NotificationRouteResolver.isCallNotification("pharmacy_dispatch_incoming")).isFalse()
        assertThat(NotificationRouteResolver.isIncomingCallNotificationType("pharmacy_dispatch_incoming")).isFalse()
    }

    @Test
    fun `incoming call notification type resolves to VideoCall route with direct join`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "call-appointment-001",
            roomId = "room-001",
            chatRoomId = null,
            deepLink = null,
            notificationType = "INCOMING_CALL",
        )

        assertThat(route).isEqualTo(Route.VideoCall("call-appointment-001", "room-001", true))
    }

    @Test
    fun `call started notification type has priority over chat room id`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "call-appointment-002",
            roomId = "room-002",
            chatRoomId = "chat-room-999",
            deepLink = null,
            notificationType = "CALL_STARTED",
        )

        assertThat(route).isEqualTo(Route.VideoCall("call-appointment-002", "room-002", true))
    }

    @Test
    fun `patient connected notification type resolves to VideoCall route without direct join flag`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "call-appointment-003",
            chatRoomId = null,
            deepLink = null,
            notificationType = "PATIENT_CONNECTED",
        )

        assertThat(route).isEqualTo(Route.VideoCall("call-appointment-003"))
    }

    @Test
    fun `call started notification without appointment id resolves to VideoCall via room id`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "",
            roomId = "room-001",
            chatRoomId = null,
            deepLink = null,
            notificationType = "CALL_STARTED",
        )

        assertThat(route).isEqualTo(Route.VideoCall("", "room-001", true))
    }

    @Test
    fun `call notification without appointment and room id resolves to null`() {
        val route = NotificationRouteResolver.resolve(
            appointmentId = "   ",
            roomId = null,
            chatRoomId = null,
            deepLink = null,
            notificationType = "CALL_STARTED",
        )

        assertThat(route).isNull()
    }

    @Test
    fun `isCallNotification detects call events`() {
        assertThat(NotificationRouteResolver.isCallNotification("incoming_call")).isTrue()
        assertThat(NotificationRouteResolver.isCallNotification("call_started")).isTrue()
        assertThat(NotificationRouteResolver.isCallNotification("patient_connected")).isTrue()
        assertThat(NotificationRouteResolver.isCallNotification("CALL_STARTED")).isTrue()
        assertThat(NotificationRouteResolver.isCallNotification("followup")).isFalse()
        assertThat(NotificationRouteResolver.isCallNotification(null)).isFalse()
    }

    @Test
    fun `Brazil Jordan QR deep link retains partner without treating solicitar as pharmacy ID`() {
        val route = NotificationRouteResolver.parseDeepLink(
            "https://www.autamedica.com/farmacia/solicitar?ref=JORDAN"
        )
        assertThat(route).isEqualTo(Route.PharmacyIntake("", "JORDAN"))
    }

    @Test
    fun `malformed referral is not trusted as partner`() {
        val route = NotificationRouteResolver.parseDeepLink(
            "https://www.autamedica.com/farmacia/solicitar?ref=JORDAN%0Ainvalid"
        )
        assertThat(route).isEqualTo(Route.PharmacyIntake("", ""))
    }

    @Test
    fun `pharmacy deep link without id resolves to PharmacyIntake with empty id`() {
        val route = NotificationRouteResolver.resolve(
            deepLink = "https://www.autamedica.com/farmacia/on-demand/entry"
        )
        assertThat(route).isEqualTo(Route.PharmacyIntake(""))
    }

    @Test
    fun `pharmacy deep link with query param resolves to PharmacyIntake with extracted id`() {
        val route = NotificationRouteResolver.resolve(
            deepLink = "https://www.autamedica.com/farmacia/on-demand/entry?pharmacy_id=pharm-123"
        )
        assertThat(route).isEqualTo(Route.PharmacyIntake("pharm-123"))
    }

    @Test
    fun `pharmacy deep link with path id resolves to PharmacyIntake with extracted id`() {
        val route = NotificationRouteResolver.resolve(
            deepLink = "autamedica://farmacia/pharm-456"
        )
        assertThat(route).isEqualTo(Route.PharmacyIntake("pharm-456"))
    }
}
