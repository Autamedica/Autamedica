package com.autamedica.android.presentation.videocall.webrtc.sfu

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * Mensajes intercambiados por el canal de señalización SFU (Supabase Realtime,
 * channel `signaling:{roomId}`). Port de packages/telemedicine/src/supabase-signaling.ts.
 *
 * El envelope se compone de { type, from, to?, data? } y viaja como payload del
 * evento broadcast `signaling`, reenviado siempre con `from` = id del remitente.
 */
@Serializable
data class SfuSignalingMessage(
    val type: String,
    val from: String? = null,
    val to: String? = null,
    val data: JsonObject? = null,
)

@Serializable
data class CfSessionEnvelope(
    val sessionId: String,
    val userType: String,
)

@Serializable
data class SfuRoomUser(
    val userId: String? = null,
    val userType: String = "unknown",
)

fun SfuRoomUser.toRoomUser(): RoomUserData =
    RoomUserData(id = userId.orEmpty(), userType = userType)

@Serializable
data class RoomUserData(
    val id: String,
    val userType: String,
)