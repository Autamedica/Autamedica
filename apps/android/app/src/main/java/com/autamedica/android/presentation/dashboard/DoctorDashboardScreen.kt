package com.autamedica.android.presentation.dashboard

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.Schedule
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.MedicalChat
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val DOCTOR_TAB_CHATS = 1

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorDashboardScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToTab: (Int) -> Unit = {},
    onNavigateToDoctorSignature: () -> Unit = {},
    onNavigateToDoctorPrescriptions: () -> Unit = {},
    onNavigateToDoctorCertificates: () -> Unit = {},
    onNavigateToDoctorMedicalOrders: () -> Unit = {},
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
                    val hasPendingMessages = uiState.unreadMessagesCount > 0 || uiState.urgentChats.isNotEmpty()
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
                                    sssValidationStatus = uiState.doctorProfile?.sssValidationStatus,
                                    onVerifyLicense = onNavigateToDoctorSignature,
                                )
                            }
                        }

                        // 2. Next patient for telemedicine (hero only with a real turn)
                        if (telemedicineAppointment != null || telemedicineCandidate != null) {
                            item {
                                DoctorNextPatientCard(
                                    candidateAppointment = telemedicineCandidate,
                                    appointment = telemedicineAppointment,
                                    validationError = uiState.telemedicineError,
                                    onJoinCall = { appointmentId -> onNavigateToVideoCall(appointmentId) },
                                )
                            }
                        }

                        // 3. Today's schedule, ordered by clinical priority
                        if (uiState.todayAppointments.isNotEmpty()) {
                            item {
                                TodayScheduleSection(
                                    appointments = uiState.todayAppointments,
                                    joinableAppointmentIds = uiState.joinableAppointmentIds,
                                    onJoinCall = onNavigateToVideoCall,
                                )
                            }
                        }

                        // 4. Pending actionable items (unread messages / urgent chats)
                        if (hasPendingMessages) {
                            item {
                                PendingActionsSection(
                                    unreadMessagesCount = uiState.unreadMessagesCount,
                                    urgentChats = uiState.urgentChats,
                                    onOpenMessages = { onNavigateToTab(DOCTOR_TAB_CHATS) },
                                )
                            }
                        }

                        // 5. Compact quick actions
                        item {
                            DoctorQuickActions(
                                onOpenPrescriptions = onNavigateToDoctorPrescriptions,
                                onOpenCertificates = onNavigateToDoctorCertificates,
                                onOpenMedicalOrders = onNavigateToDoctorMedicalOrders,
                            )
                        }

                        // 6. Today stats
                        item {
                            StatsSection(stats = uiState.stats)
                        }

                        // 7. Weekly summary (one line)
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
 * NEXT PATIENT CARD: shows only when there is a real telemedicine turn.
 * - Active sessions (joinable) → "Entrar a Consulta"
 * - Scheduled candidate → "Abrir Sala de Espera"
 * No fake device telemetry or decorative pulse.
 */
@Composable
private fun DoctorNextPatientCard(
    candidateAppointment: Appointment?,
    appointment: Appointment?,
    validationError: String?,
    onJoinCall: (appointmentId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFF0F0F11),
        border = BorderStroke(1.dp, Color(0xFF26262B)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (appointment != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0x1F10B981),
                        border = BorderStroke(1.dp, Color(0x4D10B981)),
                    ) {
                        Text(
                            text = "CONSULTA ACTIVA EN LÍNEA",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.2.sp,
                            ),
                            color = Color(0xFF34D399),
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                    Spacer(modifier = Modifier.weight(1f))
                }

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
                        text = "El paciente está listo en sala de espera. Ingresá para iniciar la consulta.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFA1A1AA),
                    )
                }

                Button(
                    onClick = { onJoinCall(appointment.id) },
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
                                androidx.compose.ui.graphics.Brush.horizontalGradient(
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
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0x1F38BDF8),
                        border = BorderStroke(1.dp, Color(0x4D38BDF8)),
                    ) {
                        Text(
                            text = "TURNO DE TELEMEDICINA",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.2.sp,
                            ),
                            color = Color(0xFF38BDF8),
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                    Spacer(modifier = Modifier.weight(1f))
                }

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
                        text = validationError
                            ?: "Consulta programada para hoy. Aparecerá acá cuando el paciente entre a la sala.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFA1A1AA),
                    )
                }

                Button(
                    onClick = { onJoinCall(candidateAppointment.id) },
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
            }
        }
    }
}

@Composable
private fun DoctorGreeting(
    name: String,
    licenseNumber: String?,
    sssValidationStatus: String?,
    onVerifyLicense: () -> Unit = {},
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
                val isVerified = sssValidationStatus == "valid" || sssValidationStatus == "exempt"
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = if (isVerified) AuSuccess.copy(alpha = 0.12f) else AuDanger.copy(alpha = 0.10f),
                    border = BorderStroke(
                        1.dp,
                        if (isVerified) AuSuccess.copy(alpha = 0.25f) else AuDanger.copy(alpha = 0.25f),
                    ),
                    modifier = if (isVerified) Modifier else Modifier.clickable { onVerifyLicense() },
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            if (isVerified) Icons.Outlined.CheckCircle else Icons.Default.Warning,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = if (isVerified) AuSuccess else AuDanger,
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (isVerified) {
                                "MN $licenseNumber · Verificado"
                            } else {
                                "Matrícula sin verificar"
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isVerified) AuSuccess else AuDanger,
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

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
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
}

@Composable
private fun PendingActionsSection(
    unreadMessagesCount: Int,
    urgentChats: List<MedicalChat>,
    onOpenMessages: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val urgentCount = urgentChats.size
    Column {
        Text(
            text = "Pendientes",
            style = MaterialTheme.typography.titleSmall,
            color = AuTextSecondary,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 12.dp),
        )
        Surface(
            modifier = modifier
                .fillMaxWidth()
                .clickable { onOpenMessages() },
            shape = RoundedCornerShape(14.dp),
            color = AuSurface,
            border = BorderStroke(1.dp, AuBorder),
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    modifier = Modifier.size(38.dp),
                    shape = CircleShape,
                    color = AuAccent.copy(alpha = 0.15f),
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.Chat,
                        contentDescription = null,
                        modifier = Modifier.padding(9.dp),
                        tint = AuAccent,
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (unreadMessagesCount > 0) {
                            "$unreadMessagesCount mensaje${if (unreadMessagesCount != 1) "s" else ""} sin leer"
                        } else {
                            "Consultas urgentes"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Medium,
                    )
                    if (unreadMessagesCount > 0 && urgentCount > 0) {
                        Text(
                            text = "$urgentCount marcada${if (urgentCount != 1) "s" else ""} como urgente",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuDanger,
                        )
                    }
                }
                if (urgentCount > 0) {
                    Surface(
                        shape = CircleShape,
                        color = AuDanger,
                        modifier = Modifier.size(24.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = urgentCount.toString(),
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DoctorQuickActions(
    onOpenPrescriptions: () -> Unit,
    onOpenCertificates: () -> Unit,
    onOpenMedicalOrders: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column {
        Text(
            text = "Acciones rápidas",
            style = MaterialTheme.typography.titleSmall,
            color = AuTextSecondary,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 12.dp),
        )
        Row(
            modifier = modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            QuickActionChip(
                label = "Recetas",
                icon = Icons.Outlined.Medication,
                color = PortalDoctors,
                onClick = onOpenPrescriptions,
                modifier = Modifier.weight(1f),
            )
            QuickActionChip(
                label = "Atestados",
                icon = Icons.Outlined.Description,
                color = PortalDoctors,
                onClick = onOpenCertificates,
                modifier = Modifier.weight(1f),
            )
            QuickActionChip(
                label = "Órdenes",
                icon = Icons.Outlined.MedicalServices,
                color = PortalDoctors,
                onClick = onOpenMedicalOrders,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun QuickActionChip(
    label: String,
    icon: ImageVector,
    color: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Surface(
                modifier = Modifier.size(34.dp),
                shape = CircleShape,
                color = color.copy(alpha = 0.15f),
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    modifier = Modifier.padding(8.dp),
                    tint = color,
                )
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = AuTextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
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
private fun WeeklySummaryCard(
    stats: DoctorStats,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.AutoMirrored.Outlined.TrendingUp,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = PortalDoctors,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Resumen semanal",
                style = MaterialTheme.typography.labelMedium,
                color = AuTextSecondary,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "${stats.weeklyAppointments} consultas · ${stats.totalPatients} pacientes activos",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextPrimary,
                fontWeight = FontWeight.Medium,
            )
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
