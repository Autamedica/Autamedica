package com.autamedica.android.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class ChatMessage(
    val id: String,
    val text: String,
    val senderId: String,
    val senderType: String,
    val senderName: String? = null,
    val timestamp: Long,
)
