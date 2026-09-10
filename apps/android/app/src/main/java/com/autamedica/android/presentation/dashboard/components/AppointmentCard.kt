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
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.SuccessContainer
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun AppointmentCard(
    appointment: Appointment,
    onJoinCall: (() -> Unit)?,
    modifier: Modifier = Modifier,
    patientName: String? = null,
) {
    val statusInfo = appointment.status.toStatusInfo()
    val isTelemed = appointment.type == AppointmentType.TELEMEDICINE || appointment.meetingUrl != null
    val isCandidate = appointment.isTelemedicineJoinCandidate()
    val guestNameMatch = appointment.notes?.let { notes ->
        Regex("\\[INVITADO:\\s*([^\\]]+)\\]").find(notes)?.groupValues?.get(1)?.trim()
    }
    val resolvedTitle = patientName 
        ?: guestNameMatch 
        ?: appointment.type.displayName()

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(
            1.dp,
            if (isCandidate) PortalDoctors.copy(alpha = 0.35f) else AuBorder,
        ),
        shadowElevation = if (isCandidate) 1.dp else 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Top Row: Hora destacada + Type badge + Status chip
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Hora destacada pill
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = if (isCandidate) PortalDoctors.copy(alpha = 0.12f) else AuSurfaceHover,
                    border = BorderStroke(
                        1.dp,
                        if (isCandidate) PortalDoctors.copy(alpha = 0.25f) else AuBorder,
                    ),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Schedule,
                            contentDescription = null,
                            tint = if (isCandidate) PortalDoctors else AuTextPrimary,
                            modifier = Modifier.size(14.dp),
                        )
                        Text(
                            text = formatTime(appointment.startTime),
                            style = MaterialTheme.typography.titleMedium,
                            color = if (isCandidate) PortalDoctors else AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        appointment.durationMinutes?.let { dur ->
                            Text(
                                text = "· ${dur}m",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                            )
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    // Type Badge (Telemedicina cyan/sky vs Presencial slate)
                    TypeBadge(isTelemed = isTelemed)

                    // Status Chip (Zero-Yellow)
                    StatusChip(statusInfo)
                }
            }

            // Main Info: Patient/Consultation Title + Subtitle/Date
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = resolvedTitle,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = AuTextPrimary,
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CalendarMonth,
                        contentDescription = null,
                        modifier = Modifier.size(13.dp),
                        tint = AuTextTertiary,
                    )
                    Text(
                        text = formatDate(appointment.startTime),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
            }

            // Cleaned notes or chief complaint if present
            val cleanNotes = cleanNotesContent(appointment.notes)
            if (cleanNotes.isNotBlank()) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = AuSurfaceHover.copy(alpha = 0.6f),
                    border = BorderStroke(1.dp, AuBorder),
                ) {
                    Text(
                        text = cleanNotes,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        maxLines = 2,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            }

            // Action Button: Direct Telemed Join (48dp min touch target)
            if (onJoinCall != null && isCandidate) {
                Button(
                    onClick = onJoinCall,
                    modifier = Modifier
                        .fillMaxWidth()
                        .sizeIn(minHeight = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalDoctors,
                        contentColor = Color.White,
                    ),
                ) {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = "Entrar a videoconsulta",
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Entrar a Consulta",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun TypeBadge(isTelemed: Boolean) {
    if (isTelemed) {
        Surface(
            shape = RoundedCornerShape(6.dp),
            color = Color(0xFFE0F2FE), // sky-100
            border = BorderStroke(1.dp, Color(0x330EA5E9)),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Videocam,
                    contentDescription = null,
                    modifier = Modifier.size(11.dp),
                    tint = Color(0xFF0284C7), // sky-700
                )
                Text(
                    text = "Telemedicina",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF0284C7),
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 10.sp,
                )
            }
        }
    } else {
        Surface(
            shape = RoundedCornerShape(6.dp),
            color = Color(0xFFF1F5F9), // slate-100
            border = BorderStroke(1.dp, Color(0x3364748B)),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.MedicalServices,
                    contentDescription = null,
                    modifier = Modifier.size(11.dp),
                    tint = Color(0xFF475569), // slate-600
                )
                Text(
                    text = "Presencial",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF475569),
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 10.sp,
                )
            }
        }
    }
}

private data class StatusInfo(
    val label: String,
    val color: Color,
    val containerColor: Color,
)

// Zero-Yellow Gate: Strict clinical colors (Emerald, Cyan, Sky, Slate, Red)
private fun AppointmentStatus.toStatusInfo(): StatusInfo = when (this) {
    AppointmentStatus.PAYMENT_PENDING -> StatusInfo("Pago pendiente", Color(0xFFD97706), Color(0xFFFEF3C7))
    AppointmentStatus.SCHEDULED -> StatusInfo("Programada", Color(0xFF0284C7), Color(0xFFE0F2FE))
    AppointmentStatus.CONFIRMED -> StatusInfo("Confirmada", Color(0xFF047857), SuccessContainer)
    AppointmentStatus.IN_PROGRESS -> StatusInfo("En curso", Color(0xFF0891B2), Color(0xFFECFEFF))
    AppointmentStatus.COMPLETED -> StatusInfo("Completada", Color(0xFF475569), Color(0xFFF1F5F9))
    AppointmentStatus.CANCELLED -> StatusInfo("Cancelada", AuDanger, ErrorContainer)
    AppointmentStatus.NO_SHOW -> StatusInfo("Ausente", Color(0xFF64748B), Color(0xFFF8FAFC))
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
            fontSize = 10.sp,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
        )
    }
}

private fun AppointmentType.displayName(): String = when (this) {
    AppointmentType.CONSULTATION -> "Consulta Médica"
    AppointmentType.FOLLOW_UP -> "Seguimiento Clínico"
    AppointmentType.EMERGENCY -> "Urgencia"
    AppointmentType.TELEMEDICINE -> "Teleconsulta"
    AppointmentType.LAB_TEST -> "Laboratorio"
    AppointmentType.CHECKUP -> "Chequeo Preventivo"
}

private fun cleanNotesContent(notes: String?): String {
    if (notes == null) return ""
    return notes.replace(Regex("\\[INVITADO:[^\\]]+\\]"), "").trim()
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
