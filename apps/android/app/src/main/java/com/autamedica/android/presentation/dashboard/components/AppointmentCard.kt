package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.AuWarning
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PrimaryContainer
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.Secondary
import com.autamedica.android.presentation.theme.SecondaryContainer
import com.autamedica.android.presentation.theme.SuccessContainer
import com.autamedica.android.presentation.theme.Tertiary
import com.autamedica.android.presentation.theme.TertiaryContainer
import com.autamedica.android.presentation.theme.WarningContainer
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun AppointmentCard(
    appointment: Appointment,
    onJoinCall: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val statusInfo = appointment.status.toStatusInfo()

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = AuSurface,
        border = androidx.compose.foundation.BorderStroke(1.dp, AuBorder),
    ) {
        Row(modifier = Modifier.height(IntrinsicSize.Min)) {
            // Left color indicator bar
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(statusInfo.color),
            )

            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = appointment.type.displayName(),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = AuTextPrimary,
                    )
                    StatusChip(statusInfo)
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.CalendarMonth,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = AuTextTertiary,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = formatDate(appointment.startTime),
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuTextSecondary,
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Schedule,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = AuTextTertiary,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = formatTime(appointment.startTime) +
                            (appointment.durationMinutes?.let { " · $it min" } ?: ""),
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuTextSecondary,
                    )
                }

                if (appointment.notes != null) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = appointment.notes,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                        maxLines = 2,
                    )
                }

                if (onJoinCall != null && appointment.canJoinCall()) {
                    Spacer(modifier = Modifier.height(14.dp))
                    Button(
                        onClick = onJoinCall,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AuAccent,
                            contentColor = AuBackground,
                        ),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Videocam,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "Unirse a la consulta",
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
        }
    }
}

private data class StatusInfo(
    val label: String,
    val color: Color,
    val containerColor: Color,
)

private fun AppointmentStatus.toStatusInfo(): StatusInfo = when (this) {
    AppointmentStatus.SCHEDULED -> StatusInfo("Programada", PrimaryLight, PrimaryContainer)
    AppointmentStatus.CONFIRMED -> StatusInfo("Confirmada", Tertiary, TertiaryContainer)
    AppointmentStatus.IN_PROGRESS -> StatusInfo("En curso", Secondary, SecondaryContainer)
    AppointmentStatus.COMPLETED -> StatusInfo("Completada", AuSuccess, SuccessContainer)
    AppointmentStatus.CANCELLED -> StatusInfo("Cancelada", AuDanger, ErrorContainer)
    AppointmentStatus.NO_SHOW -> StatusInfo("No asistio", AuWarning, WarningContainer)
}

@Composable
private fun StatusChip(info: StatusInfo) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = info.containerColor,
    ) {
        Text(
            text = info.label,
            style = MaterialTheme.typography.labelSmall,
            color = info.color,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
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

private fun Appointment.canJoinCall(): Boolean {
    return (type == AppointmentType.TELEMEDICINE || type == AppointmentType.CONSULTATION) &&
        (status == AppointmentStatus.SCHEDULED || status == AppointmentStatus.CONFIRMED || status == AppointmentStatus.IN_PROGRESS)
}

private fun formatDate(isoString: String): String {
    return try {
        val dt = OffsetDateTime.parse(isoString)
        dt.format(DateTimeFormatter.ofPattern("d 'de' MMMM, yyyy", Locale("es", "AR")))
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
