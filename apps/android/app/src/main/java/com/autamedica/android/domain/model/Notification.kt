package com.autamedica.android.domain.model

/**
 * Parsed payload from an incoming FCM notification.
 */
data class PushPayload(
    val type: NotificationType,
    val title: String,
    val body: String,
    val appointmentId: String? = null,
    val callId: String? = null,
    val roomId: String? = null,
    val chatRoomId: String? = null,
    val prescriptionId: String? = null,
    val senderId: String? = null,
    val deepLink: String? = null,
    val rawType: String? = null,
    val doctorName: String? = null,
    val doctorAvatarUrl: String? = null,
    val offerId: String? = null,
)
