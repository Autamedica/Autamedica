package com.autamedica.android.domain.signaling

import kotlinx.coroutines.flow.SharedFlow

interface SignalingClient {
    val messages: SharedFlow<ServerSignalingMessage>
    val connectionState: SharedFlow<SignalingConnectionState>

    fun connect(roomId: String, signalingUrl: String? = null)
    fun send(message: ClientSignalingMessage)
    fun disconnect()
}

enum class SignalingConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    FAILED,
}
