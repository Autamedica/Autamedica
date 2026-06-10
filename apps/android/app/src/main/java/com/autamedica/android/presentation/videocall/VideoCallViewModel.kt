package com.autamedica.android.presentation.videocall

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.VideoCallStateHolder
import com.autamedica.android.domain.model.ChatMessage
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.domain.model.StreamQualityLevel
import com.autamedica.android.domain.model.StreamQualitySummary
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.domain.signaling.SignalingClient
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.presentation.videocall.webrtc.WebRTCEngine
import com.autamedica.android.service.CallNotificationService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.webrtc.EglBase
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.VideoTrack
import com.autamedica.android.domain.repository.IceServerInfo
import timber.log.Timber
import javax.inject.Inject

data class VideoCallUiState(
    val connectionState: ConnectionState = ConnectionState.DISCONNECTED,
    val isVideoEnabled: Boolean = true,
    val isAudioEnabled: Boolean = true,
    val isSpeakerOn: Boolean = true,
    val chatMessages: List<ChatMessage> = emptyList(),
    val isChatOpen: Boolean = false,
    val chatReady: Boolean = false,
    val qualitySummary: StreamQualitySummary = StreamQualitySummary(
        "", StreamQualityLevel.UNKNOWN, emptyList()
    ),
    val callDurationSeconds: Long = 0,
    val showControls: Boolean = true,
    val hasRemoteVideo: Boolean = false,
    val isWaitingRoom: Boolean = false,
    val isPreviewOnlyMode: Boolean = false,
    val sessionStatusMessage: String? = null,
)

@HiltViewModel
class VideoCallViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val peerConnectionFactory: PeerConnectionFactory,
    private val eglBase: EglBase,
    private val json: Json,
    savedStateHandle: SavedStateHandle,
    private val authRepository: AuthRepository,
    private val signalingClient: SignalingClient,
    private val telemedicineRepository: TelemedicineRepository,
    private val videoCallStateHolder: VideoCallStateHolder,
) : ViewModel() {

    val appointmentId: String = savedStateHandle["appointmentId"] ?: ""
    private val previewOnlyMode: Boolean = appointmentId == VIDEO_PREVIEW_APPOINTMENT_ID

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    val engine = WebRTCEngine(
        context = context,
        peerConnectionFactory = peerConnectionFactory,
        eglBase = eglBase,
        signalingClient = signalingClient,
        scope = viewModelScope,
        json = json,
    )

    private val _uiState = MutableStateFlow(VideoCallUiState())
    val uiState: StateFlow<VideoCallUiState> = _uiState.asStateFlow()

    val localVideoTrack: StateFlow<VideoTrack?> = engine.localVideoTrack
    val remoteVideoTrack: StateFlow<VideoTrack?> = engine.remoteVideoTrack
    val eglContext: EglBase.Context get() = eglBase.eglBaseContext
    val currentUserId: String
        get() = callUserId

    private var callStartTimeMs: Long = 0L
    private var timerJob: kotlinx.coroutines.Job? = null
    private var sessionRetryJob: kotlinx.coroutines.Job? = null
    private var engineObserversBound = false
    private var callStarted = false
    private var callUserId: String = ""
    private var callUserType: String = ""
    private var callUserName: String = ""

    init {
        _uiState.update { it.copy(connectionState = ConnectionState.CONNECTING) }
        setupAudioForCall()
    }

    fun startCall() {
        if (callStarted) return
        callStarted = true
        _uiState.update {
            it.copy(
                connectionState = ConnectionState.CONNECTING,
                isWaitingRoom = false,
                sessionStatusMessage = "Preparando tu camara...",
            )
        }

        viewModelScope.launch {
            runCatching {
                val currentUser = authRepository.getCurrentUser()
                    ?: throw IllegalStateException("No authenticated user available for video call")
                callUserId = currentUser.id
                callUserType = currentUser.role.wireName
                callUserName = currentUser.displayName

                engine.initialize(
                    WebRTCEngine.Config(
                        roomId = appointmentId,
                        userId = callUserId,
                        userType = callUserType,
                        userName = callUserName,
                    )
                )
                observeEngine()
                engine.startLocalMedia()
            }.onFailure { error ->
                SecureLog.error("Failed to start telemedicine preview", error)
                _uiState.update {
                    it.copy(
                        connectionState = ConnectionState.FAILED,
                        isWaitingRoom = false,
                        sessionStatusMessage = "No se pudo activar la camara.",
                    )
                }
                CallNotificationService.stop(context)
                videoCallStateHolder.setInVideoCall(false)
                callStarted = false
            }.onSuccess {
                videoCallStateHolder.setInVideoCall(true)
                CallNotificationService.start(context)
                if (previewOnlyMode) {
                    _uiState.update {
                        it.copy(
                            connectionState = ConnectionState.DISCONNECTED,
                            isPreviewOnlyMode = true,
                            isWaitingRoom = false,
                            sessionStatusMessage = "Vista previa local activa. Podes probar tu camara aunque no haya nadie conectado.",
                        )
                    }
                } else {
                    attemptSessionConnection(manualRetry = false)
                }
            }
        }
    }

    fun endCall() {
        callStarted = false
        timerJob?.cancel()
        sessionRetryJob?.cancel()
        engine.disconnect()
        restoreAudio()
        CallNotificationService.stop(context)
        videoCallStateHolder.setInVideoCall(false)
    }

    fun retryConnection() {
        if (!callStarted || previewOnlyMode) return
        sessionRetryJob?.cancel()
        viewModelScope.launch {
            attemptSessionConnection(manualRetry = true)
        }
    }

    fun toggleVideo() {
        engine.toggleVideo()
    }

    fun toggleAudio() {
        engine.toggleAudio()
    }

    fun toggleSpeaker() {
        val newState = !_uiState.value.isSpeakerOn
        setSpeakerEnabled(newState)
        _uiState.update { it.copy(isSpeakerOn = newState) }
    }

    @Suppress("DEPRECATION")
    private fun setSpeakerEnabled(enabled: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (enabled) {
                val speaker = audioManager.availableCommunicationDevices
                    .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                if (speaker != null) audioManager.setCommunicationDevice(speaker)
            } else {
                audioManager.clearCommunicationDevice()
            }
        } else {
            audioManager.isSpeakerphoneOn = enabled
        }
    }

    fun toggleChat() {
        _uiState.update { it.copy(isChatOpen = !it.isChatOpen) }
    }

    fun sendMessage(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return

        if (engine.sendChatMessage(trimmed)) {
            val msg = ChatMessage(
                id = "local-${System.currentTimeMillis()}",
                text = trimmed,
                senderId = callUserId,
                senderType = callUserType,
                senderName = callUserName,
                timestamp = System.currentTimeMillis(),
            )
            _uiState.update { state ->
                state.copy(chatMessages = state.chatMessages + msg)
            }
        } else {
            val systemMessage = ChatMessage(
                id = "system-${System.currentTimeMillis()}",
                text = "No se pudo enviar. Verifica la conexion del chat.",
                senderId = "system",
                senderType = "system",
                senderName = "Sistema",
                timestamp = System.currentTimeMillis(),
            )
            _uiState.update { state ->
                state.copy(chatMessages = state.chatMessages + systemMessage)
            }
        }
    }

    fun toggleControlsVisibility() {
        _uiState.update { it.copy(showControls = !it.showControls) }
    }

    private fun setupAudioForCall() {
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        setSpeakerEnabled(true)
    }

    private fun restoreAudio() {
        audioManager.mode = AudioManager.MODE_NORMAL
        setSpeakerEnabled(false)
    }

    private fun observeEngine() {
        if (engineObserversBound) return
        engineObserversBound = true

        viewModelScope.launch {
            engine.connectionState.collect { state ->
                _uiState.update { current ->
                    current.copy(
                        connectionState = state,
                        isWaitingRoom = when (state) {
                            ConnectionState.CONNECTING,
                            ConnectionState.CONNECTED,
                            ConnectionState.RECONNECTING -> false
                            else -> current.isWaitingRoom
                        },
                        sessionStatusMessage = when (state) {
                            ConnectionState.CONNECTING -> "Conectando con la sala..."
                            ConnectionState.CONNECTED -> null
                            ConnectionState.RECONNECTING -> "Recuperando la conexion..."
                            else -> current.sessionStatusMessage
                        },
                    )
                }
                if (state == ConnectionState.CONNECTED && callStartTimeMs == 0L) {
                    sessionRetryJob?.cancel()
                    callStartTimeMs = System.currentTimeMillis()
                    startTimer()
                }
            }
        }

        viewModelScope.launch {
            engine.isVideoEnabled.collect { enabled ->
                _uiState.update { it.copy(isVideoEnabled = enabled) }
            }
        }

        viewModelScope.launch {
            engine.isAudioEnabled.collect { enabled ->
                _uiState.update { it.copy(isAudioEnabled = enabled) }
            }
        }

        viewModelScope.launch {
            engine.chatReady.collect { ready ->
                _uiState.update { it.copy(chatReady = ready) }
            }
        }

        viewModelScope.launch {
            engine.chatMessages.collect { msg ->
                _uiState.update { state ->
                    state.copy(chatMessages = state.chatMessages + msg)
                }
            }
        }

        viewModelScope.launch {
            engine.qualitySummary.collect { summary ->
                _uiState.update { it.copy(qualitySummary = summary) }
            }
        }

        viewModelScope.launch {
            engine.remoteVideoTrack.collect { track ->
                _uiState.update { it.copy(hasRemoteVideo = track != null) }
            }
        }
    }

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (true) {
                val elapsed = (System.currentTimeMillis() - callStartTimeMs) / 1000
                _uiState.update { it.copy(callDurationSeconds = elapsed) }
                kotlinx.coroutines.delay(1000)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        callStarted = false
        timerJob?.cancel()
        sessionRetryJob?.cancel()
        engine.disconnect()
        restoreAudio()
        CallNotificationService.stop(context)
        videoCallStateHolder.setInVideoCall(false)
    }

    private suspend fun attemptSessionConnection(manualRetry: Boolean) {
        if (!callStarted) return

        _uiState.update { current ->
            current.copy(
                connectionState = ConnectionState.CONNECTING,
                isPreviewOnlyMode = false,
                isWaitingRoom = false,
                sessionStatusMessage = if (manualRetry) {
                    "Intentando conectar con la sala..."
                } else {
                    current.sessionStatusMessage
                },
            )
        }

        telemedicineRepository.getSession(appointmentId)
            .onSuccess { sessionInfo ->
                sessionRetryJob?.cancel()

                val dynamicIce = sessionInfo.iceServers.map { it.toPeerConnectionIceServer() }
                if (dynamicIce.isNotEmpty()) {
                    engine.initialize(
                        engine.config.copy(
                            iceServers = dynamicIce
                        )
                    )
                }

                _uiState.update {
                    it.copy(
                        connectionState = ConnectionState.CONNECTING,
                        isPreviewOnlyMode = false,
                        isWaitingRoom = false,
                        sessionStatusMessage = "Conectando con la sala...",
                    )
                }
                engine.connect(sessionInfo.roomId, sessionInfo.signalingUrl)
            }
            .onFailure { error ->
                val logContext = if (manualRetry) {
                    "Failed resolving telemedicine session after manual retry"
                } else {
                    "Telemedicine session unavailable, keeping local preview active"
                }
                SecureLog.warn(logContext, error)
                enterWaitingRoom(error)
            }
    }

    private fun enterWaitingRoom(error: Throwable) {
        _uiState.update {
            it.copy(
                connectionState = ConnectionState.DISCONNECTED,
                isPreviewOnlyMode = false,
                isWaitingRoom = true,
                sessionStatusMessage = waitingRoomMessage(error.message),
            )
        }
        scheduleSessionRetry()
    }

    private fun scheduleSessionRetry() {
        if (sessionRetryJob?.isActive == true) return

        sessionRetryJob = viewModelScope.launch {
            while (callStarted) {
                kotlinx.coroutines.delay(8_000)
                if (!_uiState.value.isWaitingRoom) break
                attemptSessionConnection(manualRetry = false)
            }
        }
    }

    private fun waitingRoomMessage(raw: String?): String {
        val normalized = raw?.lowercase().orEmpty()
        return when {
            "network" in normalized || "timeout" in normalized ->
                "Tu camara ya esta activa. La sala todavia no responde; vamos a reintentar automaticamente."
            "no telemedicine call found" in normalized || "no telemedicine" in normalized ->
                "Tu camara ya esta activa. Todavia no hay otra persona conectada en la sala."
            else ->
                "Tu camara ya esta activa. Estamos esperando que la sala quede disponible."
        }
    }

    private fun IceServerInfo.toPeerConnectionIceServer(): PeerConnection.IceServer {
        val builder = PeerConnection.IceServer.builder(urls)
        if (username != null) builder.setUsername(username)
        if (credential != null) builder.setPassword(credential)
        return builder.createIceServer()
    }
}
