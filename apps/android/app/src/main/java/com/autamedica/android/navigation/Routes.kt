package com.autamedica.android.navigation

import kotlinx.serialization.Serializable

sealed interface Route {

    @Serializable
    data object Login : Route

    @Serializable
    data object Dashboard : Route

    @Serializable
    data class VideoCall(
        val roomId: String,
        val userId: String,
        val userType: String,
        val userName: String = "",
    ) : Route

    @Serializable
    data object Profile : Route
}
