package com.autamedica.android.presentation.videocall

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.CallClinicalGuidanceBuilder
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.domain.model.PatientClinicalContext
import com.autamedica.android.domain.model.StreamQualityLevel
import com.autamedica.android.presentation.theme.AutamedicaTheme
import com.autamedica.android.presentation.videocall.components.CallActionsOverflowSheet
import com.autamedica.android.presentation.videocall.components.CallControlsBar
import com.autamedica.android.presentation.videocall.components.CallTopBar
import com.autamedica.android.presentation.videocall.components.ClinicalFichaSheet
import com.autamedica.android.presentation.videocall.components.DoctorClinicalGuidePanel
import com.autamedica.android.presentation.videocall.components.RemoteAvatarFallback

/**
 * Preview visual del HUD médico (solo debug).
 * Abrir con: adb shell am start -a android.intent.action.VIEW -d "autamedica://doctor-call-hud-demo"
 */
class DoctorCallHudDemoActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AutamedicaTheme {
                DoctorCallHudDemoScreen(onClose = { finish() })
            }
        }
    }
}

@Composable
private fun DoctorCallHudDemoScreen(onClose: () -> Unit) {
    val clinicalContext = remember {
        PatientClinicalContext(
            hasAnamnesis = true,
            chiefComplaint = "Cefalea de 3 días",
            allergies = listOf("Penicilina", "AINE"),
            medications = "Enalapril 10 mg 1x/día",
            chronicDiseases = listOf("Hipertensión"),
        )
    }
    val guidance = remember {
        CallClinicalGuidanceBuilder.fromLocalContext(
            context = clinicalContext,
            appointmentNotes = null,
            preconsultationReason = null,
        )
    }
    var fichaOpen by remember { mutableStateOf(false) }
    var overflowOpen by remember { mutableStateOf(false) }
    var unread by remember { mutableStateOf(2) }
    var audioOn by remember { mutableStateOf(true) }
    var videoOn by remember { mutableStateOf(true) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A)),
    ) {
        RemoteAvatarFallback(
            name = "María López",
            subtitle = "Esperando que el paciente active su cámara...",
            isCameraOff = true,
            isReconnecting = false,
            isConnecting = false,
        )

        // PiP local fake — encima de la guía clínica
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(bottom = 320.dp, end = 16.dp)
                .size(width = 110.dp, height = 154.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(Color(0xFF1E293B)),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.Filled.Person,
                    contentDescription = null,
                    tint = Color(0xFF94A3B8),
                    modifier = Modifier.size(36.dp),
                )
                Text("TÚ", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = Color.Transparent,
                border = BorderStroke(1.5.dp, Color(0x33FFFFFF)),
                modifier = Modifier.fillMaxSize(),
            ) {}
        }

        CallTopBar(
            connectionState = ConnectionState.CONNECTED,
            qualityLevel = StreamQualityLevel.GOOD,
            durationSeconds = 252,
            participantLabel = "María López",
            safetyAlert = "Penicilina",
            clinicalFirst = true,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        if (!fichaOpen && !overflowOpen) {
            DoctorClinicalGuidePanel(
                guidance = guidance,
                onOpenFicha = { fichaOpen = true },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(start = 16.dp, end = 16.dp, bottom = 84.dp)
                    .fillMaxWidth(),
            )
        }

        CallControlsBar(
            isAudioEnabled = audioOn,
            isVideoEnabled = videoOn,
            onToggleAudio = { audioOn = !audioOn },
            onToggleVideo = { videoOn = !videoOn },
            onEndCall = onClose,
            isDoctor = true,
            isFichaOpen = fichaOpen,
            hasSafetyAlerts = true,
            onOpenFicha = { fichaOpen = true },
            isOverflowOpen = overflowOpen,
            overflowBadgeCount = unread,
            onOpenOverflow = { overflowOpen = true },
            modifier = Modifier.align(Alignment.BottomCenter),
        )

        if (fichaOpen) {
            ClinicalFichaSheet(
                patientName = "María López",
                clinicalContext = clinicalContext,
                fallbackReason = clinicalContext.chiefComplaint,
                guidance = guidance,
                hasPatient = true,
                isLoading = false,
                onDismiss = { fichaOpen = false },
                onOpenNotes = { fichaOpen = false },
                onEmitPrescription = { fichaOpen = false },
                onEmitCertificate = { fichaOpen = false },
            )
        }

        if (overflowOpen) {
            CallActionsOverflowSheet(
                isAudioEnabled = audioOn,
                isVideoEnabled = videoOn,
                isSpeakerOn = true,
                unreadMessages = unread,
                onToggleAudio = { audioOn = !audioOn },
                onToggleVideo = { videoOn = !videoOn },
                onToggleChat = {
                    unread = 0
                    overflowOpen = false
                },
                onToggleSpeaker = {},
                onSwitchCamera = {},
                onDismiss = { overflowOpen = false },
            )
        }
    }
}
