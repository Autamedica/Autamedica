package com.autamedica.android.presentation.patients

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.Bloodtype
import androidx.compose.material.icons.outlined.Cake
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.Secondary
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientDetailScreen(
    onBack: () -> Unit,
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PatientDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = uiState.patient?.displayName ?: "Detalle paciente",
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver",
                            tint = AuTextPrimary,
                        )
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
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                }
            }

            uiState.error != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(32.dp),
                    ) {
                        Surface(
                            modifier = Modifier.size(64.dp),
                            shape = CircleShape,
                            color = ErrorContainer,
                        ) {
                            Icon(
                                Icons.Outlined.EventBusy,
                                contentDescription = null,
                                modifier = Modifier.padding(16.dp),
                                tint = AuDanger,
                            )
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = uiState.error ?: "Error",
                            color = AuDanger,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }

            uiState.patient != null -> {
                val patient = uiState.patient ?: return@Scaffold

                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    // Patient header card
                    item { PatientHeaderCard(patient) }

                    // Quick info pills
                    item { PatientInfoPills(patient) }

                    // Medical info (if available)
                    if (patient.bloodType != null || patient.allergies != null) {
                        item { MedicalInfoSection(patient) }
                    }

                    // Appointment history
                    if (patient.appointmentHistory.isNotEmpty()) {
                        item {
                            Text(
                                text = "Historial de consultas",
                                style = MaterialTheme.typography.titleSmall,
                                color = AuTextSecondary,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        items(
                            patient.appointmentHistory.take(10),
                            key = { it.id },
                        ) { appointment ->
                            AppointmentHistoryRow(
                                appointment = appointment,
                                onJoinCall = if (appointment.id in uiState.joinableAppointmentIds) {
                                    {
                                        onNavigateToVideoCall(appointment.id)
                                    }
                                } else null,
                            )
                        }
                    }

                    // Empty history
                    if (patient.appointmentHistory.isEmpty()) {
                        item {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                color = AuSurface,
                                border = BorderStroke(1.dp, AuBorder),
                            ) {
                                Column(
                                    modifier = Modifier.padding(24.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Icon(
                                        Icons.Outlined.History,
                                        contentDescription = null,
                                        modifier = Modifier.size(40.dp),
                                        tint = AuTextTertiary,
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        text = "Sin consultas registradas",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = AuTextTertiary,
                                    )
                                }
                            }
                        }
                    }

                    uiState.telemedicineError?.let { telemedicineError ->
                        item {
                            Text(
                                text = telemedicineError,
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PatientHeaderCard(patient: PatientDetail) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = Color.Transparent,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            PortalDoctors.copy(alpha = 0.12f),
                            AuSurface,
                        ),
                    ),
                )
                .padding(24.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    modifier = Modifier.size(64.dp),
                    shape = CircleShape,
                    color = AuSurfaceHover,
                ) {
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        modifier = Modifier.padding(16.dp),
                        tint = AuTextSecondary,
                    )
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = patient.displayName,
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    if (patient.age != null || patient.gender != null) {
                        val details = listOfNotNull(
                            patient.age?.let { "$it años" },
                            patient.gender?.replaceFirstChar { it.uppercase() },
                        ).joinToString(" · ")
                        Text(
                            text = details,
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextSecondary,
                        )
                    }
                    Text(
                        text = "${patient.totalAppointments} consulta${if (patient.totalAppointments != 1) "s" else ""} en total",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }
            }
        }
    }
}

@Composable
private fun PatientInfoPills(patient: PatientDetail) {
    val pills = listOfNotNull(
        patient.email?.let { Triple(Icons.Outlined.Email, "Email", it) },
        patient.phone?.let { Triple(Icons.Outlined.Phone, "Telefono", it) },
        patient.birthDate?.let { Triple(Icons.Outlined.Cake, "Nacimiento", formatDate(it)) },
    )

    if (pills.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            pills.forEach { (icon, label, value) ->
                InfoRow(icon = icon, label = label, value = value)
            }
        }
    }
}

@Composable
private fun InfoRow(
    icon: ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = AuTextTertiary,
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                )
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
private fun MedicalInfoSection(patient: PatientDetail) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "Informacion medica",
            style = MaterialTheme.typography.titleSmall,
            color = AuTextSecondary,
            fontWeight = FontWeight.SemiBold,
        )

        if (patient.bloodType != null) {
            InfoRow(
                icon = Icons.Outlined.Bloodtype,
                label = "Grupo sanguineo",
                value = patient.bloodType,
            )
        }

        if (patient.allergies != null) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                color = AuSurface,
                border = BorderStroke(1.dp, AuBorder),
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        Icons.Outlined.Warning,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = AuDanger.copy(alpha = 0.8f),
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "Alergias",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuDanger.copy(alpha = 0.8f),
                        )
                        Text(
                            text = patient.allergies,
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextPrimary,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AppointmentHistoryRow(
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
            // Date column
            Column(
                modifier = Modifier.width(56.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = formatDayMonth(appointment.startTime),
                    style = MaterialTheme.typography.labelMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = formatTime(appointment.startTime),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    fontSize = 10.sp,
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            HorizontalDivider(
                modifier = Modifier
                    .height(36.dp)
                    .width(1.dp),
                color = AuBorder,
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = displayAppointmentType(appointment.type),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(statusColor(appointment.status)),
                    )
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
                        contentDescription = "Iniciar",
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

// ── Helpers ─────────────────────────────────────────────────────────────

private fun statusColor(status: AppointmentStatus): Color = when (status) {
    AppointmentStatus.IN_PROGRESS -> PortalDoctors
    AppointmentStatus.CONFIRMED -> AuSuccess
    AppointmentStatus.SCHEDULED -> PrimaryLight
    AppointmentStatus.COMPLETED -> AuTextTertiary
    AppointmentStatus.CANCELLED -> AuDanger
    AppointmentStatus.NO_SHOW -> AuDanger
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

private fun formatDate(isoString: String): String {
    return try {
        val date = java.time.LocalDate.parse(isoString)
        date.format(DateTimeFormatter.ofPattern("d 'de' MMMM, yyyy", Locale("es", "AR")))
    } catch (_: Exception) {
        try {
            val dt = OffsetDateTime.parse(isoString)
            dt.format(DateTimeFormatter.ofPattern("d 'de' MMMM, yyyy", Locale("es", "AR")))
        } catch (_: Exception) {
            isoString
        }
    }
}

private fun formatDayMonth(isoString: String): String {
    return try {
        val dt = OffsetDateTime.parse(isoString)
        dt.format(DateTimeFormatter.ofPattern("d MMM", Locale("es", "AR")))
    } catch (_: Exception) {
        ""
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
