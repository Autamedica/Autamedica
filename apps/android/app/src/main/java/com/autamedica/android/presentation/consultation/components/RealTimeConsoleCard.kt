package com.autamedica.android.presentation.consultation.components

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.presentation.consultation.ConsultationConsoleState
import com.autamedica.android.presentation.consultation.RedFlagSign
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.util.CountryContext
import java.text.NumberFormat
import java.util.Locale

private val COMMON_SYMPTOMS = listOf(
    "Fiebre",
    "Dolor de garganta",
    "Gastrointestinal",
    "Erupción cutánea",
    "Tos persistente",
    "Receta / Control",
)

/**
 * Consola central de telemedicina en tiempo real inspirada en la máquina de estados de Uber.
 * Modela el ciclo activo de atención: Videoconsulta lista, Pago arancelario, Guardia 24/7 con triage
 * estructurado y detector en tiempo real de banderas rojas clínicas.
 */
@Composable
fun RealTimeConsoleCard(
    state: ConsultationConsoleState,
    onEnterVideoCall: (appointmentId: String) -> Unit,
    onPayAppointment: (Appointment) -> Unit,
    onChiefComplaintChanged: (String) -> Unit,
    onSymptomChipToggled: (String) -> Unit,
    onBypassRedFlags: () -> Unit,
    onRequestEmergencyDispatch: (onReady: (String) -> Unit) -> Unit,
    onNavigateToSchedule: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        is ConsultationConsoleState.ActiveVideoconsultation -> {
            ActiveCallConsole(
                active = state,
                onEnterCall = { onEnterVideoCall(state.appointment.id) },
                modifier = modifier,
            )
        }

        is ConsultationConsoleState.PendingPayment -> {
            PendingPaymentConsole(
                pending = state,
                onPay = { onPayAppointment(state.appointment) },
                modifier = modifier,
            )
        }

        is ConsultationConsoleState.OnCallTriage -> {
            OnCallTriageConsole(
                triage = state,
                onChiefComplaintChanged = onChiefComplaintChanged,
                onSymptomChipToggled = onSymptomChipToggled,
                onBypassRedFlags = onBypassRedFlags,
                onRequestEmergencyDispatch = onRequestEmergencyDispatch,
                modifier = modifier,
            )
        }

        is ConsultationConsoleState.Idle -> {
            IdleConsole(
                onNavigateToSchedule = onNavigateToSchedule,
                modifier = modifier,
            )
        }
    }
}

// ── 1. ESTADO: VIDEOCONSULTA ACTIVA O CONFIRMADA (LISTA PARA INGRESAR) ──

@Composable
private fun ActiveCallConsole(
    active: ConsultationConsoleState.ActiveVideoconsultation,
    onEnterCall: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color(0xFFF0F9FF), // Sky-50
        border = BorderStroke(1.5.dp, Color(0xFF0284C7)),
        shadowElevation = 3.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Header con indicador pulsante
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color(0xFF0284C7).copy(alpha = 0.15f),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF0284C7)),
                        )
                        Text(
                            text = "SALA LISTA PARA ATENCIÓN",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF0369A1),
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp,
                        )
                    }
                }

                Text(
                    text = "Acceso cifrado WebRTC",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                )
            }

            // Datos del profesional médico asignado
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = active.doctorName,
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = active.doctorSpecialty,
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )

                // Matrícula y validación legal SISA REFEPS (Decreto 63)
                Row(
                    modifier = Modifier.padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (!active.licenseNumber.isNullOrBlank()) {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = Color(0xFFF1F5F9),
                        ) {
                            Text(
                                text = "MN: ${active.licenseNumber}",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = FontFamily.Monospace,
                                color = AuTextSecondary,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            )
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color(0xFFECFDF5),
                        border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.4f)),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Shield,
                                contentDescription = null,
                                tint = AuSuccess,
                                modifier = Modifier.size(12.dp),
                            )
                            Text(
                                text = "SISA REFEPS Habilitado",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF065F46),
                                fontSize = 10.sp,
                            )
                        }
                    }
                }
            }

            // Motivo clínico declarado si existe
            active.chiefComplaint?.let { complaint ->
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color.White.copy(alpha = 0.8f),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text(
                            text = "Motivo de consulta registrado:",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                            fontSize = 11.sp,
                        )
                        Text(
                            text = complaint,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }

            // Botón de ingreso directo
            Button(
                onClick = onEnterCall,
                enabled = !active.isConnecting,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            ) {
                if (active.isConnecting) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Estableciendo conexión médica...")
                } else {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Ingresar a la videoconsulta cifrada",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
            }
        }
    }
}

// ── 2. ESTADO: PAGO PENDIENTE (CONFIRMACIÓN ARANCELARIA SIN AMARILLOS) ──

@Composable
private fun PendingPaymentConsole(
    pending: ConsultationConsoleState.PendingPayment,
    onPay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color(0xFFF8FAFC), // Slate-50 sobrio (Zero Yellow)
        border = BorderStroke(1.dp, Color(0xFF0284C7).copy(alpha = 0.4f)),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFE0F2FE),
                    modifier = Modifier.size(40.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Outlined.CreditCard,
                            contentDescription = null,
                            tint = Color(0xFF0284C7),
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Confirmación de turno médico",
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "El pago asegura tu lugar en la agenda del profesional.",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Honorario profesional:",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                    )
                    Text(
                        text = formatArs(pending.feeAmountArs),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                }

                Button(
                    onClick = onPay,
                    enabled = !pending.isProcessingPayment,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    if (pending.isProcessingPayment) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Verificando...")
                    } else {
                        Text("Confirmar en MercadoPago", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

// ── 3. ESTADO: GUARDIA 24/7 CON TRIAGE ACTIVO Y DETECTOR DE RED FLAGS ──

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OnCallTriageConsole(
    triage: ConsultationConsoleState.OnCallTriage,
    onChiefComplaintChanged: (String) -> Unit,
    onSymptomChipToggled: (String) -> Unit,
    onBypassRedFlags: () -> Unit,
    onRequestEmergencyDispatch: (onReady: (String) -> Unit) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Header de guardia médica
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFECFDF5),
                        modifier = Modifier.size(36.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Outlined.HealthAndSafety,
                                contentDescription = null,
                                tint = AuSuccess,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                    Column {
                        Text(
                            text = "Guardia Médica 24/7",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "Atención inmediata con triage previo",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuSuccess,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color(0xFFECFDF5),
                    border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.4f)),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(AuSuccess),
                        )
                        Text(
                            text = "${triage.availableDoctorsCount} de guardia",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF065F46),
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                        )
                    }
                }
            }

            // Input clínico de síntoma cardinal
            Text(
                text = "¿Cuál es tu síntoma o molestia principal hoy?",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = AuTextPrimary,
            )

            OutlinedTextField(
                value = triage.enteredChiefComplaint,
                onValueChange = onChiefComplaintChanged,
                placeholder = {
                    Text(
                        text = "Ej: Fiebre desde anoche, dolor de garganta al tragar...",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PortalPatients,
                    unfocusedBorderColor = AuBorder,
                ),
                maxLines = 3,
            )

            // Chips rápidos de síntomas
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                COMMON_SYMPTOMS.forEach { symptom ->
                    val selected = symptom in triage.selectedSymptomChips
                    FilterChip(
                        selected = selected,
                        onClick = { onSymptomChipToggled(symptom) },
                        label = {
                            Text(
                                text = symptom,
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 11.sp,
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PortalPatients.copy(alpha = 0.15f),
                            selectedLabelColor = PortalPatients,
                        ),
                    )
                }
            }

            // DETECTOR EN TIEMPO REAL DE BANDERAS ROJAS
            AnimatedVisibility(
                visible = triage.hasCriticalRedFlag,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                val primaryFlag = triage.detectedRedFlags.firstOrNull() ?: return@AnimatedVisibility
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFFEF2F2), // Crimson emergency container
                    border = BorderStroke(1.5.dp, AuDanger),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.WarningAmber,
                                contentDescription = null,
                                tint = AuDanger,
                                modifier = Modifier.size(20.dp),
                            )
                            Text(
                                text = "SIGNO DE ALARMA MÉDICA DETECTADO",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuDanger,
                                letterSpacing = 0.5.sp,
                            )
                        }

                        Text(
                            text = "${primaryFlag.title}: ${primaryFlag.reason}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF7F1D1D),
                            lineHeight = 18.sp,
                        )

                        val emergencyDialInfo = resolveEmergencyDialInfo(primaryFlag.emergencyPhone)

                        // Botón de 1 toque para llamar a emergencias (192 SAMU Brasil / 107 SAME Argentina)
                        Button(
                            onClick = {
                                val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${emergencyDialInfo.phone}"))
                                context.startActivity(dialIntent)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = AuDanger),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Phone,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = emergencyDialInfo.buttonText,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                            )
                        }

                        TextButton(
                            onClick = onBypassRedFlags,
                            modifier = Modifier.align(Alignment.CenterHorizontally),
                        ) {
                            Text(
                                text = "Comprendo el riesgo, deseo consultar por guardia médica",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                            )
                        }
                    }
                }
            }

            // Botón de acción principal para solicitar guardia médica
            Button(
                onClick = { onRequestEmergencyDispatch {} },
                enabled = !triage.isDispatchingGuard && !triage.hasCriticalRedFlag,
                colors = ButtonDefaults.buttonColors(containerColor = AuSuccess),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                if (triage.isDispatchingGuard) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Asignando profesional de guardia...")
                } else {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Solicitar médico de guardia con triage",
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
            }
        }
    }
}

// ── 4. ESTADO: REPOSO CLÍNICO SOBRIO (CERO RELLENO PUBLICITARIO) ──

@Composable
private fun IdleConsole(
    onNavigateToSchedule: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Sin consultas médicas activas",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )
            Text(
                text = "Tus antecedentes, recetas vigentes y órdenes de estudio se encuentran actualizadas en la parte inferior.",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                lineHeight = 18.sp,
            )
            Spacer(modifier = Modifier.height(4.dp))
            OutlinedButton(
                onClick = onNavigateToSchedule,
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, PortalPatients),
            ) {
                Text(
                    text = "Agendar turno programado",
                    fontWeight = FontWeight.SemiBold,
                    color = PortalPatients,
                )
            }
        }
    }
}

private fun formatArs(amount: Double): String {
    return CountryContext.formatCurrency(amount, maxFractionDigits = 0)
}

data class EmergencyDialInfo(
    val phone: String,
    val serviceName: String,
    val buttonText: String,
)

fun resolveEmergencyDialInfo(
    configuredPhone: String?,
    locale: Locale = Locale.getDefault(),
): EmergencyDialInfo {
    val lang = locale.language.lowercase()
    val country = locale.country.uppercase()
    val isBrazil = lang == "pt" || country == "BR" || configuredPhone == "192" || configuredPhone?.startsWith("+55") == true
    val isArgentina = (lang == "es" && (country == "AR" || country.isEmpty())) || configuredPhone == "107" || configuredPhone?.startsWith("+54") == true

    return when {
        isBrazil -> EmergencyDialInfo(
            phone = "192",
            serviceName = "SAMU",
            buttonText = "Ligar para o 192 (SAMU / Emergência)",
        )
        isArgentina -> EmergencyDialInfo(
            phone = "107",
            serviceName = "SAME",
            buttonText = "Llamar al 107 (SAME / Emergencias)",
        )
        else -> {
            val num = if (!configuredPhone.isNullOrBlank() && configuredPhone != "107") configuredPhone else "911"
            EmergencyDialInfo(
                phone = num,
                serviceName = "Emergencias",
                buttonText = "Llamar al $num (Emergencias)",
            )
        }
    }
}

