package com.autamedica.android.presentation.dashboard

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.Secondary
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val DOCTOR_TAB_APPOINTMENTS = 2
private const val DOCTOR_TAB_PATIENTS = 3

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorDashboardScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToTab: (Int) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: DoctorDashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "AutaMedica",
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = (-0.5).sp,
                        )
                        if (uiState.doctorProfile != null) {
                            Text(
                                text = "Portal Medico",
                                style = MaterialTheme.typography.labelSmall,
                                color = PortalDoctors,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                },
                actions = {
                    uiState.doctorProfile?.let { doctorProfile ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = PortalDoctors.copy(alpha = 0.15f),
                            modifier = Modifier.padding(end = 12.dp),
                        ) {
                            Text(
                                text = doctorProfile.specialty
                                    .replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.labelSmall,
                                color = PortalDoctors,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                    }
                }

                else -> {
                    val telemedicineCandidate = uiState.todayAppointments.firstOrNull { it.isTelemedicineJoinCandidate() }
                    val telemedicineAppointment = uiState.todayAppointments.firstOrNull {
                        it.id in uiState.joinableAppointmentIds
                    }
                    val previewAppointment = telemedicineAppointment ?: telemedicineCandidate
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(20.dp),
                    ) {
                        // 1. Greeting with doctor badge
                        item {
                            AnimatedVisibility(
                                visible = true,
                                enter = fadeIn() + slideInVertically(),
                            ) {
                                DoctorGreeting(
                                    name = uiState.userName,
                                    licenseNumber = uiState.doctorProfile?.licenseNumber,
                                )
                            }
                        }

                        // 2. Clinical Command Cockpit (Hero centerpiece matching Web)
                        item {
                            DoctorClinicalCockpit(
                                candidateAppointment = telemedicineCandidate,
                                appointment = telemedicineAppointment,
                                onJoinCall = telemedicineAppointment?.let { appointment ->
                                    { onNavigateToVideoCall(appointment.id) }
                                },
                                onOpenWaitingRoom = previewAppointment?.let { appointment ->
                                    { onNavigateToVideoCall(appointment.id) }
                                },
                                onOpenPreview = { onNavigateToVideoCall(VIDEO_PREVIEW_APPOINTMENT_ID) },
                                onViewAgenda = { onNavigateToTab(DOCTOR_TAB_APPOINTMENTS) },
                                validationError = uiState.telemedicineError,
                            )
                        }

                        // 3. Stats grid
                        item {
                            StatsSection(stats = uiState.stats)
                        }

                        // 4. Today's schedule
                        if (uiState.todayAppointments.isNotEmpty()) {
                            item {
                                TodayScheduleSection(
                                    appointments = uiState.todayAppointments,
                                    joinableAppointmentIds = uiState.joinableAppointmentIds,
                                    onJoinCall = onNavigateToVideoCall,
                                )
                            }
                        }

                        // 5. Recent patients
                        if (uiState.recentPatients.isNotEmpty()) {
                            item {
                                RecentPatientsSection(
                                    patients = uiState.recentPatients,
                                    onViewAll = { onNavigateToTab(DOCTOR_TAB_PATIENTS) },
                                )
                            }
                        }

                        // 6. Weekly summary card
                        item {
                            WeeklySummaryCard(stats = uiState.stats)
                        }
                    }
                }
            }
        }
    }
}

/**
 * CLINICAL COMMAND COCKPIT (Sala de Telemedicina y Monitoreo):
 * Paridad visual idéntica con el portal médico web (DoctorsDashboardPage.tsx):
 * - Superficie oscura de alto impacto cinematográfico (from-neutral-900 via-neutral-950 to-neutral-900)
 * - Borde neutral-800 con esquinas redondeadas de 20dp
 * - Top Badge con indicador esmeralda radiante ("CONSULTA ACTIVA EN LÍNEA" o "SALA DE TELEMEDICINA ACTIVA")
 * - Botón de acceso con gradiente esmeralda a cian (from-emerald-500 to-cyan-500)
 * - Barra de telemetría de dispositivos (Cámara ON/OFF, Mic ON/OFF, Nivel de señal)
 */
@Composable
private fun DoctorClinicalCockpit(
    candidateAppointment: Appointment?,
    appointment: Appointment?,
    onJoinCall: (() -> Unit)?,
    onOpenWaitingRoom: (() -> Unit)?,
    onOpenPreview: () -> Unit,
    onViewAgenda: () -> Unit,
    validationError: String?,
    modifier: Modifier = Modifier,
) {
    var cameraActive by remember { mutableStateOf(true) }
    var micActive by remember { mutableStateOf(true) }

    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulseAlpha",
    )

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = 12.dp,
                shape = RoundedCornerShape(20.dp),
                clip = false,
                ambientColor = Color(0x66000000),
                spotColor = Color(0x99000000),
            ),
        shape = RoundedCornerShape(20.dp),
        color = Color(0xFF0F0F11),
        border = BorderStroke(1.dp, Color(0xFF26262B)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        listOf(
                            Color(0xFF17171C),
                            Color(0xFF0A0A0E),
                            Color(0xFF141419),
                        )
                    )
                )
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // ── Top Status Badge ──
                val hasActive = appointment != null
                val badgeText = if (hasActive) "CONSULTA ACTIVA EN LÍNEA" else "SALA DE TELEMEDICINA ACTIVA"

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0x1F10B981),
                        border = BorderStroke(1.dp, Color(0x4D10B981)),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(7.dp),
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFF10B981).copy(alpha = pulseAlpha)),
                            )
                            Text(
                                text = badgeText,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.2.sp,
                                ),
                                color = Color(0xFF34D399),
                            )
                        }
                    }

                    Text(
                        text = "HD 1080p · WebRTC",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                        ),
                        color = Color(0xFF71717A),
                    )
                }

                // ── Active Appointment / Direct Call Details ──
                if (appointment != null) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "${formatTime(appointment.startTime)} hs · ${displayAppointmentType(appointment.type)}",
                            style = MaterialTheme.typography.titleLarge.copy(
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = (-0.3).sp,
                            ),
                            color = Color.White,
                        )
                        Text(
                            text = "El paciente está listo en sala de espera. Habilitá tu señal para ingresar.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFA1A1AA),
                        )
                    }

                    Button(
                        onClick = { onJoinCall?.invoke() ?: onViewAgenda() },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Transparent,
                        ),
                        contentPadding = PaddingValues(0.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(
                                    Brush.horizontalGradient(
                                        listOf(
                                            Color(0xFF10B981),
                                            Color(0xFF06B6D4),
                                        )
                                    ),
                                    shape = RoundedCornerShape(12.dp),
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Videocam,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp),
                                )
                                Text(
                                    text = "Entrar a Consulta",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.labelLarge,
                                )
                            }
                        }
                    }
                } else if (candidateAppointment != null) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "${formatTime(candidateAppointment.startTime)} hs · ${displayAppointmentType(candidateAppointment.type)}",
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontSize = 18.sp,
                                fontWeight = FontWeight.SemiBold,
                            ),
                            color = Color.White,
                        )
                        Text(
                            text = validationError ?: "Consulta programada para hoy. Podés habilitar la sala de espera anticipada.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFA1A1AA),
                        )
                    }

                    Button(
                        onClick = { onOpenWaitingRoom?.invoke() ?: onViewAgenda() },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(46.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF27272A),
                            contentColor = Color.White,
                        ),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Videocam,
                                contentDescription = null,
                                tint = Color(0xFF22D3EE),
                                modifier = Modifier.size(18.dp),
                            )
                            Text(
                                text = "Abrir Sala de Espera",
                                fontWeight = FontWeight.SemiBold,
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "Sala de Videoconsulta Directa",
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontSize = 18.sp,
                                fontWeight = FontWeight.SemiBold,
                            ),
                            color = Color.White,
                        )
                        Text(
                            text = "Iniciá una videollamada o verificá tus dispositivos de audio y video en tiempo real.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFA1A1AA),
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Button(
                            onClick = onOpenPreview,
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF27272A),
                                contentColor = Color.White,
                            ),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Videocam,
                                    contentDescription = null,
                                    tint = Color(0xFF22D3EE),
                                    modifier = Modifier.size(16.dp),
                                )
                                Text(
                                    text = "Probar Cámara",
                                    fontWeight = FontWeight.Medium,
                                    style = MaterialTheme.typography.labelMedium,
                                )
                            }
                        }

                        Button(
                            onClick = onViewAgenda,
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0x1F38BDF8),
                                contentColor = Color(0xFF38BDF8),
                            ),
                        ) {
                            Text(
                                text = "Ver Agenda",
                                fontWeight = FontWeight.SemiBold,
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    }
                }

                // ── Device Telemetry & Quick Toggles (Matching Web Cockpit Bottom Row) ──
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        // Camera Toggle
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (cameraActive) Color(0x260891B2) else Color(0xFF1F1F23))
                                .border(
                                    width = 1.dp,
                                    color = if (cameraActive) Color(0x6606B6D4) else Color(0xFF27272A),
                                    shape = RoundedCornerShape(8.dp),
                                )
                                .clickable { cameraActive = !cameraActive }
                                .padding(horizontal = 8.dp, vertical = 5.dp),
                        ) {
                            Icon(
                                imageVector = if (cameraActive) Icons.Default.Videocam else Icons.Default.VideocamOff,
                                contentDescription = null,
                                tint = if (cameraActive) Color(0xFF22D3EE) else Color(0xFF71717A),
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = if (cameraActive) "Cámara ON" else "Cámara OFF",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                fontWeight = FontWeight.SemiBold,
                                color = if (cameraActive) Color(0xFF22D3EE) else Color(0xFF71717A),
                            )
                        }

                        // Mic Toggle
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (micActive) Color(0x260891B2) else Color(0xFF1F1F23))
                                .border(
                                    width = 1.dp,
                                    color = if (micActive) Color(0x6606B6D4) else Color(0xFF27272A),
                                    shape = RoundedCornerShape(8.dp),
                                )
                                .clickable { micActive = !micActive }
                                .padding(horizontal = 8.dp, vertical = 5.dp),
                        ) {
                            Icon(
                                imageVector = if (micActive) Icons.Default.Mic else Icons.Default.MicOff,
                                contentDescription = null,
                                tint = if (micActive) Color(0xFF22D3EE) else Color(0xFF71717A),
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = if (micActive) "Mic ON" else "Mic OFF",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                fontWeight = FontWeight.SemiBold,
                                color = if (micActive) Color(0xFF22D3EE) else Color(0xFF71717A),
                            )
                        }
                    }

                    // Signal Quality Indicator
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = "SEÑAL",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 9.sp,
                                letterSpacing = 1.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = Color(0xFF71717A),
                        )
                        Spacer(modifier = Modifier.width(2.dp))
                        Row(
                            verticalAlignment = Alignment.Bottom,
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                            modifier = Modifier.height(12.dp),
                        ) {
                            val barHeights = listOf(4.dp, 6.dp, 8.dp, 10.dp, 12.dp)
                            barHeights.forEach { height ->
                                Box(
                                    modifier = Modifier
                                        .width(3.dp)
                                        .height(height)
                                        .clip(RoundedCornerShape(1.dp))
                                        .background(if (micActive) Color(0xFF22D3EE) else Color(0xFF52525B)),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DoctorGreeting(
    name: String,
    licenseNumber: String?,
) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (name.isNotBlank()) "Dr. ${name.split(" ").first()}" else "Doctor",
                    style = MaterialTheme.typography.headlineMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "Panel de consultas",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextTertiary,
                )
            }
            if (licenseNumber != null) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = AuSuccess.copy(alpha = 0.12f),
                    border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.25f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = AuSuccess,
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "MN $licenseNumber",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuSuccess,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatsSection(stats: DoctorStats) {
    Column {
        Text(
            text = "Hoy",
            style = MaterialTheme.typography.titleSmall,
            color = AuTextSecondary,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 12.dp),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            StatCard(
                value = stats.todayAppointments.toString(),
                label = "Consultas",
                icon = Icons.Outlined.EventAvailable,
                iconColor = PortalDoctors,
                iconBgColor = PortalDoctors.copy(alpha = 0.15f),
                modifier = Modifier.weight(1f),
            )
            StatCard(
                value = stats.pendingAppointments.toString(),
                label = "Pendientes",
                icon = Icons.Outlined.Schedule,
                iconColor = AuAccent,
                iconBgColor = AuAccent.copy(alpha = 0.15f),
                modifier = Modifier.weight(1f),
            )
            StatCard(
                value = stats.completedToday.toString(),
                label = "Realizadas",
                icon = Icons.Outlined.CheckCircle,
                iconColor = AuSuccess,
                iconBgColor = AuSuccess.copy(alpha = 0.15f),
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun StatCard(
    value: String,
    label: String,
    icon: ImageVector,
    iconColor: Color,
    iconBgColor: Color,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Surface(
                modifier = Modifier.size(36.dp),
                shape = CircleShape,
                color = iconBgColor,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.padding(8.dp),
                    tint = iconColor,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
            )
        }
    }
}

@Composable
private fun TodayScheduleSection(
    appointments: List<Appointment>,
    joinableAppointmentIds: Set<String>,
    onJoinCall: (appointmentId: String) -> Unit,
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Agenda del dia",
                style = MaterialTheme.typography.titleSmall,
                color = AuTextSecondary,
                fontWeight = FontWeight.SemiBold,
            )
            Surface(
                shape = RoundedCornerShape(6.dp),
                color = AuSurfaceHover,
            ) {
                Text(
                    text = "${appointments.size} turno${if (appointments.size != 1) "s" else ""}",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        appointments.take(5).forEach { appointment ->
            DoctorAppointmentRow(
                appointment = appointment,
                onJoinCall = if (appointment.id in joinableAppointmentIds) {
                    { onJoinCall(appointment.id) }
                } else null,
            )
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
private fun DoctorAppointmentRow(
    appointment: Appointment,
    onJoinCall: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = AuSurface,
        border = BorderStroke(
            1.dp,
            if (appointment.status == AppointmentStatus.IN_PROGRESS) PortalDoctors.copy(alpha = 0.4f)
            else AuBorder,
        ),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Time pill
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = if (appointment.status == AppointmentStatus.IN_PROGRESS)
                    PortalDoctors.copy(alpha = 0.15f) else AuSurfaceHover,
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = formatTime(appointment.startTime),
                        style = MaterialTheme.typography.labelMedium,
                        color = if (appointment.status == AppointmentStatus.IN_PROGRESS)
                            PortalDoctors else AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    appointment.durationMinutes?.let {
                        Text(
                            text = "${it}min",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                            fontSize = 9.sp,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = displayAppointmentType(appointment.type),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusDot(appointment.status)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = displayStatus(appointment.status),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                    )
                }
            }

            if (onJoinCall != null) {
                Button(
                    onClick = onJoinCall,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalDoctors,
                        contentColor = Color.White,
                    ),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                ) {
                    Icon(
                        Icons.Default.Videocam,
                        contentDescription = "Iniciar consulta",
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        "Iniciar",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusDot(status: AppointmentStatus) {
    val color = when (status) {
        AppointmentStatus.PAYMENT_PENDING -> Color(0xFFD97706)
        AppointmentStatus.IN_PROGRESS -> PortalDoctors
        AppointmentStatus.CONFIRMED -> AuSuccess
        AppointmentStatus.SCHEDULED -> AuAccent
        AppointmentStatus.COMPLETED -> AuTextTertiary
        AppointmentStatus.CANCELLED -> Color(0xFFEF4444)
        AppointmentStatus.NO_SHOW -> Color(0xFFEF4444)
    }
    Box(
        modifier = Modifier
            .size(6.dp)
            .clip(CircleShape)
            .background(color),
    )
}

@Composable
private fun RecentPatientsSection(
    patients: List<PatientSummary>,
    onViewAll: () -> Unit,
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Pacientes recientes",
                style = MaterialTheme.typography.titleSmall,
                color = AuTextSecondary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Ver todos →",
                style = MaterialTheme.typography.labelMedium,
                color = PrimaryLight,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable(onClick = onViewAll),
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(patients, key = { it.id }) { patient ->
                PatientChip(patient = patient)
            }
        }
    }
}

@Composable
private fun PatientChip(
    patient: PatientSummary,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(36.dp),
                shape = CircleShape,
                color = AuSurfaceHover,
            ) {
                Icon(
                    Icons.Default.Person,
                    contentDescription = null,
                    modifier = Modifier.padding(8.dp),
                    tint = AuTextSecondary,
                )
            }
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    text = "${patient.firstName} ${patient.lastName}".trim().ifBlank { "Paciente" },
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${patient.appointmentCount} consulta${if (patient.appointmentCount != 1) "s" else ""}",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                )
            }
        }
    }
}

@Composable
private fun WeeklySummaryCard(
    stats: DoctorStats,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = Color.Transparent,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            PortalDoctors.copy(alpha = 0.15f),
                            Secondary.copy(alpha = 0.1f),
                        ),
                    ),
                )
                .padding(20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.AutoMirrored.Outlined.TrendingUp,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = PortalDoctors,
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Resumen semanal",
                            style = MaterialTheme.typography.labelMedium,
                            color = PortalDoctors,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "${stats.weeklyAppointments} consultas",
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "${stats.totalPatients} pacientes activos",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
                Surface(
                    modifier = Modifier.size(56.dp),
                    shape = CircleShape,
                    color = PortalDoctors.copy(alpha = 0.2f),
                ) {
                    Icon(
                        Icons.Outlined.MedicalServices,
                        contentDescription = null,
                        modifier = Modifier.padding(14.dp),
                        tint = PortalDoctors,
                    )
                }
            }
        }
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────

private fun displayAppointmentType(type: AppointmentType): String = when (type) {
    AppointmentType.CONSULTATION -> "Consulta"
    AppointmentType.FOLLOW_UP -> "Seguimiento"
    AppointmentType.EMERGENCY -> "Urgencia"
    AppointmentType.TELEMEDICINE -> "Telemedicina"
    AppointmentType.LAB_TEST -> "Laboratorio"
    AppointmentType.CHECKUP -> "Chequeo"
}

private fun displayStatus(status: AppointmentStatus): String = when (status) {
    AppointmentStatus.PAYMENT_PENDING -> "Pago pendiente"
    AppointmentStatus.SCHEDULED -> "Programada"
    AppointmentStatus.CONFIRMED -> "Confirmada"
    AppointmentStatus.IN_PROGRESS -> "En curso"
    AppointmentStatus.COMPLETED -> "Completada"
    AppointmentStatus.CANCELLED -> "Cancelada"
    AppointmentStatus.NO_SHOW -> "Ausente"
}

private fun formatTime(isoString: String): String {
    return try {
        val dt = OffsetDateTime.parse(isoString)
        dt.format(DateTimeFormatter.ofPattern("HH:mm", Locale("es", "AR")))
    } catch (_: Exception) {
        ""
    }
}
