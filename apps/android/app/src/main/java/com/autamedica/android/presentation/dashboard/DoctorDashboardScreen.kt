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
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.MedicalServices
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalPatients
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
    onNavigateToDoctorSignature: () -> Unit = {},
    onNavigateToDoctorPrescriptions: () -> Unit = {},
    onNavigateToDoctorCertificates: () -> Unit = {},
    onNavigateToDoctorMedicalOrders: () -> Unit = {},
    onNavigateToDoctorOnDemand: () -> Unit = {},
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
                                text = stringResource(R.string.doctor_portal_title),
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
                                text = formatDoctorSpecialty(doctorProfile.specialty),
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

                        // 2. Today's schedule (first fold, matching Web widget)
                        item {
                            TodayScheduleSection(
                                appointments = uiState.todayAppointments,
                                joinableAppointmentIds = uiState.joinableAppointmentIds,
                                onJoinCall = onNavigateToVideoCall,
                                onViewAll = { onNavigateToTab(DOCTOR_TAB_APPOINTMENTS) },
                            )
                        }

                        // 3. Clinical Command Cockpit (compact hero matching Web)
                        item {
                            DoctorClinicalCockpit(
                                candidateAppointment = telemedicineCandidate,
                                appointment = telemedicineAppointment,
                                doctorName = uiState.userName,
                                stats = uiState.stats,
                                onJoinCall = telemedicineAppointment?.let { appointment ->
                                    { onNavigateToVideoCall(appointment.id) }
                                },
                                onOpenWaitingRoom = previewAppointment?.let { appointment ->
                                    { onNavigateToVideoCall(appointment.id) }
                                },
                                onViewAgenda = { onNavigateToTab(DOCTOR_TAB_APPOINTMENTS) },
                                onNavigateToOnDemand = onNavigateToDoctorOnDemand,
                                validationError = uiState.telemedicineError,
                            )
                        }

                        // 4. Patients in active follow-up (matching Web widget)
                        if (uiState.recentPatients.isNotEmpty()) {
                            item {
                                RecentPatientsSection(
                                    patients = uiState.recentPatients,
                                    onViewAll = { onNavigateToTab(DOCTOR_TAB_PATIENTS) },
                                )
                            }
                        }

                        // 5. Weekly summary card
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
 * - Superficie oscura de alto impacto (from-neutral-900 via-neutral-950 to-neutral-900)
 * - Borde neutral-800 con esquinas redondeadas de 20dp
 * - Top Badge con indicador clínico ("CONSULTA ACTIVA EN LÍNEA" o "SALA DE TELEMEDICINA ACTIVA")
 * - Botón de acceso directo a consulta (from-emerald-500 to-cyan-500)
 * - Acceso a agenda médica y guardia on-demand
 * - Métricas de actividad clínica en tiempo real
 */
@Composable
private fun DoctorClinicalCockpit(
    candidateAppointment: Appointment?,
    appointment: Appointment?,
    doctorName: String = "",
    stats: DoctorStats = DoctorStats(),
    onJoinCall: (() -> Unit)?,
    onOpenWaitingRoom: (() -> Unit)?,
    onViewAgenda: () -> Unit,
    onNavigateToOnDemand: () -> Unit = {},
    validationError: String?,
    modifier: Modifier = Modifier,
) {
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
            // ── Ambient glow (matching Web cockpit: cyan top-right, emerald bottom) ──
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 60.dp, y = (-70).dp)
                    .size(180.dp)
                    .background(
                        Brush.radialGradient(
                            colors = listOf(Color(0x3D22D3EE), Color.Transparent),
                            center = Offset(90f, 90f),
                            radius = 90f,
                        )
                    ),
            )
            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .offset(x = (-60).dp, y = 70.dp)
                    .size(180.dp)
                    .background(
                        Brush.radialGradient(
                            colors = listOf(Color(0x3410B981), Color.Transparent),
                            center = Offset(90f, 90f),
                            radius = 90f,
                        )
                    ),
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // ── Top Status Badge ──
                val hasActive = appointment != null
                val badgeText = if (hasActive) {
                    stringResource(R.string.doctor_cockpit_status_active_consultation)
                } else if (candidateAppointment != null) {
                    "TURNO DE TELEMEDICINA"
                } else {
                    stringResource(R.string.doctor_cockpit_status_telemedicine_active)
                }
                val badgeColor = if (hasActive) Color(0xFF34D399) else Color(0xFF38BDF8)
                val badgeDotColor = if (hasActive) Color(0xFF10B981) else Color(0xFF0284C7)
                val badgeBgColor = if (hasActive) Color(0x1F10B981) else Color(0x1F0284C7)
                val badgeBorderColor = if (hasActive) Color(0x4D10B981) else Color(0x4D0284C7)

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = CircleShape,
                        color = badgeBgColor,
                        border = BorderStroke(1.dp, badgeBorderColor),
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
                                    .background(badgeDotColor.copy(alpha = pulseAlpha)),
                            )
                            Text(
                                text = badgeText,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.2.sp,
                                ),
                                color = badgeColor,
                            )
                        }
                    }
                }

                // ── Active doctor row (matching Web cockpit column) ──
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.doctor_cockpit_active_doctor_label),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 9.sp,
                                letterSpacing = 1.4.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = Color(0xFF3F3F46),
                        )
                        Text(
                            text = if (doctorName.isNotBlank()) stringResource(R.string.doctor_greeting_name, doctorName.split(" ").first()) else stringResource(R.string.doctor_greeting_fallback),
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0x1F38BDF8),
                        border = BorderStroke(1.dp, Color(0x4D38BDF8)),
                        modifier = Modifier.clickable(onClick = onViewAgenda),
                    ) {
                        Text(
                            text = stringResource(R.string.doctor_cockpit_view_agenda),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF38BDF8),
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }

                // ── Active Appointment / Direct Call Details ──
                if (appointment != null) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = stringResource(R.string.doctor_appointment_time_type, formatTime(appointment.startTime), displayAppointmentType(appointment.type)),
                            style = MaterialTheme.typography.titleLarge.copy(
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = (-0.3).sp,
                            ),
                            color = Color.White,
                        )
                        Text(
                            text = stringResource(R.string.doctor_cockpit_patient_ready_hint),
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
                                    text = stringResource(R.string.doctor_cockpit_enter_consultation),
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
                            text = stringResource(R.string.doctor_appointment_time_type, formatTime(candidateAppointment.startTime), displayAppointmentType(candidateAppointment.type)),
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontSize = 18.sp,
                                fontWeight = FontWeight.SemiBold,
                            ),
                            color = Color.White,
                        )
                        Text(
                            text = when (validationError) {
                                "No se pudo validar la sala de telemedicina." -> stringResource(R.string.doctor_telemedicine_validation_error)
                                null -> stringResource(R.string.doctor_cockpit_candidate_hint)
                                else -> validationError
                            },
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
                                text = stringResource(R.string.doctor_cockpit_open_waiting_room),
                                fontWeight = FontWeight.SemiBold,
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = stringResource(R.string.doctor_cockpit_direct_room_title),
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontSize = 18.sp,
                                fontWeight = FontWeight.SemiBold,
                            ),
                            color = Color.White,
                        )
                        Text(
                            text = stringResource(R.string.doctor_cockpit_direct_room_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFA1A1AA),
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Button(
                            onClick = onViewAgenda,
                            modifier = Modifier
                                .weight(1f)
                                .height(46.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0x1F38BDF8),
                                contentColor = Color(0xFF38BDF8),
                            ),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CalendarMonth,
                                    contentDescription = null,
                                    tint = Color(0xFF38BDF8),
                                    modifier = Modifier.size(16.dp),
                                )
                                Text(
                                    text = stringResource(R.string.doctor_cockpit_btn_view_agenda),
                                    fontWeight = FontWeight.SemiBold,
                                    style = MaterialTheme.typography.labelMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }

                        Button(
                            onClick = onNavigateToOnDemand,
                            modifier = Modifier
                                .weight(1f)
                                .height(46.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF27272A),
                                contentColor = Color.White,
                            ),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.MedicalServices,
                                    contentDescription = null,
                                    tint = Color(0xFF22D3EE),
                                    modifier = Modifier.size(16.dp),
                                )
                                Text(
                                    text = "Guardia",
                                    fontWeight = FontWeight.SemiBold,
                                    style = MaterialTheme.typography.labelMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }

                // ── Mini metrics (matching Web cockpit stats column) ──
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF141419).copy(alpha = 0.9f))
                        .border(1.dp, Color(0xFF1F1F23), RoundedCornerShape(12.dp))
                        .padding(horizontal = 4.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CockpitMetric(
                        value = stats.todayAppointments.toString(),
                        label = stringResource(R.string.doctor_cockpit_metric_today),
                    )
                    CockpitMetric(
                        value = stats.pendingAppointments.toString(),
                        label = stringResource(R.string.doctor_cockpit_metric_pending),
                    )
                    CockpitMetric(
                        value = stats.completedToday.toString(),
                        label = stringResource(R.string.doctor_cockpit_metric_completed),
                    )
                }
            }
        }
    }
}

@Composable
private fun CockpitMetric(
    value: String,
    label: String,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp, letterSpacing = 0.5.sp),
            color = Color(0xFF71717A),
        )
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
                    text = if (name.isNotBlank()) stringResource(R.string.doctor_greeting_name, name.split(" ").first()) else stringResource(R.string.doctor_greeting_fallback),
                    style = MaterialTheme.typography.headlineMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = stringResource(R.string.doctor_dashboard_subtitle),
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
                            text = stringResource(R.string.doctor_license_badge, licenseNumber),
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
private fun TodayScheduleSection(
    appointments: List<Appointment>,
    joinableAppointmentIds: Set<String>,
    onJoinCall: (appointmentId: String) -> Unit,
    onViewAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val visibleAppointments = appointments.take(5)
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE4E4E7)),
        shadowElevation = 1.dp,
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF18181B)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.CalendarMonth,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(20.dp),
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = stringResource(R.string.doctor_schedule_today_title),
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = if (appointments.size == 1) {
                            stringResource(R.string.doctor_schedule_count_single, appointments.size)
                        } else {
                            stringResource(R.string.doctor_schedule_count_plural, appointments.size)
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            if (visibleAppointments.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, Color(0xFFE4E4E7), RoundedCornerShape(14.dp))
                        .padding(vertical = 22.dp, horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.CalendarMonth,
                            contentDescription = null,
                            tint = Color(0xFFD4D4D8),
                            modifier = Modifier.size(24.dp),
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = stringResource(R.string.doctor_schedule_empty_title),
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextSecondary,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            text = stringResource(R.string.doctor_schedule_empty_subtitle),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                }
            } else {
                visibleAppointments.forEachIndexed { index, appointment ->
                    DoctorAppointmentRow(
                        appointment = appointment,
                        onJoinCall = if (appointment.id in joinableAppointmentIds) {
                            { onJoinCall(appointment.id) }
                        } else null,
                    )
                    if (index < visibleAppointments.lastIndex) {
                        Spacer(modifier = Modifier.height(10.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(onClick = onViewAll)
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.doctor_schedule_manage),
                    style = MaterialTheme.typography.labelMedium,
                    color = PortalDoctors,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "→",
                    style = MaterialTheme.typography.labelMedium,
                    color = PortalDoctors,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun DoctorAppointmentRow(
    appointment: Appointment,
    onJoinCall: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val statusColor = statusColor(appointment.status)
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = Color(0xFFFAFAFA),
        border = BorderStroke(
            1.dp,
            if (appointment.status == AppointmentStatus.IN_PROGRESS) PortalDoctors.copy(alpha = 0.4f)
            else Color(0xFFEFEFEF),
        ),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        if (appointment.status == AppointmentStatus.IN_PROGRESS) PortalDoctors.copy(alpha = 0.12f)
                        else Color(0xFFF4F4F5)
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = appointmentTypeIcon(appointment.type),
                    contentDescription = null,
                    tint = if (appointment.status == AppointmentStatus.IN_PROGRESS) PortalDoctors else AuTextSecondary,
                    modifier = Modifier.size(18.dp),
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = displayAppointmentType(appointment.type),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = formatTime(appointment.startTime),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                    )
                    appointment.durationMinutes?.let {
                        Text(
                            text = stringResource(R.string.doctor_appointment_duration_format, it),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = statusColor.copy(alpha = 0.12f),
                    ) {
                        Text(
                            text = displayStatus(appointment.status),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 9.sp,
                                letterSpacing = 0.3.sp,
                            ),
                            color = statusColor,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
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
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Icon(
                        Icons.Default.Videocam,
                        contentDescription = stringResource(R.string.doctor_appointment_start_cd),
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        stringResource(R.string.doctor_appointment_start_btn),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
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
                text = stringResource(R.string.doctor_patients_section_title),
                style = MaterialTheme.typography.titleSmall,
                color = AuTextSecondary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = stringResource(R.string.doctor_patients_view_all),
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
        modifier = modifier.width(150.dp),
        shape = RoundedCornerShape(16.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE4E4E7)),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFF4F4F5)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = initialsOf("${patient.firstName} ${patient.lastName}"),
                    style = MaterialTheme.typography.titleSmall,
                    color = PortalDoctors,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "${patient.firstName} ${patient.lastName}".trim().ifBlank { stringResource(R.string.doctor_patient_fallback_name) },
                style = MaterialTheme.typography.bodySmall,
                color = AuTextPrimary,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = if (patient.appointmentCount == 1) {
                    stringResource(R.string.doctor_patient_consultations_count_single, patient.appointmentCount)
                } else {
                    stringResource(R.string.doctor_patient_consultations_count_plural, patient.appointmentCount)
                },
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Surface(
                shape = RoundedCornerShape(6.dp),
                color = AuSuccess.copy(alpha = 0.12f),
            ) {
                Text(
                    text = stringResource(R.string.doctor_patient_active_badge),
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 8.sp,
                        letterSpacing = 0.6.sp,
                    ),
                    color = AuSuccess,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
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
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE4E4E7)),
        shadowElevation = 1.dp,
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF18181B)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.TrendingUp,
                    contentDescription = null,
                    tint = Color(0xFF22C55E),
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.doctor_weekly_summary_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = AuTextTertiary,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = if (stats.weeklyAppointments == 1) {
                        stringResource(R.string.doctor_weekly_consultations_single, stats.weeklyAppointments)
                    } else {
                        stringResource(R.string.doctor_weekly_consultations_plural, stats.weeklyAppointments)
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = if (stats.totalPatients == 1) {
                        stringResource(R.string.doctor_weekly_patients_single, stats.totalPatients)
                    } else {
                        stringResource(R.string.doctor_weekly_patients_plural, stats.totalPatients)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }
        }
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────

@Composable
private fun formatDoctorSpecialty(specialty: String): String {
    return if (specialty.equals("general", ignoreCase = true) ||
        specialty.equals("medicina general", ignoreCase = true) ||
        specialty.equals("clínica médica", ignoreCase = true) ||
        specialty.equals("clinica medica", ignoreCase = true)
    ) {
        stringResource(R.string.doctor_specialty_general)
    } else {
        specialty.replaceFirstChar { it.uppercase() }
    }
}

@Composable
private fun displayAppointmentType(type: AppointmentType): String = when (type) {
    AppointmentType.CONSULTATION -> stringResource(R.string.doctor_appointment_type_consultation)
    AppointmentType.FOLLOW_UP -> stringResource(R.string.doctor_appointment_type_follow_up)
    AppointmentType.EMERGENCY -> stringResource(R.string.doctor_appointment_type_emergency)
    AppointmentType.TELEMEDICINE -> stringResource(R.string.doctor_appointment_type_telemedicine)
    AppointmentType.LAB_TEST -> stringResource(R.string.doctor_appointment_type_lab_test)
    AppointmentType.CHECKUP -> stringResource(R.string.doctor_appointment_type_checkup)
}

@Composable
private fun displayStatus(status: AppointmentStatus): String = when (status) {
    AppointmentStatus.PAYMENT_PENDING -> stringResource(R.string.doctor_status_payment_pending)
    AppointmentStatus.SCHEDULED -> stringResource(R.string.doctor_status_scheduled)
    AppointmentStatus.CONFIRMED -> stringResource(R.string.doctor_status_confirmed)
    AppointmentStatus.IN_PROGRESS -> stringResource(R.string.doctor_status_in_progress)
    AppointmentStatus.COMPLETED -> stringResource(R.string.doctor_status_completed)
    AppointmentStatus.CANCELLED -> stringResource(R.string.doctor_status_cancelled)
    AppointmentStatus.NO_SHOW -> stringResource(R.string.doctor_status_no_show)
}

private fun appointmentTypeIcon(type: AppointmentType): ImageVector = when (type) {
    AppointmentType.TELEMEDICINE,
    AppointmentType.EMERGENCY,
    -> Icons.Default.Videocam
    AppointmentType.CHECKUP -> Icons.Outlined.MedicalServices
    AppointmentType.FOLLOW_UP -> Icons.Outlined.Groups
    AppointmentType.LAB_TEST -> Icons.Outlined.AccessTime
    AppointmentType.CONSULTATION -> Icons.Default.Person
}

private fun statusColor(status: AppointmentStatus): Color = when (status) {
    AppointmentStatus.CONFIRMED -> Color(0xFF16A34A)
    AppointmentStatus.PAYMENT_PENDING -> Color(0xFFD97706)
    AppointmentStatus.SCHEDULED -> Color(0xFFD97706)
    AppointmentStatus.IN_PROGRESS -> PortalDoctors
    AppointmentStatus.COMPLETED -> AuTextTertiary
    AppointmentStatus.CANCELLED -> Color(0xFFEF4444)
    AppointmentStatus.NO_SHOW -> Color(0xFFEF4444)
}

private fun initialsOf(raw: String): String {
    val parts = raw.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    if (parts.isEmpty()) return "?"
    val first = parts.first().firstOrNull()?.uppercase() ?: ""
    val last = parts.getOrNull(1)?.firstOrNull()?.uppercase() ?: ""
    return (first + last).ifBlank { "?" }
}

private fun formatTime(isoString: String): String {
    return try {
        val dt = OffsetDateTime.parse(isoString)
        dt.format(DateTimeFormatter.ofPattern("HH:mm", Locale("es", "AR")))
    } catch (_: Exception) {
        ""
    }
}
