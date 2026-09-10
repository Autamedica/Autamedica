package com.autamedica.android.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PortalNotification(
    val id: String,
    @SerialName("user_id") val userId: String,
    val audience: String? = "patient",
    val category: String? = "appointment",
    val type: String? = "general",
    val title: String,
    val body: String,
    @SerialName("action_url") val actionUrl: String? = null,
    @SerialName("action_label") val actionLabel: String? = null,
    val priority: String? = "normal",
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val isRead: Boolean get() = !readAt.isNullOrBlank()
}
