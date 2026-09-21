package com.autamedica.android.presentation.patients.continuity

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Emergency
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MedicalInformation
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.NotificationImportant
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R

// ── Design Tokens AutaMedica ──
private val DeepSlate = Color(0xFF0F172A)
private val DarkCardBg = Color(0xFF1E293B)
private val LightCanvasBg = Color(0xFFF8FAFC)
private val EmeraldPrimary = Color(0xFF10B981)
private val EmeraldSoft = Color(0xFFECFDF5)
private val AmberPrimary = Color(0xFFF59E0B)
private val AmberSoft = Color(0xFFFFFBEB)
private val RosePrimary = Color(0xFFEF4444)
private val RoseSoft = Color(0xFFFEF2F2)
private val SkyPrimary = Color(0xFF0284C7)
private val SkySoft = Color(0xFFF0F9FF)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContinuityStatusScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ContinuityStatusViewModel = hiltViewModel(),
    onNavigateToVideoCall: (String) -> Unit = {},
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.feedbackMessage) {
        uiState.feedbackMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearFeedbackMessage()
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = LightCanvasBg,
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        CircularProgressIndicator(
                            color = SkyPrimary,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(40.dp),
                        )
                        Text(
                            text = stringResource(R.string.continuity_loading_sync),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFF64748B),
                        )
                    }
                }
            } else if (uiState.status == "none" || uiState.request == null) {
                // ── ESTADO VACÍO CLÍNICO IMPECABLE ──
                EmptyContinuityState(
                    onBack = onBack,
                    onRequestNew = viewModel::requestNewContinuity,
                )
            } else {
                val request = uiState.request!!

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 40.dp),
                ) {
                    // 1. Header Hero Clínico Obsidian
                    item {
                        ContinuityHeroHeader(
                            request = request,
                            onBack = onBack,
                            onRefresh = viewModel::fetchStatus,
                        )
                    }

                    // 2. Contenido Principal en Tarjetas
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp)
                                .padding(top = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            // Alerta de Escalamiento / Riesgo Clínico (si aplica)
                            if (request.isEscalatedAlertActive || request.triageStatus == "escalated") {
                                EscalatedClinicalAlertCard(
                                    onContactEmergency = { /* Acción directa */ },
                                    onOpenVideoCall = { onNavigateToVideoCall("emergency_room") },
                                )
                            }

                            // A. Tarjeta de Solicitud de Continuidad & Timeline
                            ContinuityTimelineCard(request = request)

                            // B. Tarjeta de Medicación & Adherencia a 30 Días (Línea 4)
                            request.medication?.let { med ->
                                MedicationAdherenceCard(
                                    medication = med,
                                    adherenceScore = request.adherenceScore,
                                    dosesTaken = request.dosesTakenInCycle,
                                    totalDoses = request.totalDosesInCycle,
                                    riskOfInterruption = request.riskOfInterruption,
                                    onRecordDose = viewModel::recordDoseToday,
                                )
                            }

                            // C. Módulo de Check-in Post-Consulta a 48 Horas (Línea 4)
                            PostConsultationCheckInCard(
                                currentStatus = request.postConsultationCheckInState,
                                isSubmitting = uiState.isSubmittingCheckIn,
                                onSelectState = viewModel::submitPostConsultationCheckIn,
                            )

                            // D. Plazo de Resolución y Contacto Médico Garantizado
                            ResolutionDeadlineCard(
                                deadline = request.resolutionDeadline,
                                assignedDoctor = request.assignedDoctor,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── COMPONENTE: HERO HEADER OBSIDIAN ──
@Composable
private fun ContinuityHeroHeader(
    request: ContinuityRequest,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(DeepSlate, Color(0xFF1E293B)),
                ),
            )
            .statusBarsPadding()
            .padding(top = 12.dp, bottom = 24.dp, start = 16.dp, end = 16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            // Barra Superior de Navegación
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(Color(0x26FFFFFF)),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.continuity_back_cd),
                        tint = Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                }

                // Badge de Estado Clínico
                val (statusLabel, badgeBg, badgeTextColor, badgeBorder) = when (request.triageStatus) {
                    "pending" -> Quadruple(stringResource(R.string.continuity_status_pending), SkySoft, SkyPrimary, Color(0x330284C7))
                    "acknowledged" -> Quadruple(stringResource(R.string.continuity_status_acknowledged), AmberSoft, AmberPrimary, Color(0x33F59E0B))
                    "in_progress" -> Quadruple(stringResource(R.string.continuity_status_in_progress), SkySoft, SkyPrimary, Color(0x330284C7))
                    "resolved" -> Quadruple(stringResource(R.string.continuity_status_resolved), EmeraldSoft, EmeraldPrimary, Color(0x3310B981))
                    "escalated" -> Quadruple(stringResource(R.string.continuity_status_escalated), RoseSoft, RosePrimary, Color(0x33EF4444))
                    else -> Quadruple(stringResource(R.string.continuity_status_default), SkySoft, SkyPrimary, Color(0x330284C7))
                }

                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = badgeBg,
                    border = BorderStroke(1.dp, badgeBorder),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(badgeTextColor),
                        )
                        Text(
                            text = statusLabel,
                            color = badgeTextColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                IconButton(
                    onClick = onRefresh,
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(Color(0x26FFFFFF)),
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = stringResource(R.string.continuity_refresh_cd),
                        tint = Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }

            // Título Principal
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = stringResource(R.string.continuity_hero_title),
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.5).sp,
                )
                Text(
                    text = request.intent,
                    color = Color(0xFF94A3B8),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Normal,
                )
            }
        }
    }
}

// ── COMPONENTE: TARJETA DE LÍNEA DE TIEMPO CLÍNICA ──
@Composable
private fun ContinuityTimelineCard(request: ContinuityRequest) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        shadowElevation = 2.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.continuity_timeline_card_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = DeepSlate,
                )
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFF1F5F9),
                ) {
                    Text(
                        text = stringResource(R.string.continuity_timeline_id_badge, request.id),
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFF64748B),
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                    )
                }
            }

            // Pasos de la Timeline
            val isStep1Done = true
            val isStep2Done = request.acknowledgedAt != null || request.triageStatus in listOf("acknowledged", "in_progress", "resolved")
            val isStep3Done = request.inProgressAt != null || request.triageStatus in listOf("in_progress", "resolved")
            val isStep4Done = request.resolvedAt != null || request.triageStatus == "resolved"

            val step2Subtitle = if (request.assignedDoctor != null) {
                stringResource(
                    R.string.continuity_step2_desc_assigned,
                    request.assignedDoctor.name,
                    request.assignedDoctor.specialty,
                    request.assignedDoctor.licenseNumber,
                )
            } else {
                stringResource(R.string.continuity_step2_desc_assigning)
            }

            Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
                TimelineStepRow(
                    stepNumber = "1",
                    title = stringResource(R.string.continuity_step1_title),
                    subtitle = stringResource(R.string.continuity_step1_desc),
                    timestamp = request.createdAt,
                    isDone = isStep1Done,
                    isLast = false,
                )
                TimelineStepRow(
                    stepNumber = "2",
                    title = stringResource(R.string.continuity_step2_title),
                    subtitle = step2Subtitle,
                    timestamp = request.acknowledgedAt,
                    isDone = isStep2Done,
                    isLast = false,
                )
                TimelineStepRow(
                    stepNumber = "3",
                    title = stringResource(R.string.continuity_step3_title),
                    subtitle = stringResource(R.string.continuity_step3_desc),
                    timestamp = request.inProgressAt,
                    isDone = isStep3Done,
                    isLast = false,
                )
                TimelineStepRow(
                    stepNumber = "4",
                    title = stringResource(R.string.continuity_step4_title),
                    subtitle = stringResource(R.string.continuity_step4_desc),
                    timestamp = request.resolvedAt,
                    isDone = isStep4Done,
                    isLast = true,
                )
            }
        }
    }
}

@Composable
private fun TimelineStepRow(
    stepNumber: String,
    title: String,
    subtitle: String,
    timestamp: String?,
    isDone: Boolean,
    isLast: Boolean,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Columna de Ícono / Línea
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(if (isDone) EmeraldSoft else Color(0xFFF1F5F9))
                    .border(
                        1.dp,
                        if (isDone) EmeraldPrimary else Color(0xFFCBD5E1),
                        CircleShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (isDone) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = null,
                        tint = EmeraldPrimary,
                        modifier = Modifier.size(16.dp),
                    )
                } else {
                    Text(
                        text = stepNumber,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF94A3B8),
                    )
                }
            }

            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(38.dp)
                        .background(if (isDone) EmeraldPrimary.copy(alpha = 0.4f) else Color(0xFFE2E8F0)),
                )
            }
        }

        // Columna de Contenido
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(bottom = if (isLast) 0.dp else 16.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = title,
                    fontSize = 13.sp,
                    fontWeight = if (isDone) FontWeight.SemiBold else FontWeight.Medium,
                    color = if (isDone) DeepSlate else Color(0xFF64748B),
                )
                if (timestamp != null) {
                    Text(
                        text = timestamp.take(10),
                        fontSize = 10.sp,
                        color = Color(0xFF94A3B8),
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
            Text(
                text = subtitle,
                fontSize = 11.sp,
                color = Color(0xFF64748B),
                lineHeight = 15.sp,
            )
        }
    }
}

// ── COMPONENTE: MEDICACIÓN Y SCORE DE ADHERENCIA A 30 DÍAS ──
@Composable
private fun MedicationAdherenceCard(
    medication: Medication,
    adherenceScore: Int,
    dosesTaken: Int,
    totalDoses: Int,
    riskOfInterruption: String,
    onRecordDose: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        shadowElevation = 2.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header del fármaco
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = SkySoft,
                        border = BorderStroke(1.dp, Color(0x330284C7)),
                        modifier = Modifier.size(44.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Outlined.Medication,
                                contentDescription = null,
                                tint = SkyPrimary,
                                modifier = Modifier.size(24.dp),
                            )
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = medication.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = DeepSlate,
                        )
                        Text(
                            text = "${medication.dose} • ${medication.frequency}",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B),
                        )
                    }
                }

                // Badge de Riesgo de Suministro
                val (riskText, riskBg, riskColor) = when (riskOfInterruption) {
                    "critical" -> Triple(stringResource(R.string.continuity_risk_critical), RoseSoft, RosePrimary)
                    "moderate" -> Triple(stringResource(R.string.continuity_risk_moderate), AmberSoft, AmberPrimary)
                    else -> Triple(stringResource(R.string.continuity_risk_ok), EmeraldSoft, EmeraldPrimary)
                }
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = riskBg,
                ) {
                    Text(
                        text = riskText,
                        color = riskColor,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }

            // Días restantes de medicación
            medication.daysRemaining?.let { days ->
                val daysColor = if (days <= 2) RosePrimary else if (days <= 5) AmberPrimary else EmeraldPrimary
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.AccessTime,
                                contentDescription = null,
                                tint = daysColor,
                                modifier = Modifier.size(16.dp),
                            )
                            Text(
                                text = stringResource(R.string.continuity_supply_label),
                                fontSize = 12.sp,
                                color = Color(0xFF64748B),
                            )
                        }
                        val supplyDaysText = if (days == 0) {
                            stringResource(R.string.continuity_supply_no_stock)
                        } else {
                            stringResource(R.string.continuity_supply_days_remaining, days)
                        }
                        Text(
                            text = supplyDaysText,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = daysColor,
                        )
                    }
                }
            }

            // Score de Adherencia a 30 Días
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.continuity_adherence_title),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = DeepSlate,
                    )
                    Text(
                        text = stringResource(R.string.continuity_adherence_stat, adherenceScore, dosesTaken, totalDoses),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (adherenceScore >= 80) EmeraldPrimary else if (adherenceScore >= 60) AmberPrimary else RosePrimary,
                    )
                }

                LinearProgressIndicator(
                    progress = { (adherenceScore / 100f).coerceIn(0f, 1f) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp)),
                    color = if (adherenceScore >= 80) EmeraldPrimary else if (adherenceScore >= 60) AmberPrimary else RosePrimary,
                    trackColor = Color(0xFFE2E8F0),
                )

                Text(
                    text = if (adherenceScore >= 80) {
                        stringResource(R.string.continuity_adherence_hint_optimal)
                    } else {
                        stringResource(R.string.continuity_adherence_hint_warning)
                    },
                    fontSize = 11.sp,
                    color = Color(0xFF64748B),
                    lineHeight = 14.sp,
                )
            }

            // Botón interactivo: Registrar toma de hoy
            if (medication.isTakenToday) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = EmeraldSoft,
                    border = BorderStroke(1.dp, EmeraldPrimary.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = EmeraldPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.continuity_dose_recorded_success),
                            color = EmeraldPrimary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            } else {
                Button(
                    onClick = onRecordDose,
                    colors = ButtonDefaults.buttonColors(containerColor = SkyPrimary),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.continuity_record_dose_btn),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

// ── COMPONENTE: CHECK-IN POST-CONSULTA A 48 HORAS (LÍNEA 4 AUTAMEDICA) ──
@Composable
private fun PostConsultationCheckInCard(
    currentStatus: String?,
    isSubmitting: Boolean,
    onSelectState: (String) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        shadowElevation = 2.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Shield,
                        contentDescription = null,
                        tint = SkyPrimary,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = stringResource(R.string.continuity_checkin_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = DeepSlate,
                    )
                }
                Text(
                    text = stringResource(R.string.continuity_checkin_question),
                    fontSize = 13.sp,
                    color = Color(0xFF475569),
                    fontWeight = FontWeight.Medium,
                )
            }

            // 3 Opciones Rápidas de Evolución
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Opción: Mejor
                CheckInOptionButton(
                    label = stringResource(R.string.continuity_checkin_option_better),
                    icon = Icons.Default.ThumbUp,
                    isSelected = currentStatus.equals("better", ignoreCase = true),
                    activeColor = EmeraldPrimary,
                    activeBg = EmeraldSoft,
                    onClick = { onSelectState("better") },
                    modifier = Modifier.weight(1f),
                )

                // Opción: Igual
                CheckInOptionButton(
                    label = stringResource(R.string.continuity_checkin_option_stable),
                    icon = Icons.Outlined.HourglassEmpty,
                    isSelected = currentStatus.equals("stable", ignoreCase = true),
                    activeColor = SkyPrimary,
                    activeBg = SkySoft,
                    onClick = { onSelectState("stable") },
                    modifier = Modifier.weight(1.2f),
                )

                // Opción: Empeoré / Dudas
                CheckInOptionButton(
                    label = stringResource(R.string.continuity_checkin_option_worse),
                    icon = Icons.Default.ThumbDown,
                    isSelected = currentStatus.equals("worse", ignoreCase = true),
                    activeColor = RosePrimary,
                    activeBg = RoseSoft,
                    onClick = { onSelectState("worse") },
                    modifier = Modifier.weight(1.3f),
                )
            }

            if (isSubmitting) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth().height(3.dp),
                    color = SkyPrimary,
                )
            }
        }
    }
}

@Composable
private fun CheckInOptionButton(
    label: String,
    icon: ImageVector,
    isSelected: Boolean,
    activeColor: Color,
    activeBg: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isSelected) activeBg else Color(0xFFF8FAFC),
        border = BorderStroke(
            width = if (isSelected) 1.5.dp else 1.dp,
            color = if (isSelected) activeColor else Color(0xFFE2E8F0),
        ),
        modifier = modifier.clickable { onClick() },
    ) {
        Column(
            modifier = Modifier.padding(vertical = 12.dp, horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (isSelected) activeColor else Color(0xFF64748B),
                modifier = Modifier.size(18.dp),
            )
            Text(
                text = label,
                fontSize = 11.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                color = if (isSelected) activeColor else Color(0xFF475569),
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
        }
    }
}

// ── COMPONENTE: ALERTA DE ESCALAMIENTO CLÍNICO INMEDIATO ──
@Composable
private fun EscalatedClinicalAlertCard(
    onContactEmergency: () -> Unit,
    onOpenVideoCall: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = RoseSoft,
        border = BorderStroke(1.5.dp, RosePrimary.copy(alpha = 0.4f)),
        shadowElevation = 4.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Surface(
                    shape = CircleShape,
                    color = RosePrimary,
                    modifier = Modifier.size(32.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
                Text(
                    text = stringResource(R.string.continuity_escalated_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = RosePrimary,
                )
            }

            Text(
                text = stringResource(R.string.continuity_escalated_desc),
                fontSize = 12.sp,
                color = Color(0xFF991B1B),
                lineHeight = 16.sp,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = onOpenVideoCall,
                    colors = ButtonDefaults.buttonColors(containerColor = RosePrimary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        imageVector = Icons.Default.MedicalServices,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.continuity_escalated_action_btn),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

// ── COMPONENTE: PLAZO DE RESOLUCIÓN MÉDICA Y PROFESIONAL ASIGNADO ──
@Composable
private fun ResolutionDeadlineCard(
    deadline: String?,
    assignedDoctor: AssignedDoctorInfo?,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.CheckCircle,
                    contentDescription = null,
                    tint = EmeraldPrimary,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = stringResource(R.string.continuity_deadline_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = DeepSlate,
                )
            }

            if (deadline != null) {
                Text(
                    text = stringResource(R.string.continuity_deadline_desc, deadline),
                    fontSize = 12.sp,
                    color = Color(0xFF64748B),
                    lineHeight = 16.sp,
                )
            }

            if (assignedDoctor != null) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = SkySoft,
                            modifier = Modifier.size(36.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.Person,
                                    contentDescription = null,
                                    tint = SkyPrimary,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = assignedDoctor.name,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = DeepSlate,
                            )
                            Text(
                                text = "${assignedDoctor.specialty} • ${assignedDoctor.licenseNumber}",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B),
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── COMPONENTE: ESTADO VACÍO CLÍNICO ──
@Composable
private fun EmptyContinuityState(
    onBack: () -> Unit,
    onRequestNew: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Surface(
                shape = CircleShape,
                color = SkySoft,
                border = BorderStroke(1.dp, Color(0x330284C7)),
                modifier = Modifier.size(72.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Outlined.AccessTime,
                        contentDescription = null,
                        tint = SkyPrimary,
                        modifier = Modifier.size(36.dp),
                    )
                }
            }

            Text(
                text = stringResource(R.string.continuity_empty_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = DeepSlate,
                textAlign = TextAlign.Center,
            )

            Text(
                text = stringResource(R.string.continuity_empty_desc),
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF64748B),
                textAlign = TextAlign.Center,
                lineHeight = 20.sp,
            )

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = onRequestNew,
                colors = ButtonDefaults.buttonColors(containerColor = SkyPrimary),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(0.85f),
            ) {
                Icon(
                    imageVector = Icons.Outlined.Medication,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.continuity_empty_request_btn))
            }

            OutlinedButton(
                onClick = onBack,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(0.85f),
            ) {
                Text(stringResource(R.string.continuity_empty_back_btn))
            }
        }
    }
}

private data class Quadruple<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)
