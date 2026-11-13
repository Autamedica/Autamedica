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
import com.autamedica.android.R
import com.autamedica.android.presentation.common.findHostActivity
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.presentation.videocall.components.CallActionsOverflowSheet
import com.autamedica.android.presentation.videocall.components.CallControlsBar
import com.autamedica.android.presentation.videocall.components.CallTopBar
import com.autamedica.android.presentation.videocall.components.ChatPanel
import com.autamedica.android.presentation.videocall.components.ClinicalHudLayer
import com.autamedica.android.presentation.videocall.components.InCallClinicalBottomSheet
import com.autamedica.android.presentation.videocall.components.InCallClinicalMode
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
    val activity = context.findHostActivity()
    val currentView = androidx.compose.ui.platform.LocalView.current
    DisposableEffect(Unit) {
        currentView.keepScreenOn = true
        onDispose {
            currentView.keepScreenOn = false
        }
    }
    val onMinimizeCall: () -> Unit = {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O && activity != null) {
            val params = android.app.PictureInPictureParams.Builder()
                .setAspectRatio(android.util.Rational(9, 16))
                .build()
            runCatching { activity.enterPictureInPictureMode(params) }
        }
    }

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
                    text = stringResource(R.string.ui_video_permissions_required),
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
    var clinicalSheetMode by remember { mutableStateOf<InCallClinicalMode?>(null) }

    androidx.compose.runtime.LaunchedEffect(Unit) {
        com.autamedica.android.telemetry.CallTelemetry.recordMilestone(null, "T2_COMPOSE_MOUNTED")
    }

    DisposableEffect(hasMediaPermissions) {
        viewModel.startCall(roomId = roomId, isIncomingCall = isIncomingCall)
        onDispose { viewModel.endCall() }
    }

    // Determine waiting room vs active call:
    val isOnDemandRoom = roomId.startsWith("cf-room") || uiState.activeCallId?.startsWith("cf-room") == true
    val isCallActive = remoteTrack != null || uiState.connectionState == ConnectionState.CONNECTED
    val isWaitingRoomActive = !uiState.isDoctor && !isOnDemandRoom && (
        isPreviewRoute || (!isIncomingCall && uiState.isWaitingRoom && !isCallActive)
    )

    // Handle call end or abrupt failure after call was active
    val isCallEndedOrFailed = !uiState.isAuthorizationBlocked && (
        uiState.connectionState == ConnectionState.DISCONNECTED ||
            uiState.connectionState == ConnectionState.FAILED
    )

    val hadActiveSession = uiState.callDurationSeconds > 0 ||
        uiState.activeCallId != null ||
        uiState.sessionStatusMessage?.contains("finaliz", ignoreCase = true) == true

    if (isCallEndedOrFailed && hadActiveSession) {
        if (uiState.isDoctor && !uiState.soapSaved && !isPreviewRoute) {
            LaunchedEffect(Unit) {
                viewModel.openSoapEvolution()
            }
        } else if (!uiState.showSoapEvolution) {
            LaunchedEffect(Unit) {
                onCallEnd()
            }
            return
        }
    }

    androidx.activity.compose.BackHandler(enabled = !isInPipMode) {
        val canEnterPip = !uiState.showSoapEvolution &&
            !isWaitingRoomActive &&
            remoteTrack != null &&
            uiState.connectionState == ConnectionState.CONNECTED

        if (canEnterPip && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O && activity != null) {
            val params = android.app.PictureInPictureParams.Builder()
                .setAspectRatio(android.util.Rational(9, 16))
                .build()
            val entered = runCatching { activity.enterPictureInPictureMode(params) }.getOrDefault(false)
            if (!entered) {
                viewModel.handleCallEnd(onCallEnd)
            }
        } else {
            viewModel.handleCallEnd(onCallEnd)
        }
    }

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
                            text = stringResource(R.string.ui_video_camera_off),
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
            // Main Viewport: Remote Video OR Doctor Local Preview OR RemoteAvatarFallback
            val isDoctorTestingCamera = uiState.isDoctor && (isPreviewRoute || remoteTrack == null) && localTrack != null && uiState.isVideoEnabled
            if (remoteTrack != null) {
                ManagedVideoRenderer(
                    videoTrack = remoteTrack,
                    eglContext = viewModel.eglContext,
                    modifier = Modifier.fillMaxSize(),
                    mirror = false,
                    onFirstFrameRendered = {
                        com.autamedica.android.telemetry.CallTelemetry.recordMilestone(
                            null,
                            "T5_FIRST_FRAME_RENDERED",
                        )
                        com.autamedica.android.telemetry.CallTelemetry.finalizeTrace(null)
                    },
                )
            } else if (isDoctorTestingCamera && localTrack != null) {
                ManagedVideoRenderer(
                    videoTrack = localTrack,
                    eglContext = viewModel.eglContext,
                    modifier = Modifier.fillMaxSize(),
                    mirror = true,
                )
            } else {
                val isOnDemandRoom = roomId.startsWith("cf-room") || uiState.activeCallId?.startsWith("cf-room") == true
                val isPatientWaitingForDoctor = !uiState.isDoctor && isOnDemandRoom && (uiState.doctorName.isBlank() || uiState.doctorName == "Médico" || uiState.doctorName == "Profesional")
                val remoteDisplayName = when {
                    uiState.isDoctor -> uiState.patientName.ifBlank { "Paciente" }
                    isPatientWaitingForDoctor -> "Médico de Guardia"
                    else -> uiState.doctorName.ifBlank { "Médico de Guardia" }
                }
                val subtitleText = when {
                    uiState.isAuthorizationBlocked && !uiState.sessionStatusMessage.isNullOrBlank() ->
                        uiState.sessionStatusMessage.orEmpty()
                    uiState.connectionState == ConnectionState.FAILED -> "Error de conexión con la sala"
                    uiState.connectionState == ConnectionState.RECONNECTING -> "Reconectando..."
                    isPatientWaitingForDoctor -> "Buscando médico de guardia... Aguarde en línea mientras un profesional toma su consulta."
                    uiState.connectionState == ConnectionState.CONNECTING -> if (uiState.isDoctor) "Llamando al paciente..." else "Llamando al médico..."
                    uiState.isDoctor -> "Esperando que el paciente active su cámara..."
                    else -> "Esperando que el profesional active su cámara..."
                }
                RemoteAvatarFallback(
                    name = remoteDisplayName,
                    subtitle = subtitleText,
                    isCameraOff = uiState.connectionState == ConnectionState.CONNECTED && !isPatientWaitingForDoctor,
                    isReconnecting = uiState.connectionState == ConnectionState.RECONNECTING,
                    isConnecting = isPatientWaitingForDoctor || uiState.connectionState == ConnectionState.CONNECTING,
                    isFailed = uiState.connectionState == ConnectionState.FAILED,
                    onEndCall = { viewModel.handleCallEnd(onCallEnd) },
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
                        onMinimize = onMinimizeCall,
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
                                text = stringResource(R.string.ui_video_connection_weak),
                                color = Color.White,
                                fontSize = 12.sp,
                                modifier = Modifier.weight(1f),
                            )
                            TextButton(
                                onClick = { viewModel.reactivateVideo() },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            ) {
                                Text(stringResource(R.string.ui_video_reactivate), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                }

                // Local PiP: doctor sube el padding para dejar espacio a la guía clínica.
                // No mostrar PiP duplicado si el médico ya está viendo su cámara en pantalla completa.
                if (!isDoctorTestingCamera) {
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

                // Doctor: HUD clínico morph reposo→sheet (resumen/preguntas/notas) sobre
                // el video full-bleed. Compartido con AntaMedici web (ConsultationContextPanel):
                // motivo + alertas + preguntas + relato + antecedentes + receta/atestado/SOAP,
                // sin modal que tape la pantalla. Mic/cam/timer viven en overflow / top bar.
                if (uiState.isDoctor) {
                    AnimatedVisibility(
                        visible = !uiState.isActionsOverflowOpen,
                        enter = fadeIn() + slideInVertically { it },
                        exit = fadeOut() + slideOutVertically { it },
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .navigationBarsPadding()
                            .padding(start = 16.dp, end = 16.dp, bottom = 84.dp),
                    ) {
                        ClinicalHudLayer(
                            panel = uiState.clinicalSheetPanel,
                            guidance = uiState.clinicalGuidance,
                            clinicalContext = uiState.patientClinicalContext,
                            fallbackMotivo = uiState.chiefComplaintPeek,
                            patientName = uiState.patientName,
                            hasPatient = uiState.patientId.isNotBlank(),
                            isLoading = uiState.isLoadingClinicalContext,
                            consultationNotes = uiState.consultationNotes,
                            initialNotes = uiState.appointmentNotes,
                            isSavingNotes = uiState.isSavingNotes,
                            notesSaved = uiState.notesSaved,
                            onNotesChange = viewModel::updateConsultationNotes,
                            onSaveNotes = viewModel::saveConsultationNotes,
                            onRequestPanelChange = viewModel::setClinicalSheetPanel,
                            onOpenSoap = if (!isPreviewRoute) {
                                {
                                    viewModel.setClinicalSheetPanel(ClinicalSheetPanel.GUIDANCE)
                                    viewModel.openSoapEvolution()
                                }
                            } else null,
                            onEmitPrescription = {
                                clinicalSheetMode = InCallClinicalMode.PRESCRIPTION
                            },
                            onEmitCertificate = {
                                clinicalSheetMode = InCallClinicalMode.CERTIFICATE
                            },
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
                        isFichaOpen = uiState.isClinicalSheetExpanded,
                        hasSafetyAlerts = uiState.safetyAlertCount > 0,
                        onOpenFicha = if (uiState.isDoctor) viewModel::toggleClinicalSheet else null,
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
            }
        }
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

    clinicalSheetMode?.let { mode ->
        InCallClinicalBottomSheet(
            initialMode = mode,
            patientName = uiState.patientName,
            chiefComplaint = uiState.chiefComplaintPeek,
            countryCode = uiState.doctorCountryCode,
            patientLinked = uiState.patientId.isNotBlank(),
            isSubmitting = uiState.isIssuingPrescription || uiState.isIssuingCertificate,
            onIssuePrescription = { med, dosage, instructions, diagnosis, onResult ->
                viewModel.issueInCallPrescription(med, dosage, instructions, diagnosis, onResult)
            },
            onIssueCertificate = { type, days, diag, onResult ->
                viewModel.issueInCallCertificate(type, days, diag, onResult)
            },
            onDismiss = { clinicalSheetMode = null },
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
