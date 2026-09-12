package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CalendarMonth
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun UpcomingAppointmentHeroCard(
    appointment: Appointment,
    isJoinableNow: Boolean,
    onJoinCall: () -> Unit,
    onViewDetails: () -> Unit,
    joinError: String? = null,
    modifier: Modifier = Modifier,
) {
    val isInProgress = appointment.status.name.equals("in_progress", ignoreCase = true)

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color.White,
        border = BorderStroke(1.dp, if (isJoinableNow) Color(0xFF0284C7) else Color(0xFFE2E8F0)),
        shadowElevation = if (isJoinableNow) 4.dp else 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Header Row: Status Badge + Calendar/Video Circle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = when {
                        isInProgress -> Color(0xFFFEF2F2)
                        isJoinableNow -> Color(0xFFECFEFF)
                        else -> Color(0xFF0F172A)
                    },
                    border = if (isJoinableNow && !isInProgress) BorderStroke(1.dp, Color(0xFF22D3EE)) else null,
                ) {
                    Text(
                        text = when {
                            isInProgress -> "EN VIVO • SALA ACTIVA"
                            isJoinableNow -> "EN VIVO • SALA LISTA"
                            else -> "PRÓXIMA CONSULTA"
                        },
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = when {
                            isInProgress -> Color(0xFFDC2626)
                            isJoinableNow -> Color(0xFF0891B2)
                            else -> Color.White
                        },
                        letterSpacing = 0.5.sp,
                        maxLines = 1,
                        softWrap = false,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }

                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(if (isJoinableNow) Color(0xFFECFEFF) else Color(0xFFF0F9FF)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = if (isJoinableNow) Icons.Default.Videocam else Icons.Default.CalendarMonth,
                        contentDescription = if (isJoinableNow) "Sala de videoconsulta disponible" else "Fecha de consulta",
                        tint = if (isJoinableNow) Color(0xFF0891B2) else PortalPatients,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }

            // Doctor / Title
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = appointment.type.displayName(),
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = if (isJoinableNow) "Sala lista para ingresar" else "Consulta programada",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF0284C7),
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Date and time info
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = "Fecha y horario",
                    fontSize = 12.sp,
                    color = AuTextTertiary,
                )
                Text(
                    text = "${formatDate(appointment.startTime)} • ${formatTime(appointment.startTime)}" +
                        (appointment.durationMinutes?.let { " ($it min)" } ?: ""),
                    style = MaterialTheme.typography.titleSmall,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Action Button (48dp min touch target & WCAG AA contrast)
            Button(
                onClick = { if (isJoinableNow) onJoinCall() else onViewDetails() },
                shape = RoundedCornerShape(999.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isJoinableNow) Color(0xFF0284C7) else Color(0xFF0F172A),
                    contentColor = Color.White,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .sizeIn(minHeight = 48.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 14.dp),
            ) {
                if (isJoinableNow) {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = "Entrar a la consulta",
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Entrar a la consulta",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                    )
                } else {
                    Text(
                        text = "Ver detalles",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                }
                Spacer(modifier = Modifier.width(6.dp))
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                )
            }

            if (joinError != null) {
                Text(
                    text = joinError,
                    fontSize = 12.sp,
                    color = Color(0xFFDC2626),
                )
            }
        }
    }
}

private fun formatDate(isoString: String): String = try {
    val dt = OffsetDateTime.parse(isoString)
    val formatter = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", Locale("es", "AR"))
    dt.format(formatter).replaceFirstChar { it.uppercase() }
} catch (_: Exception) {
    isoString.take(10)
}

private fun formatTime(isoString: String): String = try {
    val dt = OffsetDateTime.parse(isoString)
    val formatter = DateTimeFormatter.ofPattern("HH:mm 'hs'", Locale("es", "AR"))
    dt.format(formatter)
} catch (_: Exception) {
    ""
}

private fun AppointmentType.displayName(): String = when (this) {
    AppointmentType.TELEMEDICINE -> "Videoconsulta Clínica"
    AppointmentType.CONSULTATION -> "Consulta Médica"
    AppointmentType.FOLLOW_UP -> "Control de Seguimiento"
    AppointmentType.EMERGENCY -> "Guardia Médica"
    AppointmentType.LAB_TEST -> "Estudio de Laboratorio"
    AppointmentType.CHECKUP -> "Chequeo de Rutina"
}
