package com.autamedica.android.presentation.videocall.livekit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.VideoCallStateHolder
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import io.livekit.android.annotations.Beta
import io.livekit.android.compose.local.RoomScope
import io.livekit.android.compose.state.rememberConnectionState
import io.livekit.android.compose.state.rememberLocalMedia
import io.livekit.android.compose.state.rememberTracks
import io.livekit.android.compose.ui.VideoTrackView
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.participant.ConnectionQuality
import io.livekit.android.room.participant.LocalParticipant
import io.livekit.android.room.track.Track
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LiveKitVideoCallUiState(
    val isLoading: Boolean = true,
    val wsUrl: String? = null,
    val token: String? = null,
    val error: String? = null,
)

@HiltViewModel
class LiveKitVideoCallViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val telemedicineRepository: TelemedicineRepository,
    private val videoCallStateHolder: VideoCallStateHolder,
) : ViewModel() {
    private val sessionId: String = savedStateHandle["appointmentId"] ?: ""

    private val _uiState = MutableStateFlow(LiveKitVideoCallUiState())
    val uiState: StateFlow<LiveKitVideoCallUiState> = _uiState.asStateFlow()

    private var initialized = false

    fun initialize() {
        if (initialized) return
        initialized = true

        viewModelScope.launch {
            telemedicineRepository.getLiveKitCredentials(sessionId)
                .onSuccess { credentials ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            wsUrl = credentials.wsUrl,
                            token = credentials.token,
                            error = null,
                        )
                    }
                }
                .onFailure { error ->
                    SecureLog.error("LiveKit credentials initialization failed", error)
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = error.message ?: "No se pudo iniciar la sala LiveKit",
                        )
                    }
                }
        }
    }

    fun retry() {
        initialized = false
        _uiState.value = LiveKitVideoCallUiState()
        initialize()
    }

    fun setInCall(active: Boolean) {
        videoCallStateHolder.setInVideoCall(active)
    }

    override fun onCleared() {
        super.onCleared()
        videoCallStateHolder.setInVideoCall(false)
    }
}

@Composable
fun LiveKitVideoCallScreen(
    onCallEnd: () -> Unit,
    onFallbackToLegacy: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: LiveKitVideoCallViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val liveKitToken = uiState.token
    val liveKitWsUrl = uiState.wsUrl
    val roomOptions = remember { LiveKitCallProfile.roomOptions }
    val connectOptions = remember { LiveKitCallProfile.connectOptions }
    var startupError by rememberSaveable(liveKitToken, liveKitWsUrl) { mutableStateOf<String?>(null) }
    var fallbackRequested by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.initialize()
    }

    LaunchedEffect(uiState.error, startupError) {
        val errorMessage = uiState.error ?: startupError
        if (!fallbackRequested && shouldFallbackToLegacy(errorMessage)) {
            fallbackRequested = true
            SecureLog.warn(
                "LiveKit bootstrap unavailable, falling back to legacy video runtime",
                IllegalStateException(errorMessage ?: "Unknown LiveKit bootstrap error"),
            )
            onFallbackToLegacy()
        }
    }

    when {
        fallbackRequested -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .background(Color.Black)
                    .safeDrawingPadding(),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(horizontal = 24.dp),
                ) {
                    CircularProgressIndicator()
                    Text(
                        text = "Recuperando la videollamada...",
                        color = Color.White,
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
        }

        uiState.isLoading -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .background(Color.Black)
                    .safeDrawingPadding(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }

        uiState.error != null || startupError != null -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .background(Color.Black)
                    .safeDrawingPadding(),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(horizontal = 24.dp),
                ) {
                    Text(
                        text = startupError ?: uiState.error ?: "Error iniciando LiveKit",
                        color = Color.White,
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Button(onClick = viewModel::retry) {
                        Text(stringResource(com.autamedica.android.R.string.common_retry))
                    }
                    Button(onClick = onFallbackToLegacy) {
                        Text(stringResource(com.autamedica.android.R.string.videocall_use_current_mode))
                    }
                    Button(onClick = onCallEnd) {
                        Text(stringResource(com.autamedica.android.R.string.common_back))
                    }
                }
            }
        }

        liveKitToken != null && liveKitWsUrl != null -> {
            RoomScope(
                url = liveKitWsUrl,
                token = liveKitToken,
                audio = true,
                video = true,
                connect = false,
                roomOptions = roomOptions,
                connectOptions = connectOptions,
                onError = { room, error ->
                    if (room.state == Room.State.CONNECTING || room.state == Room.State.DISCONNECTED) {
                        startupError = error?.message ?: "No se pudo iniciar la sala LiveKit"
                    }
                    if (error != null) {
                        SecureLog.error("LiveKit room error", error)
                    } else {
                        SecureLog.debug("LiveKit room error without throwable")
                    }
                },
            ) { room ->
                LaunchedEffect(room, liveKitWsUrl, liveKitToken) {
                    startupError = null
                    runCatching {
                        room.prepareConnection(liveKitWsUrl, liveKitToken)
                        room.connect(
                            url = liveKitWsUrl,
                            token = liveKitToken,
                            options = connectOptions,
                        )
                    }.onFailure { error ->
                        startupError = error.message ?: "No se pudo conectar a la sala LiveKit"
                        SecureLog.error("LiveKit prewarm/connect failed", error)
                    }
                }

                LiveKitRoomContent(
                    room = room,
                    onCallEnd = onCallEnd,
                    onFallbackToLegacy = onFallbackToLegacy,
                    viewModel = viewModel,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

@OptIn(Beta::class)
@Composable
private fun LiveKitRoomContent(
    room: Room,
    onCallEnd: () -> Unit,
    onFallbackToLegacy: () -> Unit,
    viewModel: LiveKitVideoCallViewModel,
    modifier: Modifier = Modifier,
) {
    val connectionState by rememberConnectionState(room)
    val cameraTracks by rememberTracks(listOf(Track.Source.CAMERA))
    val localMedia = rememberLocalMedia(room)
    val coroutineScope = rememberCoroutineScope()
    var localConnectionQuality by remember { mutableStateOf(ConnectionQuality.UNKNOWN) }

    LaunchedEffect(connectionState) {
        viewModel.setInCall(connectionState != Room.State.DISCONNECTED)
    }

    LaunchedEffect(room) {
        room.events.collect { event: RoomEvent ->
            if (event is RoomEvent.ConnectionQualityChanged && event.participant is LocalParticipant) {
                localConnectionQuality = event.quality
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            room.disconnect()
            viewModel.setInCall(false)
        }
    }

    val localTrack = cameraTracks.firstOrNull { it.participant is LocalParticipant }
    val remoteTrack = cameraTracks.firstOrNull { it.participant !is LocalParticipant }
    val qualityLabel = connectionQualityLabel(localConnectionQuality)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        if (remoteTrack != null) {
            VideoTrackView(
                trackReference = remoteTrack,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                val statusText = when (connectionState) {
                    Room.State.CONNECTING -> "Conectando..."
                    Room.State.RECONNECTING -> "Reconectando..."
                    Room.State.CONNECTED -> "Esperando al otro participante..."
                    Room.State.DISCONNECTED -> "Sala desconectada"
                }
                Text(
                    text = statusText,
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }

        if (localTrack != null && localMedia.isCameraEnabled) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding()
                    .padding(top = 12.dp, end = 12.dp)
                    .size(width = 120.dp, height = 170.dp),
            ) {
                VideoTrackView(
                    trackReference = localTrack,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        if (qualityLabel != null) {
            Text(
                text = qualityLabel,
                color = Color.White,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .statusBarsPadding()
                    .padding(top = 12.dp, start = 12.dp)
                    .background(Color.Black.copy(alpha = 0.55f), shape = MaterialTheme.shapes.small)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(
                onClick = {
                    coroutineScope.launch {
                        localMedia.setMicrophoneEnabled(!localMedia.isMicrophoneEnabled)
                    }
                },
                modifier = Modifier.weight(1f),
            ) {
                Text(if (localMedia.isMicrophoneEnabled) "Mute" else "Unmute")
            }

            Button(
                onClick = {
                    coroutineScope.launch {
                        localMedia.setCameraEnabled(!localMedia.isCameraEnabled)
                    }
                },
                modifier = Modifier.weight(1f),
            ) {
                Text(if (localMedia.isCameraEnabled) "Cam Off" else "Cam On")
            }

            Button(
                onClick = {
                    room.disconnect()
                    viewModel.setInCall(false)
                    onCallEnd()
                },
                modifier = Modifier.weight(1f),
            ) {
                Text(stringResource(com.autamedica.android.R.string.videocall_hang_up))
            }
        }

        if (connectionState == Room.State.DISCONNECTED) {
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "LiveKit desconectado",
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge,
                )
                Button(onClick = onFallbackToLegacy) {
                    Text(stringResource(com.autamedica.android.R.string.videocall_use_current_mode))
                }
            }
        }
    }
}

private fun connectionQualityLabel(quality: ConnectionQuality): String? {
    return when (quality) {
        ConnectionQuality.POOR -> "Conexion inestable"
        ConnectionQuality.LOST -> "Recuperando conexion"
        else -> null
    }
}

private fun shouldFallbackToLegacy(error: String?): Boolean {
    val normalized = error?.trim()?.lowercase().orEmpty()
    if (normalized.isEmpty()) return false

    return "consultation not found" in normalized ||
        ("livekit token function failed" in normalized && "404" in normalized)
}
