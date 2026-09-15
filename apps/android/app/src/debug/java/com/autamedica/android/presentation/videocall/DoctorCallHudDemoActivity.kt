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
import androidx.compose.runtime.mutableIntStateOf
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
import com.autamedica.android.presentation.videocall.components.ClinicalHudLayer
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
            presentIllness = "Cefalea bifrontal opresiva desde hace 3 días de evolución.",
            allergies = listOf("Penicilina", "AINE"),
            medications = "Enalapril 10 mg 1x/día",
            chronicDiseases = listOf("Hipertensión"),
            ageYears = 67,
            gender = "F",
            physiologicalHistory = listOf("Tabaco 20 paquetes/año", "Menopausia 52 años"),
            familyHistory = listOf("IAM en padre a los 55", "DM2 en hermano"),
            anamnesisCompletion = 85,
        )
    }
    val guidance = remember {
        CallClinicalGuidanceBuilder.fromLocalContext(
            context = clinicalContext,
            appointmentNotes = "Consulta por cefalea persistente",
            preconsultationReason = null,
        )
    }
    var sheetPanel by remember { mutableStateOf(ClinicalSheetPanel.GUIDANCE) }
    var overflowOpen by remember { mutableStateOf(false) }
    var unread by remember { mutableIntStateOf(2) }
    var audioOn by remember { mutableStateOf(true) }
    var videoOn by remember { mutableStateOf(true) }
    var notes by remember { mutableStateOf("") }

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

        // PiP local fake — encima del HUD clínico
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

        if (!overflowOpen) {
            ClinicalHudLayer(
                panel = sheetPanel,
                guidance = guidance,
                clinicalContext = clinicalContext,
                fallbackMotivo = clinicalContext.chiefComplaint,
                patientName = "María López",
                hasPatient = true,
                isLoading = false,
                consultationNotes = notes,
                initialNotes = "Consulta por cefalea persistente",
                isSavingNotes = false,
                notesSaved = false,
                onNotesChange = { notes = it },
                onSaveNotes = {},
                onRequestPanelChange = { sheetPanel = it },
                onOpenSoap = { sheetPanel = ClinicalSheetPanel.GUIDANCE },
                onEmitPrescription = { sheetPanel = ClinicalSheetPanel.GUIDANCE },
                onEmitCertificate = { sheetPanel = ClinicalSheetPanel.GUIDANCE },
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
            isFichaOpen = sheetPanel != ClinicalSheetPanel.GUIDANCE,
            hasSafetyAlerts = true,
            onOpenFicha = {
                sheetPanel = if (sheetPanel == ClinicalSheetPanel.GUIDANCE) {
                    ClinicalSheetPanel.RESUMEN
                } else {
                    ClinicalSheetPanel.GUIDANCE
                }
            },
            isOverflowOpen = overflowOpen,
            overflowBadgeCount = unread,
            onOpenOverflow = { overflowOpen = true },
            modifier = Modifier.align(Alignment.BottomCenter),
        )

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