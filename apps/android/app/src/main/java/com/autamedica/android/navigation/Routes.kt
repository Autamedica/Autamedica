package com.autamedica.android.navigation

import kotlinx.serialization.Serializable

sealed interface Route {

    @Serializable
    data object Login : Route

    @Serializable
    data object Main : Route

    @Serializable
    data class VideoCall(
        val appointmentId: String,
    ) : Route

    @Serializable
    data class PatientDetail(
        val patientId: String,
    ) : Route

    @Serializable
    data object ChatList : Route

    @Serializable
    data class ChatConversation(
        val chatId: String,
    ) : Route

    @Serializable
    data object AnamnesisForm : Route

    @Serializable
    data object PreventiveHealth : Route
}
