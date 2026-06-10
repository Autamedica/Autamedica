package com.autamedica.android.data.remote

import com.autamedica.android.domain.signaling.ClientSignalingMessage
import com.autamedica.android.domain.signaling.JoinData
import com.autamedica.android.domain.signaling.ServerSignalingMessage
import com.autamedica.android.domain.signaling.SignalingConnectionState
import com.google.common.truth.Truth.assertThat
import io.mockk.*
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.junit.After
import org.junit.Before
import org.junit.Test

class SignalingWebSocketTest {

    private lateinit var signalingWebSocket: SignalingWebSocket
    private val mockWebSocket = mockk<WebSocket>(relaxed = true)
    private val listenerSlot = slot<WebSocketListener>()

    @Before
    fun setUp() {
        mockkConstructor(OkHttpClient::class)
        every {
            anyConstructed<OkHttpClient>().newWebSocket(any(), capture(listenerSlot))
        } returns mockWebSocket
        
        signalingWebSocket = SignalingWebSocket("wss://test.autamedica.com/signaling")
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    @Test
    fun connectEstablishesWebsocketWithCorrectUrl() {
        signalingWebSocket.connect("room-123")
        
        val capturedRequest = slot<Request>()
        verify {
            anyConstructed<OkHttpClient>().newWebSocket(capture(capturedRequest), any())
        }
        
        // Note: OkHttp internal HttpUrl maps "wss" scheme to "https"
        assertThat(capturedRequest.captured.url.toString())
            .isEqualTo("https://test.autamedica.com/signaling?roomId=room-123")
    }

    @Test
    fun connectUsesDynamicSignalingUrlIfProvided() {
        signalingWebSocket.connect("room-123", "wss://dynamic.autamedica.com/ws")
        
        val capturedRequest = slot<Request>()
        verify {
            anyConstructed<OkHttpClient>().newWebSocket(capture(capturedRequest), any())
        }
        
        // Note: OkHttp internal HttpUrl maps "wss" scheme to "https"
        assertThat(capturedRequest.captured.url.toString())
            .isEqualTo("https://dynamic.autamedica.com/ws?roomId=room-123")
    }

    @Test
    fun onOpenEmitsConnectedState() = runTest {
        val states = mutableListOf<SignalingConnectionState>()
        val job = launch {
            signalingWebSocket.connectionState.take(2).toList(states)
        }
        yield() // Allow collector to start subscribing
        
        signalingWebSocket.connect("room-123")
        
        // Simulate onOpen from the WebSocket
        listenerSlot.captured.onOpen(mockWebSocket, mockk(relaxed = true))
        
        job.join()
        
        assertThat(states).containsExactly(
            SignalingConnectionState.CONNECTING,
            SignalingConnectionState.CONNECTED
        )
    }

    @Test
    fun onMessageParsesAndEmitsServerSignalingMessage() = runTest {
        val messages = mutableListOf<ServerSignalingMessage>()
        val job = launch {
            signalingWebSocket.messages.take(1).toList(messages)
        }
        yield() // Allow collector to start subscribing
        
        signalingWebSocket.connect("room-123")
        listenerSlot.captured.onOpen(mockWebSocket, mockk(relaxed = true))
        
        val rawMessage = """{"type":"user-left","from":"user-abc"}"""
        listenerSlot.captured.onMessage(mockWebSocket, rawMessage)
        
        job.join()
        
        assertThat(messages.first()).isInstanceOf(ServerSignalingMessage.UserLeft::class.java)
        assertThat((messages.first() as ServerSignalingMessage.UserLeft).from).isEqualTo("user-abc")
    }

    @Test
    fun sendSerializesMessageAndForwardsToWebsocket() {
        signalingWebSocket.connect("room-123")
        listenerSlot.captured.onOpen(mockWebSocket, mockk(relaxed = true))
        
        val joinMsg = ClientSignalingMessage.Join("user-1", JoinData("patient"))
        signalingWebSocket.send(joinMsg)
        
        val payloadSlot = slot<String>()
        verify { mockWebSocket.send(capture(payloadSlot)) }
        
        assertThat(payloadSlot.captured).contains("\"type\":\"join\"")
        assertThat(payloadSlot.captured).contains("\"from\":\"user-1\"")
    }

    @Test
    fun onClosedSchedulesReconnectIfNotIntentional() = runTest {
        val states = mutableListOf<SignalingConnectionState>()
        val job = launch {
            signalingWebSocket.connectionState.take(3).toList(states)
        }
        yield() // Allow collector to start subscribing
        
        signalingWebSocket.connect("room-123")
        listenerSlot.captured.onOpen(mockWebSocket, mockk(relaxed = true))
        
        // Simulate abnormal closure (code 1006)
        listenerSlot.captured.onClosed(mockWebSocket, 1006, "Abnormal closure")
        
        job.join()
        
        assertThat(states).containsExactly(
            SignalingConnectionState.CONNECTING,
            SignalingConnectionState.CONNECTED,
            SignalingConnectionState.RECONNECTING
        )
    }

    @Test
    fun onFailureSchedulesReconnectAndSetsStateToReconnecting() = runTest {
        val states = mutableListOf<SignalingConnectionState>()
        val job = launch {
            signalingWebSocket.connectionState.take(3).toList(states)
        }
        yield() // Allow collector to start subscribing
        
        signalingWebSocket.connect("room-123")
        listenerSlot.captured.onOpen(mockWebSocket, mockk(relaxed = true))
        
        listenerSlot.captured.onFailure(mockWebSocket, Exception("Network error"), null)
        
        job.join()
        
        assertThat(states).containsExactly(
            SignalingConnectionState.CONNECTING,
            SignalingConnectionState.CONNECTED,
            SignalingConnectionState.RECONNECTING
        )
    }

    @Test
    fun disconnectClosesWebsocketAndClearsState() = runTest {
        val states = mutableListOf<SignalingConnectionState>()
        val job = launch {
            signalingWebSocket.connectionState.take(3).toList(states)
        }
        yield() // Allow collector to start subscribing
        
        signalingWebSocket.connect("room-123")
        listenerSlot.captured.onOpen(mockWebSocket, mockk(relaxed = true))
        
        signalingWebSocket.disconnect()
        
        job.join()
        
        verify { mockWebSocket.close(1000, "Client disconnect") }
        assertThat(states).containsExactly(
            SignalingConnectionState.CONNECTING,
            SignalingConnectionState.CONNECTED,
            SignalingConnectionState.DISCONNECTED
        )
    }
}
