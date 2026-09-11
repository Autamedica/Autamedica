package com.autamedica.android.presentation.doctors.agenda.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentTransitionRules
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.PatientClinicalContext
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val spanishLocale = Locale("es", "AR")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentDetailsBottomSheet(
    appointment: Appointment,
    patientName: String,
    patientContext: PatientClinicalContext?,
    isContextLoading: Boolean,
    onDismiss: () -> Unit,
    onStartCall: () -> Unit,
    onStatusChange: (AppointmentStatus) -> Unit,
    modifier: Modifier = Modifier,
    onOpenAnamnesis: (() -> Unit)? = null,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    val isTelemed = appointment.type == AppointmentType.TELEMEDICINE || appointment.meetingUrl != null
    val isGuest = appointment.patientId == null && appointment.notes?.contains("[INVITADO:") == true

    val startDt = runCatching { OffsetDateTime.parse(appointment.startTime) }.getOrNull()
    val timeStr = startDt?.format(DateTimeFormatter.ofPattern("HH:mm", spanishLocale)) ?: ""
    val dateStr = startDt?.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", spanishLocale))
        ?.replaceFirstChar { it.uppercase() }
        ?: ""

    val cleanNotes = appointment.notes?.replace(Regex("\\[INVITADO:[^\\]]+\\]"), "")?.trim().orEmpty()
    val guestLink = "https://doctor.autamedica.com/calls/guest?appointment=${appointment.id}"

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color.White,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 12.dp)
        ) {
            // Header: Status Badges & Delete Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AppointmentStatusBadge(status = appointment.status)
                    if (isGuest) {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = Color(0xFFE0F2FE),
                            border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                        ) {
                            Text(
                                text = "INVITADO EXTERNO",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFF0369A1),
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            )
                        }
                    }
                }

                if (AppointmentTransitionRules.isTransitionAllowed(appointment.status, AppointmentStatus.CANCELLED)) {
                    IconButton(
                        onClick = { onStatusChange(AppointmentStatus.CANCELLED) },
                        modifier = Modifier.size(36.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Cancelar turno",
                            tint = AuDanger,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Patient Name
            Text(
                text = patientName,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )

            Spacer(modifier = Modifier.height(6.dp))

            // Date & Time
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CalendarMonth,
                        contentDescription = null,
                        tint = AuTextTertiary,
                        modifier = Modifier.size(15.dp),
                    )
                    Text(
                        text = dateStr,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        fontWeight = FontWeight.Medium,
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Schedule,
                        contentDescription = null,
                        tint = AuTextTertiary,
                        modifier = Modifier.size(15.dp),
                    )
                    Text(
                        text = "$timeStr (${appointment.durationMinutes ?: 30} min)",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            HorizontalDivider(color = Color(0xFFF1F5F9))
            Spacer(modifier = Modifier.height(16.dp))

            // Section: DETALLES DE LA CONSULTA
            Text(
                text = "DETALLES DE LA CONSULTA",
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
                fontWeight = FontWeight.Bold,
                fontSize = 10.sp,
                letterSpacing = 1.5.sp,
            )
            Spacer(modifier = Modifier.height(10.dp))

            Surface(
                shape = RoundedCornerShape(14.dp),
                color = Color(0xFFF8FAFC),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Surface(
                            modifier = Modifier.size(32.dp),
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFE2E8F0),
                        ) {
                            Icon(
                                imageVector = if (isTelemed) Icons.Default.Videocam else Icons.Default.Person,
                                contentDescription = null,
                                tint = Color(0xFF475569),
                                modifier = Modifier.padding(6.dp),
                            )
                        }
                        Column {
                            Text("Modalidad", style = MaterialTheme.typography.labelSmall, color = AuTextTertiary, fontSize = 10.sp)
                            Text(
                                if (isTelemed) "Videoconsulta" else "Presencial",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                        }
                    }

                    HorizontalDivider(color = Color(0xFFE2E8F0))

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Surface(
                            modifier = Modifier.size(32.dp),
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFE2E8F0),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Place,
                                contentDescription = null,
                                tint = Color(0xFF475569),
                                modifier = Modifier.padding(6.dp),
                            )
                        }
                        Column {
                            Text("Ubicación", style = MaterialTheme.typography.labelSmall, color = AuTextTertiary, fontSize = 10.sp)
                            Text(
                                if (isTelemed) "Consultorio Virtual AutaMedica" else "Consultorio Médico",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            // Section: NOTAS CLÍNICAS
            Text(
                text = "NOTAS CLÍNICAS",
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
                fontWeight = FontWeight.Bold,
                fontSize = 10.sp,
                letterSpacing = 1.5.sp,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFFF8FAFC),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Description,
                        contentDescription = null,
                        tint = AuTextTertiary,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = cleanNotes.ifBlank { "Sin observaciones para este turno." },
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (cleanNotes.isNotBlank()) AuTextPrimary else AuTextTertiary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            // Section: CONTEXTO DEL PACIENTE
            Text(
                text = "CONTEXTO DEL PACIENTE",
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
                fontWeight = FontWeight.Bold,
                fontSize = 10.sp,
                letterSpacing = 1.5.sp,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = Color(0xFFF8FAFC),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    ClinicalContextSummary(
                        context = patientContext,
                        fallbackReason = cleanNotes,
                        hasPatient = appointment.patientId != null,
                        isLoading = isContextLoading,
                        dense = true,
                        onOpenAnamnesis = onOpenAnamnesis,
                    )
                }
            }

            // Section: TELEMEDICINA
            if (isTelemed) {
                Spacer(modifier = Modifier.height(18.dp))
                Text(
                    text = "TELEMEDICINA",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 10.sp,
                    letterSpacing = 1.5.sp,
                )
                Spacer(modifier = Modifier.height(8.dp))

                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFF0FDF4), // emerald-50
                    border = BorderStroke(1.dp, Color(0xFFA7F3D0)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "Ventana de conexión",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                            fontSize = 10.sp,
                        )
                        Text(
                            text = "La sala de videoconsulta está habilitada",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF047857),
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = {
                                onDismiss()
                                onStartCall()
                            },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Default.Videocam, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("ENTRAR A VIDEOCONSULTA", fontWeight = FontWeight.Bold)
                        }

                        // Guest share
                        if (isGuest) {
                            Spacer(modifier = Modifier.height(12.dp))
                            HorizontalDivider(color = Color(0xFFDCFCE7))
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = "El paciente no tiene cuenta. Compartí el enlace para que ingrese desde su navegador.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF166534),
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(
                                    onClick = {
                                        clipboardManager.setText(AnnotatedString(guestLink))
                                    },
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.weight(1f),
                                ) {
                                    Text("Copiar Link", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                                Button(
                                    onClick = {
                                        val msg = "Hola $patientName, te comparto el link para nuestra videoconsulta en AutaMedica: $guestLink"
                                        val sendIntent = Intent(Intent.ACTION_VIEW).apply {
                                            data = Uri.parse("https://wa.me/?text=" + Uri.encode(msg))
                                        }
                                        context.startActivity(sendIntent)
                                    },
                                    shape = RoundedCornerShape(10.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                                    modifier = Modifier.weight(1f),
                                ) {
                                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(14.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("WhatsApp", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Section: ACCIONES RÁPIDAS
            val validTransitions = AppointmentTransitionRules.getValidTransitions(appointment.status)
            if (validTransitions.isNotEmpty()) {
                Text(
                    text = "ACCIONES RÁPIDAS",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 10.sp,
                    letterSpacing = 1.5.sp,
                )
                Spacer(modifier = Modifier.height(10.dp))

                val hasStatusRow = AppointmentStatus.CONFIRMED in validTransitions ||
                    AppointmentStatus.IN_PROGRESS in validTransitions ||
                    AppointmentStatus.COMPLETED in validTransitions
                if (hasStatusRow) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        if (validTransitions.contains(AppointmentStatus.CONFIRMED)) {
                            OutlinedButton(
                                onClick = { onStatusChange(AppointmentStatus.CONFIRMED) },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                            ) {
                                Text(
                                    text = "Confirmar",
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF047857),
                                )
                            }
                        }

                        if (validTransitions.contains(AppointmentStatus.IN_PROGRESS)) {
                            OutlinedButton(
                                onClick = { onStatusChange(AppointmentStatus.IN_PROGRESS) },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                            ) {
                                Text(
                                    text = "Iniciar consulta",
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0284C7),
                                )
                            }
                        }

                        if (validTransitions.contains(AppointmentStatus.COMPLETED)) {
                            OutlinedButton(
                                onClick = { onStatusChange(AppointmentStatus.COMPLETED) },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                            ) {
                                Text(
                                    text = "Finalizada",
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF334155),
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                }

                if (validTransitions.contains(AppointmentStatus.NO_SHOW)) {
                    OutlinedButton(
                        onClick = { onStatusChange(AppointmentStatus.NO_SHOW) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.4f)),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.EventBusy,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = AuDanger,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "No asistió",
                            fontWeight = FontWeight.Bold,
                            color = AuDanger,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
