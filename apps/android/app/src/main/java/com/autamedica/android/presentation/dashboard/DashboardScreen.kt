package com.autamedica.android.presentation.dashboard

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Person
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.Secondary
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val PATIENT_TAB_APPOINTMENTS = 2
private const val PATIENT_TAB_HEALTH = 3
private const val PATIENT_TAB_PROFILE = 4

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToTab: (Int) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "AutaMedica",
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.5).sp,
                    )
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
                        CircularProgressIndicator(color = AuAccent, strokeWidth = 2.dp)
                    }
                }

                else -> {
                    val nextAppointment = uiState.appointments.firstOrNull()
                    val telemedicineCandidate = uiState.appointments.firstOrNull { it.isTelemedicineJoinCandidate() }
                    val telemedicineAppointment = uiState.appointments.firstOrNull {
                        it.id in uiState.joinableAppointmentIds
                    }
                    val previewAppointment = telemedicineAppointment ?: telemedicineCandidate
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // Greeting
                        item {
                            Column {
                                Text(
                                    text = if (uiState.userName.isNotBlank()) "Hola, ${uiState.userName.split(" ").first()}"
                                    else "Bienvenido",
                                    style = MaterialTheme.typography.headlineMedium,
                                    color = AuTextPrimary,
                                    fontWeight = FontWeight.Bold,
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "Tu salud, conectada",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = AuTextTertiary,
                                )
                            }
                        }

                        // Next appointment highlight
                        if (nextAppointment != null) {
                            item {
                                NextAppointmentCard(
                                    appointment = nextAppointment,
                                    onJoinCall = if (nextAppointment.id in uiState.joinableAppointmentIds) {
                                        {
                                            onNavigateToVideoCall(nextAppointment.id)
                                        }
                                    } else null,
                                )
                            }
                        }

                        item {
                            TelemedicineAccessCard(
                                candidateAppointment = telemedicineCandidate,
                                appointment = telemedicineAppointment,
                                onJoinCall = telemedicineAppointment?.let { appointment ->
                                    { onNavigateToVideoCall(appointment.id) }
                                },
                                onOpenWaitingRoom = previewAppointment?.let { appointment ->
                                    { onNavigateToVideoCall(appointment.id) }
                                },
                                onOpenPreview = { onNavigateToVideoCall(VIDEO_PREVIEW_APPOINTMENT_ID) },
                                onBrowseAppointments = { onNavigateToTab(PATIENT_TAB_APPOINTMENTS) },
                                validationError = uiState.telemedicineError,
                            )
                        }

                        // Quick actions
                        item {
                            Column {
                                Text(
                                    text = "Acceso rapido",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = AuTextSecondary,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(bottom = 12.dp),
                                )
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    QuickActionCard(
                                        icon = Icons.Outlined.CalendarMonth,
                                        label = "Mis Turnos",
                                        iconColor = PrimaryLight,
                                        onClick = { onNavigateToTab(PATIENT_TAB_APPOINTMENTS) },
                                        modifier = Modifier.weight(1f),
                                    )
                                    QuickActionCard(
                                        icon = Icons.Outlined.FavoriteBorder,
                                        label = "Mi Salud",
                                        iconColor = PortalPatients,
                                        onClick = { onNavigateToTab(PATIENT_TAB_HEALTH) },
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                Spacer(modifier = Modifier.height(12.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    QuickActionCard(
                                        icon = Icons.Outlined.Person,
                                        label = "Mi Perfil",
                                        iconColor = Secondary,
                                        onClick = { onNavigateToTab(PATIENT_TAB_PROFILE) },
                                        modifier = Modifier.weight(1f),
                                    )
                                    QuickActionCard(
                                        icon = Icons.AutoMirrored.Outlined.HelpOutline,
                                        label = "Ayuda",
                                        iconColor = AuTextSecondary,
                                        onClick = { },
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                        }

                        // Remaining appointments
                        if (uiState.appointments.size > 1) {
                            item {
                                Text(
                                    text = "Proximos turnos",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = AuTextSecondary,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                            val remaining = uiState.appointments.drop(1).take(3)
                            remaining.forEach { appointment ->
                                item(key = appointment.id) {
                                    CompactAppointmentRow(
                                        appointment = appointment,
                                        onClick = if (appointment.id in uiState.joinableAppointmentIds) {
                                            {
                                                onNavigateToVideoCall(appointment.id)
                                            }
                                        } else null,
                                    )
                                }
                            }
                            if (uiState.appointments.size > 4) {
                                item {
                                    Surface(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { onNavigateToTab(PATIENT_TAB_APPOINTMENTS) },
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color.Transparent,
                                    ) {
                                        Text(
                                            text = "Ver todos los turnos →",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = PrimaryLight,
                                            fontWeight = FontWeight.Medium,
                                            modifier = Modifier.padding(vertical = 8.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TelemedicineAccessCard(
    candidateAppointment: Appointment?,
    appointment: Appointment?,
    onJoinCall: (() -> Unit)?,
    onOpenWaitingRoom: (() -> Unit)?,
    onOpenPreview: () -> Unit,
    onBrowseAppointments: () -> Unit,
    validationError: String?,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Surface(
                        modifier = Modifier.size(40.dp),
                        shape = CircleShape,
                        color = PortalPatients.copy(alpha = 0.15f),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Videocam,
                            contentDescription = null,
                            modifier = Modifier.padding(10.dp),
                            tint = PortalPatients,
                        )
                    }
                    Column {
                        Text(
                            text = "Telemedicina",
                            style = MaterialTheme.typography.titleSmall,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = when {
                                appointment != null -> "Videoconsulta disponible"
                                candidateAppointment != null -> "Sala de espera disponible"
                                else -> "Sin videoconsulta activa"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = if (appointment != null) PortalPatients.copy(alpha = 0.15f) else AuSurfaceHover,
                ) {
                    Text(
                        text = when {
                            appointment != null -> "Lista"
                            candidateAppointment != null -> "Preview"
                            else -> "Pendiente"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = if (appointment != null) PortalPatients else AuTextSecondary,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    )
                }
            }

            if (appointment != null) {
                Text(
                    text = "Tenes una ${appointment.type.displayName().lowercase()} habilitada para video el ${formatDate(appointment.startTime)} a las ${formatTime(appointment.startTime)}.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                )
                Button(
                    onClick = { onJoinCall?.invoke() ?: onBrowseAppointments() },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatients,
                        contentColor = Color.White,
                    ),
                ) {
                    Text("Entrar a la videoconsulta", fontWeight = FontWeight.SemiBold)
                }
            } else if (candidateAppointment != null) {
                Text(
                    text = validationError
                        ?: "Tu turno es compatible con video. Podes encender tu camara y esperar aunque la otra persona todavia no este conectada.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                )
                Button(
                    onClick = { onOpenWaitingRoom?.invoke() ?: onBrowseAppointments() },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatients.copy(alpha = 0.9f),
                        contentColor = Color.White,
                    ),
                ) {
                    Text("Abrir sala de espera", fontWeight = FontWeight.Medium)
                }
            } else {
                Text(
                    text = "No tenes una videoconsulta activa, pero igual podes probar tu camara desde la app.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                )
                Button(
                    onClick = onOpenPreview,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatients.copy(alpha = 0.9f),
                        contentColor = Color.White,
                    ),
                ) {
                    Text("Probar mi camara", fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun NextAppointmentCard(
    appointment: Appointment,
    onJoinCall: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Proxima consulta",
                    style = MaterialTheme.typography.labelMedium,
                    color = PrimaryLight,
                    fontWeight = FontWeight.SemiBold,
                )
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = AuSurfaceHover,
                ) {
                    Text(
                        text = appointment.type.displayName(),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextSecondary,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.CalendarMonth,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = AuTextTertiary,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = formatDate(appointment.startTime),
                    style = MaterialTheme.typography.bodyLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = formatTime(appointment.startTime) +
                    (appointment.durationMinutes?.let { " · $it min" } ?: ""),
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextSecondary,
                modifier = Modifier.padding(start = 26.dp),
            )

            if (onJoinCall != null) {
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onJoinCall,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatients,
                        contentColor = Color.White,
                    ),
                ) {
                    Icon(
                        Icons.Default.Videocam,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Unirse a la consulta",
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickActionCard(
    icon: ImageVector,
    label: String,
    iconColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Surface(
                modifier = Modifier.size(40.dp),
                shape = CircleShape,
                color = AuSurfaceHover,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.padding(10.dp),
                    tint = iconColor,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextPrimary,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun CompactAppointmentRow(
    appointment: Appointment,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = appointment.type.displayName(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = formatDate(appointment.startTime) + " · " +
                        formatTime(appointment.startTime),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextTertiary,
                )
            }
            if (onClick != null) {
                Button(
                    onClick = onClick,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatients,
                        contentColor = Color.White,
                    ),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Icon(
                        Icons.Default.Videocam,
                        contentDescription = "Unirse",
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        "Unirse",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

private fun AppointmentType.displayName(): String = when (this) {
    AppointmentType.CONSULTATION -> "Consulta"
    AppointmentType.FOLLOW_UP -> "Seguimiento"
    AppointmentType.EMERGENCY -> "Urgencia"
    AppointmentType.TELEMEDICINE -> "Telemedicina"
    AppointmentType.LAB_TEST -> "Laboratorio"
    AppointmentType.CHECKUP -> "Chequeo"
}

private fun formatDate(isoString: String): String {
    return try {
        val dt = OffsetDateTime.parse(isoString)
        dt.format(DateTimeFormatter.ofPattern("d 'de' MMMM", Locale("es", "AR")))
    } catch (_: Exception) {
        isoString
    }
}

private fun formatTime(isoString: String): String {
    return try {
        val dt = OffsetDateTime.parse(isoString)
        dt.format(DateTimeFormatter.ofPattern("HH:mm", Locale("es", "AR")))
    } catch (_: Exception) {
        ""
    }
}
