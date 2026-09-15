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
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.presentation.videocall.components.CallActionsOverflowSheet
import com.autamedica.android.presentation.videocall.components.CallControlsBar
import com.autamedica.android.presentation.videocall.components.CallTopBar
import com.autamedica.android.presentation.videocall.components.ChatPanel
import com.autamedica.android.presentation.videocall.components.ClinicalFichaSheet
import com.autamedica.android.presentation.videocall.components.ClinicalNotesSheet
import com.autamedica.android.presentation.videocall.components.DoctorClinicalGuidePanel
import com.autamedica.android.presentation.videocall.components.ManagedVideoRenderer
import com.autamedica.android.presentation.videocall.components.PatientWaitingRoomOverlay
import com.autamedica.android.presentation.videocall.components.RemoteAvatarFallback
import com.autamedica.android.presentation.videocall.components.SoapEvolutionSheet

@Composable
fun VideoCallScreen(
    appointmentId: String,
    onCallEnd: () -> Unit,
    isInPipMode: Boolean = false,
    roomId: String = "",
    isIncomingCall: Boolean = false,
    onNavigateToCreatePrescription: ((patientId: String) -> Unit)? = null,
    onNavigateToCreateCertificate: ((patientId: String) -> Unit)? = null,
    modifier: Modifier = Modifier,
    viewModel: VideoCallViewModel = hiltViewModel(),
) {
    val isPreviewRoute = appointmentId == VIDEO_PREVIEW_APPOINTMENT_ID
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
                modifier = Modifier
                    .safeDrawingPadding()
                    .padding(horizontal = 24.dp),
            ) {
                Text(
                    text = "Se requieren permisos de cámara y micrófono para iniciar la videollamada.",
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

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val localTrack by viewModel.localVideoTrack.collectAsStateWithLifecycle()
    val remoteTrack by viewModel.remoteVideoTrack.collectAsStateWithLifecycle()

    DisposableEffect(hasMediaPermissions) {
        viewModel.startCall(roomId = roomId, isIncomingCall = isIncomingCall)
        onDispose { viewModel.endCall() }
    }

    // Handle call end
    if (uiState.connectionState == ConnectionState.DISCONNECTED && uiState.callDurationSeconds > 0) {
        if (uiState.isDoctor && !uiState.soapSaved && !isPreviewRoute) {
            LaunchedEffect(Unit) {
                viewModel.openSoapEvolution()
            }
        } else if (!uiState.showSoapEvolution) {
            onCallEnd()
            return
        }
    }

    // Determine waiting room vs active call:
    // - isPreviewRoute (chequeo de cámara) siempre muestra la Sala de Espera.
    // - Paciente con flujo manual: la Sala de Espera cede paso al estado de llamada cuando se
    //   alcanza CONNECTED (médico en sala) o llega el video remoto.
    // - Paciente con llamada entrante aceptada (isIncomingCall): entra directo a la llamada
    //   activa, saltando la Sala de Espera / preconsulta.
    val isCallActive = remoteTrack != null || uiState.connectionState == ConnectionState.CONNECTED
    val isWaitingRoomActive = isPreviewRoute || (
        !uiState.isDoctor && !isIncomingCall && uiState.isWaitingRoom && !isCallActive
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A))
            .clickable(
                indication = null,
                interactionSource = remember { MutableInteractionSource() },
            ) {
                if (!isInPipMode && !isWaitingRoomActive) {
                    viewModel.toggleControlsVisibility()
                }
            },
    ) {
        if (isWaitingRoomActive) {
            // ── PHASE 1: GREEN ROOM / WAITING ROOM (Identical to Web PatientWaitingRoom) ──
            // Local Camera Preview in Background
            if (localTrack != null && uiState.isVideoEnabled) {
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
                        .background(Color(0xFF0F172A)),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = Color(0xFF1E293B),
                            border = BorderStroke(1.dp, Color(0x26FFFFFF)),
                            modifier = Modifier.size(64.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Filled.Person,
                                    contentDescription = null,
                                    tint = Color(0xFF94A3B8),
                                    modifier = Modifier.size(32.dp),
                                )
                            }
                        }
                        Text(
                            text = "Cámara apagada",
                            color = Color(0xFF94A3B8),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }

            // Waiting Room Overlay (HUD, Reticle, Horizon, Lighting check, Tuner, CTA)
            PatientWaitingRoomOverlay(
                isAudioEnabled = uiState.isAudioEnabled,
                isVideoEnabled = uiState.isVideoEnabled,
                statusMessage = uiState.sessionStatusMessage ?: "Esperando al médico...",
                isConnecting = uiState.connectionState == ConnectionState.CONNECTING,
                onToggleAudio = viewModel::toggleAudio,
                onToggleVideo = viewModel::toggleVideo,
                onSwitchCamera = viewModel::switchCamera,
                onJoinOrRetry = viewModel::joinConsultation,
                onCancelCall = viewModel::cancelCallRequest,
                onExit = {
                    viewModel.endCall()
                    onCallEnd()
                },
                doctorName = uiState.doctorName,
                doctorRole = uiState.doctorRole,
                doctorCrm = uiState.doctorCrm,
                clinicName = uiState.clinicName,
                preconsultationReason = uiState.preconsultationReason,
                preconsultationSymptoms = uiState.preconsultationSymptoms,
                preconsultationEvolution = uiState.preconsultationEvolution,
                isPreconsultationSaved = uiState.isPreconsultationSaved,
                onReasonSelected = viewModel::updatePreconsultationReason,
                onSymptomsChanged = viewModel::updatePreconsultationSymptoms,
                onEvolutionSelected = viewModel::updatePreconsultationEvolution,
                onSavePreconsultation = viewModel::savePreconsultation,
            )
        } else {
            // ── PHASE 2: ACTIVE CALL LAYOUT (Identical to Web ActiveCallLayout) ──
            // Main Viewport: Remote Video OR RemoteAvatarFallback
            if (remoteTrack != null) {
                ManagedVideoRenderer(
                    videoTrack = remoteTrack,
                    eglContext = viewModel.eglContext,
                    modifier = Modifier.fillMaxSize(),
                    mirror = false,
                )
            } else {
                val remoteDisplayName = when {
                    uiState.isDoctor -> uiState.patientName.ifBlank { "Paciente" }
                    else -> uiState.doctorName
                }
                val subtitleText = when (uiState.connectionState) {
                    ConnectionState.CONNECTING -> if (uiState.isDoctor) "Llamando al paciente..." else "Llamando al médico..."
                    ConnectionState.RECONNECTING -> "Reconectando..."
                    ConnectionState.FAILED -> "Error de conexión con la sala"
                    else -> if (uiState.isDoctor) {
                        "Esperando que el paciente active su cámara..."
                    } else {
                        "Esperando que el profesional active su cámara..."
                    }
                }
                RemoteAvatarFallback(
                    name = remoteDisplayName,
                    subtitle = subtitleText,
                    isCameraOff = uiState.connectionState == ConnectionState.CONNECTED,
                    isReconnecting = uiState.connectionState == ConnectionState.RECONNECTING,
                    isConnecting = uiState.connectionState == ConnectionState.CONNECTING,
                )
            }

            // In PiP mode, hide controls & PiP container
            if (!isInPipMode) {
                val participantLabel = when {
                    uiState.isDoctor -> uiState.patientName.ifBlank { "Paciente" }
                    else -> uiState.doctorName.ifBlank { "Profesional" }
                }
                AnimatedVisibility(
                    visible = uiState.showControls,
                    enter = fadeIn() + slideInVertically(),
                    exit = fadeOut() + slideOutVertically(),
                    modifier = Modifier.align(Alignment.TopCenter),
                ) {
                    CallTopBar(
                        connectionState = uiState.connectionState,
                        qualityLevel = uiState.qualitySummary.overallLevel,
                        durationSeconds = uiState.callDurationSeconds,
                        participantLabel = participantLabel,
                        isWaitingRoom = isWaitingRoomActive,
                        safetyAlert = if (uiState.isDoctor) uiState.safetyAlertLabel else null,
                        clinicalFirst = uiState.isDoctor,
                    )
                }

                if (uiState.isAutoDegradedToAudio) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xD9B45309),
                        border = BorderStroke(1.dp, Color(0x66FCD34D)),
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .statusBarsPadding()
                            .padding(top = 100.dp, start = 16.dp, end = 16.dp),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = "Conexión débil: llamada en solo audio",
                                color = Color.White,
                                fontSize = 12.sp,
                                modifier = Modifier.weight(1f),
                            )
                            TextButton(
                                onClick = { viewModel.reactivateVideo() },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            ) {
                                Text("Reactivar video", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                }

                // Local PiP: doctor sube el padding para dejar espacio a la guía clínica.
                val pipBottomPadding = if (uiState.isDoctor) 320.dp else 96.dp
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .navigationBarsPadding()
                        .padding(bottom = pipBottomPadding, end = 16.dp)
                        .size(width = 110.dp, height = 154.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color(0xFF1E293B)),
                ) {
                    if (localTrack != null && uiState.isVideoEnabled) {
                        ManagedVideoRenderer(
                            videoTrack = localTrack,
                            eglContext = viewModel.eglContext,
                            modifier = Modifier.fillMaxSize(),
                            mirror = true,
                        )
                    } else {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Person,
                                contentDescription = null,
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(36.dp),
                            )
                        }
                    }

                    // Border overlay
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = Color.Transparent,
                        border = BorderStroke(1.5.dp, Color(0x33FFFFFF)),
                        modifier = Modifier.fillMaxSize(),
                    ) {}

                    // Bottom-left "TÚ" Pill
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color.Black.copy(alpha = 0.65f),
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(6.dp),
                    ) {
                        Text(
                            text = "TÚ",
                            color = Color.White,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        )
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

                // Doctor: guía clínica permanente (motivo + alertas + preguntas).
                // Mic/cam/timer viven en overflow / top bar reducida — fuera de 1ª vista.
                if (uiState.isDoctor) {
                    AnimatedVisibility(
                        visible = !uiState.isClinicalFichaOpen &&
                            !uiState.isClinicalNotesOpen &&
                            !uiState.isActionsOverflowOpen,
                        enter = fadeIn() + slideInVertically { it },
                        exit = fadeOut() + slideOutVertically { it },
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .navigationBarsPadding()
                            .padding(start = 16.dp, end = 16.dp, bottom = 84.dp),
                    ) {
                        DoctorClinicalGuidePanel(
                            guidance = uiState.clinicalGuidance,
                            onOpenFicha = viewModel::toggleClinicalFicha,
                        )
                    }
                }

                // Dock: doctor = ficha + medios(overflow) + colgar; paciente = media + chat
                AnimatedVisibility(
                    visible = uiState.showControls,
                    enter = fadeIn() + slideInVertically { it },
                    exit = fadeOut() + slideOutVertically { it },
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding(),
                ) {
                    CallControlsBar(
                        isAudioEnabled = uiState.isAudioEnabled,
                        isVideoEnabled = uiState.isVideoEnabled,
                        onToggleAudio = viewModel::toggleAudio,
                        onToggleVideo = viewModel::toggleVideo,
                        onEndCall = { viewModel.handleCallEnd(onCallEnd) },
                        isDoctor = uiState.isDoctor,
                        isFichaOpen = uiState.isClinicalFichaOpen,
                        hasSafetyAlerts = uiState.safetyAlertCount > 0,
                        onOpenFicha = if (uiState.isDoctor) viewModel::toggleClinicalFicha else null,
                        isOverflowOpen = uiState.isActionsOverflowOpen,
                        overflowBadgeCount = uiState.unreadChatMessages,
                        onOpenOverflow = if (uiState.isDoctor) viewModel::toggleActionsOverflow else null,
                        isSpeakerOn = uiState.isSpeakerOn,
                        isChatOpen = uiState.isChatOpen,
                        unreadMessages = uiState.unreadChatMessages,
                        onToggleSpeaker = if (!uiState.isDoctor) viewModel::toggleSpeaker else null,
                        onToggleChat = if (!uiState.isDoctor) viewModel::toggleChat else null,
                    )
                }

                // Clinical Notes Sheet (Doctor only)
                AnimatedVisibility(
                    visible = uiState.isClinicalNotesOpen,
                    enter = fadeIn() + slideInVertically { it },
                    exit = fadeOut() + slideOutVertically { it },
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding(),
                ) {
                    ClinicalNotesSheet(
                        notes = uiState.consultationNotes,
                        initialNotes = uiState.appointmentNotes,
                        isSaving = uiState.isSavingNotes,
                        isSaved = uiState.notesSaved,
                        onNotesChange = viewModel::updateConsultationNotes,
                        onSaveNotes = viewModel::saveConsultationNotes,
                        onClose = viewModel::toggleClinicalNotes,
                        onOpenFullSoap = if (!isPreviewRoute) {
                            {
                                viewModel.toggleClinicalNotes()
                                viewModel.openSoapEvolution()
                            }
                        } else null,
                    )
                }
            }
        }
    }

    if (uiState.isDoctor && uiState.isClinicalFichaOpen) {
        ClinicalFichaSheet(
            patientName = uiState.patientName,
            clinicalContext = uiState.patientClinicalContext,
            fallbackReason = uiState.chiefComplaintPeek,
            guidance = uiState.clinicalGuidance,
            hasPatient = uiState.patientId.isNotBlank(),
            isLoading = uiState.isLoadingClinicalContext,
            onDismiss = viewModel::closeClinicalFicha,
            onOpenNotes = viewModel::openClinicalNotesFromFicha,
            onEmitPrescription = if (uiState.patientId.isNotBlank() && onNavigateToCreatePrescription != null) {
                { onNavigateToCreatePrescription(uiState.patientId) }
            } else null,
            onEmitCertificate = if (uiState.patientId.isNotBlank() && onNavigateToCreateCertificate != null) {
                { onNavigateToCreateCertificate(uiState.patientId) }
            } else null,
        )
    }

    if (uiState.isDoctor && uiState.isActionsOverflowOpen) {
        CallActionsOverflowSheet(
            isAudioEnabled = uiState.isAudioEnabled,
            isVideoEnabled = uiState.isVideoEnabled,
            isSpeakerOn = uiState.isSpeakerOn,
            unreadMessages = uiState.unreadChatMessages,
            onToggleAudio = viewModel::toggleAudio,
            onToggleVideo = viewModel::toggleVideo,
            onToggleChat = viewModel::toggleChat,
            onToggleSpeaker = viewModel::toggleSpeaker,
            onSwitchCamera = viewModel::switchCamera,
            onDismiss = viewModel::closeActionsOverflow,
        )
    }

    if (uiState.showSoapEvolution) {
        SoapEvolutionSheet(
            soapData = uiState.soapData,
            isSaving = uiState.isSavingSoap,
            isSaved = uiState.soapSaved,
            errorMessage = uiState.soapError,
            onSoapDataChange = viewModel::updateSoapData,
            onSaveAndFinish = {
                viewModel.saveSoapEvolution(appointmentId) {
                    onCallEnd()
                }
            },
            onDismiss = {
                viewModel.dismissSoapEvolution()
                onCallEnd()
            },
        )
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
