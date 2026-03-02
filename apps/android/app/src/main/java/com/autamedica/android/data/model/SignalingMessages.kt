package com.autamedica.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Messages sent FROM the Android client TO the signaling server.
 * Must match the protocol in worker/src/types.ts exactly.
 */
@Serializable
sealed interface ClientSignalingMessage {

    @Serializable
    @SerialName("join")
    data class Join(
        val from: String,
        val data: JoinData,
    ) : ClientSignalingMessage

    @Serializable
    @SerialName("leave")
    data object Leave : ClientSignalingMessage

    @Serializable
    @SerialName("offer")
    data class Offer(
        val to: String,
        val data: JsonElement,
    ) : ClientSignalingMessage

    @Serializable
    @SerialName("answer")
    data class Answer(
        val to: String,
        val data: JsonElement,
    ) : ClientSignalingMessage

    @Serializable
    @SerialName("ice-candidate")
    data class IceCandidate(
        val to: String,
        val data: JsonElement,
    ) : ClientSignalingMessage
}

@Serializable
data class JoinData(
    val userType: String,
)

/**
 * Messages received FROM the signaling server.
 * Must match ServerSignalingMessage in webrtc-client.ts.
 */
@Serializable
sealed interface ServerSignalingMessage {

    @Serializable
    @SerialName("room-state")
    data class RoomState(
        val data: RoomStateData,
    ) : ServerSignalingMessage

    @Serializable
    @SerialName("user-joined")
    data class UserJoined(
        val from: String,
        val data: UserJoinedData,
    ) : ServerSignalingMessage

    @Serializable
    @SerialName("user-left")
    data class UserLeft(
        val from: String,
    ) : ServerSignalingMessage

    @Serializable
    @SerialName("offer")
    data class Offer(
        val from: String,
        val data: JsonElement,
    ) : ServerSignalingMessage

    @Serializable
    @SerialName("answer")
    data class Answer(
        val from: String,
        val data: JsonElement,
    ) : ServerSignalingMessage

    @Serializable
    @SerialName("ice-candidate")
    data class IceCandidate(
        val from: String,
        val data: JsonElement,
    ) : ServerSignalingMessage

    @Serializable
    @SerialName("error")
    data class Error(
        val data: String,
    ) : ServerSignalingMessage
}

@Serializable
data class RoomStateData(
    val users: List<RoomUser>,
)

@Serializable
data class RoomUser(
    val id: String,
    val userType: String,
)

@Serializable
data class UserJoinedData(
    val userType: String,
)

@Serializable
data class SdpPayload(
    val type: String,
    val sdp: String,
)

@Serializable
data class IceCandidatePayload(
    val candidate: String? = null,
    val sdpMLineIndex: Int? = null,
    val sdpMid: String? = null,
    val usernameFragment: String? = null,
)
