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
            deepLink = "/prescriptions/presc-123",
        )

        assertThat(route).isNull()
    }
}
