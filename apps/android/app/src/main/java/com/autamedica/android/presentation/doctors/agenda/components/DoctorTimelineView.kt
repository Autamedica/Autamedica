package com.autamedica.android.presentation.doctors.agenda.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.VideoCall
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

@Composable
fun DoctorTimelineView(
    selectedDate: LocalDate,
    appointments: List<Appointment>,
    getPatientName: (Appointment) -> String,
    onSelectAppointment: (Appointment) -> Unit,
    onBookSlot: (hourStr: String) -> Unit,
    onStartCall: (appointmentId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Current time ticker (updates every 30s)
    var currentTime by remember { mutableStateOf(LocalTime.now()) }
    val isToday = selectedDate == LocalDate.now()

    LaunchedEffect(isToday) {
        if (isToday) {
            while (true) {
                currentTime = LocalTime.now()
                delay(30000)
            }
        }
    }

    // Operating hours range: 08:00 to 20:00
    val hours = remember { (8..20).toList() }

    val appointmentsByHour = remember(appointments, selectedDate) {
        val filtered = appointments.filter { appt ->
            runCatching {
                OffsetDateTime.parse(appt.startTime).toLocalDate() == selectedDate
            }.getOrDefault(false)
        }
        filtered.groupBy { appt ->
            runCatching {
                OffsetDateTime.parse(appt.startTime).hour
            }.getOrDefault(-1)
        }
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Schedule,
                        contentDescription = null,
                        tint = PortalDoctors,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = stringResource(R.string.doctor_agenda_timeline_title),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.2.sp,
                    )
                }

                if (isToday) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = Color(0xFFE0F2FE),
                    ) {
                        Text(
                            text = stringResource(R.string.doctor_agenda_timeline_today_time, currentTime.format(DateTimeFormatter.ofPattern("HH:mm"))),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF0284C7),
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                }
            }

            HorizontalDivider(color = Color(0xFFF1F5F9))

            // Hours loop
            hours.forEach { hour ->
                val hourAppointments = appointmentsByHour[hour].orEmpty()
                val isCurrentHour = isToday && currentTime.hour == hour
                val hourFormatted = String.format("%02d:00", hour)

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    // Hour Row header & "Now" line if applicable
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = hourFormatted,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = if (isCurrentHour) FontWeight.ExtraBold else FontWeight.SemiBold,
                            color = if (isCurrentHour) PortalDoctors else AuTextTertiary,
                            fontSize = 12.sp,
                            modifier = Modifier.width(48.dp),
                        )

                        if (isCurrentHour) {
                            // Pulsing dot + horizontal line
                            val transition = rememberInfiniteTransition(label = "now_pulse")
                            val pulseAlpha by transition.animateFloat(
                                initialValue = 0.4f,
                                targetValue = 1f,
                                animationSpec = infiniteRepeatable(
                                    animation = tween(800),
                                    repeatMode = RepeatMode.Reverse,
                                ),
                                label = "pulse",
                            )

                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .background(AuDanger.copy(alpha = pulseAlpha), CircleShape),
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            HorizontalDivider(
                                modifier = Modifier.weight(1f),
                                color = AuDanger.copy(alpha = 0.8f),
                                thickness = 1.5.dp,
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = stringResource(R.string.doctor_agenda_timeline_now),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuDanger,
                                fontSize = 9.sp,
                                letterSpacing = 1.sp,
                            )
                        } else {
                            HorizontalDivider(
                                modifier = Modifier.weight(1f),
                                color = Color(0xFFF1F5F9),
                            )
                        }
                    }

                    // Content for this hour
                    if (hourAppointments.isNotEmpty()) {
                        hourAppointments.forEach { appt ->
                            TimelineAppointmentCard(
                                appointment = appt,
                                patientName = getPatientName(appt),
                                onClick = { onSelectAppointment(appt) },
                                onStartCall = { onStartCall(appt.id) },
                            )
                        }
                    } else {
                        // Empty slot: free space where doctor can create quick appointment
                        EmptyTimelineSlot(
                            hourFormatted = hourFormatted,
                            onBookSlot = { onBookSlot(hourFormatted) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TimelineAppointmentCard(
    appointment: Appointment,
    patientName: String,
    onClick: () -> Unit,
    onStartCall: () -> Unit,
) {
    val startTime = runCatching {
        OffsetDateTime.parse(appointment.startTime).format(DateTimeFormatter.ofPattern("HH:mm"))
    }.getOrDefault("--:--")

    val endTime = runCatching {
        OffsetDateTime.parse(appointment.endTime).format(DateTimeFormatter.ofPattern("HH:mm"))
    }.getOrDefault("--:--")

    val isInProgress = appointment.status == AppointmentStatus.IN_PROGRESS
    val isConfirmed = appointment.status == AppointmentStatus.CONFIRMED
    val isCompleted = appointment.status == AppointmentStatus.COMPLETED

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = when {
            isInProgress -> Color(0xFFF0FDF4)
            isConfirmed -> Color(0xFFF8FAFC)
            isCompleted -> Color(0xFFF1F5F9)
            else -> Color(0xFFFFFFFF)
        },
        border = BorderStroke(
            1.dp,
            when {
                isInProgress -> Color(0xFF86EFAC)
                isConfirmed -> Color(0xFFCBD5E1)
                else -> Color(0xFFE2E8F0)
            },
        ),
        shadowElevation = if (isInProgress) 3.dp else 0.dp,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "$startTime - $endTime",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (isInProgress) Color(0xFF15803D) else PortalDoctors,
                        fontSize = 12.sp,
                    )

                    AppointmentStatusBadge(status = appointment.status)
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = patientName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                    fontSize = 15.sp,
                )

                if (!appointment.notes.isNullOrBlank()) {
                    val cleanNotes = appointment.notes.replace(Regex("\\[INVITADO:[^\\]]+\\]"), "").trim()
                    if (cleanNotes.isNotBlank()) {
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = cleanNotes,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                            maxLines = 1,
                            fontSize = 12.sp,
                        )
                    }
                }
            }

            // Quick Call action button if Telemedicine
            if ((appointment.type == AppointmentType.TELEMEDICINE || appointment.meetingUrl != null) && (isInProgress || isConfirmed)) {
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    onClick = onStartCall,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isInProgress) Color(0xFF16A34A) else PortalDoctors,
                        contentColor = Color.White,
                    ),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        horizontal = 12.dp,
                        vertical = 8.dp,
                    ),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.VideoCall,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = if (isInProgress) {
                                stringResource(R.string.doctor_agenda_timeline_connected)
                            } else {
                                stringResource(R.string.doctor_agenda_timeline_call)
                            },
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyTimelineSlot(
    hourFormatted: String,
    onBookSlot: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFFFAFAFA),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0).copy(alpha = 0.7f)),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onBookSlot),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.doctor_agenda_timeline_free_slot),
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
                fontWeight = FontWeight.Medium,
                fontSize = 12.sp,
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = null,
                    tint = PortalDoctors,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = stringResource(R.string.doctor_agenda_timeline_add_extra),
                    style = MaterialTheme.typography.labelSmall,
                    color = PortalDoctors,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp,
                )
            }
        }
    }
}
