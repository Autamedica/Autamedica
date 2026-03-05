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
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.TrendingUp
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientSummary
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorDashboardScreen(
    onNavigateToVideoCall: (appointmentId: String, userId: String, userType: String, userName: String) -> Unit,
    onNavigateToTab: (Int) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: DoctorDashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

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
                    if (uiState.doctorProfile != null) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = PortalDoctors.copy(alpha = 0.15f),
                            modifier = Modifier.padding(end = 12.dp),
                        ) {
                            Text(
                                text = uiState.doctorProfile!!.specialty
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
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(20.dp),
                    ) {
                        // Greeting with doctor badge
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

                        // Stats grid
                        item {
                            StatsSection(stats = uiState.stats)
                        }

                        // Today's schedule
                        if (uiState.todayAppointments.isNotEmpty()) {
                            item {
                                TodayScheduleSection(
                                    appointments = uiState.todayAppointments,
                                    userId = uiState.userId,
                                    userName = uiState.userName,
                                    onJoinCall = onNavigateToVideoCall,
                                )
                            }
                        }

                        // Recent patients
                        if (uiState.recentPatients.isNotEmpty()) {
                            item {
                                RecentPatientsSection(
                                    patients = uiState.recentPatients,
                                    onViewAll = { onNavigateToTab(1) },
                                )
                            }
                        }

                        // Weekly summary card
                        item {
                            WeeklySummaryCard(stats = uiState.stats)
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
    userId: String,
    userName: String,
    onJoinCall: (appointmentId: String, userId: String, userType: String, userName: String) -> Unit,
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
                onJoinCall = if (canJoinCall(appointment)) {
                    {
                        onJoinCall(
                            appointment.id,
                            userId,
                            "doctor",
                            userName,
                        )
                    }
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
                            Icons.Outlined.TrendingUp,
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

private fun canJoinCall(appointment: Appointment): Boolean {
    return (appointment.type == AppointmentType.TELEMEDICINE || appointment.type == AppointmentType.CONSULTATION) &&
        (appointment.status == AppointmentStatus.SCHEDULED || appointment.status == AppointmentStatus.CONFIRMED || appointment.status == AppointmentStatus.IN_PROGRESS)
}

private fun displayAppointmentType(type: AppointmentType): String = when (type) {
    AppointmentType.CONSULTATION -> "Consulta"
    AppointmentType.FOLLOW_UP -> "Seguimiento"
    AppointmentType.EMERGENCY -> "Urgencia"
    AppointmentType.TELEMEDICINE -> "Telemedicina"
    AppointmentType.LAB_TEST -> "Laboratorio"
    AppointmentType.CHECKUP -> "Chequeo"
}

private fun displayStatus(status: AppointmentStatus): String = when (status) {
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
