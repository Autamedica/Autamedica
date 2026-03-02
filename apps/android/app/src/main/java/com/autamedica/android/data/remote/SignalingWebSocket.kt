package com.autamedica.android.data.remote

import com.autamedica.android.data.model.ClientSignalingMessage
import com.autamedica.android.data.model.ServerSignalingMessage
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import timber.log.Timber
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * WebSocket connection to the AutaMedica signaling server.
 * Handles connection lifecycle, message serialization, and reconnection.
 *
 * Protocol matches: wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling
 */
class SignalingWebSocket(
    private val signalingUrl: String,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val _messages = MutableSharedFlow<ServerSignalingMessage>(
        replay = 0,
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val messages: SharedFlow<ServerSignalingMessage> = _messages.asSharedFlow()

    private val _connectionState = MutableSharedFlow<SignalingConnectionState>(
        replay = 1,
        extraBufferCapacity = 8,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val connectionState: SharedFlow<SignalingConnectionState> = _connectionState.asSharedFlow()

    private var isConnected = false

    fun connect(roomId: String) {
        if (isConnected) return

        val encodedRoomId = URLEncoder.encode(roomId, "UTF-8")
        val url = "$signalingUrl?roomId=$encodedRoomId"
        Timber.i("[Signaling] Connecting to: $url")

        val request = Request.Builder().url(url).build()
        webSocket = client.newWebSocket(request, SignalingListener())
        _connectionState.tryEmit(SignalingConnectionState.CONNECTING)
    }

    fun send(message: ClientSignalingMessage) {
        val ws = webSocket
        if (ws == null || !isConnected) {
            Timber.w("[Signaling] Cannot send: not connected")
            return
        }
        val payload = json.encodeToString(message)
        ws.send(payload)
    }

    fun disconnect() {
        Timber.i("[Signaling] Disconnecting")
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        isConnected = false
        _connectionState.tryEmit(SignalingConnectionState.DISCONNECTED)
    }

    private inner class SignalingListener : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Timber.i("[Signaling] Connected")
            isConnected = true
            _connectionState.tryEmit(SignalingConnectionState.CONNECTED)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            try {
                val message = json.decodeFromString<ServerSignalingMessage>(text)
                _messages.tryEmit(message)
            } catch (e: Exception) {
                Timber.e(e, "[Signaling] Failed to parse message: ${text.take(200)}")
            }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Timber.i("[Signaling] Closing: code=$code reason=$reason")
            webSocket.close(1000, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Timber.i("[Signaling] Closed: code=$code reason=$reason")
            isConnected = false
            _connectionState.tryEmit(SignalingConnectionState.DISCONNECTED)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Timber.e(t, "[Signaling] Connection failed: ${response?.code}")
            isConnected = false
            _connectionState.tryEmit(SignalingConnectionState.FAILED)
        }
    }
}

enum class SignalingConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    FAILED,
}
