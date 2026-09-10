package com.autamedica.android.presentation.doctors.agenda.components

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
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
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.PatientClinicalContext
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val spanishLocale = Locale("es", "AR")

@Composable
fun TurnoActualHeroCard(
    appointment: Appointment,
    patientName: String,
    patientContext: PatientClinicalContext?,
    isContextLoading: Boolean,
    onStartCall: () -> Unit,
    onViewDetail: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenAnamnesis: (() -> Unit)? = null,
) {
    val isTelemed = appointment.type == AppointmentType.TELEMEDICINE || appointment.meetingUrl != null
    val startDt = runCatching { OffsetDateTime.parse(appointment.startTime) }.getOrNull()
    val timeStr = startDt?.format(DateTimeFormatter.ofPattern("HH:mm", spanishLocale)) ?: ""
    val dateStr = startDt?.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", spanishLocale))
        ?.replaceFirstChar { it.uppercase() }
        ?: "Hoy"

    val rawNotes = appointment.notes?.replace(Regex("\\[INVITADO:[^\\]]+\\]"), "")?.trim()
    val motivoText = rawNotes?.ifBlank { null } ?: "Consulta programada"

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)), // neutral-200
        shadowElevation = 2.dp,
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            // Header: TURNO ACTUAL
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "TURNO ACTUAL",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 11.sp,
                    letterSpacing = 2.sp,
                )
                AppointmentStatusBadge(status = appointment.status)
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Time & Date Section (Sky themed container)
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color(0xFFF0F9FF), // sky-50
                border = BorderStroke(1.dp, Color(0xFFBAE6FD)), // sky-200
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        modifier = Modifier.size(52.dp),
                        shape = CircleShape,
                        color = Color(0xFFE0F2FE), // sky-100
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Schedule,
                            contentDescription = null,
                            tint = Color(0xFF0284C7), // sky-600
                            modifier = Modifier.padding(14.dp),
                        )
                    }

                    Spacer(modifier = Modifier.width(16.dp))

                    Column {
                        Text(
                            text = timeStr,
                            style = MaterialTheme.typography.headlineLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Black,
                            fontSize = 32.sp,
                        )
                        Text(
                            text = dateStr,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Patient Info Block
            Column {
                Text(
                    text = "PACIENTE",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 10.sp,
                    letterSpacing = 1.sp,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = patientName,
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = if (appointment.patientId != null) "Paciente registrado" else "Invitado externo",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextTertiary,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFF0F9FF), // sky-50
                    border = BorderStroke(1.dp, Color(0xFFE0F2FE)),
                ) {
                    Text(
                        text = "Motivo: $motivoText",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF0369A1), // sky-700
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            // Action Button: Iniciar consulta / Videoconsulta
            Button(
                onClick = {
                    if (isTelemed) onStartCall() else onViewDetail()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PortalDoctors,
                    contentColor = Color.White,
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp),
            ) {
                if (isTelemed) {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(
                    text = if (isTelemed) "INICIAR CONSULTA" else "VER DETALLE DE TURNO",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                )
            }

            Text(
                text = if (isTelemed) "VIDEOCONSULTA" else "CONSULTA PRESENCIAL",
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
                fontWeight = FontWeight.Bold,
                fontSize = 9.sp,
                letterSpacing = 1.sp,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(top = 6.dp),
            )

            Spacer(modifier = Modifier.height(18.dp))
            HorizontalDivider(color = Color(0xFFF1F5F9))
            Spacer(modifier = Modifier.height(16.dp))

            // Integrated Clinical Context Section
            Text(
                text = "CONTEXTO DEL PACIENTE",
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 10.sp,
                letterSpacing = 2.sp,
                modifier = Modifier.padding(bottom = 12.dp),
            )

            ClinicalContextSummary(
                context = patientContext,
                fallbackReason = rawNotes,
                hasPatient = appointment.patientId != null,
                isLoading = isContextLoading,
                dense = true,
                onOpenAnamnesis = onOpenAnamnesis,
            )
        }
    }
}
