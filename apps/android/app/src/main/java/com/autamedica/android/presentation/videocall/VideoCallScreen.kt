package com.autamedica.android.presentation.videocall

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.core.content.ContextCompat
import com.autamedica.android.BuildConfig
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.presentation.videocall.livekit.LiveKitVideoCallScreen
import com.autamedica.android.presentation.videocall.components.CallControls
import com.autamedica.android.presentation.videocall.components.CallTimer
import com.autamedica.android.presentation.videocall.components.ChatPanel
import com.autamedica.android.presentation.videocall.components.ManagedVideoRenderer
import com.autamedica.android.presentation.videocall.components.QualityIndicator

@Composable
fun VideoCallScreen(
    appointmentId: String,
    onCallEnd: () -> Unit,
    isInPipMode: Boolean = false,
    modifier: Modifier = Modifier,
    viewModel: VideoCallViewModel = hiltViewModel(),
) {
    val isPreviewRoute = appointmentId == VIDEO_PREVIEW_APPOINTMENT_ID
    var useLiveKitRuntime by rememberSaveable(appointmentId) {
        mutableStateOf(BuildConfig.USE_LIVEKIT && !isPreviewRoute)
    }
    val context = LocalContext.current
    var hasMediaPermissions by remember { mutableStateOf(context.hasTelemedicineMediaPermissions()) }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        hasMediaPermissions = context.hasTelemedicineMediaPermissions()
    }

    LaunchedEffect(isPreviewRoute) {
        if (isPreviewRoute && useLiveKitRuntime) {
            useLiveKitRuntime = false
        }
    }

    LaunchedEffect(Unit) {
        if (!hasMediaPermissions) {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO,
                ),
            )
        }
    }

    if (!hasMediaPermissions) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier
                    .safeDrawingPadding()
                    .padding(horizontal = 24.dp),
            ) {
                Text(
                    text = "Se requieren permisos de camara y microfono para iniciar la videollamada.",
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                )
                Button(
                    onClick = {
                        permissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.CAMERA,
                                Manifest.permission.RECORD_AUDIO,
                            ),
                        )
                    },
                ) {
                    Text(stringResource(com.autamedica.android.R.string.permissions_grant))
                }
                Button(onClick = onCallEnd) {
                    Text(stringResource(com.autamedica.android.R.string.common_back))
                }
            }
        }
        return
    }

    if (useLiveKitRuntime) {
        LiveKitVideoCallScreen(
            onCallEnd = onCallEnd,
            onFallbackToLegacy = { useLiveKitRuntime = false },
            modifier = modifier,
        )
        return
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val localTrack by viewModel.localVideoTrack.collectAsStateWithLifecycle()
    val remoteTrack by viewModel.remoteVideoTrack.collectAsStateWithLifecycle()

    DisposableEffect(hasMediaPermissions) {
        viewModel.startCall()
        onDispose { viewModel.endCall() }
    }

    // Handle call end
    if (uiState.connectionState == ConnectionState.DISCONNECTED && uiState.callDurationSeconds > 0) {
        onCallEnd()
        return
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                indication = null,
                interactionSource = remember { MutableInteractionSource() },
            ) { if (!isInPipMode) viewModel.toggleControlsVisibility() },
    ) {
        val showLocalPreviewFullscreen = remoteTrack == null && localTrack != null && uiState.isVideoEnabled

        if (remoteTrack != null) {
            ManagedVideoRenderer(
                videoTrack = remoteTrack,
                eglContext = viewModel.eglContext,
                modifier = Modifier.fillMaxSize(),
                mirror = false,
            )
        } else if (showLocalPreviewFullscreen) {
            ManagedVideoRenderer(
                videoTrack = localTrack,
                eglContext = viewModel.eglContext,
                modifier = Modifier.fillMaxSize(),
                mirror = true,
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF1A1A2E)),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    when (uiState.connectionState) {
                        ConnectionState.CONNECTING -> {
                            CircularProgressIndicator(
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(48.dp),
                            )
                            Text(
                                text = uiState.sessionStatusMessage ?: "Conectando...",
                                color = Color.White,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                        }
                        ConnectionState.RECONNECTING -> {
                            CircularProgressIndicator(
                                color = Color(0xFFFFA726),
                                modifier = Modifier.size(48.dp),
                            )
                            Text(
                                text = uiState.sessionStatusMessage ?: "Reconectando...",
                                color = Color(0xFFFFA726),
                                style = MaterialTheme.typography.bodyLarge,
                            )
                        }
                        ConnectionState.FAILED -> {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Text(
                                    text = uiState.sessionStatusMessage ?: "Error de conexion",
                                    color = Color.Red,
                                    style = MaterialTheme.typography.bodyLarge,
                                    textAlign = TextAlign.Center,
                                )
                                Button(onClick = viewModel::retryConnection) {
                                    Text(stringResource(com.autamedica.android.R.string.common_retry_connection))
                                }
                            }
                        }
                        else -> {
                            Text(
                                text = uiState.sessionStatusMessage ?: "Esperando al otro participante...",
                                color = Color.White,
                                style = MaterialTheme.typography.bodyLarge,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }
        }

        if (remoteTrack == null) {
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .safeDrawingPadding()
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                val overlayText = when {
                    uiState.isPreviewOnlyMode ->
                        uiState.sessionStatusMessage ?: "Vista previa local activa."
                    uiState.isWaitingRoom ->
                        uiState.sessionStatusMessage ?: "Tu camara ya esta activa. Esperando que la sala este disponible."
                    uiState.connectionState == ConnectionState.CONNECTING ->
                        uiState.sessionStatusMessage ?: "Conectando con la sala..."
                    uiState.connectionState == ConnectionState.RECONNECTING ->
                        uiState.sessionStatusMessage ?: "Recuperando la conexion..."
                    uiState.connectionState == ConnectionState.FAILED ->
                        uiState.sessionStatusMessage ?: "No se pudo conectar la llamada."
                    showLocalPreviewFullscreen ->
                        "Tu camara esta encendida. Falta que se conecte la otra persona."
                    else -> null
                }

                if (overlayText != null) {
                    Text(
                        text = overlayText,
                        color = Color.White,
                        style = MaterialTheme.typography.bodyLarge,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color.Black.copy(alpha = 0.55f))
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                    )
                }

                if (uiState.isWaitingRoom || uiState.connectionState == ConnectionState.FAILED) {
                    Button(onClick = viewModel::retryConnection) {
                        Text(stringResource(com.autamedica.android.R.string.common_try_connect))
                    }
                }
            }
        }

        // In PiP mode, hide all overlays
        if (isInPipMode) return@Box

        // Local video (picture-in-picture, top-right)
        if (!showLocalPreviewFullscreen && localTrack != null && uiState.isVideoEnabled) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding()
                    .padding(top = 16.dp, end = 16.dp)
                    .size(width = 120.dp, height = 160.dp)
                    .clip(RoundedCornerShape(12.dp)),
            ) {
                ManagedVideoRenderer(
                    videoTrack = localTrack,
                    eglContext = viewModel.eglContext,
                    modifier = Modifier.fillMaxSize(),
                    mirror = true,
                )
            }
        }

        // Top bar: timer + quality
        AnimatedVisibility(
            visible = uiState.showControls,
            enter = fadeIn() + slideInVertically(),
            exit = fadeOut() + slideOutVertically(),
            modifier = Modifier.align(Alignment.TopStart),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(top = 12.dp, start = 16.dp, end = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (uiState.callDurationSeconds > 0) {
                    CallTimer(durationSeconds = uiState.callDurationSeconds)
                } else {
                    Box(modifier = Modifier)
                }
                QualityIndicator(level = uiState.qualitySummary.overallLevel)
            }
        }

        // Chat panel (slide from bottom)
        AnimatedVisibility(
            visible = uiState.isChatOpen,
            enter = fadeIn() + slideInVertically { it },
            exit = fadeOut() + slideOutVertically { it },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .fillMaxWidth()
                .fillMaxHeight(0.45f)
                .navigationBarsPadding()
                .padding(bottom = 80.dp),
        ) {
            ChatPanel(
                messages = uiState.chatMessages,
                currentUserId = viewModel.currentUserId,
                chatReady = uiState.chatReady,
                onSendMessage = viewModel::sendMessage,
            )
        }

        // Bottom controls
        AnimatedVisibility(
            visible = uiState.showControls,
            enter = fadeIn() + slideInVertically { it },
            exit = fadeOut() + slideOutVertically { it },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding(),
        ) {
            CallControls(
                isAudioEnabled = uiState.isAudioEnabled,
                isVideoEnabled = uiState.isVideoEnabled,
                isSpeakerOn = uiState.isSpeakerOn,
                isChatOpen = uiState.isChatOpen,
                onToggleAudio = viewModel::toggleAudio,
                onToggleVideo = viewModel::toggleVideo,
                onToggleSpeaker = viewModel::toggleSpeaker,
                onToggleChat = viewModel::toggleChat,
                onEndCall = {
                    viewModel.endCall()
                    onCallEnd()
                },
            )
        }
    }
}

private fun Context.hasTelemedicineMediaPermissions(): Boolean {
    val cameraGranted = ContextCompat.checkSelfPermission(
        this,
        Manifest.permission.CAMERA,
    ) == PackageManager.PERMISSION_GRANTED
    val audioGranted = ContextCompat.checkSelfPermission(
        this,
        Manifest.permission.RECORD_AUDIO,
    ) == PackageManager.PERMISSION_GRANTED

    return cameraGranted && audioGranted
}
