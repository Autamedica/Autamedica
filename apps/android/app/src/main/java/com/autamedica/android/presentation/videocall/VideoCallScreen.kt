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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import com.autamedica.android.presentation.videocall.livekit.LiveKitVideoCallScreen
import com.autamedica.android.presentation.videocall.components.CallControls
import com.autamedica.android.presentation.videocall.components.CallTimer
import com.autamedica.android.presentation.videocall.components.ChatPanel
import com.autamedica.android.presentation.videocall.components.ManagedVideoRenderer
import com.autamedica.android.presentation.videocall.components.QualityIndicator

@Composable
fun VideoCallScreen(
    appointmentId: String,
    userId: String,
    userType: String,
    userName: String,
    onCallEnd: () -> Unit,
    isInPipMode: Boolean = false,
    modifier: Modifier = Modifier,
    viewModel: VideoCallViewModel = hiltViewModel(),
) {
    var useLiveKitRuntime by rememberSaveable { mutableStateOf(BuildConfig.USE_LIVEKIT) }
    val context = LocalContext.current
    var hasMediaPermissions by remember { mutableStateOf(context.hasTelemedicineMediaPermissions()) }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        hasMediaPermissions = context.hasTelemedicineMediaPermissions()
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
                modifier = Modifier.padding(horizontal = 24.dp),
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
                    Text("Conceder permisos")
                }
                Button(onClick = onCallEnd) {
                    Text("Volver")
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
        // Remote video (full screen)
        if (remoteTrack != null) {
            ManagedVideoRenderer(
                videoTrack = remoteTrack,
                eglContext = viewModel.eglContext,
                modifier = Modifier.fillMaxSize(),
                mirror = false,
            )
        } else {
            // Placeholder when no remote video
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
                                text = "Conectando...",
                                color = Color.White,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                        }
                        ConnectionState.CONNECTED -> {
                            Text(
                                text = "Esperando al otro participante...",
                                color = Color.White,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                        }
                        ConnectionState.FAILED -> {
                            Text(
                                text = "Error de conexion",
                                color = Color.Red,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                        }
                        else -> {}
                    }
                }
            }
        }

        // In PiP mode, hide all overlays
        if (isInPipMode) return@Box

        // Local video (picture-in-picture, top-right)
        if (localTrack != null && uiState.isVideoEnabled) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 80.dp, end = 16.dp)
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
                    .padding(top = 48.dp, start = 16.dp, end = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CallTimer(durationSeconds = uiState.callDurationSeconds)
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
                .padding(bottom = 80.dp),
        ) {
            ChatPanel(
                messages = uiState.chatMessages,
                currentUserId = viewModel.userId,
                chatReady = uiState.chatReady,
                onSendMessage = viewModel::sendMessage,
            )
        }

        // Bottom controls
        AnimatedVisibility(
            visible = uiState.showControls,
            enter = fadeIn() + slideInVertically { it },
            exit = fadeOut() + slideOutVertically { it },
            modifier = Modifier.align(Alignment.BottomCenter),
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
