package com.autamedica.android.presentation.doctors.agenda.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun AppointmentListItem(
    appointment: Appointment,
    patientName: String,
    isSelected: Boolean,
    isCurrent: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isTelemed = appointment.type == AppointmentType.TELEMEDICINE || appointment.meetingUrl != null
    val startDt = runCatching { OffsetDateTime.parse(appointment.startTime) }.getOrNull()
    val timeStr = startDt?.format(DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault())) ?: ""

    val cleanNotes = appointment.notes?.let { notes ->
        val cleaned = notes
            .replace(Regex("\\[INVITADO:[^\\]]+\\]", RegexOption.IGNORE_CASE), "")
            .replace(Regex("(?i)^(Videoconsulta|Consulta|Turno)(?:\\s+m[eé]dica)?(?:\\s+de\\s+.*?)?\\s+con\\s+.*?$"), "")
            .trim()
        if (cleaned.startsWith("Videoconsulta de", ignoreCase = true) && cleaned.contains(" con ", ignoreCase = true)) ""
        else if (cleaned.startsWith("Consulta de", ignoreCase = true) && cleaned.contains(" con ", ignoreCase = true)) ""
        else if (cleaned.equals("Consulta programada", ignoreCase = true) || cleaned.equals("Videoconsulta médica", ignoreCase = true)) ""
        else cleaned
    }.orEmpty()

    val (cardBg, borderStroke) = when {
        isSelected -> Color(0xFFF0FDF4) to BorderStroke(1.dp, Color(0xFF86EFAC)) // green tint if selected
        isCurrent -> Color(0xFFECFDF5) to BorderStroke(1.dp, Color(0xFFA7F3D0))
        else -> Color.White to BorderStroke(1.dp, Color(0xFFF1F5F9))
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        color = cardBg,
        border = borderStroke,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            // Left: Time + Video/Presencial tag
            Row(
                modifier = Modifier.width(96.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = if (isTelemed) Icons.Default.Videocam else Icons.Default.Person,
                    contentDescription = null,
                    tint = if (isTelemed) PortalDoctors else AuTextTertiary,
                    modifier = Modifier.size(16.dp),
                )
                Column {
                    Text(
                        text = timeStr,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                        maxLines = 1,
                        softWrap = false,
                    )
                    if (isTelemed) {
                        Text(
                            text = stringResource(R.string.doctor_agenda_list_item_video_badge),
                            style = MaterialTheme.typography.labelSmall,
                            color = PortalDoctors,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            softWrap = false,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Center: Patient Name & Notes
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = patientName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (cleanNotes.isNotBlank()) {
                    Text(
                        text = cleanNotes,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontSize = 11.sp,
                    )
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Right: Status Badge
            AppointmentStatusBadge(status = appointment.status)
        }
    }
}
