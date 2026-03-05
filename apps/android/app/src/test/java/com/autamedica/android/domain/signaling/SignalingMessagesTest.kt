package com.autamedica.android.domain.signaling

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test
import com.google.common.truth.Truth.assertThat

/**
 * Tests that signaling message serialization matches the Cloudflare Workers protocol.
 * Critical for interop between Android and web clients.
 */
class SignalingMessagesTest {

    private val json = Json { ignoreUnknownKeys = true }

    // -- Client messages (serialize) --

    @Test
    fun `join message serializes with type discriminator`() {
        val msg: ClientSignalingMessage = ClientSignalingMessage.Join(
            from = "user-123",
            data = JoinData(userType = "patient"),
        )
        val encoded = json.encodeToString(msg)
        assertThat(encoded).contains("\"type\":\"join\"")
        assertThat(encoded).contains("\"from\":\"user-123\"")
        assertThat(encoded).contains("\"userType\":\"patient\"")
    }

    @Test
    fun `leave message serializes correctly`() {
        val msg: ClientSignalingMessage = ClientSignalingMessage.Leave
        val encoded = json.encodeToString(msg)
        assertThat(encoded).contains("\"type\":\"leave\"")
    }

    @Test
    fun `offer message serializes with to and data`() {
        val sdp = buildJsonObject {
            put("type", "offer")
            put("sdp", "v=0\r\n...")
        }
        val msg: ClientSignalingMessage = ClientSignalingMessage.Offer(
            to = "remote-user",
            data = sdp,
        )
        val encoded = json.encodeToString(msg)
        assertThat(encoded).contains("\"type\":\"offer\"")
        assertThat(encoded).contains("\"to\":\"remote-user\"")
        assertThat(encoded).contains("\"sdp\"")
    }

    @Test
    fun `ice-candidate message serializes with correct type`() {
        val candidate = buildJsonObject {
            put("candidate", "candidate:123 1 udp 2122262783 ...")
            put("sdpMLineIndex", 0)
            put("sdpMid", "0")
        }
        val msg: ClientSignalingMessage = ClientSignalingMessage.IceCandidate(
            to = "remote-user",
            data = candidate,
        )
        val encoded = json.encodeToString(msg)
        assertThat(encoded).contains("\"type\":\"ice-candidate\"")
        assertThat(encoded).contains("\"to\":\"remote-user\"")
    }

    // -- Server messages (deserialize) --

    @Test
    fun `room-state message deserializes correctly`() {
        val raw = """
            {
                "type": "room-state",
                "data": {
                    "users": [
                        {"id": "user-1", "userType": "doctor"},
                        {"id": "user-2", "userType": "patient"}
                    ]
                }
            }
        """.trimIndent()
        val msg = json.decodeFromString<ServerSignalingMessage>(raw)
        assertThat(msg).isInstanceOf(ServerSignalingMessage.RoomState::class.java)
        val roomState = msg as ServerSignalingMessage.RoomState
        assertThat(roomState.data.users).hasSize(2)
        assertThat(roomState.data.users[0].id).isEqualTo("user-1")
        assertThat(roomState.data.users[0].userType).isEqualTo("doctor")
        assertThat(roomState.data.users[1].userType).isEqualTo("patient")
    }

    @Test
    fun `user-joined message deserializes correctly`() {
        val raw = """
            {"type": "user-joined", "from": "user-abc", "data": {"userType": "doctor"}}
        """.trimIndent()
        val msg = json.decodeFromString<ServerSignalingMessage>(raw)
        assertThat(msg).isInstanceOf(ServerSignalingMessage.UserJoined::class.java)
        val joined = msg as ServerSignalingMessage.UserJoined
        assertThat(joined.from).isEqualTo("user-abc")
        assertThat(joined.data.userType).isEqualTo("doctor")
    }

    @Test
    fun `user-left message deserializes correctly`() {
        val raw = """{"type": "user-left", "from": "user-xyz"}"""
        val msg = json.decodeFromString<ServerSignalingMessage>(raw)
        assertThat(msg).isInstanceOf(ServerSignalingMessage.UserLeft::class.java)
        assertThat((msg as ServerSignalingMessage.UserLeft).from).isEqualTo("user-xyz")
    }

    @Test
    fun `offer from server deserializes with SDP data`() {
        val raw = """
            {"type": "offer", "from": "doctor-1", "data": {"type": "offer", "sdp": "v=0\r\n..."}}
        """.trimIndent()
        val msg = json.decodeFromString<ServerSignalingMessage>(raw)
        assertThat(msg).isInstanceOf(ServerSignalingMessage.Offer::class.java)
        val offer = msg as ServerSignalingMessage.Offer
        assertThat(offer.from).isEqualTo("doctor-1")
    }

    @Test
    fun `answer from server deserializes correctly`() {
        val raw = """
            {"type": "answer", "from": "patient-1", "data": {"type": "answer", "sdp": "v=0\r\n..."}}
        """.trimIndent()
        val msg = json.decodeFromString<ServerSignalingMessage>(raw)
        assertThat(msg).isInstanceOf(ServerSignalingMessage.Answer::class.java)
        assertThat((msg as ServerSignalingMessage.Answer).from).isEqualTo("patient-1")
    }

    @Test
    fun `ice-candidate from server deserializes correctly`() {
        val raw = """
            {"type": "ice-candidate", "from": "user-1", "data": {"candidate": "...", "sdpMLineIndex": 0}}
        """.trimIndent()
        val msg = json.decodeFromString<ServerSignalingMessage>(raw)
        assertThat(msg).isInstanceOf(ServerSignalingMessage.IceCandidate::class.java)
    }

    @Test
    fun `error message deserializes correctly`() {
        val raw = """{"type": "error", "data": "Room not found"}"""
        val msg = json.decodeFromString<ServerSignalingMessage>(raw)
        assertThat(msg).isInstanceOf(ServerSignalingMessage.Error::class.java)
        assertThat((msg as ServerSignalingMessage.Error).data).isEqualTo("Room not found")
    }

    @Test
    fun `unknown fields are ignored gracefully`() {
        val raw = """
            {"type": "user-left", "from": "user-1", "extraField": 42, "nested": {"foo": "bar"}}
        """.trimIndent()
        val msg = json.decodeFromString<ServerSignalingMessage>(raw)
        assertThat(msg).isInstanceOf(ServerSignalingMessage.UserLeft::class.java)
    }

    // -- Payload DTOs --

    @Test
    fun `SdpPayload round-trips correctly`() {
        val payload = SdpPayload(type = "offer", sdp = "v=0\r\no=- 123 2 IN IP4 127.0.0.1")
        val encoded = json.encodeToString(payload)
        val decoded = json.decodeFromString<SdpPayload>(encoded)
        assertThat(decoded).isEqualTo(payload)
    }

    @Test
    fun `IceCandidatePayload with null fields`() {
        val payload = IceCandidatePayload(candidate = null, sdpMLineIndex = null, sdpMid = null)
        val encoded = json.encodeToString(payload)
        val decoded = json.decodeFromString<IceCandidatePayload>(encoded)
        assertThat(decoded.candidate).isNull()
    }

    @Test
    fun `IceCandidatePayload full round-trip`() {
        val payload = IceCandidatePayload(
            candidate = "candidate:842163049 1 udp 1677729535 192.168.1.1 3478",
            sdpMLineIndex = 0,
            sdpMid = "0",
            usernameFragment = "abc123",
        )
        val encoded = json.encodeToString(payload)
        val decoded = json.decodeFromString<IceCandidatePayload>(encoded)
        assertThat(decoded).isEqualTo(payload)
    }
}
