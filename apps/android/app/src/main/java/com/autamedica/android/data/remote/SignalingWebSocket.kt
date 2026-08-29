package com.autamedica.android.data.remote

import com.autamedica.android.domain.signaling.ClientSignalingMessage
import com.autamedica.android.domain.signaling.ServerSignalingMessage
import com.autamedica.android.domain.signaling.SignalingClient
import com.autamedica.android.domain.signaling.SignalingConnectionState
import com.autamedica.android.logging.SecureLog
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
import java.util.Timer
import java.util.TimerTask
import java.util.concurrent.TimeUnit
import kotlin.math.min

/**
 * WebSocket connection to the AutaMedica signaling server.
 * Handles connection lifecycle, message serialization, and reconnection with exponential backoff.
 *
 * Protocol matches: wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling
 */
class SignalingWebSocket(
    private val signalingUrl: String,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : SignalingClient {
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
    override val messages: SharedFlow<ServerSignalingMessage> = _messages.asSharedFlow()

    private val _connectionState = MutableSharedFlow<SignalingConnectionState>(
        replay = 1,
        extraBufferCapacity = 8,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    override val connectionState: SharedFlow<SignalingConnectionState> = _connectionState.asSharedFlow()

    private var isConnected = false
    private var currentRoomId: String? = null
    private var activeSignalingUrl: String? = null
    private var reconnectAttempt = 0
    private var reconnectTimer: Timer? = null
    private var intentionalDisconnect = false

    override fun connect(roomId: String, signalingUrl: String?) {
        if (isConnected) return

        currentRoomId = roomId
        activeSignalingUrl = signalingUrl?.trim()?.takeIf { it.isNotEmpty() } ?: this.signalingUrl
        intentionalDisconnect = false
        reconnectAttempt = 0
        connectInternal(roomId)
    }

    private fun connectInternal(roomId: String) {
        val encodedRoomId = URLEncoder.encode(roomId, "UTF-8")
        val baseTargetUrl = activeSignalingUrl ?: this.signalingUrl
        val url = "$baseTargetUrl?roomId=$encodedRoomId"
        val safeHost = runCatching { java.net.URI(baseTargetUrl).host }.getOrNull() ?: "unknown"
        SecureLog.info("[Signaling] Connecting to signaling host=$safeHost")

        val request = Request.Builder().url(url).build()
        webSocket = client.newWebSocket(request, SignalingListener())
        _connectionState.tryEmit(
            if (reconnectAttempt > 0) SignalingConnectionState.RECONNECTING
            else SignalingConnectionState.CONNECTING
        )
    }

    override fun send(message: ClientSignalingMessage) {
        val ws = webSocket
        if (ws == null || !isConnected) {
            Timber.w("[Signaling] Cannot send: not connected")
            return
        }
        val payload = json.encodeToString(message)
        ws.send(payload)
    }

    override fun disconnect() {
        Timber.i("[Signaling] Disconnecting")
        intentionalDisconnect = true
        cancelReconnect()
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        isConnected = false
        currentRoomId = null
        _connectionState.tryEmit(SignalingConnectionState.DISCONNECTED)
    }

    private fun scheduleReconnect() {
        val roomId = currentRoomId ?: return
        if (intentionalDisconnect) return
        if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
            Timber.e("[Signaling] Max reconnect attempts ($MAX_RECONNECT_ATTEMPTS) reached")
            _connectionState.tryEmit(SignalingConnectionState.FAILED)
            return
        }

        val delayMs = min(
            INITIAL_BACKOFF_MS * (1L shl reconnectAttempt),
            MAX_BACKOFF_MS,
        )
        reconnectAttempt++
        Timber.i("[Signaling] Reconnecting in ${delayMs}ms (attempt $reconnectAttempt/$MAX_RECONNECT_ATTEMPTS)")
        _connectionState.tryEmit(SignalingConnectionState.RECONNECTING)

        cancelReconnect()
        reconnectTimer = Timer("signaling-reconnect", true).apply {
            schedule(object : TimerTask() {
                override fun run() {
                    if (!intentionalDisconnect) {
                        connectInternal(roomId)
                    }
                }
            }, delayMs)
        }
    }

    private fun cancelReconnect() {
        reconnectTimer?.cancel()
        reconnectTimer = null
    }

    private inner class SignalingListener : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Timber.i("[Signaling] Connected")
            isConnected = true
            reconnectAttempt = 0
            _connectionState.tryEmit(SignalingConnectionState.CONNECTED)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            try {
                val message = json.decodeFromString<ServerSignalingMessage>(text)
                _messages.tryEmit(message)
            } catch (e: Exception) {
                SecureLog.error("[Signaling] Failed to parse message", e)
            }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Timber.i("[Signaling] Closing: code=$code reason=$reason")
            webSocket.close(1000, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Timber.i("[Signaling] Closed: code=$code reason=$reason")
            isConnected = false
            if (code != 1000 && !intentionalDisconnect) {
                scheduleReconnect()
            } else {
                _connectionState.tryEmit(SignalingConnectionState.DISCONNECTED)
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            SecureLog.error("[Signaling] Connection failed: ${response?.code}", t)
            isConnected = false
            if (!intentionalDisconnect) {
                scheduleReconnect()
            } else {
                _connectionState.tryEmit(SignalingConnectionState.FAILED)
            }
        }
    }

    companion object {
        private const val MAX_RECONNECT_ATTEMPTS = 6
        private const val INITIAL_BACKOFF_MS = 1000L
        private const val MAX_BACKOFF_MS = 32_000L
    }
}
